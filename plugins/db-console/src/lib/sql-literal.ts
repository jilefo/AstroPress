/**
 * SQL 字面量安全编码，用于导出/备份中的 INSERT 语句。
 * 所有值都经过编码后拼接，绝不信任原始字符串。
 */

export function isBlob(v: unknown): v is ArrayBuffer | Uint8Array {
  if (v instanceof Uint8Array) return true;
  if (typeof ArrayBuffer === "function" && v instanceof ArrayBuffer) return true;
  return false;
}

export function asBytes(v: ArrayBuffer | Uint8Array): Uint8Array {
  return v instanceof Uint8Array ? v : new Uint8Array(v);
}

function toHex(v: ArrayBuffer | Uint8Array): string {
  const bytes = asBytes(v);
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

/** 将一个 JS 值编码为 SQL 字面量 */
export function encodeValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "bigint") return v.toString();
  if (typeof v === "boolean") return v ? "1" : "0";
  if (isBlob(v)) return `X'${toHex(v)}'`;
  // 其余一律按字符串处理，单引号双写转义
  return "'" + String(v).replace(/'/g, "''") + "'";
}
