import type { APIRoute } from "astro";
import { eq, and } from "drizzle-orm";
import { wpUsers, wpUsermeta } from "@astropress/core/schema";
import { hashPassword } from "@astropress/auth";

async function getUserRole(db: any, userId: number): Promise<string> {
  const [row] = await db
    .select({ value: wpUsermeta.metaValue })
    .from(wpUsermeta)
    .where(and(eq(wpUsermeta.userId, userId), eq(wpUsermeta.metaKey, "wp_capabilities")))
    .limit(1);
  if (!row?.value) return "subscriber";
  try {
    const caps = JSON.parse(row.value) as Record<string, boolean>;
    const ROLES = ["administrator", "editor", "author", "contributor", "subscriber"];
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
    .where(and(eq(wpUsermeta.userId, userId), eq(wpUsermeta.metaKey, "wp_capabilities")))
    .limit(1);
  if (existing.length > 0) {
    await db.update(wpUsermeta).set({ metaValue: caps }).where(eq(wpUsermeta.umetaId, existing[0].id));
  } else {
    await db.insert(wpUsermeta).values({ userId, metaKey: "wp_capabilities", metaValue: caps });
  }
}

export const GET: APIRoute = async ({ params, locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const id = Number(params.id);
  const [user] = await db.select().from(wpUsers).where(eq(wpUsers.id, id)).limit(1);
  if (!user) return new Response(JSON.stringify({ error: "用户不存在" }), { status: 404, headers: { "Content-Type": "application/json" } });

  const role = await getUserRole(db, id);
  return new Response(JSON.stringify({ id: user.id, userLogin: user.userLogin, userEmail: user.userEmail, displayName: user.displayName, userRegistered: user.userRegistered, role }), { headers: { "Content-Type": "application/json" } });
};

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const id = Number(params.id);
  const body = await request.json() as any;
  const { userEmail, displayName, password, role } = body;

  const updates: Record<string, any> = {};
  if (userEmail !== undefined) updates.userEmail = userEmail;
  if (displayName !== undefined) updates.displayName = displayName;
  if (password) updates.userPass = await hashPassword(password);

  if (Object.keys(updates).length > 0) {
    await db.update(wpUsers).set(updates).where(eq(wpUsers.id, id));
  }

  if (role) await setUserRole(db, id, role);

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};

export const DELETE: APIRoute = async ({ params, locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const id = Number(params.id);
  if (id === locals.user.id) {
    return new Response(JSON.stringify({ error: "不能删除当前登录的账号" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  await db.delete(wpUsermeta).where(eq(wpUsermeta.userId, id));
  await db.delete(wpUsers).where(eq(wpUsers.id, id));

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};
