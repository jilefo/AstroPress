/**
 * Playwright 浏览器管理（v2：内嵌视图 + 持久化登录态）
 *
 * 关键设计：
 *  - 每 provider 一个「持久化上下文」launchPersistentContext，userDataDir 位于
 *    仓库根 .ap-data/ai-profiles/<provider>，cookie/localStorage 落盘，
 *    dev server 重启后登录态不丢失（修复旧版"登录后关闭再开又未登录"的问题）。
 *  - headless 运行，不再弹独立浏览器窗口；后台页面通过 viewScreenshot() 拉取
 *    实时画面、viewClick/viewType/viewPress/viewScroll 回传操作，实现内嵌登录。
 *  - 空闲 30 分钟关闭上下文释放内存（profile 保留）；每 provider 发送串行队列。
 */
import type { BrowserContext, Page } from "playwright";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { getProvider, type ChatProvider } from "./providers";

export const VIEWPORT = { width: 1280, height: 800 };

interface Session {
  provider: ChatProvider;
  context: BrowserContext;
  page: Page;
  loggedIn: boolean;
  lastUsed: number;
  /** 同一 provider 的会话创建互斥（防并发双击开出两个上下文） */
  opening?: Promise<Session>;
  /** 截图单飞 + 节流 */
  shotAt: number;
  shotQueue?: Promise<Buffer>;
  /** 导航串行队列：禁止两个 goto 并发（后者会中断前者，首帧停在 about:blank） */
  navChain?: Promise<unknown>;
  /** 最近一次导航错误（空=正常），供状态接口展示 */
  lastError?: string;
}

const sessions = new Map<string, Session>();
const sendQueues = new Map<string, Promise<unknown>>();
const SESSION_TTL = 30 * 60 * 1000;
const SHOT_MIN_GAP = 350;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** 仓库根：src/lib → 上 4 级（lib/src/ai-chat/plugins/root） */
function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url ?? "file:///")), "..", "..", "..", "..");
}

function profileDir(providerId: string): string {
  return resolve(repoRoot(), ".ap-data", "ai-profiles", providerId);
}

/** 清理空闲/死会话 */
async function sweepStale(): Promise<void> {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.opening) continue; // 正在创建中的占位会话不扫
    if (now - s.lastUsed > SESSION_TTL || !s.page || s.page.isClosed()) {
      await s.context?.close?.().catch(() => {});
      sessions.delete(id);
    }
  }
}

/** 串行化同一会话内的导航任务，防止并发 goto 互相中断导致页面停在 about:blank */
function withNav<T>(s: Session, task: () => Promise<T>): Promise<T> {
  const prev = s.navChain ?? Promise.resolve();
  const next = prev.then(task, task);
  s.navChain = next.catch(() => {});
  return next;
}

/** 导航到 URL 并等待 SPA 首屏 settle；错误记录到 session 而非静默吞掉 */
async function navGoto(s: Session, url: string, settle = true): Promise<string> {
  return withNav(s, async () => {
    try {
      await s.page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (settle) await s.page.waitForTimeout(Math.min(s.provider.settleMs ?? 3000, 6000));
      s.lastError = undefined;
    } catch (e: any) {
      s.lastError = e?.message ? String(e.message).slice(0, 200) : "navigation failed";
      throw e;
    }
    return s.page.url();
  });
}

/**
 * 取得（必要时创建）某 provider 的持久化会话。
 * 创建后会【等待】导航到聊天主页完成：持久化 Cookie/LocalStorage 随 profile 自动恢复，
 * 保证会话返回时首帧不是 about:blank、登录判定基于真实页面。
 */
