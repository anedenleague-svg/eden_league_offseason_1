import { createFileRoute } from "@tanstack/react-router";
import { providerCooldownRemaining, providerHasKey } from "@/lib/ai-provider-status.server";

export const Route = createFileRoute("/api/ai-status")({
  server: {
    handlers: {
      GET: async () => {
        const PROVIDERS = [
          { name: "gemini", label: "Google Gemini (2.5 Flash)", model: "gemini-2.5-flash" },
          { name: "groq", label: "Groq (Llama 3.3 70B)", model: "llama-3.3-70b-versatile" },
          { name: "mistral", label: "Mistral (Small Latest)", model: "mistral-small-latest" },
          { name: "openrouter", label: "OpenRouter (Gemini 2.5 Flash)", model: "google/gemini-2.5-flash" },
        ] as const;

        const providers = PROVIDERS.map((p) => {
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

        return new Response(JSON.stringify({ providers }), {
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      },
    },
  },
});
