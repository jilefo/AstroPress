/**
 * Webhook call log — stores the last N webhook invocations in wp_options.
 */
import { getOption, updateOption } from "@astropress/core/query";

export interface WebhookLog {
  id: string;
  timestamp: number;
  action: string;
  keyId: string;
  keyName: string;
  status: "success" | "error";
  message: string;
  payload?: unknown;
}

const OPTION_KEY = "astropress_webhook_logs";
const MAX_LOGS = 100;

export async function loadLogs(db: any): Promise<WebhookLog[]> {
  const raw = await getOption(db, OPTION_KEY, "[]");
  try {
    return JSON.parse(raw) as WebhookLog[];
  } catch {
    return [];
  }
}

// In-process mutex: serializes load-modify-write cycles so concurrent
// webhook calls don't overwrite each other's log entries.
let queue: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

export function appendLog(db: any, log: Omit<WebhookLog, "id" | "timestamp">): Promise<void> {
  return withLock(async () => {
    const logs = await loadLogs(db);
    logs.unshift({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      ...log,
    });
    if (logs.length > MAX_LOGS) logs.length = MAX_LOGS;
    await updateOption(db, OPTION_KEY, JSON.stringify(logs));
  });
}

export async function clearLogs(db: any): Promise<void> {
  await updateOption(db, OPTION_KEY, "[]");
}
