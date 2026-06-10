/**
 * 从 LLM 返回文本中稳健地提取并解析 JSON 对象。
 * 处理常见漂移：```json 围栏、前后解释文字、尾随逗号。
 *
 * @returns 解析后的对象；失败返回 null（调用方决定如何兜底）。
 */
export function extractJsonObject<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw || typeof raw !== "string") return null;

  // 去掉 markdown 代码围栏
  let text = raw.replace(/```json\s*|```/gi, "").trim();

  // 直接尝试
  const direct = tryParse<T>(text);
  if (direct !== null) return direct;

  // 截取最外层 { ... }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    text = text.slice(first, last + 1);
    const sliced = tryParse<T>(text);
    if (sliced !== null) return sliced;

    // 移除对象/数组尾随逗号后再试
    const noTrailing = text.replace(/,\s*([}\]])/g, "$1");
    const cleaned = tryParse<T>(noTrailing);
    if (cleaned !== null) return cleaned;
  }

  return null;
}

function tryParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