export async function getSession(providerId: string): Promise<Session> {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);

  await sweepStale();

  const existing = sessions.get(providerId);
  if (existing?.opening) return existing.opening;
  if (existing && existing.page && existing.page.isClosed() === false) {
    existing.lastUsed = Date.now();
    return existing;
  }
  if (existing) {
    await existing.context?.close?.().catch(() => {});
    sessions.delete(providerId);
  }

  const doOpen = async (): Promise<Session> => {
    // 动态导入：Cloudflare Workers 无浏览器子进程，静态顶层导入会导致整个 Worker 启动即崩
    const { chromium } = await import("playwright");
    const context = await chromium.launchPersistentContext(profileDir(providerId), {
      headless: true,
      viewport: VIEWPORT,
      userAgent: UA,
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-default-browser-check",
      ],
    });
    // 隐藏 navigator.webdriver 等自动化指纹
    await context.addInitScript(() => {
      try {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      } catch { /* ignore */ }
    });

    const pages = context.pages();
    const page = pages[0] ?? (await context.newPage());
    const session: Session = { provider, context, page, loggedIn: false, lastUsed: Date.now(), shotAt: 0 };
    sessions.set(providerId, session);
    // 新建上下文后【等待】打开聊天主页：持久化 Cookie/LocalStorage 自动恢复登录态，
    // SPA 需要 settleMs 从存储回填会话。导航失败不抛出创建流程（记录 lastError，
    // 用户仍可点「打开登录页」重试），但绝不能让调用方拿到停在 about:blank 的会话。
    await navGoto(session, provider.url).catch(() => {});
    return session;
  };

  // 并发互斥：双击"打开登录页"时复用同一个创建 Promise
  const pending = sessions.get(providerId)?.opening;
  if (pending) return pending;
  const promise = doOpen();
  // 占位 opening 标记
  sessions.set(providerId, {
    provider,
    context: null as unknown as BrowserContext,
    page: null as unknown as Page,
    loggedIn: false,
    lastUsed: Date.now(),
    shotAt: 0,
    opening: promise,
  });
  try {
    const s = await promise;
    sessions.set(providerId, s);
    return s;
  } catch (e) {
    sessions.delete(providerId);
    throw e;
  }
}

/** 打开登录页（或任意 provider 同站页面） */
export async function viewOpen(providerId: string, target: "login" | "home" = "login"): Promise<{ url: string }> {
  const s = await getSession(providerId);
  const url = target === "home" ? s.provider.url : s.provider.loginUrl;
  const finalUrl = await navGoto(s, url);
  s.lastUsed = Date.now();
  return { url: finalUrl };
}

/** 当前页面 URL 与标题（前端画面前态展示） */
export async function viewInfo(providerId: string): Promise<{ url: string; title: string }> {
  const s = await getSession(providerId);
  return { url: s.page.url(), title: await s.page.title().catch(() => "") };
}

/**
 * 实时画面截图（JPEG）。单飞 + 350ms 节流，前端 ~1s 轮询时不会压垮浏览器。
 */
export async function viewScreenshot(providerId: string): Promise<{ buf: Buffer; url: string }> {
  const s = await getSession(providerId);
  if (s.shotQueue) {
    return { buf: await s.shotQueue, url: s.page.url() };
  }
  const wait = Math.max(0, SHOT_MIN_GAP - (Date.now() - s.shotAt));
  const job = (async () => {
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    let lastErr: unknown;
    // 登录跳转/导航进行中 CDP 会短暂拒绝截图，最多重试 3 次
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const buf = (await s.page.screenshot({ type: "jpeg", quality: 70, fullPage: false })) as Buffer;
        s.shotAt = Date.now();
        s.lastUsed = s.shotAt;
        return buf;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw lastErr;
  })();
  const tracked = job.finally(() => {
    const cur = sessions.get(providerId);
    if (cur) cur.shotQueue = undefined;
  });
  // 存入 shotQueue 的派生 Promise 若无人 await 会触发 unhandled rejection，挂空 catch
  tracked.catch(() => {});
  s.shotQueue = tracked;
  return { buf: await job, url: s.page.url() };
}

/** 画面点击：坐标为 viewport 自然坐标（1280×800 系），由前端按显示比例换算 */
export async function viewClick(
  providerId: string,
  x: number,
  y: number,
  dbl = false
): Promise<void> {
  const s = await getSession(providerId);
  const cx = clamp(Math.round(x), 0, VIEWPORT.width);
  const cy = clamp(Math.round(y), 0, VIEWPORT.height);
  await s.page.mouse.move(cx, cy).catch(() => {});
  if (dbl) await s.page.mouse.dblclick(cx, cy);
  else await s.page.mouse.click(cx, cy);
  s.lastUsed = Date.now();
}

/** 键盘输入文本（≤200 字符/次；用于扫码之外的账号密码/中文，IME 在前端完成） */
export async function viewType(providerId: string, text: string): Promise<void> {
  const s = await getSession(providerId);
  await s.page.keyboard.type(String(text).slice(0, 200), { delay: 12 });
  s.lastUsed = Date.now();
}

