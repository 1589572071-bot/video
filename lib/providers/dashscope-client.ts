import { MODEL_CONFIG } from "@/lib/model-config";

export type TaskStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";

export interface DashScopeTaskResult {
  taskId: string;
  status: TaskStatus;
  output?: Record<string, unknown>;
  videoUrl?: string;
  imageUrls?: string[];
  errorMessage?: string;
  raw?: unknown;
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  onPoll?: (result: DashScopeTaskResult) => void;
}

function getApiKey(): string {
  const key = MODEL_CONFIG.bailian.apiKey;
  if (!key) throw new Error("未配置 DASHSCOPE_API_KEY");
  return key;
}

function normalizeStatus(s: string | undefined): TaskStatus {
  const u = (s || "").toUpperCase();
  if (u === "SUCCEEDED" || u === "SUCCESS") return "SUCCEEDED";
  if (u === "FAILED" || u === "FAILURE") return "FAILED";
  if (u === "RUNNING" || u === "PROCESSING") return "RUNNING";
  if (u === "PENDING" || u === "QUEUED") return "PENDING";
  return "UNKNOWN";
}

function extractUrls(output: Record<string, unknown> | undefined): {
  videoUrl?: string;
  imageUrls: string[];
} {
  const imageUrls: string[] = [];
  if (!output) return { imageUrls };

  const videoUrl =
    (output.video_url as string) ||
    (output.videoUrl as string) ||
    (output.url as string);

  const results = output.results as Array<{ url?: string; video_url?: string }> | undefined;
  if (Array.isArray(results)) {
    for (const r of results) {
      if (r.url) imageUrls.push(r.url);
      if (r.video_url) return { videoUrl: r.video_url, imageUrls };
    }
  }

  const choices = output.choices as Array<{ message?: { content?: unknown[] } }> | undefined;
  if (Array.isArray(choices)) {
    for (const c of choices) {
      const content = c.message?.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item && typeof item === "object") {
            const o = item as Record<string, unknown>;
            if (typeof o.image === "string") imageUrls.push(o.image);
            if (typeof o.url === "string") imageUrls.push(o.url);
          }
        }
      }
    }
  }

  return { videoUrl, imageUrls };
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 创建 DashScope 异步任务 */
export async function createAsyncTask(
  endpoint: string,
  body: Record<string, unknown>
): Promise<string> {
  const res = await fetchWithRetry(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as Record<string, unknown>;
  const taskId =
    (data.task_id as string) ||
    ((data.output as Record<string, unknown>)?.task_id as string);

  if (!taskId) {
    throw new Error(`DashScope 未返回 task_id: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return taskId;
}

/** 同步调用（万相2.6 文生图 / 图像编辑等） */
export async function callSync(
  endpoint: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await fetchWithRetry(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

/** 轮询任务直到完成 */
export async function pollTask(
  taskId: string,
  options: PollOptions = {}
): Promise<DashScopeTaskResult> {
  const intervalMs = options.intervalMs ?? MODEL_CONFIG.bailian.video.pollIntervalMs;
  const timeoutMs = options.timeoutMs ?? MODEL_CONFIG.bailian.video.pollTimeoutMs;
  const url = `${MODEL_CONFIG.bailian.video.taskEndpoint}/${taskId}`;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const res = await fetchWithRetry(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${getApiKey()}` },
    });
    const data = (await res.json()) as Record<string, unknown>;
    const output = (data.output as Record<string, unknown>) || data;
    const status = normalizeStatus(
      (output.task_status as string) || (data.task_status as string) || (data.status as string)
    );
    const { videoUrl, imageUrls } = extractUrls(output);
    const result: DashScopeTaskResult = {
      taskId,
      status,
      output,
      videoUrl,
      imageUrls,
      errorMessage:
        (output.message as string) ||
        (output.error_message as string) ||
        (data.message as string),
      raw: data,
    };

    options.onPoll?.(result);

    if (status === "SUCCEEDED") return result;
    if (status === "FAILED") {
      throw new Error(result.errorMessage || "DashScope 任务失败");
    }

    await sleep(intervalMs);
  }

  throw new Error(`DashScope 任务超时 (${timeoutMs}ms): ${taskId}`);
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3
): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After") || "5");
        await sleep(retryAfter * 1000);
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`DashScope HTTP ${res.status}: ${text.slice(0, 400)}`);
      }
      return res;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (i < retries - 1) await sleep(1000 * (i + 1));
    }
  }
  throw lastError || new Error("DashScope 请求失败");
}

export function parseSyncImageUrls(data: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const output = (data.output as Record<string, unknown>) || data;
  const { imageUrls, videoUrl } = extractUrls(output as Record<string, unknown>);
  urls.push(...imageUrls);
  if (videoUrl) urls.push(videoUrl);

  const choices = output.choices as Array<{ message?: { content?: unknown[] } }> | undefined;
  if (Array.isArray(choices?.[0]?.message?.content)) {
    for (const item of choices[0].message!.content!) {
      if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        if (typeof o.image === "string") urls.push(o.image);
      }
    }
  }
  return urls;
}
