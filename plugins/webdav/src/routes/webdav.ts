import type { APIRoute, APIContext } from "astro";
import * as fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { hasFileSystem, envNotSupported } from "@astropress/core";
import { checkDavAuth, unauthorized } from "../lib/auth";
import { DavError, ensureStorageRoot, normalizeDavRel, resolveDavPath } from "../lib/paths";

/**
 * /webdav/[...path] — WebDAV 协议端点。
 *
 * 核心中间件只对 /api/* 与 /admin* 强制登录，/webdav 属于公共路由，
 * 因此本端点自行做 HTTP Basic Auth（站点用户名 + 专用 access token）。
 *
 * 支持方法：OPTIONS / PROPFIND / GET / PUT / DELETE / MKCOL。
 */

const DAV_METHODS = "OPTIONS, PROPFIND, GET, PUT, DELETE, MKCOL";

const XML_CONTENT_TYPE = "application/xml; charset=utf-8";

interface GuardOk {
  rel: string;
  abs: string;
}

/** 鉴权 + 路径解析；失败直接返回 Response（401/403/501） */
async function guard(ctx: APIContext): Promise<GuardOk | Response> {
  if (!hasFileSystem()) return envNotSupported("WebDAV 存储");
  const db = (ctx.locals as any).db;
  const ok = await checkDavAuth(ctx.request, db);
  if (!ok) return unauthorized();

  const rel = normalizeDavRel(ctx.params.path ?? "");
  const abs = resolveDavPath(rel);
  return { rel, abs };
}

function guardFailure(g: GuardOk | Response): g is Response {
  return g instanceof Response;
}

/** XML 特殊字符转义 */
function xesc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 相对路径 → WebDAV href（逐段编码，目录带尾斜杠） */
function davHref(rel: string, isDir: boolean): string {
  if (!rel) return "/webdav/";
  const segs = rel.split("/").map((s) => encodeURIComponent(s));
  return "/webdav/" + segs.join("/") + (isDir ? "/" : "");
}

function displayName(rel: string): string {
  if (!rel) return "/";
  const segs = rel.split("/");
  return segs[segs.length - 1] || "/";
}

function responseXml(rel: string, isDir: boolean, size: number, mtime: Date): string {
  const props = [
    `<D:displayname>${xesc(displayName(rel))}</D:displayname>`,
    isDir ? "<D:resourcetype><D:collection/></D:resourcetype>" : "<D:resourcetype/>",
    `<D:getlastmodified>${mtime.toUTCString()}</D:getlastmodified>`,
  ];
  if (!isDir) props.push(`<D:getcontentlength>${size}</D:getcontentlength>`);
  return (
    "<D:response>" +
    `<D:href>${xesc(davHref(rel, isDir))}</D:href>` +
    "<D:propstat><D:prop>" +
    props.join("") +
    "</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>" +
    "</D:response>"
  );
}

/** OPTIONS — 通告 DAV 能力与允许的方法 */
export const OPTIONS: APIRoute = async (ctx) => {
  const ok = await checkDavAuth(ctx.request, (ctx.locals as any).db);
  if (!ok) return unauthorized();
  return new Response(null, {
    status: 200,
    headers: {
      DAV: "1,2",
      Allow: DAV_METHODS,
      "MS-Author-Via": "DAV",
      "Content-Length": "0",
    },
  });
};

/** PROPFIND — 资源属性 / 目录列表（Depth 0/1），207 Multi-Status */
export const PROPFIND: APIRoute = async (ctx) => {
  let g: GuardOk | Response;
  try {
    g = await guard(ctx);
  } catch (e) {
    if (e instanceof DavError) return new Response(e.message, { status: e.status });
    throw e;
  }
  if (guardFailure(g)) return g;

  await ensureStorageRoot();
  const st = await fs.stat(g.abs).catch(() => null);
  if (!st) return new Response("Not Found", { status: 404 });

  const depth = ctx.request.headers.get("depth") ?? "1";
  const parts: string[] = [
    responseXml(g.rel, st.isDirectory(), st.isDirectory() ? 0 : st.size, st.mtime),
  ];

  if (st.isDirectory() && depth !== "0") {
    const dirents = await fs.readdir(g.abs, { withFileTypes: true }).catch(() => []);
    for (const d of dirents) {
      try {
        const child = await fs.stat(join(g.abs, d.name));
        const childRel = g.rel ? `${g.rel}/${d.name}` : d.name;
        parts.push(
          responseXml(childRel, d.isDirectory(), d.isDirectory() ? 0 : child.size, child.mtime),
        );
      } catch {
        // 枚举期间被删除的条目跳过
      }
    }
  }

  const xml =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<D:multistatus xmlns:D="DAV:">' +
    parts.join("") +
    "</D:multistatus>";
  return new Response(xml, {
    status: 207,
    headers: {
      "Content-Type": XML_CONTENT_TYPE,
      DAV: "1,2",
    },
  });
};

