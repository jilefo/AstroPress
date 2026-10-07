import type { APIRoute } from "astro";
import { unzipSync } from "fflate";

function decode(buf: Uint8Array) { return new TextDecoder().decode(buf); }

/** Assemble a package from a multi-file zip (manifest.json + folder structure) */
function assembleMultiFilePackage(files: Record<string, Uint8Array>): any {
  // Find manifest (could be at root or inside a single top-level folder)
  let prefix = "";
  const keys = Object.keys(files);
  const manifestKey = keys.find(k => k === "manifest.json") ??
    keys.find(k => /^[^/]+\/manifest\.json$/.test(k));
  if (manifestKey && manifestKey !== "manifest.json") {
    prefix = manifestKey.replace("manifest.json", "");
  }

  const manifest = JSON.parse(decode(files[manifestKey!]));

  // Tokens: inline in manifest OR tokens.json
  let tokens = manifest.tokens ?? null;
  const tokensKey = keys.find(k => k === `${prefix}tokens.json`);
  if (!tokens && tokensKey) tokens = JSON.parse(decode(files[tokensKey]));

  // CSS: theme.css
  let css: string | null = null;
  const cssKey = keys.find(k => k === `${prefix}theme.css`);
  if (cssKey) css = decode(files[cssKey]);

  // Pages: pages/*.json
  const pages: any[] = [];
  for (const k of keys) {
    if (k.startsWith(`${prefix}pages/`) && k.endsWith(".json")) {
      try { pages.push(JSON.parse(decode(files[k]))); } catch {}
    }
  }

  // Templates: templates/*.json
  const templates: any[] = [];
  for (const k of keys) {
    if (k.startsWith(`${prefix}templates/`) && k.endsWith(".json")) {
      try { templates.push(JSON.parse(decode(files[k]))); } catch {}
    }
  }

  // Post types: post-types/*.json (optional, stored for future use)
  const postTypes: any[] = [];
  for (const k of keys) {
    if (k.startsWith(`${prefix}post-types/`) && k.endsWith(".json")) {
      try { postTypes.push(JSON.parse(decode(files[k]))); } catch {}
    }
  }

  return { ...manifest, tokens, css, pages, templates, postTypes };
}

export const POST: APIRoute = async ({ locals, request }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  let pkg: any;
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return new Response(JSON.stringify({ error: "未选择上传文件" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = file.name.toLowerCase();

    if (name.endsWith(".zip")) {
      const files = unzipSync(bytes);
      const keys = Object.keys(files);

      // Detect multi-file package (has manifest.json)
      const hasManifest = keys.some(k => k === "manifest.json" || /^[^/]+\/manifest\.json$/.test(k));

      if (hasManifest) {
        pkg = assembleMultiFilePackage(files);
      } else {
        // Legacy single-file zip: find theme.json or first .json
        const jsonKey = keys.find(k => k.endsWith("theme.json")) ?? keys.find(k => k.endsWith(".json"));
        if (!jsonKey) {
          return new Response(JSON.stringify({ error: "压缩包内未找到 JSON 主题文件" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        pkg = JSON.parse(decode(files[jsonKey]));
      }
    } else if (name.endsWith(".json")) {
      pkg = JSON.parse(decode(bytes));
    } else {
      return new Response(JSON.stringify({ error: "仅支持 .zip 和 .json 格式文件" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "文件解析失败：" + String(e?.message ?? e) }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  if (!pkg?.tokens) {
    return new Response(JSON.stringify({ error: "无效的主题文件：缺少 tokens" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({
    ok: true,
    preview: {
      name: pkg.name || "未命名主题",
      description: pkg.description || "",
      author: pkg.author || "",
      version: pkg.version || "",
      tokens: pkg.tokens,
      hasCSS: !!pkg.css,
      templateCount: (pkg.templates ?? []).length,
      pageCount: (pkg.pages ?? []).length,
      pages: (pkg.pages ?? []).map((p: any) => ({ slug: p.slug, title: p.title })),
      templates: (pkg.templates ?? []).map((t: any) => ({ type: t.type, name: t.name })),
      postTypeCount: (pkg.postTypes ?? []).length,
    },
    package: pkg,
  }), { headers: { "Content-Type": "application/json" } });
};
