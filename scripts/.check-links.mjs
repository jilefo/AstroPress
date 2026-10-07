// 检查 apps/admin 的 @astropress 依赖是否可解析（识别坏链接）
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const adminDir = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "admin");
const pkg = JSON.parse(readFileSync(join(adminDir, "package.json"), "utf-8"));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
const req = createRequire(join(adminDir, "package.json"));
let broken = 0;
for (const name of Object.keys(deps).filter((n) => n.startsWith("@astropress/"))) {
  try {
    req.resolve(name);
  } catch {
    broken++;
    console.log("BROKEN:", name);
  }
}
console.log(broken === 0 ? "ALL_OK" : `broken=${broken}`);