/**
 * 快捷填写登录表单：在当前页面找「可见的账号框 + 密码框」直接填值，
 * 避免用户在截图画面上用坐标点输入框（坐标点击对 SPA 输入框聚焦不稳定）。
 * submit=true 时再点击可见的主登录按钮。
 * 返回各步骤命中情况供前端提示。
 */
export async function viewFillLogin(
  providerId: string,
  account: string,
  password: string,
  submit: boolean
): Promise<{ account: boolean; password: boolean; submitted: boolean; message: string }> {
  const s = await getSession(providerId);
  const p = s.page;
  const acc = String(account ?? "").trim().slice(0, 200);
  const pwd = String(password ?? "").slice(0, 200);
  if (!acc || !pwd) throw new Error("账号和密码不能为空");

  // 账号框候选：显式类型优先，再到常见 name/placeholder
  const accSelectors = [
    'input[type="tel"]:visible',
    'input[autocomplete="username"]:visible',
    'input[type="email"]:visible',
    'input[name*="phone" i]:visible',
    'input[name*="mobile" i]:visible',
    'input[name*="account" i]:visible',
    'input[name*="user" i]:visible',
    'input[placeholder*="手机" i]:visible',
    'input[placeholder*="邮箱" i]:visible',
    'input[placeholder*="账号" i]:visible',
    'input[placeholder*="账户" i]:visible',
    'input[type="text"]:visible',
  ];
  let accOk = false;
  for (const sel of accSelectors) {
    const loc = p.locator(sel).first();
    if (await loc.count().catch(() => 0)) {
      try {
        await loc.click({ timeout: 2500 });
        await loc.fill("").catch(() => {});
        await p.keyboard.type(acc, { delay: 35 });
        accOk = true;
        break;
      } catch { /* 试下一个选择器 */ }
    }
  }

  let pwdOk = false;
  const pwdLoc = p.locator('input[type="password"]:visible').first();
  if (await pwdLoc.count().catch(() => 0)) {
    try {
      await pwdLoc.click({ timeout: 2500 });
      await pwdLoc.fill("").catch(() => {});
      await p.keyboard.type(pwd, { delay: 35 });
      pwdOk = true;
    } catch { /* ignore */ }
  }

  let submitted = false;
  if (submit && accOk && pwdOk) {
    const btnSelectors = [
      'button:has-text("登录"):visible',
      'button:has-text("登 录"):visible',
      'button:has-text("Log in"):visible',
      'button:has-text("Sign in"):visible',
      'button[type="submit"]:visible',
      '[role="button"]:has-text("登录"):visible',
    ];
    for (const sel of btnSelectors) {
      const b = p.locator(sel).first();
      if (await b.count().catch(() => 0)) {
        try { await b.click({ timeout: 2500 }); submitted = true; break; } catch { /* next */ }
      }
    }
  }

  s.lastUsed = Date.now();
  const message = !accOk
    ? "未找到账号输入框，请先用画面点击切换到手机号/密码登录方式后重试"
    : !pwdOk
      ? "已填账号，未找到密码框（可能需要先切换到密码登录）"
      : submit && !submitted
        ? "账号密码已填写，未找到登录按钮，请在画面中点击登录"
        : "账号密码已填写" + (submitted ? "并点击登录" : "");
  return { account: accOk, password: pwdOk, submitted, message };
}

/**
 * 人类化拖拽回放（滑块验证码）。
 * points 为前端采集的自然坐标轨迹（≥2 点），durationMs 为总时长。
 * 服务端加密轨迹：线性插值到 ~45 步、ease-out（先快后慢）、Y 轴 ±1px 抖动、
 * 末端小幅越过再回位（拼图滑块常见拟人特征）。
 */
