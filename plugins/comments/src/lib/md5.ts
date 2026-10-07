/**
 * 纯 TS MD5（RFC 1321），无外部依赖，兼容 Node 与 Cloudflare Workers。
 * 仅用于 Gravatar 头像哈希（非安全场景）。常量表由 sin 公式现算，避免硬编码错误。
 */

function safeAdd(x: number, y: number): number {
  const lsw = (x & 0xffff) + (y & 0xffff);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xffff);
}

function bitRol(num: number, cnt: number): number {
  return (num << cnt) | (num >>> (32 - cnt));
}

/** K[i] = floor(2^32 * abs(sin(i+1))) */
const K: number[] = new Array(64);
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) | 0;

const SHIFTS: number[][] = [
  [7, 12, 17, 22],
  [5, 9, 14, 20],
  [4, 11, 16, 23],
  [6, 10, 15, 21],
];

/** 处理一个 512 位分组，返回新的链接状态 */
function transform(h: number[], x: number[]): number[] {
  let [a, b, c, d] = h;

  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < 16; i++) {
      let f: number;
      let g: number;
      if (round === 0) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (round === 1) {
        f = (b & d) | (c & ~d);
        g = (5 * i + 1) % 16;
      } else if (round === 2) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const s = SHIFTS[round][i % 4];
      const sum = safeAdd(safeAdd(a, f), safeAdd(x[g], K[round * 16 + i]));
      const rotated = bitRol(sum, s);
      const newB = safeAdd(b, rotated);
      a = d;
      d = c;
      c = b;
      b = newB;
    }
  }

  return [safeAdd(h[0], a), safeAdd(h[1], b), safeAdd(h[2], c), safeAdd(h[3], d)];
}

/** 字符串 → UTF-8 字节 */
function utf8Bytes(input: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i);
    // 代理对 → 码点
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return bytes;
}

export function md5(input: string): string {
  const bytes = utf8Bytes(input);
  const bitLen = bytes.length * 8;

  // 填充：0x80 + 0... + 64 位小端长度（按 512 位 / 16 字分组）
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  // 长度低 32 位小端（高 32 位为 0，实际输入远小于 512MB）
  bytes.push(bitLen & 0xff, (bitLen >>> 8) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 24) & 0xff);
  bytes.push(0, 0, 0, 0);

  let h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let off = 0; off < bytes.length; off += 64) {
    const words = new Array(16).fill(0);
    for (let i = 0; i < 64; i++) {
      words[i >> 2] |= bytes[off + i] << ((i % 4) * 8);
    }
    h = transform(h, words);
  }

  const hex = "0123456789abcdef";
  let out = "";
  for (const word of h) {
    for (let i = 0; i < 4; i++) {
      const b = (word >>> (i * 8)) & 0xff;
      out += hex.charAt((b >>> 4) & 0x0f) + hex.charAt(b & 0x0f);
    }
  }
  return out;
}
