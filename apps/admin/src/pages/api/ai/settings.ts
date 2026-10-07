import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";
import { readJsonBody } from "../../../lib/json-body";

const OPTION_KEY = "astropress_ai_settings";

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const row = await db
    .select()
    .from(wpOptions)
    .where(eq(wpOptions.optionName, OPTION_KEY))
    .get();

  const settings = row?.optionValue
    ? JSON.parse(row.optionValue)
    : { providers: {}, activeProvider: "anthropic" };

  // Mask API keys before sending to client
  const masked = {
    ...settings,
    providers: Object.fromEntries(
      Object.entries(settings.providers ?? {}).map(([k, v]: [string, any]) => [
        k,
        {
          ...v,
          apiKey: v.apiKey ? "•".repeat(Math.min(v.apiKey.length, 20)) : "",
          _hasKey: Boolean(v.apiKey),
        },
      ])
    ),
  };

  return new Response(JSON.stringify(masked), {
    headers: { "Content-Type": "application/json" },
  });
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const parsed = await readJsonBody<any>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const { activeProvider, providers, systemContext } = body;

  // Load existing to preserve real API keys when masked value is sent
  const existing = await db
    .select()
    .from(wpOptions)
    .where(eq(wpOptions.optionName, OPTION_KEY))
    .get();

  const existingSettings = existing?.optionValue
    ? JSON.parse(existing.optionValue)
    : { providers: {}, activeProvider: "anthropic" };

  const mergedProviders: Record<string, any> = {};
  for (const [key, config] of Object.entries(providers ?? {}) as [string, any][]) {
    const prev = existingSettings.providers?.[key] ?? {};
    // If the submitted apiKey looks like a masked value (all bullets), keep the real key
    const isMasked = /^•+$/.test(config.apiKey ?? "");
    mergedProviders[key] = {
      ...prev,
      ...config,
      apiKey: isMasked ? (prev.apiKey ?? "") : config.apiKey,
    };
    delete mergedProviders[key]._hasKey;
  }

  const newSettings = {
    activeProvider: activeProvider ?? existingSettings.activeProvider,
    systemContext: systemContext !== undefined ? systemContext : (existingSettings.systemContext ?? ""),
    confirmBeforeAction: body.confirmBeforeAction !== undefined ? body.confirmBeforeAction : (existingSettings.confirmBeforeAction ?? true),
    providers: mergedProviders,
  };

  await db
    .insert(wpOptions)
    .values({ optionName: OPTION_KEY, optionValue: JSON.stringify(newSettings) })
    .onConflictDoUpdate({
      target: wpOptions.optionName,
      set: { optionValue: JSON.stringify(newSettings) },
    });

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
