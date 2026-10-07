/**
 * Minimal dependency-free SVG sanitizer: strips <script>, event handlers,
 * javascript:/data: URLs and foreignObject while keeping shape/geometry
 * elements. ~80 lines instead of pulling DOMPurify into the bundle.
 */

const ALLOWED_TAGS = new Set([
  "svg", "g", "defs", "title", "desc", "metadata", "symbol", "use",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textPath", "marker", "pattern", "clipPath", "mask",
  "linearGradient", "radialGradient", "stop", "filter", "feBlend",
  "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix",
  "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow",
  "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur",
  "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight",
  "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence",
]);

const URL_ATTRS = new Set(["href", "xlink:href", "src", "action", "formaction"]);

export function sanitizeSvg(source: string): string {
  // Remove comments, scripts, foreignObject entirely
  let out = source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "");

  // Keep only whitelisted opening/closing tags; drop everything else
  out = out.replace(/<\/?([a-zA-Z][\w:-]*)((?:\s+[^<>]*)?)\/?>/g, (match, tagRaw: string, attrsRaw: string) => {
    const tag = tagRaw;
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (match.startsWith("</")) return `</${tag}>`;
    return `<${tag}${sanitizeAttrs(attrsRaw)}>`;
  });

  // Strip CDATA javascript payloads in style blocks
  out = out.replace(/javascript\s*:/gi, "blocked:");
  return out;
}

function sanitizeAttrs(attrs: string): string {
  let out = attrs ?? "";

  // Pass 1 — hard-strip event handlers in EVERY syntax (quoted, unquoted,
  // single/double). The quoted-only rebuild below would otherwise let
  // `<svg onload=alert(1)>` through untouched.
  out = out.replace(/\son[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Pass 2 — URL attributes: quoted forms are vetted; unquoted forms are
  // dropped outright (rare in real SVGs, impossible to vet reliably).
  out = out.replace(
    /\s(href|xlink:href|src|action|formaction)\s*=\s*("([^"]*)"|'([^']*)')/gi,
    (m, nameRaw: string, _q: string, dq: string, sq: string) => {
      const name = nameRaw.toLowerCase();
      const value = dq ?? sq ?? "";
      const v = value.trim().toLowerCase();
      // Allow fragment/self/http(s); block javascript:, data: (except raster
      // images), vbscript: and everything else.
      const safe =
        v.startsWith("#") ||
        v.startsWith("/") ||
        v.startsWith("http://") ||
        v.startsWith("https://") ||
        /^data:image\/(png|jpeg|gif|webp);/.test(v);
      if (!safe) return "";
      return ` ${nameRaw}="${value.replace(/"/g, "&quot;")}"`;
    }
  );
  out = out.replace(/\s(href|xlink:href|src|action|formaction)\s*=\s*[^"'\s>]+/gi, "");

  // Pass 3 — rebuild remaining quoted attributes (style gets extra vetting).
  out = out.replace(/([a-zA-Z-:]+)\s*=\s*("([^"]*)"|'([^']*)')/g, (m, nameRaw: string, _q: string, dq: string, sq: string) => {
    const name = nameRaw.toLowerCase();
    const value = dq ?? sq ?? "";
    if (/^on/i.test(name)) return "";
    if (URL_ATTRS.has(name)) return ""; // already handled in pass 2
    if (name === "style" && /expression\s*\(|javascript:/i.test(value)) return "";
    return ` ${nameRaw}="${value.replace(/"/g, "&quot;")}"`;
  });
  // Any leftover unquoted junk attributes (not handler/URL) are dropped.
  out = out.replace(/\s[a-zA-Z-:]+\s*=\s*[^"'\s>]+/g, "");
  return out;
}