export async function viewDrag(
  providerId: string,
  points: Array<{ x: number; y: number }>,
  durationMs = 900
): Promise<void> {
  const s = await getSession(providerId);
  const p = s.page;
  if (!Array.isArray(points) || points.length < 2) throw new Error("拖拽轨迹至少需要 2 个点");
  const pts = points
    .filter((q) => q && typeof q.x === "number" && typeof q.y === "number")
    .map((q) => ({ x: clamp(Math.round(q.x), 0, VIEWPORT.width), y: clamp(Math.round(q.y), 0, VIEWPORT.height) }));
  if (pts.length < 2) throw new Error("拖拽轨迹点无效");

  const start = pts[0];
  const end = pts[pts.length - 1];

  // 把原始轨迹按累计长度参数化，再均匀重采样到 N 步
  const seg: Array<{ x0: number; y0: number; x: number; y: number; start: number; len: number }> = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    seg.push({ x0: pts[i - 1].x, y0: pts[i - 1].y, x: pts[i].x, y: pts[i].y, start: total, len });
    total += len;
  }
  if (total < 2) throw new Error("拖拽距离过短");
  const STEPS = 46;
  const overshoot = Math.min(6, Math.max(2, Math.round(total * 0.02)));
  const dur = clamp(Math.round(durationMs), 300, 2500);

  const pointAt = (dist: number) => {
    for (const sg of seg) {
      if (sg.start + sg.len >= dist) {
        const r = sg.len === 0 ? 0 : (dist - sg.start) / sg.len;
        return { x: sg.x0 + (sg.x - sg.x0) * r, y: sg.y0 + (sg.y - sg.y0) * r };
      }
    }
    return { x: end.x, y: end.y };
  };

  await p.mouse.move(start.x, start.y, { steps: 3 }).catch(() => {});
  await p.waitForTimeout(120);
  await p.mouse.down();

  // 主体：ease-out，末端越过目标 overshoot 像素
  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS;
    const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
    const q = pointAt(total * Math.min(ease, 1));
    const x = q.x + overshoot * ease;
    const y = q.y + (Math.random() - 0.5) * 1.6;
    await p.mouse.move(Math.round(x), Math.round(y));
    await p.waitForTimeout((dur / STEPS) * (0.6 + Math.random() * 0.8));
  }
  // 回位到真实终点
  await p.waitForTimeout(90);
  await p.mouse.move(end.x, end.y + (Math.random() - 0.5), { steps: 4 });
  await p.waitForTimeout(140);
  await p.mouse.up();
  s.lastUsed = Date.now();
}

const ALLOWED_KEYS = new Set([
  "Enter", "Tab", "Escape", "Backspace", "Delete",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown",
  "CapsLock", " ",
]);

/** 单键（白名单，防止注入任意组合键） */
export async function viewPress(providerId: string, key: string): Promise<void> {
  const s = await getSession(providerId);
  const k = ALLOWED_KEYS.has(key) ? key : key.length === 1 ? key : null;
  if (!k) throw new Error("unsupported key");
  await s.page.keyboard.press(k);
  s.lastUsed = Date.now();
}

/** 滚轮 */
export async function viewScroll(providerId: string, deltaY: number): Promise<void> {
  const s = await getSession(providerId);
  await s.page.mouse.wheel(0, clamp(Math.round(deltaY), -3000, 3000));
  s.lastUsed = Date.now();
}

/** 导航：仅允许同 provider 注册域名，防开放代理 */
export async function viewNavigate(providerId: string, url: string): Promise<{ url: string }> {
  const s = await getSession(providerId);
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    throw new Error("invalid url");
  }
  const allow = [s.provider.url, s.provider.loginUrl].map((u) => new URL(u).hostname);
  if (!allow.some((h) => target.hostname === h || target.hostname.endsWith("." + h))) {
    throw new Error("host not allowed");
  }
  const finalUrl = await navGoto(s, target.toString());
  s.lastUsed = Date.now();
  return { url: finalUrl };
}

/** 兼容旧 API：打开登录页 */
export async function openLoginPage(providerId: string): Promise<{ url: string; message: string }> {
  const { url } = await viewOpen(providerId, "login");
  return { url, message: "内嵌登录视图已打开，请在页面画面中完成登录。" };
}

/** 当前 URL 是否落在 provider 注册域名上 */
function onProviderHost(s: Session, u: string): boolean {
  if (!u || u === "about:blank") return false;
  let host = "";
  try {
    host = new URL(u).hostname;
  } catch {
    return false;
  }
  return [s.provider.url, s.provider.loginUrl]
    .map((x) => new URL(x).hostname)
    .some((h) => host === h || host.endsWith("." + h));
}

/**
 * LocalStorage 鉴权信号（仅部分 SPA 型平台需要，如元宝把登录态放在 LOCAL_AUTH_INFO_KEY）。
 * storageCheck 是 providers.ts 中自带的 JS 语句体，可使用 ls（= window.localStorage），
 * 返回 true 表示已登录。配置为服务端静态代码，无任何用户输入拼接。
 */
