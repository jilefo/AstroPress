import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";
import { readJsonBody } from "../../../lib/json-body";

function optionKey(slug: string) {
  return `astropress_page_schema_${slug}`;
}

export const GET: APIRoute = async ({ locals, params }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const slug = params.slug!;
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, optionKey(slug)))
    .limit(1);

  const schema = row?.value ? JSON.parse(row.value) : { version: 1, blocks: [] };
  return new Response(JSON.stringify(schema), {
    headers: { "Content-Type": "application/json" },
  });
};

export const PUT: APIRoute = async ({ locals, params, request }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const slug = params.slug!;
  const parsed = await readJsonBody<unknown>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const key = optionKey(slug);

  const existing = await db
    .select({ id: wpOptions.optionId })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, key))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(wpOptions)
      .set({ optionValue: JSON.stringify(body) })
      .where(eq(wpOptions.optionName, key));
  } else {
    await db.insert(wpOptions).values({
      optionName: key,
      optionValue: JSON.stringify(body),
      autoload: "no",
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const slug = params.slug!;
  await db.delete(wpOptions).where(eq(wpOptions.optionName, optionKey(slug)));

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
