import type { APIRoute } from "astro";
import { createAuth } from "@astropress/auth";

export const POST: APIRoute = async ({ cookies, redirect, locals }) => {
  const db = locals.db;
  if (!db) return redirect("/login");

  const auth = createAuth(db as Parameters<typeof createAuth>[0]);
  const sessionId = cookies.get(auth.sessionCookieName)?.value ?? null;
  if (sessionId) await auth.invalidateSession(sessionId);

  const blank = auth.createBlankSessionCookie();
  cookies.set(blank.name, blank.value, blank.attributes);
  return redirect("/login");
};
