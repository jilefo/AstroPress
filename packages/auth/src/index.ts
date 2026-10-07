import {
  Lucia,
  type Adapter,
  type DatabaseSession,
  type DatabaseUser,
} from "lucia";
import { eq, sql } from "drizzle-orm";
import type { Database } from "@astropress/core";
import { wpSessions, wpUsers } from "@astropress/core/schema";

// ---------------------------------------------------------------------------
// Custom Lucia adapter — bridges WordPress integer user IDs to Lucia's string IDs
// ---------------------------------------------------------------------------
class WordPressAdapter implements Adapter {
  constructor(private db: Database) {}

  async getSessionAndUser(
    sessionId: string
  ): Promise<[DatabaseSession | null, DatabaseUser | null]> {
    const [row] = await this.db
      .select()
      .from(wpSessions)
      .where(eq(wpSessions.id, sessionId))
      .limit(1);

    if (!row) return [null, null];

    const [user] = await this.db
      .select()
      .from(wpUsers)
      .where(eq(wpUsers.id, parseInt(row.userId, 10)))
      .limit(1);

    if (!user) return [null, null];

    return [
      {
        id: row.id,
        userId: row.userId,
        expiresAt: new Date(row.expiresAt * 1000),
        attributes: {},
      },
      {
        id: String(user.id),
        attributes: {
          user_login: user.userLogin,
          user_email: user.userEmail,
          display_name: user.displayName,
        },
      },
    ];
  }

  async getUserSessions(userId: string): Promise<DatabaseSession[]> {
    const rows = await this.db
      .select()
      .from(wpSessions)
      .where(eq(wpSessions.userId, userId));

    return rows.map((r: typeof wpSessions.$inferSelect) => ({
      id: r.id,
      userId: r.userId,
      expiresAt: new Date(r.expiresAt * 1000),
      attributes: {},
    }));
  }

  async setSession(session: DatabaseSession): Promise<void> {
    await this.db.insert(wpSessions).values({
      id: session.id,
      userId: session.userId,
      expiresAt: Math.floor(session.expiresAt.getTime() / 1000),
    });
  }

  async updateSessionExpiration(
    sessionId: string,
    expiresAt: Date
  ): Promise<void> {
    await this.db
      .update(wpSessions)
      .set({ expiresAt: Math.floor(expiresAt.getTime() / 1000) })
      .where(eq(wpSessions.id, sessionId));
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.db.delete(wpSessions).where(eq(wpSessions.id, sessionId));
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.db.delete(wpSessions).where(eq(wpSessions.userId, userId));
  }

  async deleteExpiredSessions(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.db
      .delete(wpSessions)
      .where(sql`${wpSessions.expiresAt} < ${now}`);
  }
}

// ---------------------------------------------------------------------------
// Auth factory
// ---------------------------------------------------------------------------
export function createAuth(db: Database) {
  const adapter = new WordPressAdapter(db);

  return new Lucia(adapter, {
    sessionCookie: {
      attributes: {
        secure:
          // CF Workers（无 process）：恒为 secure。
          // Node：仅显式 NODE_ENV=development（astro dev）时关闭；
          // 生产部署即使未设置 NODE_ENV 也必须带 Secure（旧逻辑要求
          // NODE_ENV 严格等于 "production"，在 wrangler 下 NODE_ENV 缺省，
          // 导致会话 cookie 无 Secure 属性）。
          typeof (globalThis as Record<string, unknown>).process === "undefined"
            ? true
            : (
                globalThis as {
                  process?: { env?: { NODE_ENV?: string } };
                }
              ).process?.env?.NODE_ENV !== "development",
      },
    },
    getUserAttributes(attributes) {
      return {
        userLogin: attributes.user_login,
        userEmail: attributes.user_email,
        displayName: attributes.display_name,
      };
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

declare module "lucia" {
  interface Register {
    Auth: Auth;
    DatabaseUserAttributes: {
      user_login: string;
      user_email: string;
      display_name: string;
    };
  }
}

// ---------------------------------------------------------------------------
// Password hashing — PBKDF2 via Web Crypto (Node 18+, CF Workers, browsers)
// Format: "pbkdf2:<saltHex>:<hashHex>"
// ---------------------------------------------------------------------------

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

async function pbkdf2Key(
  password: string,
  salt: Uint8Array
): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: 100_000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await pbkdf2Key(password, salt);
  return `pbkdf2:${toHex(salt.buffer as ArrayBuffer)}:${toHex(hash)}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "pbkdf2") return false;
  const [, saltHex, hashHex] = parts;
  const salt = fromHex(saltHex);
  const derived = await pbkdf2Key(password, salt);
  return toHex(derived) === hashHex;
}
