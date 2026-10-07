import { wpUsermeta } from "@astropress/core/schema";
import { eq, and } from "drizzle-orm";
import type { Role } from "./capabilities";

const ROLES: Role[] = ["administrator", "editor", "author", "contributor", "subscriber"];

/**
 * 从 wp_usermeta 读取用户角色。
 *
 * - 查询成功但无 wp_capabilities meta：视为 administrator（向后兼容，
 *   仅种子流程创建的初始管理员没有角色 meta；通过用户管理接口创建的用户必有 meta）。
 * - 读库失败 / JSON 解析失败：抛出异常，由调用方中间件按 subscriber fail-closed，
 *   绝不在存储层抖动时静默授予最高权限。
 */
export async function getUserRole(db: any, userId: number): Promise<Role> {
  const [row] = await db
    .select({ value: wpUsermeta.metaValue })
    .from(wpUsermeta)
    .where(and(eq(wpUsermeta.userId, userId), eq(wpUsermeta.metaKey, "wp_capabilities")))
    .limit(1);
  if (!row?.value) return "administrator"; // 无角色 meta → 初始管理员（向后兼容）
  const caps = JSON.parse(row.value) as Record<string, boolean>;
  for (const role of ROLES) {
    if (caps[role]) return role;
  }
  // meta 存在但不含任何已知角色：数据异常，拒绝提权
  throw new Error("invalid wp_capabilities value");
}