async function readStorageSignal(s: Session): Promise<boolean> {
  const code = s.provider.storageCheck;
  if (!code) return false;
  if (!onProviderHost(s, s.page.url())) return false;
  try {
    const fn = new Function(`try { var ls = window.localStorage; ${code} } catch (e) { return false; }`);
    const v = await s.page.evaluate(fn as () => unknown);
    return v === true;
  } catch {
    return false;
  }
}

/**
 * 登录状态判定（三重信号 + SPA 启动宽限）：
 *  1. 页面不在站上（about:blank / 导航失败）→ 主动回主页，让持久化登录态生效；
 *  2. URL 含 loginMarkers 视为负信号；
 *  3. 聊天输入框可见 或 LocalStorage 鉴权 blob 有效 视为正信号；
 *  4. 给 SPA 最多 14s 回填会话，避免首帧误判；过期会话被弹回登录页时自动降级为未登录。
 */
export async function checkLoginStatus(
  providerId: string
): Promise<{ loggedIn: boolean; url: string; reason?: string; lastError?: string }> {
  const s = await getSession(providerId);

  if (!onProviderHost(s, s.page.url())) {
    await navGoto(s, s.provider.url).catch(() => {});
  }

  const deadline = Date.now() + 14000;
  let reason = "timeout";
  while (Date.now() < deadline) {
    const url = s.page.url();
    const onLoginPage = s.provider.loginMarkers.some((m) => url.includes(m));
    const inputVisible =
      (await s.page.locator(s.provider.loggedInSelector).first().isVisible({ timeout: 2500 }).catch(() => false)) ??
      false;
    const storageOk = await readStorageSignal(s);

    if (!onLoginPage && (inputVisible || storageOk)) {
      s.loggedIn = true;
      return { loggedIn: true, url: s.page.url() };
    }
    if (onLoginPage && !inputVisible && !storageOk) reason = "login-page";
    else reason = inputVisible ? "login-marker-url" : "no-login-signal";
    await s.page.waitForTimeout(1500);
  }

  s.loggedIn = false;
  return { loggedIn: false, url: s.page.url(), reason, lastError: s.lastError };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

async function doSendPrompt(providerId: string, prompt: string): Promise<{ reply: string; error?: string }> {
  let s: Session;
  try {
    s = await getSession(providerId);
  } catch (err: any) {
    return { reply: "", error: `Browser unavailable: ${err?.message ?? String(err)}` };
  }
  const p = s.page;

  if (!s.loggedIn) {
    const status = await checkLoginStatus(providerId).catch(() => ({ loggedIn: false }));
    if (!status.loggedIn) return { reply: "", error: "未登录。请先在「登录助手」画面中扫码或用账号密码登录。" };
  }

  // 内存登录标记可能过期（Cookie 失效后站点会把页面弹回登录 URL）：
  // 只要当前 URL 命中登录页标记，就重新判定，失败立即返回，避免在登录页上空等 120 秒。
  if (s.provider.loginMarkers.some((m) => p.url().includes(m))) {
    const status = await checkLoginStatus(providerId).catch(() => ({ loggedIn: false }));
    if (!status.loggedIn) {
      s.loggedIn = false;
      return { reply: "", error: "登录已过期。请到「插件 → AI 助手」重新登录（可用快捷登录或扫码）后再试。" };
    }
  }

  // 发送前确保在聊天主页（用户可能停留在登录后的深层页）
  if (!onProviderHost(s, p.url())) {
    await navGoto(s, s.provider.url).catch(() => {});
  }

  try {
    await p.keyboard.press("Escape").catch(() => {});
    await p.waitForTimeout(300);
    const input = p.locator(s.provider.inputSelector).first();
    await input.waitFor({ state: "visible", timeout: 10000 });
    await input.click();
    await input.fill(prompt);
    await p.waitForTimeout(300);
    const sendBtn = p.locator(s.provider.sendButtonSelector).first();
    await sendBtn.waitFor({ state: "visible", timeout: 5000 });
    await sendBtn.click();
    // 发送兜底：部分页面按钮点击不生效（按钮被遮挡/改版），1.5s 后输入框仍有内容则按回车
    await p.waitForTimeout(1500);
    const remain = await input.inputValue?.().catch(() => "") ?? "";
    if (remain.trim() && remain.trim() === prompt.trim().slice(0, remain.length)) {
      await input.click().catch(() => {});
      await p.keyboard.press("Enter").catch(() => {});
    }
  } catch {
    s.loggedIn = false;
    return { reply: "", error: "找不到聊天输入框：页面可能改版或登录已过期。" };
  }

  // 发送前快照：replySelector 可能误匹配上传区/提示条等固定 UI，
  // 只接受「发送后新出现、当前可见、有实质长度」的候选文本。
  // 注意 [class*='message'] 这类宽选择器也会命中用户气泡，需用「位于
  // 用户消息之后 + 不包含发送原文」双重条件排除。
  const sel = s.provider.replySelector;
  const promptHead = prompt.replace(/\s+/g, " ").trim().slice(0, 60);
  const snapshot = async (): Promise<Array<{ i: number; text: string; visible: boolean }>> =>
    p.$$eval(sel, (els: Element[]) =>
      els.map((el, i) => {
        const e = el as HTMLElement;
        const rect = e.getBoundingClientRect();
        return {
          i,
          text: (e.innerText || "").trim(),
          visible: rect.width > 0 && rect.height > 0 && (!!e.offsetParent || e.getClientRects().length > 0),
        };
      })
    ).catch(() => []);
  const beforeList = await snapshot();
  const beforeTexts = new Set(beforeList.map((b) => b.text).filter(Boolean));

  let lastText = "";
  let stable = 0;
  const start = Date.now();
  while (Date.now() - start < 120000) {
    await p.waitForTimeout(2000);
    if (p.isClosed()) return { reply: "", error: "浏览器页面已关闭。" };
    const cands = await snapshot();
    // 定位用户自己发送的消息气泡（宽选择器会一并命中）
    let userIdx = -1;
    if (promptHead) {
      const u = cands.find((c) => c.text && c.text.replace(/\s+/g, " ").includes(promptHead));
      if (u) userIdx = u.i;
    }
    const fresh = cands.filter((c) => {
      if (!c.visible || c.text.length < 20 || beforeTexts.has(c.text)) return false;
      if (userIdx >= 0 && c.i <= userIdx) return false;          // 用户气泡及其之前的元素全部排除
      if (promptHead && c.text.replace(/\s+/g, " ").includes(promptHead)) return false; // 原文回声
      return true;
    });
    // 取内容最长的新增候选：外层容器通常包含完整回复（含图片/链接），
    // 而内层片段或误匹配的小元素可能只有一行链接——取最长可避免把
    // 「仅一张图片链接」当作完整回复。
    const text = fresh.length ? fresh.reduce((a, b) => (b.text.length > a.text.length ? b : a)).text : "";
    if (text && text === lastText) {
      if (++stable >= 3) break; // 连续 6s 不变视为生成结束
    } else {
      stable = 0;
    }
    lastText = text;
  }
  return { reply: lastText || "(空回复)" };
}

export function sendPrompt(providerId: string, prompt: string): Promise<{ reply: string; error?: string }> {
  const prev = sendQueues.get(providerId) ?? Promise.resolve();
  const next = prev.then(
    () => doSendPrompt(providerId, prompt),
    () => doSendPrompt(providerId, prompt)
  );
  sendQueues.set(providerId, next.catch(() => {}));
  return next;
}

/** 仅关闭上下文（保留登录态） */
export async function closeSession(providerId: string): Promise<void> {
  const s = sessions.get(providerId);
  if (s) {
    await s.context?.close?.().catch(() => {});
    sessions.delete(providerId);
  }
}

/** 退出登录：关闭上下文并删除本地 profile（清除 Cookie） */
export async function logoutSession(providerId: string): Promise<void> {
  await closeSession(providerId);
  await rm(profileDir(providerId), { recursive: true, force: true }).catch(() => {});
}

export async function closeAll(): Promise<void> {
  for (const id of Array.from(sessions.keys())) await closeSession(id);
}

export function listSessions(): Array<{
  provider: string;
  loggedIn: boolean;
  lastUsed: number;
  url: string;
  lastError?: string;
}> {
  return Array.from(sessions.entries())
    .filter(([, s]) => !!s.context)
    .map(([id, s]) => {
      let url = "";
      try {
        url = s.page?.url?.() ?? "";
      } catch {
        url = "";
      }
      return { provider: id, loggedIn: s.loggedIn, lastUsed: s.lastUsed, url, lastError: s.lastError };
    });
}
