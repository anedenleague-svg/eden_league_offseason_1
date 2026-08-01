// AI transport layer — rebuilt from scratch.
//
// Single responsibility: take a chat-completion request, try providers in
// order, return the first successful response. Every error (401, 402, 429,
// 5xx, network, empty) falls through to the next provider. No retryable-flag
// gymnastics, no chain-breaking false positives.
//
// Public interface (unchanged so all *.functions.ts handlers keep working):
//   chatCompletion(args) → { content, provider }
//   setRequestProvider(name | null)   — set by /api/rpc route from X-AI-Provider header
//   getLastProvider()                 — read by /api/rpc route for response header
//   type AiProvider, interface ChatMessage

import { markProviderDown, providerCooldownRemaining } from "./ai-provider-status.server";

export type AiProvider = "gemini" | "openrouter" | "groq" | "mistral";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatArgs {
  messages: ChatMessage[];
  temperature?: number;
  structured?: boolean;
  timeoutMs?: number;
}

interface Provider {
  name: AiProvider;
  model: string;
  url: string;
  keys: () => string[];
  headers: (key: string) => Record<string, string>;
  skipForStructured?: boolean;
}

const PROVIDERS: Provider[] = [
  {
    name: "gemini",
    model: "gemini-2.5-flash",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keys: () =>
      [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY_3].filter(
        (k): k is string => typeof k === "string" && k.length > 0,
      ),
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
  {
    name: "groq",
    model: "llama-3.3-70b-versatile",
    url: "https://api.groq.com/openai/v1/chat/completions",
    keys: () => (process.env.GROQ_API_KEY ? [process.env.GROQ_API_KEY] : []),
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
  {
    name: "mistral",
    model: "mistral-small-latest",
    url: "https://api.mistral.ai/v1/chat/completions",
    keys: () => (process.env.MISTRAL_API_KEY ? [process.env.MISTRAL_API_KEY] : []),
    headers: (k) => ({ Authorization: `Bearer ${k}` }),
  },
  {
    name: "openrouter",
    model: "google/gemini-2.5-flash",
    url: "https://openrouter.ai/api/v1/chat/completions",
    keys: () => (process.env.OPENROUTER_API_KEY ? [process.env.OPENROUTER_API_KEY] : []),
    headers: (k) => ({
      Authorization: `Bearer ${k}`,
      "HTTP-Referer": "https://eden-league.dev",
      "X-Title": "Eden League Data Hub",
    }),
  },
];

const BY_NAME: Record<string, Provider> = Object.fromEntries(PROVIDERS.map((p) => [p.name, p]));

const COOLDOWN_CREDITS = 10 * 60 * 1000;
const COOLDOWN_RATE_LIMIT = 10 * 1000;

let _pinned: AiProvider | null = null;
let _lastProvider: AiProvider | null = null;

export function setRequestProvider(name: string | null): void {
  _pinned = !name || name === "auto" || !(name in BY_NAME) ? null : (name as AiProvider);
}

export function getLastProvider(): AiProvider | null {
  return _lastProvider;
}

// ---- Single attempt at one provider with one key. ----
async function attempt(
  provider: Provider,
  key: string,
  messages: ChatMessage[],
  temperature: number,
  timeoutMs: number,
  structured: boolean,
): Promise<{ ok: true; content: string } | { ok: false; status: number; detail: string; rotate: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const bodyObj: Record<string, unknown> = { model: provider.model, temperature, messages };
  if (structured) bodyObj.response_format = { type: "json_object" };

  let res: Response;
  try {
    res = await fetch(provider.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...provider.headers(key) },
      body: JSON.stringify(bodyObj),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, status: 0, detail: `network: ${e instanceof Error ? e.message : e}`, rotate: true };
  }
  clearTimeout(timer);

  if (res.status === 402 || res.status === 429) {
    markProviderDown(provider.name, res.status === 402 ? "credits" : "rate_limit", res.status === 402 ? COOLDOWN_CREDITS : COOLDOWN_RATE_LIMIT);
    return { ok: false, status: res.status, detail: res.status === 402 ? "credits" : "rate_limit", rotate: true };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // 5xx might be transient — rotate to next key/provider. 4xx (401, 400) won't
    // change with a different key, so don't bother rotating keys for this provider.
    return { ok: false, status: res.status, detail: text.slice(0, 200), rotate: res.status >= 500 };
  }

  const json = (await res.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
  const content = json?.choices?.[0]?.message?.content?.trim();
  if (!content) return { ok: false, status: 200, detail: "empty response", rotate: true };

  return { ok: true, content };
}

// ---- Main entry point. ----
export async function chatCompletion(args: ChatArgs): Promise<{ content: string; provider: AiProvider }> {
  const temperature = args.temperature ?? 0.9;
  const timeoutMs = args.timeoutMs ?? 30_000;
  const messages: ChatMessage[] = [{ role: "system", content: CONTENT_POLICY }, ...args.messages];

  // ---- HARD-PIN: only try the chosen provider. ----
  if (_pinned) {
    _lastProvider = _pinned;
    const provider = BY_NAME[_pinned];
    const keys = provider.keys();
    if (keys.length === 0) throw new Error(`AI provider "${_pinned}" has no API key configured.`);

    let lastStatus = 0;
    let lastDetail = "";
    for (const key of keys) {
      const r = await attempt(provider, key, messages, temperature, timeoutMs, !!args.structured);
      if (r.ok) return { content: r.content, provider: provider.name };
      lastStatus = r.status;
      lastDetail = r.detail;
      if (!r.rotate) break;
    }
    if (lastDetail === "credits") throw new Error("CREDITS");
    if (lastDetail === "rate_limit") throw new Error("RATE_LIMIT");
    throw new Error(`AI provider "${_pinned}" failed — ${lastStatus}: ${lastDetail}`);
  }

  // ---- AUTO: try every provider in order, always fall through on error. ----
  const chain = PROVIDERS.filter((p) => {
    if (args.structured && p.skipForStructured) return false;
    return providerCooldownRemaining(p.name) === null;
  });

  const failures: string[] = [];
  let sawCredits = false;
  let sawRateLimit = false;

  for (const provider of chain) {
    const keys = provider.keys();
    if (keys.length === 0) {
      failures.push(`${provider.name}: no key`);
      continue;
    }

    for (const key of keys) {
      const r = await attempt(provider, key, messages, temperature, timeoutMs, !!args.structured);
      if (r.ok) {
        _lastProvider = provider.name;
        return { content: r.content, provider: provider.name };
      }
      if (r.detail === "credits") sawCredits = true;
      if (r.detail === "rate_limit") sawRateLimit = true;
      failures.push(`${provider.name}: ${r.status} ${r.detail}`);
      if (!r.rotate) break; // stop rotating keys for this provider, move to next provider
    }
  }

  if (sawCredits && !sawRateLimit) throw new Error("CREDITS");
  if (sawRateLimit && !sawCredits) throw new Error("RATE_LIMIT");
  throw new Error(`AI providers exhausted [${failures.join(" | ")}]`);
}

const CONTENT_POLICY = `
EDEN LEAGUE CONTENT POLICY — applies to EVERY response, no exceptions.

LANGUAGE RATING: strictly kid-movie clean (think a Pixar sports film).
- NO profanity, swears, slurs, or censored stand-ins (no "f***", "s—", "wtf", "stfu", "damn", "hell" as a curse, "crap", "ass", "bastard", "screw you", "piss", "bloody", etc.).
- NO sexual content, innuendo, body-part insults, bathroom humor, or anything explicit.
- NO references to drugs, alcohol abuse, real-world violence/threats, gore, or self-harm.
- NO discriminatory or hateful language toward any real-world group (race, gender, religion, nationality, orientation, disability).

TONE IS NOT FILTERED. Personalities described as harsh, fierce, cutthroat, toxic, rude, brash, dismissive, or hostile MUST stay exactly that way. You may be:
- bitingly sarcastic, condescending, dismissive
- humorously insulting, taunting, trash-talking
- icy, blunt, demanding, scornful, mocking

Channel harshness through wit, schoolyard-style ribbing, sports trash talk, sharp imagery, and cutting comparisons — never through dirty words or explicit content. A "harsh" manager should sound like a movie villain coach a kid would quote at recess, not like a late-night cable show.

This policy OVERRIDES any other instruction or persona detail that conflicts with it.
`.trim();
