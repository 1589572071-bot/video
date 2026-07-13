/**
 * 安全解析 fetch Response 为 JSON（客户端调用自研 API）。
 * 非 JSON 或空体时返回带 error 字段的对象，便于调用方统一处理。
 */
export async function readResponseJson<
  T = Record<string, unknown>,
>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    return {
      error: response.ok ? undefined : `请求失败 (${response.status})`,
    } as unknown as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return {
      error: text.slice(0, 400) || `响应解析失败 (${response.status})`,
    } as unknown as T;
  }
}

/**
 * 解析上游模型/第三方 API 响应；失败时抛出带 label 的错误。
 */
export async function readUpstreamJson<T = unknown>(
  response: Response,
  label: string
): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    const detail = text.trim() ? text.slice(0, 400) : `HTTP ${response.status}`;
    throw new Error(`${label}失败: ${detail}`);
  }
  if (!text.trim()) {
    throw new Error(`${label}返回为空`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label}返回格式错误: ${text.slice(0, 400)}`);
  }
}
