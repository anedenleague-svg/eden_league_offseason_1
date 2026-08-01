import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  const captured = consumeLastCapturedError();
  console.error(captured ?? new Error(`h3 swallowed SSR error: ${body}`));
  const msg = captured instanceof Error ? captured.message : `h3 swallowed SSR error: ${body}`;
  return new Response(JSON.stringify({ error: msg }), {
    status: 500,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// Server function RPCs expect JSON, not HTML. Return a JSON error so the
// client can parse the message instead of rendering raw HTML.
function isServerFnRequest(request: Request): boolean {
  const url = new URL(request.url);
  const base = process.env.TSS_SERVER_FN_BASE ?? "/_serverFn";
  return url.pathname.startsWith(base);
}

function errorResponse(request: Request, error: unknown): Response {
  const message = error instanceof Error ? error.message : "Internal server error";
  if (isServerFnRequest(request)) {
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return errorResponse(request, error);
    }
  },
};
