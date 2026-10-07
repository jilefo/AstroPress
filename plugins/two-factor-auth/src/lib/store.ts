import { wpUsermeta } from "@astropress/core/schema";
import { eq, and } from "drizzle-orm";

/** 获取用户 2FA 密钥 */
export async function get2FASecret(db: any, userId: number): Promise<string | null> {
  try {
    const [row] = await db
      .select({ value: wpUsermeta.metaValue })
      .from(wpUsermeta)
      .where(and(eq(wpUsermeta.userId, userId), eq(wpUsermeta.metaKey, "_2fa_secret")))
      .limit(1);
    return row?.value || null;
  } catch { return null; }
}

/** 获取用户 2FA 是否启用 */
export async function is2FAEnabled(db: any, userId: number): Promise<boolean> {
  try {
    const [row] = await db
      .select({ value: wpUsermeta.metaValue })
      .from(wpUsermeta)
      .where(and(eq(wpUsermeta.userId, userId), eq(wpUsermeta.metaKey, "_2fa_enabled")))
      .limit(1);
    return row?.value === "1";
  } catch { return false; }
}

/** 设置 2FA 密钥并启用 */
export async function enable2FA(db: any, userId: number, secret: string): Promise<void> {
  // 保存密钥
  const existing = await db
    .select({ umetaId: wpUsermeta.umetaId })
    .from(wpUsermeta)
    .where(and(eq(wpUsermeta.userId, userId), eq(wpUsermeta.metaKey, "_2fa_secret")))
    .limit(1);
  if (existing.length > 0) {
    await db.update(wpUsermeta).set({ metaValue: secret }).where(eq(wpUsermeta.umetaId, existing[0].umetaId));
  } else {
    await db.insert(wpUsermeta).values({ userId, metaKey: "_2fa_secret", metaValue: secret });
  }
  // 启用标记
  const enExisting = await db
    .select({ umetaId: wpUsermeta.umetaId })
    .from(wpUsermeta)
    .where(and(eq(wpUsermeta.userId, userId), eq(wpUsermeta.metaKey, "_2fa_enabled")))
    .limit(1);
  if (enExisting.length > 0) {
    await db.update(wpUsermeta).set({ metaValue: "1" }).where(eq(wpUsermeta.umetaId, enExisting[0].umetaId));
  } else {
    await db.insert(wpUsermeta).values({ userId, metaKey: "_2fa_enabled", metaValue: "1" });
  }
}

/** 禁用 2FA */
export async function disable2FA(db: any, userId: number): Promise<void> {
  await db.delete(wpUsermeta).where(and(eq(wpUsermeta.userId, userId), eq(wpUsermeta.metaKey, "_2fa_secret")));
  await db.delete(wpUsermeta).where(and(eq(wpUsermeta.userId, userId), eq(wpUsermeta.metaKey, "_2fa_enabled")));
}
