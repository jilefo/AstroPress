import type { APIRoute } from "astro";
import { eq, desc } from "drizzle-orm";
import { wpUsers, wpUsermeta } from "@astropress/core/schema";
import { hashPassword } from "@astropress/auth";
import { readJsonBody } from "../../../lib/json-body";

const ROLES = ["administrator", "editor", "author", "contributor", "subscriber"] as const;

async function getUserRole(db: any, userId: number): Promise<string> {
  const [row] = await db
    .select({ value: wpUsermeta.metaValue })
    .from(wpUsermeta)
    .where(eq(wpUsermeta.userId, userId))
    .where(eq(wpUsermeta.metaKey, "wp_capabilities"))
    .limit(1);
  if (!row?.value) return "subscriber";
  try {
    const caps = JSON.parse(row.value) as Record<string, boolean>;
    for (const role of ROLES) {
      if (caps[role]) return role;
    }
  } catch {}
  return "subscriber";
}

async function setUserRole(db: any, userId: number, role: string): Promise<void> {
  const caps = JSON.stringify({ [role]: true });
  const existing = await db
    .select({ id: wpUsermeta.umetaId })
    .from(wpUsermeta)
    .where(eq(wpUsermeta.userId, userId))
    .where(eq(wpUsermeta.metaKey, "wp_capabilities"))
    .limit(1);

  if (existing.length > 0) {
    await db.update(wpUsermeta)
      .set({ metaValue: caps })
      .where(eq(wpUsermeta.umetaId, existing[0].id));
  } else {
    await db.insert(wpUsermeta).values({ userId, metaKey: "wp_capabilities", metaValue: caps });
  }
}

export const GET: APIRoute = async ({ locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const users = await db.select().from(wpUsers).orderBy(desc(wpUsers.id));

  const result = await Promise.all(users.map(async (u: any) => ({
    id: u.id,
    userLogin: u.userLogin,
    userEmail: u.userEmail,
    displayName: u.displayName,
    userRegistered: u.userRegistered,
    role: await getUserRole(db, u.id),
  })));

  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const parsed = await readJsonBody<any>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const { userLogin, userEmail, displayName, password, role } = body;

  if (!userLogin || !userEmail || !password) {
    return new Response(JSON.stringify({ error: "用户名、邮箱和密码均为必填项" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  // Check for duplicate login or email
  const [dup] = await db.select({ id: wpUsers.id }).from(wpUsers).where(eq(wpUsers.userLogin, userLogin)).limit(1);
  if (dup) return new Response(JSON.stringify({ error: "用户名已存在" }), { status: 409, headers: { "Content-Type": "application/json" } });

  const hashedPass = await hashPassword(password);
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  const [inserted] = await db.insert(wpUsers).values({
    userLogin,
    userPass: hashedPass,
    userNicename: userLogin.toLowerCase().replace(/\s+/g, "-"),
    userEmail,
    displayName: displayName || userLogin,
    userRegistered: now,
  }).returning({ id: wpUsers.id });

  await setUserRole(db, inserted.id, role || "subscriber");

  return new Response(JSON.stringify({ ok: true, id: inserted.id }), { headers: { "Content-Type": "application/json" } });
};
