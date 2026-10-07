import type { APIRoute } from "astro";
import { hasChildProcess, envNotSupported } from "@astropress/core";
import {
  viewOpen,
  viewClick,
  viewType,
  viewPress,
  viewScroll,
  viewNavigate,
  viewInfo,
  viewFillLogin,
  viewDrag,
} from "../../lib/browser";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

interface DragPoint { x: number; y: number }

interface ViewBody {
  provider?: string;
  action?: string;
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  dbl?: boolean;
  text?: string;
  key?: string;
  deltaY?: number;
  url?: string;
  target?: "login" | "home";
  account?: string;
  password?: string;
  submit?: boolean;
  points?: DragPoint[];
  duration?: number;
}

/**
 * POST /admin-ext/api/ai-chat/view
 * 内嵌浏览器视图的操作总线：open/click/type/press/scroll/navigate/info/fill-login/drag
 */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!hasChildProcess()) return envNotSupported("AI 会话截图（需要浏览器子进程）");
  const user = (locals as any).user;
  if (!user) return json({ error: "Unauthorized" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "CSRF" }, 403);

  let body: ViewBody;
  try {
    body = (await request.json()) as ViewBody;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const provider = String(body.provider ?? "");
  const action = String(body.action ?? "");
  if (!provider || !action) return json({ error: "provider and action required" }, 400);

  try {
    switch (action) {
      case "open": {
        const r = await viewOpen(provider, body.target === "home" ? "home" : "login");
        return json({ ok: true, ...r });
      }
      case "info": {
        return json({ ok: true, ...(await viewInfo(provider)) });
      }
      case "click": {
        if (typeof body.x !== "number" || typeof body.y !== "number") return json({ error: "x,y required" }, 400);
        await viewClick(provider, body.x, body.y, !!body.dbl);
        return json({ ok: true });
      }
      case "type": {
        if (typeof body.text !== "string" || !body.text) return json({ error: "text required" }, 400);
        await viewType(provider, body.text);
        return json({ ok: true });
      }
      case "press": {
        if (typeof body.key !== "string" || !body.key) return json({ error: "key required" }, 400);
        await viewPress(provider, body.key);
        return json({ ok: true });
      }
      case "scroll": {
        await viewScroll(provider, Number(body.deltaY ?? 600));
        return json({ ok: true });
      }
      case "navigate": {
        if (typeof body.url !== "string" || !body.url) return json({ error: "url required" }, 400);
        return json({ ok: true, ...(await viewNavigate(provider, body.url)) });
      }
      case "fill-login": {
        if (typeof body.account !== "string" || typeof body.password !== "string" ||
            !body.account.trim() || !body.password) {
          return json({ error: "account and password required" }, 400);
        }
        const r = await viewFillLogin(provider, body.account, body.password, !!body.submit);
        return json({ ok: true, ...r });
      }
      case "drag": {
        const pts = Array.isArray(body.points) ? body.points : [];
        if (pts.length < 2) return json({ error: "points(>=2) required" }, 400);
        if (!pts.every((q) => q && typeof q.x === "number" && typeof q.y === "number")) {
          return json({ error: "invalid points" }, 400);
        }
        // 轨迹上限 200 点，防止滥用
        await viewDrag(provider, pts.slice(0, 200), typeof body.duration === "number" ? body.duration : 900);
        return json({ ok: true });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (err: any) {
    return json({ error: err?.message ?? String(err) }, 400);
  }
};
