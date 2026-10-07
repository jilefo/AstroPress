import type { APIRoute } from "astro";
import { getPost, updatePost, deletePost } from "../../../lib/posts";

export const GET: APIRoute = async ({ params, locals }) => {
  const db = locals.db;
  if (!db) return new Response("数据库不可用", { status: 503 });

  const id = Number(params.id);
  const post = await getPost(db, id);
  if (!post) return new Response("文章不存在", { status: 404 });

  return new Response(JSON.stringify(post), {
    headers: { "Content-Type": "application/json" },
  });
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const id = Number(params.id);
  const body = await request.json() as {
    title?: string;
    content?: string;
    excerpt?: string;
    status?: string;
    slug?: string;
  };

  await updatePost(db, id, body);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  await deletePost(db, Number(params.id));
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
