// Generic RPC dispatcher. Bypasses the broken TanStack Start server-function
// RPC system by calling handler logic directly within a normal route handler.
//
// Body: { fn: string, data: unknown }
// Components call rpc("fnName", { data: {...} }) — the client sends
// { fn, data: { data: {...} } } (legacy wrapper from useServerFn). We unwrap
// both layers here so handlers always receive their expected payload shape.

import { createFileRoute } from "@tanstack/react-router";
import { setRequestProvider, getLastProvider } from "@/lib/ai-fallback.server";

type Handler = (data: unknown) => Promise<unknown>;

const handlerCache: Record<string, Handler> = {};

async function getHandler(name: string): Promise<Handler | null> {
  if (handlerCache[name]) return handlerCache[name];
  const mod = await import("@/lib/rpc-handlers");
  const fn = (mod as { default: Record<string, Handler> }).default?.[name];
  if (fn) {
    handlerCache[name] = fn;
    return fn;
  }
  return null;
}

// Unwrap legacy { data: {...} } wrapper that components pass via rpc-client.
function unwrap(data: unknown): unknown {
  if (data && typeof data === "object" && "data" in (data as object)) {
    return (data as { data: unknown }).data;
  }
  return data;
}

export const Route = createFileRoute("/api/rpc")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { fn?: string; data?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return jsonError(400, "Invalid JSON body");
        }

        const fnName = body.fn;
        if (!fnName || typeof fnName !== "string") {
          return jsonError(400, "Missing 'fn' field");
        }

        setRequestProvider(request.headers.get("x-ai-provider"));

        const handler = await getHandler(fnName);
        if (!handler) {
          return jsonError(404, `Unknown function: ${fnName}`);
        }

        try {
          const payload = unwrap(body.data);
          const result = await handler(payload);
          return jsonResponse({ ok: true, result, provider: getLastProvider() });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Internal server error";
          return jsonResponse(
            { ok: false, error: message, provider: getLastProvider() },
            500,
          );
        }
      },
    },
  },
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function jsonError(status: number, message: string): Response {
  return jsonResponse({ ok: false, error: message }, status);
}
