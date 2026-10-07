/// <reference path="../env.d.ts" />
import { createDatabase, createD1Database } from "@astropress/core";

/**
 * pre 中间件先于应用中间件执行，locals.db 尚未注入。
 * 这里自建进程级单例连接，优先级：
 *   D1 绑定（生产 Cloudflare）→ virtual:astropress/config → 仓库根 local.db
 */
let _db: any = null;

export async function getPreDb(locals: any): Promise<any> {
  if (_db) return _db;
  const d1 = locals?.runtime?.env?.DB;
  if (d1) return createD1Database(d1); // D1 为绑定对象，无需缓存连接
  let url: string | undefined;
  try {
    const cfg: any = await import("virtual:astropress/config");
    url = cfg?.database?.url;
  } catch { /* 虚拟模块不可用时走相对路径 */ }
  if (!url) {
    const { dirname, resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    // plugins/plugin-manager/src/lib → 上四级 = 仓库根
    url = "file:" + resolve(dirname(fileURLToPath(import.meta.url ?? "file:///")), "..", "..", "..", "..", "local.db");
  }
  _db = await createDatabase(url);
  return _db;
}
