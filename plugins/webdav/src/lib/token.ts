import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

/**
 * WebDAV 专用 access token，存 wp_options。
 * 客户端用 HTTP Basic Auth「站点用户名 : token」认证，
 * 与站点登录密码相互独立，可随时在管理页重置。
 */
export const TOKEN_KEY = "webdav_access_token";

export function generateToken(): string {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** 读取已生成的 token；未生成时返回空串 */
export async function getToken(db: any): Promise<string> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, TOKEN_KEY))
    .limit(1);
  return row?.value ?? "";
}

/** 生成（或重置）token 并持久化，返回新 token 明文（仅此一次可见） */
export async function resetToken(db: any): Promise<string> {
  const token = generateToken();
  const [row] = await db
    .select({ optionId: wpOptions.optionId })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, TOKEN_KEY))
    .limit(1);
  if (row) {
    await db
      .update(wpOptions)
      .set({ optionValue: token })
      .where(eq(wpOptions.optionName, TOKEN_KEY));
  } else {
    await db
      .insert(wpOptions)
      .values({ optionName: TOKEN_KEY, optionValue: token, autoload: "yes" });
  }
  return token;
}
