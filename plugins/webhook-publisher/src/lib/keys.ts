/**
 * API key storage and validation.
 * Keys are stored in wp_options as a JSON array.
 * Each key has: id, name, key (hashed), createdAt, lastUsed, permissions.
 */
import { getOption, updateOption } from "@astropress/core/query";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export interface ApiKey {
  id: string;
  name: string;
  keyHash: string; // sha256 hex
  permissions: string[]; // e.g. ["publish", "delete"]
  createdAt: number;
  lastUsed: number | null;
}

const OPTION_KEY = "astropress_webhook_api_keys";
/** Throttle lastUsed persistence — avoids a DB write on every single API call. */
const LASTUSED_WRITE_INTERVAL = 60 * 1000;

// In-process mutex: serializes load-modify-write cycles so concurrent
// requests don't overwrite each other's changes.
let queue: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function loadKeys(db: any): Promise<ApiKey[]> {
  const raw = await getOption(db, OPTION_KEY, "[]");
  try {
    return JSON.parse(raw) as ApiKey[];
  } catch {
    return [];
  }
}

export async function saveKeys(db: any, keys: ApiKey[]): Promise<void> {
  await updateOption(db, OPTION_KEY, JSON.stringify(keys));
}

export function createKey(db: any, name: string, permissions: string[]): Promise<{ id: string; key: string }> {
  return withLock(async () => {
    const keys = await loadKeys(db);
    const id = randomBytes(8).toString("hex");
    const key = `apwh_${randomBytes(24).toString("hex")}`;
    keys.push({
      id,
      name,
      keyHash: hashKey(key),
      permissions,
      createdAt: Date.now(),
      lastUsed: null,
    });
    await saveKeys(db, keys);
    return { id, key };
  });
}

export function validateKey(db: any, key: string): Promise<ApiKey | null> {
  return withLock(async () => {
    const keys = await loadKeys(db);
    const hash = hashKey(key);
    // 恒定时间比较：hex 摘要长度固定 64，仍做长度兜底防 timingSafeEqual 抛错
    const found = keys.find((k) => {
      const a = Buffer.from(k.keyHash);
      const b = Buffer.from(hash);
      return a.length === b.length && timingSafeEqual(a, b);
    });
    if (found && Date.now() - (found.lastUsed ?? 0) > LASTUSED_WRITE_INTERVAL) {
      found.lastUsed = Date.now();
      await saveKeys(db, keys);
    }
    return found ?? null;
  });
}

export function deleteKey(db: any, id: string): Promise<boolean> {
  return withLock(async () => {
    const keys = await loadKeys(db);
    const idx = keys.findIndex((k) => k.id === id);
    if (idx === -1) return false;
    keys.splice(idx, 1);
    await saveKeys(db, keys);
    return true;
  });
}
