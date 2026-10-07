import type { APIRoute } from "astro";
import { createDb } from "@astropress/core";
import { listPosts, createPost } from "../../../lib/posts";
import { readJsonBody } from "../../../lib/json-body";

export const GET: APIRoute = async ({ url, locals }) => {
  const db = locals.db;
  if (!db) return new Response("数据库不可用", { status: 503 });

  const type = url.searchParams.get("type") ?? "post";
  const status = url.searchParams.get("status") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? "1");

  const { posts, total } = await listPosts(db, { type, status, page });
  return new Response(JSON.stringify({ posts, total }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.db;
  const user = locals.user;
  if (!db || !user) return new Response("未登录或登录已过期", { status: 401 });

  const parsed = await readJsonBody<{
    title: string;
    content?: string;
    excerpt?: string;
    status?: string;
    type?: string;
    slug?: string;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (!body.title?.trim()) {
    return new Response(JSON.stringify({ error: "标题不能为空" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const id = await createPost(db, { ...body, authorId: user.id });
  return new Response(JSON.stringify({ id }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
