import type { APIRoute } from "astro";
import { createDb } from "@astropress/core";
import { listPosts, createPost } from "../../../lib/posts";

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

  let body: {
    title: string;
    content?: string;
    excerpt?: string;
    status?: string;
    type?: string;
    slug?: string;
  };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "请求体不是有效的 JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

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
