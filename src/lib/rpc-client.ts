// Client-side RPC helper. POSTs to /api/rpc which dispatches to handler
// functions directly within a normal route handler.

const AI_PROVIDER_STORAGE_KEY = "eden_ai_provider";

function getProviderHeader(): Record<string, string> {
  try {
    if (typeof window !== "undefined") {
      const name = (window.localStorage.getItem(AI_PROVIDER_STORAGE_KEY) ?? "").trim();
      if (name && name !== "auto") return { "X-AI-Provider": name };
    }
  } catch {
    // ignore
  }
  return {};
}

export async function rpc<T = unknown>(fn: string, data: unknown): Promise<T> {
  const res = await fetch("/api/rpc", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...getProviderHeader(),
    },
    body: JSON.stringify({ fn, data }),
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  const body = (await res.json()) as { ok: boolean; result?: T; error?: string };
  if (!body.ok) {
    throw new Error(body.error ?? "RPC failed");
  }
  return body.result as T;
}
