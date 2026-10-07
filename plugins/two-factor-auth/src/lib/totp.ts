import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Base32 字符集 */
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** 生成随机 TOTP 密钥（20 字节 → 32 字符 base32） */
export function generateSecret(): string {
  const bytes = randomBytes(20);
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    result += BASE32[bytes[i] % 32];
  }
  return result;
}

/** Base32 解码 */
function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.replace(/[^A-Z2-7]/gi, "").toUpperCase();
  let bits = "";
  for (const ch of cleaned) {
    const val = BASE32.indexOf(ch);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return Buffer.from(bytes);
}

/** 生成 TOTP 码（6 位数字） */
export function generateTOTP(secret: string, time?: number): string {
  const counter = Math.floor((time ?? Date.now() / 1000) / 30);
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(0, 0);
  buf.writeUInt32BE(counter, 4);
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 1000000).toString().padStart(6, "0");
}

/** 常量时间字符串比较（长度不同时拒绝，不泄露前缀信息） */
function safeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** 验证 TOTP 码（允许前后 1 个时间窗口的偏移） */
export function verifyTOTP(secret: string, token: string): boolean {
  // 只接受 6 位数字，先卡格式避免任意字符串进入比较
  if (!/^\d{6}$/.test(String(token ?? ""))) return false;
  const now = Date.now() / 1000;
  for (const offset of [-30, 0, 30]) {
    if (safeEqualStr(generateTOTP(secret, now + offset), token)) return true;
  }
  return false;
}

/** 生成 otpauth:// URI（用于 QR 码） */
export function getOTPAuthURI(secret: string, account: string, issuer = "AstroPress"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
