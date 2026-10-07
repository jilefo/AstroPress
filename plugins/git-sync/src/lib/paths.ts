import * as fs from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// src/lib 下：lib → src → git-sync → plugins → 仓库根，共上溯 4 级
const libDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
export const repoRoot = resolve(libDir, "..", "..", "..", "..");

/**
 * 媒体目录探测：apps/admin/public/media，
 * 通过 fs 探测确认存在且为目录，否则返回 null。
 */
export async function findMediaDir(): Promise<string | null> {
  const candidates = [resolve(repoRoot, "apps", "admin", "public", "media")];
  for (const dir of candidates) {
    try {
      const st = await fs.stat(dir);
      if (st.isDirectory()) return dir;
    } catch {
      /* 不存在，继续探测 */
    }
  }
  return null;
}
