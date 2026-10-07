/**
 * 生成 URL slug：保留 Unicode 字母/数字（含中文等 CJK 字符），
 * 空白与斜杠转为连字符，其余符号移除。调用方需自行处理空结果（如追加随机后缀）。
 */
export function slugify(title: string): string {
  return (title || "")
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[\s/\\]+/g, "-")
    .replace(/[^\p{L}\p{N}_-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
