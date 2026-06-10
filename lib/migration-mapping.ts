import { formatNarrativeStage } from "@/lib/narrative-stage-labels";
import type { GapPlanLike } from "@/lib/gap-display-labels";
import { getGapsForShot } from "@/lib/gap-display-labels";

export interface TimelineEventRef {
  start: number;
  end: number;
  event_name: string;
  description?: string;
  emotion?: string;
}

import type { ScriptShotPackaging } from "@/lib/types/pipeline";

export interface ShotRef {
  index: number;
  timeRange: string;
  narrative_stage: string;
  stage_brief?: string;
  packaging?: ScriptShotPackaging;
  asset_source?: string;
  is_aigc_supplement?: boolean;
  ui_label?: string;
  gap_codes?: string[];
}

export interface StageMappingRow {
  stageKey: string;
  stageLabel: string;
  sampleSegment?: {
    start: number;
    end: number;
    description?: string;
  };
  newShots: ShotRef[];
  gapCodes: string[];
}

export type SegmentShotPairing = "matched" | "sample_unmapped" | "shot_extra";

export interface SampleEventRef extends TimelineEventRef {
  eventIndex: number;
}

export interface SegmentShotRow {
  id: string;
  rowIndex: number;
  stageKey: string;
  stageLabel: string;
  sampleEvent?: SampleEventRef;
  newShot?: ShotRef;
  pairing: SegmentShotPairing;
  gapCodes: string[];
}

function normalizeStage(stage: string): string {
  return stage.trim().toLowerCase();
}

function formatTimeRange(start: number, end: number): string {
  return `${start.toFixed(1)}s - ${end.toFixed(1)}s`;
}

function collectGapCodes(shot: ShotRef | undefined, gapPlan?: GapPlanLike | null): string[] {
  if (!shot) return [];
  const gapCodeSet = new Set<string>();
  for (const code of shot.gap_codes ?? []) gapCodeSet.add(code);
  for (const gap of getGapsForShot(gapPlan, shot.index)) gapCodeSet.add(gap.code);
  return Array.from(gapCodeSet);
}

/** 样例段 ↔ 新镜逐行一一对应（按时间轴序号：第 i 段 ↔ 第 i 镜） */
export function buildSegmentShotRows(
  timelineEvents: TimelineEventRef[],
  shots: ShotRef[],
  gapPlan?: GapPlanLike | null
): SegmentShotRow[] {
  if (!timelineEvents.length && !shots.length) return [];

  const orderedEvents = [...timelineEvents].sort((a, b) => a.start - b.start);
  const orderedShots = [...shots].sort((a, b) => a.index - b.index);
  const rowCount =
    orderedEvents.length > 0 ? orderedEvents.length : orderedShots.length;
  const rows: SegmentShotRow[] = [];

  for (let i = 0; i < rowCount; i++) {
    const event = orderedEvents[i];
    const shot = orderedShots[i];
    const sampleEvent = event ? { ...event, eventIndex: i } : undefined;

    let pairing: SegmentShotPairing;
    if (event && shot) pairing = "matched";
    else if (event) pairing = "sample_unmapped";
    else pairing = "shot_extra";

    const stageKey = normalizeStage(event?.event_name ?? shot?.narrative_stage ?? "unknown");

    rows.push({
      id: `pair-${i}-s${shot?.index ?? "x"}-e${event ? i : "x"}`,
      rowIndex: i,
      stageKey,
      stageLabel: formatNarrativeStage(stageKey),
      sampleEvent,
      newShot: shot,
      pairing,
      gapCodes: collectGapCodes(shot, gapPlan),
    });
  }

  return rows;
}

function collectStageKeys(events: TimelineEventRef[], shots: ShotRef[]): string[] {
  const keys = new Set<string>();
  for (const e of events) keys.add(normalizeStage(e.event_name));
  for (const s of shots) keys.add(normalizeStage(s.narrative_stage));
  return Array.from(keys);
}

/** 按 narrative_stage 同名对齐样例阶段与新方案镜头 */
export function buildStageMappings(
  timelineEvents: TimelineEventRef[],
  shots: ShotRef[],
  gapPlan?: GapPlanLike | null
): StageMappingRow[] {
  if (!timelineEvents.length && !shots.length) return [];

  const stageKeys = collectStageKeys(timelineEvents, shots);

  return stageKeys.map((stageKey) => {
    const sampleEvent = timelineEvents.find((e) => normalizeStage(e.event_name) === stageKey);
    const newShots = shots.filter((s) => normalizeStage(s.narrative_stage) === stageKey);

    const gapCodeSet = new Set<string>();
    for (const shot of newShots) {
      for (const code of collectGapCodes(shot, gapPlan)) gapCodeSet.add(code);
    }

    return {
      stageKey,
      stageLabel: formatNarrativeStage(stageKey),
      sampleSegment: sampleEvent
        ? {
            start: sampleEvent.start,
            end: sampleEvent.end,
            description: sampleEvent.description,
          }
        : undefined,
      newShots,
      gapCodes: Array.from(gapCodeSet),
    };
  });
}

export function flattenManifestShots(
  blocks: Array<{
    shots: Array<{
      index: number;
      start: number;
      end: number;
      narrative_stage: string;
      stage_brief?: string;
      packaging?: import("./types/pipeline").ScriptShotPackaging;
      asset_source?: string;
      is_aigc_supplement?: boolean;
      ui_label?: string;
      gap_codes?: string[];
    }>;
  }>
): ShotRef[] {
  return blocks.flatMap((block) =>
    block.shots.map((s) => ({
      index: s.index,
      timeRange: formatTimeRange(s.start, s.end),
      narrative_stage: s.narrative_stage,
      stage_brief: s.stage_brief,
      packaging: s.packaging,
      asset_source: s.asset_source,
      is_aigc_supplement: s.is_aigc_supplement,
      ui_label: s.ui_label,
      gap_codes: s.gap_codes,
    }))
  );
}

export function flattenScriptBlockShots(
  blocks: Array<{
    shots: Array<{
      index: number;
      timeRange: string;
      phase: string;
      stageBrief?: string;
      packaging?: import("./types/pipeline").ScriptShotPackaging;
      asset_source?: string;
      is_aigc_supplement?: boolean;
      ui_label?: string;
      gap_codes?: string[];
    }>;
  }>
): ShotRef[] {
  return blocks.flatMap((block) =>
    block.shots.map((s) => ({
      index: s.index,
      timeRange: s.timeRange,
      narrative_stage: s.phase,
      stage_brief: s.stageBrief,
      packaging: s.packaging,
      asset_source: s.asset_source,
      is_aigc_supplement: s.is_aigc_supplement,
      ui_label: s.ui_label,
      gap_codes: s.gap_codes,
    }))
  );
}
