import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import node from "@astrojs/node";
import { astropress } from "@astropress/core/integration";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const dbPath = resolve(__dirname, "../../local.db");

const isCloudflare = process.env.ASTRO_ADAPTER === "cloudflare";

export default defineConfig({
  output: "server",
  adapter: isCloudflare ? cloudflare() : node({ mode: "standalone" }),
  integrations: [
    astropress({
      database: { url: `file:${dbPath}` },
    }),
  ],
  vite: {
    ssr: {
      external: isCloudflare
        ? ["node:fs/promises", "node:path", "node:fs", "node:os", "postgres", "drizzle-orm/postgres-js"]
        : ["node:fs/promises", "node:path", "node:fs", "node:os"],
    },
  },
});
