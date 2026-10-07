/** HTML 特殊字符转义，防 XSS（所有用户内容渲染前必须经过） */
export function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 邮箱格式校验（实用正则，非 RFC 全集） */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email: string): boolean {
  return email.length <= 200 && EMAIL_RE.test(email);
}

/**
 * 网站地址白名单：仅允许 http(s)://，长度 ≤ 200；不合法返回空串。
 * 同时用于前台渲染时决定是否给作者名加链接。
 */
export function safeWebsite(raw: string): string {
  const url = raw.trim();
  if (!url) return "";
  if (url.length > 200) return "";
  if (!/^https?:\/\//i.test(url)) return "";
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    if (!u.host) return "";
    return u.href;
  } catch {
    return "";
  }
}

/** 后台表格内容摘要（去换行、截断） */
export function excerpt(input: string, max = 80): string {
  const flat = String(input).replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

/** 中文日期时间 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
