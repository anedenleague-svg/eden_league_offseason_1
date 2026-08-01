// Server fn: reports availability of every AI provider so the Settings
// suite can grey out the ones that can't accept traffic right now.
import { createServerFn } from "@tanstack/react-start";
import { providerCooldownRemaining, providerHasKey } from "./ai-provider-status.server";

export type AiProviderName = "gemini" | "openrouter" | "groq" | "mistral";

export interface ProviderStatus {
  name: AiProviderName;
  label: string;
  model: string;
  hasKey: boolean;
  cooldownMs: number;
  reason: "credits" | "rate_limit" | "error" | null;
  note?: string;
}

const PROVIDERS: { name: AiProviderName; label: string; model: string }[] = [
  { name: "gemini", label: "Google Gemini (2.5 Flash)", model: "gemini-2.5-flash" },
  { name: "groq", label: "Groq (Llama 3.3 70B)", model: "llama-3.3-70b-versatile" },
  { name: "mistral", label: "Mistral (Small Latest)", model: "mistral-small-latest" },
  { name: "openrouter", label: "OpenRouter (Gemini 2.5 Flash)", model: "google/gemini-2.5-flash" },
];

export const getAiProviderStatus = createServerFn({ method: "POST" }).handler(async () => {
  const out: ProviderStatus[] = PROVIDERS.map((p) => {
    const cd = providerCooldownRemaining(p.name);
    return {
      name: p.name,
      label: p.label,
      model: p.model,
      hasKey: providerHasKey(p.name),
      cooldownMs: cd ? Math.max(0, cd.until - Date.now()) : 0,
      reason: cd?.reason ?? null,
      note: cd?.note,
    };
  });
  return { providers: out };
});
