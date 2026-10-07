import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const SETTINGS_KEY = "astropress_backup_settings";

export const DEFAULT_SETTINGS = {
  autoEnabled: false,
  schedule: "daily" as "daily" | "weekly",
  time: "03:30",
  weekday: 1, // 0=周日 … 6=周六
  keepLast: 7,
  includeMedia: true,
};

export interface BackupSettings {
  autoEnabled: boolean;
  schedule: "daily" | "weekly";
  time: string;
  weekday: number;
  keepLast: number;
  includeMedia: boolean;
}

export function sanitize(data: Partial<BackupSettings>): BackupSettings {
  const merged = { ...DEFAULT_SETTINGS, ...data };
  merged.autoEnabled = !!merged.autoEnabled;
  merged.schedule = merged.schedule === "weekly" ? "weekly" : "daily";
  if (!/^\d{1,2}:\d{2}$/.test(merged.time)) merged.time = DEFAULT_SETTINGS.time;
  {
    const [hh, mm] = merged.time.split(":").map((x) => parseInt(x, 10));
    if (!(hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59)) merged.time = DEFAULT_SETTINGS.time;
  }
  merged.weekday = Math.max(0, Math.min(6, Number(merged.weekday) || 0));
  merged.keepLast = Math.max(1, Math.min(60, Number(merged.keepLast) || DEFAULT_SETTINGS.keepLast));
  merged.includeMedia = !!merged.includeMedia;
  return merged;
}

export async function loadSettings(db: any): Promise<BackupSettings> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);
  try {
    return sanitize(JSON.parse(row?.value ?? "{}"));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(db: any, data: Partial<BackupSettings>): Promise<BackupSettings> {
  const merged = sanitize(data);
  const payload = JSON.stringify(merged);
  const [row] = await db
    .select({ optionId: wpOptions.optionId })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SETTINGS_KEY))
    .limit(1);
  if (row) {
    await db.update(wpOptions).set({ optionValue: payload }).where(eq(wpOptions.optionId, row.optionId));
  } else {
    await db.insert(wpOptions).values({ optionName: SETTINGS_KEY, optionValue: payload });
  }
  return merged;
}
