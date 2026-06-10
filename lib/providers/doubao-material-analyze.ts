import { MODEL_CONFIG } from "@/lib/model-config";
import { readLocalAssetBase64 } from "@/lib/local-asset";
import { readUpstreamJson } from "@/lib/parse-api-response";
import { extractJsonObject } from "@/lib/safe-json";
import { MAX_ANALYZE_VIDEO_BYTES, pickVideoAnalysisFps } from "@/lib/video-limits";

export interface MaterialAnalysisResult {
  highlights: Array<{
    start: number;
    end: number;
    description: string;
    tags: string[];
    recommended_for: string[];
  }>;
}

export async function analyzeMaterialVideo(
  videoUrl: string
): Promise<MaterialAnalysisResult> {
  const cfg = MODEL_CONFIG.productParse;
  if (!cfg.apiKey || !cfg.endpoint) {
    throw new Error("未配置 DOUBAO_APIKEY 或 DOUBAO_EP");
  }

  const asset = await readLocalAssetBase64(videoUrl);
  if (asset.sizeBytes > MAX_ANALYZE_VIDEO_BYTES) {
    throw new Error(`素材视频过大（>50MB），请压缩后再试`);
  }
  const fps = pickVideoAnalysisFps(asset.sizeBytes);

  const systemPrompt = `你是一个专业的短视频剪辑师。请分析用户提供的长视频素材，提取出其中的高光片段。
请以 JSON 格式输出，包含一个 highlights 数组。每个元素包含：
- start: 开始时间（秒，数字）
- end: 结束时间（秒，数字）
- description: 画面描述
- tags: 标签数组（如 "特写", "全景", "动态"）
- recommended_for: 推荐用于哪些环节（如 "Hook", "展示卖点", "结尾 CTA"）

只输出 JSON，不要有任何其他内容。`;

  const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.endpoint,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "请分析这个视频素材的高光片段：" },
            {
              type: "video_url",
              video_url: {
                url: `data:${asset.mimeType};base64,${asset.base64}`,
                fps,
              },
            },
          ],
        },
      ],
      temperature: 0.1,
    }),
  });

  const data = await readUpstreamJson<{
    choices?: Array<{ message?: { content?: string } }>;
  }>(response, "素材高光分析");
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error("模型返回为空");

  const parsed = extractJsonObject<MaterialAnalysisResult>(rawContent);
  if (!parsed?.highlights) {
    throw new Error("模型返回格式错误，未能解析高光片段");
  }
  return parsed;
}