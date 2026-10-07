/**
 * 统一解析 JSON 请求体（V8 任务4：核心 API 输入校验收口）。
 *
 * - 非法 JSON / 空 body → 返回 400 中文 JSON Response，杜绝裸 request.json() 抛错导致 500
 *   或被上层静默吞掉返回首页 HTML
 * - 对象与数组 body 均接受（如菜单批量排序接收数组），字段级校验由各端点自行处理
 *
 * 用法：
 *   const parsed = await readJsonBody<MyBody>(request);
 *   if (!parsed.ok) return parsed.response;
 *   const body = parsed.data;
 */
export type JsonBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

/** 构造统一的中文 JSON 错误响应。 */
export function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function readJsonBody<T = unknown>(
  request: Request,
): Promise<JsonBodyResult<T>> {
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return { ok: false, response: jsonError(400, "请求体不是有效的 JSON") };
  }
  if (data === null || data === undefined) {
    return { ok: false, response: jsonError(400, "请求体不能为空") };
  }
  return { ok: true, data: data as T };
}
