/**
 * Auth secret management — auto-generates and persists in wp_options.
 *
 * AstroPress never requires AUTH_SECRET in .env.
 * On first boot the secret is generated via Web Crypto and stored in the DB.
 * Subsequent requests reuse the cached in-memory value (same process lifetime).
 */

import { eq } from "drizzle-orm";
import { wpOptions } from "./schema/index";

const OPTION_KEY = "astropress_auth_secret";
const SECRET_BYTES = 48; // 384 bits — plenty for session signing

let _cached: string | null = null;

function generateSecret(): string {
  const buf = new Uint8Array(SECRET_BYTES);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Get (or create) the auth secret.
 *
 * 1. Returns the in-memory cached value if available.
 * 2. Reads from `wp_options.astropress_auth_secret` if the DB is ready.
 * 3. Generates a new secret, persists it, and caches it.
 *
 * Falls back to a process-scoped random secret if the DB is not yet
 * reachable (e.g. before setup runs) — sessions created before setup
 * will be invalidated once setup completes and the secret is persisted.
 */
export async function getAuthSecret(db: any): Promise<string> {
  if (_cached) return _cached;

  try {
    const rows = await db
      .select({ value: wpOptions.optionValue })
      .from(wpOptions)
      .where(eq(wpOptions.optionName, OPTION_KEY))
      .limit(1);

    if (rows[0]?.value) {
      _cached = rows[0].value;
      return _cached!;
    }

    // Not found — generate, persist, cache
    const secret = generateSecret();
    await db.insert(wpOptions).values({
      optionName: OPTION_KEY,
      optionValue: secret,
      autoload: "yes",
    });
    _cached = secret;
    return secret;
  } catch {
    // DB not ready yet (pre-setup) — use a temporary process-scoped secret
    if (!_cached) _cached = generateSecret();
    return _cached!;
  }
}

/** Reset the in-memory cache (used in tests). */
export function resetSecretCache() {
  _cached = null;
}
