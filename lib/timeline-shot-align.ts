import { resolveShotFallback } from "./fallback-ladder";
import { inferStageBrief } from "./script-stage-brief";
import type {
  ProductInput,
  ScriptBlockManifest,
  ScriptManifest,
  ManifestShot,
  TimelineEvent,
  VideoAnalysisInput,
} from "./types/pipeline";

const BLOCK_MAX = 15.0;

/** 无样例视频时的演示用时间轴（仅 videoAnalysis 为 null 时使用） */
const DEMO_TIMELINE_EVENTS: TimelineEvent[] = [
  { start: 0, end: 2.8, event_name: "hook", description: "建立痛点", emotion: "anxiety" },
  { start: 2.8, end: 6.5, event_name: "problem_agitation", description: "放大焦虑", emotion: "anxiety" },
  { start: 6.5, end: 11.2, event_name: "solution_intro", description: "引入方案", emotion: "curiosity" },
  { start: 11.2, end: 15.0, event_name: "product_detail", description: "展示爽点", emotion: "joy" },
  { start: 15.0, end: 18.5, event_name: "cta", description: "行动号召", emotion: "joy" },
];

export { BLOCK_MAX };

/**
 * 样例叙事时间轴：有解析结果时只返回 timeline_events，绝不注入 cta 等虚构阶段。
 * 仅在没有上传/解析样例视频时才用演示模板。
 */
export function getTimelineEvents(video: VideoAnalysisInput | null): TimelineEvent[] {
  const events = video?.narrative_structure?.timeline_events;
  if (events?.length) {
    return [...events].sort((a, b) => a.start - b.start);
  }
  if (video) return [];
  return DEMO_TIMELINE_EVENTS;
}

/** 按 15s 物理硬切点将 timeline 拆成渲染区块（单块时长不超过 BLOCK_MAX） */
export function splitTimelineIntoBlocks(events: TimelineEvent[]) {
  if (!events.length) return [];

  const ordered = [...events].sort((a, b) => a.start - b.start);
  const blocks: Array<{ start: number; end: number; shots: TimelineEvent[] }> = [];
  let currentBlock: TimelineEvent[] = [];
  let blockStart = ordered[0].start;

  const flush = (blockEnd: number) => {
    if (!currentBlock.length) return;
    blocks.push({ start: blockStart, end: blockEnd, shots: [...currentBlock] });
    currentBlock = [];
    blockStart = blockEnd;
  };

  for (const event of ordered) {
    if (currentBlock.length && event.end - blockStart > BLOCK_MAX) {
      const prevEnd = currentBlock[currentBlock.length - 1].end;
      flush(Math.min(blockStart + BLOCK_MAX, prevEnd));
    }
    if (!currentBlock.length && event.start >= BLOCK_MAX) {
      blockStart = event.start;
    }
    currentBlock.push(event);
  }

  if (currentBlock.length) {
    const lastEnd = currentBlock[currentBlock.length - 1].end;
    flush(Math.min(blockStart + BLOCK_MAX, lastEnd));
  }

  return blocks;
}

function flattenManifestShots(manifest: ScriptManifest): ManifestShot[] {
  return manifest.blocks
    .flatMap((block) => block.shots)
    .sort((a, b) => a.index - b.index);
}

/** 将 manifest 镜头与样例 timeline_events 严格 1:1 对齐（序号、时间、阶段名） */
export function alignManifestToTimelineEvents(
  manifest: ScriptManifest,
  videoAnalysis: VideoAnalysisInput | null,
  product?: ProductInput
): ScriptManifest {
  const events = getTimelineEvents(videoAnalysis);
  if (!events.length) return manifest;

  const orderedEvents = [...events].sort((a, b) => a.start - b.start);
  const existingShots = flattenManifestShots(manifest);
  const productForBrief = product ?? { product_name: "商品" };

  const alignedFlat: ManifestShot[] = orderedEvents.map((event, i) => {
    const src = existingShots[i];
    const shotIndex = i + 1;

    if (src) {
      return {
        ...src,
        index: shotIndex,
        start: event.start,
        end: event.end,
        narrative_stage: event.event_name,
      };
    }

    const fallback = resolveShotFallback({
      shotIndex,
      event,
      gapPlan: manifest.gap_plan,
      inventory: {
        product_images_count: product?.user_asset_inventory?.product_images_count ?? 0,
        product_video_clips_count: product?.user_asset_inventory?.product_video_clips_count ?? 0,
        product_image_urls: [],
        product_video_url: null,
      },
      product: productForBrief,
      usedImageSlots: 0,
      usedVideoSlots: 0,
    });

    return {
      index: shotIndex,
      block_index: 1,
      start: event.start,
      end: event.end,
      narrative_stage: event.event_name,
      asset_source: fallback.asset_source,
      gap_codes: fallback.gap_codes,
      fallback_applied: fallback.fallback_applied,
      requires_image_gen: fallback.requires_image_gen,
      is_aigc_supplement: fallback.is_aigc_supplement,
      ui_label: fallback.ui_label,
      stage_brief: inferStageBrief(event.event_name, productForBrief),
      degraded_narrative: fallback.degraded_narrative,
      keyframe_url: null,
    };
  });

  const blocks: ScriptBlockManifest[] = [];
  let cursor = 0;

  splitTimelineIntoBlocks(orderedEvents).forEach((block, blockIdx) => {
    const blockShots = block.shots.map(() => {
      const shot = alignedFlat[cursor++];
      return { ...shot, block_index: blockIdx + 1 };
    });

    blocks.push({
      index: blockIdx + 1,
      start: block.start,
      end: block.end,
      render_mode: blockIdx === 0 ? "T2V" : "I2V",
      is_continuation: false,
      shots: blockShots,
    });
  });

  return {
    ...manifest,
    total_duration: orderedEvents[orderedEvents.length - 1].end,
    blocks,
  };
}

/** 同步 Markdown 镜头标题的时间与阶段名，与 timeline_events 序号一一对应 */
export function alignMarkdownToTimelineEvents(
  markdown: string,
  videoAnalysis: VideoAnalysisInput | null
): string {
  const events = getTimelineEvents(videoAnalysis);
  if (!events.length) return markdown;

  const orderedEvents = [...events].sort((a, b) => a.start - b.start);
  let shotIdx = 0;
  let blockIdx = 0;
  const eventBlocks = splitTimelineIntoBlocks(orderedEvents);

  const result = markdown.replace(
    /## 【区块\s*(\d+)：[\d.]+\s*s\s*-\s*[\d.]+\s*s】/g,
    (match) => {
      const block = eventBlocks[blockIdx++];
      if (!block) return match;
      return `## 【区块 ${blockIdx}：${block.start.toFixed(1)}s - ${block.end.toFixed(1)}s】`;
    }
  );

  return result.replace(
    /\*\s+\*\*镜头\s+(\d+)\s+\[([\d.]+)s\s*-\s*([\d.]+)s\]\s*\|\s*([^*]+?)\*\*/g,
    (match) => {
      if (shotIdx >= orderedEvents.length) return match;
      const event = orderedEvents[shotIdx++];
      return `* **镜头 ${shotIdx} [${event.start.toFixed(1)}s - ${event.end.toFixed(1)}s] | ${event.event_name}**`;
    }
  );
}
