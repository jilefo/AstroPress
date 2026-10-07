/**
 * 逻辑转储用 SQL 字面量安全编码。
 */

export function isBlob(v: unknown): v is ArrayBuffer | Uint8Array {
  if (v instanceof Uint8Array) return true;
  if (typeof ArrayBuffer === "function" && v instanceof ArrayBuffer) return true;
  return false;
}

function toHex(v: ArrayBuffer | Uint8Array): string {
  const bytes = v instanceof Uint8Array ? v : new Uint8Array(v);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

/** 双引号包裹的标识符（内部 " 双写转义） */
export function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

/** JS 值 → SQL 字面量：null / 数字 / BLOB hex / 单引号转义字符串 */
export function encodeValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "boolean") return v ? "1" : "0";
  if (isBlob(v)) return `X'${toHex(v)}'`;
  return "'" + String(v).replace(/'/g, "''") + "'";
}
