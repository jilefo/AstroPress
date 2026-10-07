/**
 * SSRF guard for remote image sideloading.
 *
 * Every URL the server is about to fetch must pass:
 *  - http/https scheme only, no userinfo, no non-standard ports;
 *  - no loopback / link-local / private / reserved IP space, both for IP
 *    literals and for every address returned by DNS (rebinding protection);
 *  - well-known cloud metadata hosts blocked by name.
 *
 * On runtimes without node:dns (e.g. Cloudflare Workers) DNS vetting is
 * skipped — edge runtimes themselves block private-range egress, and raw IP
 * literals are still checked here.
 */

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const BLOCKED_HOST_SUFFIXES = [
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "metadata.tencentyun.com",
  "metadata.aliyun.com",
  "metadata.azure.com",
];

/** Validate an absolute URL and throw UnsafeUrlError when it must not be fetched. */
export async function assertSafeRemoteUrl(raw: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError("链接格式不正确");
  }

  if (u.protocol !== "http:" && u.protocol !== "https:")
    throw new UnsafeUrlError("仅允许 http/https 链接");
  if (u.username || u.password)
    throw new UnsafeUrlError("不允许在链接中携带账号密码");
  if (u.port && u.port !== "80" && u.port !== "443")
    throw new UnsafeUrlError("已拦截非标准端口");

  const host = u.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (!host) throw new UnsafeUrlError("链接缺少主机名");
  if (BLOCKED_HOST_SUFFIXES.includes(host) ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")) {
    throw new UnsafeUrlError("该主机已被拦截");
  }

  const family = ipFamily(host);
  if (family) {
    assertPublicIp(host, family);
    return;
  }

  // Hostname: resolve and vet every record (DNS-rebinding defence).
  try {
    const dns = await import("node:dns/promises");
    const records: Array<{ address: string; family: number }> =
      await dns.lookup(host, { all: true });
    if (!records.length) throw new UnsafeUrlError("域名解析未返回任何地址");
    for (const r of records) assertPublicIp(r.address, r.family === 6 ? 6 : 4);
  } catch (err) {
    if (err instanceof UnsafeUrlError) throw err;
    // node:dns unavailable (edge runtime) or resolution failed — let fetch
    // make the final call; it will reject on its own when appropriate.
  }
}

function ipFamily(host: string): 4 | 6 | null {
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return 4;
  if (host.includes(":")) return 6;
  return null;
}

function assertPublicIp(ip: string, family: 4 | 6): void {
  if (family === 4) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
    if (!m) throw new UnsafeUrlError("IPv4 地址格式不正确");
    const o = m.slice(1).map(Number);
    if (o.some((x) => x > 255)) throw new UnsafeUrlError("IPv4 地址格式不正确");
    const [a, b] = o;
    const blocked =
      a === 0 || // 0.0.0.0/8 "this network"
      a === 10 || // private
      (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64.0.0/10
      a === 127 || // loopback
      (a === 169 && b === 254) || // link-local
      (a === 172 && b >= 16 && b <= 31) || // private
      (a === 192 && b === 0) || // 192.0.0.0/24 + TEST-NET-1
      (a === 192 && b === 88) || // 6to4 relay anycast 192.88.99.0/24
      (a === 192 && b === 168) || // private
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      (a === 198 && b === 51) || // TEST-NET-2
      (a === 203 && b === 0) || // TEST-NET-3
      a >= 224; // multicast + reserved
    if (blocked) throw new UnsafeUrlError("已拦截私有/保留 IP 地址段");
    return;
  }

  const big = parseIpv6(ip);
  if (big === null) throw new UnsafeUrlError("IPv6 地址格式不正确");

  const prefix = (bits: number) => big >> BigInt(128 - bits);
  const low32 = big & 0xffffffffn;
  const high96 = big >> 32n;

  // ::a.b.c.d (v4-compatible, deprecated) — the whole range is dead weight;
  // :: and ::1 already fall in here as well.
  if (high96 === 0n) throw new UnsafeUrlError("已拦截私有/保留 IPv6 地址段");
  // v4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::/32) carry an embedded
  // IPv4 address — vet that instead.
  if (high96 === 0xffffn || prefix(32) === 0x0064ff9bn) {
    assertPublicIp(bigIntToV4(low32), 4);
    return;
  }

  const blocked =
    big === 0n || // :: unspecified
    big === 1n || // ::1 loopback
    prefix(8) === 0xffn || // ff00::/8 multicast
    prefix(7) === 0x7en || // fc00::/7 unique local
    prefix(10) === 0x3fan || // fe80::/10 link-local
    prefix(10) === 0x3fbn || // fec0::/10 deprecated site-local
    prefix(32) === 0x20010db8n; // 2001:db8::/32 documentation
  if (blocked) throw new UnsafeUrlError("已拦截私有/保留 IPv6 地址段");
}

/** Parse IPv6 (with :: expansion, no zones) to a 128-bit bigint; null on error. */
function parseIpv6(ip: string): bigint | null {
  let s = ip.toLowerCase().split("%")[0];
  if (s.startsWith("[")) s = s.slice(1);
  if (s.endsWith("]")) s = s.slice(0, -1);

  const dbl = s.split("::");
  if (dbl.length > 2) return null;

  const parseGroups = (part: string): string[] => {
    if (part === "") return [];
    return part.split(":");
  };
  const head = dbl[0] !== undefined ? parseGroups(dbl[0]) : [];
  const tail = dbl.length === 2 && dbl[1] !== undefined ? parseGroups(dbl[1]) : [];

  // Embedded IPv4 occupies 2 groups.
  let v4: string | null = null;
  const last = tail[tail.length - 1] ?? head[head.length - 1];
  if (last && last.includes(".")) {
    v4 = last;
  }

  let groups: string[];
  if (dbl.length === 2) {
    // A trailing IPv4 literal occupies one textual slot but two 16-bit groups.
    const missing = 8 - head.length - tail.length - (v4 ? 1 : 0);
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tail];
  } else {
    groups = [...head];
  }

  if (v4) {
    groups[groups.length - 1] = v4;
    const flat: number[] = [];
    for (const g of groups) {
      if (g.includes(".")) {
        const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(g);
        if (!m) return null;
        const o = m.slice(1).map(Number);
        if (o.some((x) => x > 255)) return null;
        flat.push((o[0] << 8) | o[1], (o[2] << 8) | o[3]);
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
        flat.push(parseInt(g, 16));
      }
    }
    if (flat.length !== 8) return null;
    return flat.reduce((acc, g16) => (acc << 16n) | BigInt(g16), 0n);
  }

  if (groups.length !== 8) return null;
  let out = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out = (out << 16n) | BigInt(parseInt(g, 16));
  }
  return out;
}

function bigIntToV4(low32: bigint): string {
  const n = Number(low32);
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}
