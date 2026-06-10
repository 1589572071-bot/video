import type { ProductInput, TimelineEvent, VideoAnalysisInput } from "./types/pipeline";

/** 从 Step3 Markdown 剧本中解析【仿写对照】区块 */

export interface ImitationComparisonRow {
  dimension: string;
  original: string;
  adapted: string;
}

export interface ImitationComparisonBlock {
  preserve_structure?: string;
  replace_content?: string;
  rows: ImitationComparisonRow[];
}

export function parseImitationComparisonBlock(
  markdown: string | null | undefined
): ImitationComparisonBlock | null {
  if (!markdown) return null;

  const section =
    markdown.match(/## 【仿写对照】([\s\S]*?)(?=## 【|$)/)?.[1]?.trim() ?? "";
  if (!section) return null;

  const preserveMatch = section.match(/\*\*保留结构\*\*：(.+)/);
  const replaceMatch = section.match(/\*\*替换内容\*\*：(.+)/);

  const rows: ImitationComparisonRow[] = [];
  const tableLines = section
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|") && !l.includes("---"));

  for (const line of tableLines.slice(1)) {
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length >= 3) {
      rows.push({
        dimension: cells[0],
        original: cells[1],
        adapted: cells[2],
      });
    }
  }

  if (!preserveMatch && !replaceMatch && !rows.length) return null;

  return {
    preserve_structure: preserveMatch?.[1]?.trim(),
    replace_content: replaceMatch?.[1]?.trim(),
    rows,
  };
}

/** 规则引擎 fallback 用 · 生成【仿写对照】Markdown */
export function buildImitationComparisonMarkdown(input: {
  videoAnalysis: VideoAnalysisInput | null;
  product: ProductInput;
  events: TimelineEvent[];
  hookPain: string;
  hookAdapted: string;
  gain: string;
  firstPoint: string;
}): string {
  const { videoAnalysis, product, events, hookPain, hookAdapted, firstPoint } = input;
  const cs = videoAnalysis?.content_strategy;
  const hookEvent = events.find((e) => e.event_name === "hook") ?? events[0];
  const problemEvent = events.find((e) => e.event_name === "problem_agitation");

  const stageChain = events.map((e) => e.event_name).join(" → ");
  const preserve =
    cs?.imitation_focus ??
    cs?.structure ??
    `保留样例叙事阶段链：${stageChain}；切镜节奏与 hook 在前 3s 内的结构不变`;

  const replace =
    cs?.topic
      ? `替换为新商品「${product.product_name ?? "新品"}」的品类、场景（${product.usage_scene ?? "使用场景"}）与卖点`
      : `替换产品外观、使用场景、痛点（${product.pain_point_gain_point?.split(/[；;]/)[0] ?? "痛点"}）与卖点（${firstPoint}）`;

  const hookOriginal = hookEvent?.description ?? cs?.hook ?? "样例开场 hook";
  const painOriginal = problemEvent?.description ?? "样例痛点放大";
  const expressionOriginal = cs?.expression_style ?? "样例口播 + 花字节奏";

  return `
## 【仿写对照】
- **保留结构**：${preserve}
- **替换内容**：${replace}
| 维度 | 原视频表达 | 新商品表达 |
| 钩子 | ${hookOriginal} | ${hookAdapted || hookPain} |
| 痛点 | ${painOriginal} | ${hookPain} |
| 卖点 | 样例产品卖点呈现 | ${firstPoint} |
| 表达方式 | ${expressionOriginal} | 适配 ${product.target_audience ?? "目标受众"} 的口播 + 花字 |
`;
}