/** GET — 下载文件（分块流式） */
export const GET: APIRoute = async (ctx) => {
  let g: GuardOk | Response;
  try {
    g = await guard(ctx);
  } catch (e) {
    if (e instanceof DavError) return new Response(e.message, { status: e.status });
    throw e;
  }
  if (guardFailure(g)) return g;

  const st = await fs.stat(g.abs).catch(() => null);
  if (!st) return new Response("Not Found", { status: 404 });
  if (st.isDirectory()) return new Response("目录不可下载", { status: 403 });

  const fh = await fs.open(g.abs, "r");
  const chunkSize = 1024 * 1024;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = new Uint8Array(chunkSize);
        const { bytesRead } = await fh.read(chunk, 0, chunkSize, null);
        if (!bytesRead) {
          await fh.close();
          controller.close();
          return;
        }
        controller.enqueue(chunk.subarray(0, bytesRead));
      } catch (e) {
        await fh.close().catch(() => undefined);
        controller.error(e);
      }
    },
    async cancel() {
      await fh.close().catch(() => undefined);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(st.size),
      "Last-Modified": st.mtime.toUTCString(),
      "Accept-Ranges": "bytes",
    },
  });
};

/** PUT — 上传/覆盖文件（流式写盘；父目录不存在返回 409） */
export const PUT: APIRoute = async (ctx) => {
  let g: GuardOk | Response;
  try {
    g = await guard(ctx);
  } catch (e) {
    if (e instanceof DavError) return new Response(e.message, { status: e.status });
    throw e;
  }
  if (guardFailure(g)) return g;
  if (!g.rel) return new Response("不能覆盖存储根", { status: 403 });

  await ensureStorageRoot();
  const parent = dirname(g.abs);
  const pst = await fs.stat(parent).catch(() => null);
  if (!pst || !pst.isDirectory()) {
    return new Response("父目录不存在", { status: 409 });
  }
  const exist = await fs.stat(g.abs).catch(() => null);
  if (exist?.isDirectory()) return new Response("目标是目录", { status: 409 });

  if (!ctx.request.body) return new Response("空请求体", { status: 400 });

  const fh = await fs.open(g.abs, "w");
  try {
    const reader = (ctx.request.body as ReadableStream<Uint8Array>).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length) await fh.write(value);
    }
  } catch (e) {
    await fh.close().catch(() => undefined);
    await fs.unlink(g.abs).catch(() => undefined);
    throw e;
  }
  await fh.close();

  return new Response(null, { status: exist ? 204 : 201 });
};

/** DELETE — 删除文件或目录（目录递归） */
export const DELETE: APIRoute = async (ctx) => {
  let g: GuardOk | Response;
  try {
    g = await guard(ctx);
  } catch (e) {
    if (e instanceof DavError) return new Response(e.message, { status: e.status });
    throw e;
  }
  if (guardFailure(g)) return g;
  if (!g.rel) return new Response("不能删除存储根", { status: 403 });

  const st = await fs.stat(g.abs).catch(() => null);
  if (!st) return new Response("Not Found", { status: 404 });
  await fs.rm(g.abs, { recursive: st.isDirectory(), force: false });
  return new Response(null, { status: 204 });
};

/** MKCOL — 创建目录（已存在 405；父目录不存在 409） */
export const MKCOL: APIRoute = async (ctx) => {
  let g: GuardOk | Response;
  try {
    g = await guard(ctx);
  } catch (e) {
    if (e instanceof DavError) return new Response(e.message, { status: e.status });
    throw e;
  }
  if (guardFailure(g)) return g;
  if (!g.rel) return new Response("存储根已存在", { status: 405 });

  await ensureStorageRoot();
  const exist = await fs.stat(g.abs).catch(() => null);
  if (exist) return new Response("已存在", { status: 405 });
  const pst = await fs.stat(dirname(g.abs)).catch(() => null);
  if (!pst || !pst.isDirectory()) {
    return new Response("父目录不存在", { status: 409 });
  }
  await fs.mkdir(g.abs);
  return new Response(null, { status: 201 });
};
