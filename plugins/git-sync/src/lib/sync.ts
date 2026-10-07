/**
 * 同步编排：按勾选范围收集文件 → 逐个通过驱动 PUT 到远端仓库 → 记录历史。
 */
import { Buffer } from "node:buffer";
import { buildConfigExport } from "./config-export";
import { buildDump } from "./dump";
import { createDriver, DriverError, PRESETS } from "./drivers";
import { collectMediaPlan, readMediaBase64 } from "./media";
import { advanceSiteCursor, collectSitePlan, readSiteBase64 } from "./site";
import {
  GitSyncSettings,
  HistoryEntry,
  joinRemote,
  pushHistory,
} from "./settings";


export interface FileResult {
  path: string;
  ok: boolean;
  bytes: number;
  error?: string;
}

export interface SyncSummary {
  ok: boolean;
  platform: string;
  startedAt: string;
  durationMs: number;
  total: number;
  succeeded: number;
  failed: number;
  results: FileResult[];
  warnings: string[];
}

interface PendingFile {
  path: string;
  base64: string;
  bytes: number;
}

function textBase64(text: string): { base64: string; bytes: number } {
  const buf = Buffer.from(text, "utf-8");
  return { base64: buf.toString("base64"), bytes: buf.byteLength };
}

/** 收集待推送文件清单（不落盘，直接内存 base64） */
async function collectFiles(
  db: any,
  settings: GitSyncSettings,
  warnings: string[]
): Promise<PendingFile[]> {
  const files: PendingFile[] = [];
  const prefix = settings.prefix;

  if (settings.scopes.dbDump) {
    const dump = await buildDump(db);
    const b = textBase64(dump);
    files.push({ path: joinRemote(prefix, settings.dumpPath), base64: b.base64, bytes: b.bytes });
  }

  if (settings.scopes.configJson) {
    const envelope = await buildConfigExport(db);
    const b = textBase64(JSON.stringify(envelope, null, 2));
    files.push({
      path: joinRemote(prefix, "config/astropress-config.json"),
      base64: b.base64,
      bytes: b.bytes,
    });
  }

  if (settings.scopes.media) {
    const plan = await collectMediaPlan();
    if (!plan.mediaDirFound) {
      warnings.push("未找到媒体目录（apps/admin/public/media），已跳过媒体同步");
    }
    for (const s of plan.skipped) {
      warnings.push(`${s.rel}（${(s.size / 1024 / 1024).toFixed(1)}MB）：${s.reason}`);
    }
    if (plan.remaining > 0) {
      warnings.push(
        `本次已达单次 50 个文件上限，剩余 ${plan.remaining} 个媒体文件未推送，再次执行「立即同步」即可续传`
      );
    }
    for (const entry of plan.files) {
      const base64 = await readMediaBase64(entry.abs);
      files.push({
        path: joinRemote(prefix, "media/" + entry.rel),
        base64,
        bytes: entry.size,
      });
    }
  }

  if (settings.scopes.site) {
    const plan = await collectSitePlan(db);
    if (plan.wrapped) {
      warnings.push("整站源码已完整同步一轮，本次从头开始覆盖更新");
    }
    for (const s of plan.skipped) {
      warnings.push(`${s.rel}（${(s.size / 1024 / 1024).toFixed(1)}MB）：${s.reason}`);
    }
    if (plan.remaining > 0) {
      warnings.push(
        `本次已推送 ${plan.files.length} 个源码文件，剩余约 ${plan.remaining} 个未推送，再次执行「立即同步」即可续传`
      );
    }
    for (const entry of plan.files) {
      const base64 = await readSiteBase64(entry.abs);
      files.push({
        path: joinRemote(prefix, "site/" + entry.rel),
        base64,
        bytes: entry.size,
      });
    }
  }

  return files;
}

/**
 * 执行一次同步。平台/仓库配置错误抛 DriverError；
 * 单文件失败不阻断后续文件，全部结果汇总返回并写入历史。
 */
export async function runSync(db: any, settings: GitSyncSettings): Promise<SyncSummary> {
  const driver = createDriver(settings);
  const platform = PRESETS[settings.preset]?.label ?? settings.preset;
  const startedAt = new Date();
  const warnings: string[] = [];
  const results: FileResult[] = [];

  const files = await collectFiles(db, settings, warnings);
  if (files.length === 0) {
    warnings.push("没有需要同步的文件（请检查同步范围勾选与媒体目录）");
  }

  for (const f of files) {
    const stamp = startedAt.toISOString();
    try {
      await driver.putFile(f.path, f.base64, `chore(sync): ${f.path} @ ${stamp}`);
      results.push({ path: f.path, ok: true, bytes: f.bytes });
    } catch (e) {
      // DriverError 为策展文案（含 token 脱敏）可直接展示；内部异常不透传，只留服务端日志
      let error: string;
      if (e instanceof DriverError) {
        error = e.message;
      } else {
        console.error(`[git-sync] 文件推送异常（${f.path}）：`, e);
        error = "内部错误，详情见服务器日志";
      }
      results.push({ path: f.path, ok: false, bytes: f.bytes, error });
    }
  }

  // 整站源码游标推进：以本批次最后一个 site/ 文件为准（失败文件留待下一轮覆盖）
  if (settings.scopes.site) {
    const sitePrefix = joinRemote(settings.prefix, "site/");
    const siteResults = results.filter((r) => r.path.startsWith(sitePrefix));
    if (siteResults.length > 0) {
      const last = siteResults[siteResults.length - 1];
      await advanceSiteCursor(db, last.path.slice(sitePrefix.length));
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;
  const ok = failed === 0 && results.length > 0;

  const historyEntry: HistoryEntry = {
    time: startedAt.toISOString(),
    platform,
    files: succeeded,
    ok,
    message: ok
      ? `成功推送 ${succeeded} 个文件`
      : results.length === 0
        ? "无文件可同步"
        : `失败 ${failed}/${results.length}：${results.find((r) => !r.ok)?.error ?? "未知错误"}`,
  };
  try {
    await pushHistory(db, historyEntry);
  } catch {
    // 历史写入失败不影响同步结果返回
  }

  return {
    ok,
    platform,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    total: results.length,
    succeeded,
    failed,
    results,
    warnings,
  };
}
