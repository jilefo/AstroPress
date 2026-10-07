import * as fs from "node:fs/promises";
import * as path from "node:path";

/** 递归复制文件/目录；目标同级同名时自动加 -1/-2 后缀。返回实际目标绝对路径。 */
export async function copyRecursive(srcAbs: string, destDirAbs: string): Promise<string> {
  const base = path.basename(srcAbs);
  const st = await fs.stat(srcAbs);
  const target = await uniqueInDir(destDirAbs, base);
  if (st.isDirectory()) {
    await fs.mkdir(target, { recursive: true });
    const entries = await fs.readdir(srcAbs, { withFileTypes: true });
    for (const ent of entries) {
      await copyRecursive(path.join(srcAbs, ent.name), target);
    }
  } else {
    await fs.mkdir(destDirAbs, { recursive: true });
    await fs.copyFile(srcAbs, target);
  }
  return target;
}

/** 同卷移动（rename）；跨卷回退为复制+删除。返回实际目标绝对路径。 */
export async function moveEntry(srcAbs: string, destDirAbs: string): Promise<string> {
  const base = path.basename(srcAbs);
  await fs.mkdir(destDirAbs, { recursive: true });
  const target = await uniqueInDir(destDirAbs, base);
  try {
    await fs.rename(srcAbs, target);
  } catch (e: any) {
    if (e && (e.code === "EXDEV" || e.code === "EPERM")) {
      await fs.cp(srcAbs, target, { recursive: true });
      await fs.rm(srcAbs, { recursive: true, force: true });
      return target;
    }
    throw e;
  }
  return target;
}

/** 在目录中生成不冲突的名字：name → name-1.ext … */
async function uniqueInDir(dir: string, base: string): Promise<string> {
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let candidate = path.join(dir, base);
  let n = 0;
  while (true) {
    const st = await fs.stat(candidate).catch(() => null);
    if (!st) return candidate;
    n += 1;
    candidate = path.join(dir, `${stem}-${n}${ext}`);
  }
}

/** 列出某目录下的子目录（相对 posix 路径），供前端目录选择器 */
export async function listDirectories(rootAbs: string, maxDepth = 3): Promise<string[]> {
  const out: string[] = [];
  async function walk(dirAbs: string, depth: number, relPrefix: string): Promise<void> {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await fs.readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const name = ent.name;
      if (name.startsWith(".") || name === "node_modules") continue;
      const rel = relPrefix ? `${relPrefix}/${name}` : name;
      out.push(rel);
      await walk(path.join(dirAbs, name), depth + 1, rel);
    }
  }
  await walk(rootAbs, 1, "");
  return out.sort((a, b) => a.localeCompare(b));
}
