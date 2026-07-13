"use client";

import { useState } from "react";
import { formatGapCode, formatFallbackStrategy, type GapPlanLike } from "@/lib/gap-display-labels";
import {
  buildSegmentShotRows,
  flattenManifestShots,
  flattenScriptBlockShots,
  type SampleEventRef,
  type SegmentShotRow,
  type ShotRef,
  type TimelineEventRef,
} from "@/lib/migration-mapping";
import { buildMigrationPairBrief } from "@/lib/migration-shot-summary";
import { formatNarrativeStage } from "@/lib/narrative-stage-labels";
import type { ProductInput, ScriptShotPackaging } from "@/lib/types/pipeline";
import ExpandableText from "@/components/ui/ExpandableText";

interface ScriptBlockLike {
  shots: Array<{
    index: number;
    timeRange: string;
    phase: string;
    stageBrief?: string;
    packaging?: ScriptShotPackaging;
    asset_source?: string;
    is_aigc_supplement?: boolean;
    ui_label?: string;
    gap_codes?: string[];
  }>;
}

interface ManifestLike {
  blocks: Array<{
    shots: Array<{
      index: number;
      start: number;
      end: number;
      narrative_stage: string;
      stage_brief?: string;
      packaging?: ScriptShotPackaging;
      asset_source?: string;
      is_aigc_supplement?: boolean;
      ui_label?: string;
      gap_codes?: string[];
    }>;
  }>;
}

interface MigrationOverviewPanelProps {
  sampleEvents: TimelineEventRef[];
  scriptBlocks?: ScriptBlockLike[];
  scriptManifest?: ManifestLike | null;
  gapPlan?: GapPlanLike | null;
  product?: ProductInput | null;
  className?: string;
}

function resolveShots(
  scriptManifest?: ManifestLike | null,
  scriptBlocks?: ScriptBlockLike[]
): ShotRef[] {
  if (scriptManifest?.blocks?.length) return flattenManifestShots(scriptManifest.blocks);
  if (scriptBlocks?.length) return flattenScriptBlockShots(scriptBlocks);
  return [];
}

function cardHighlight(active: boolean): string {
  return active ? "ring-1 ring-[#00F0FF]/30 border-[#00F0FF]/25" : "border-white/10";
}

function SampleSegmentCard({
  event,
  active,
  pairing,
}: {
  event?: SampleEventRef;
  active: boolean;
  pairing: SegmentShotRow["pairing"];
}) {
  if (!event) {
    return (
      <div
        className={`h-full min-h-[72px] rounded-lg border border-dashed px-3 py-2 flex items-center justify-center text-[10px] text-white/30 ${cardHighlight(active)}`}
      >
        {pairing === "shot_extra" ? "样例段数不足" : "—"}
      </div>
    );
  }

  return (
    <div className={`h-full rounded-lg border bg-[#1A1F2A] px-3 py-2 ${cardHighlight(active)}`}>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[#00F0FF] font-mono text-[10px]">
          {event.start.toFixed(1)}–{event.end.toFixed(1)}s
        </span>
        <span className="text-white/80">{formatNarrativeStage(event.event_name)}</span>
      </div>
      <ExpandableText
        text={buildMigrationPairBrief(event).sampleHighlight}
        lines={2}
        className="text-[10px] text-white/60 mt-1"
      />
    </div>
  );
}

function NewShotCard({
  shot,
  sampleEvent,
  product,
  active,
  emptyLabel,
}: {
  shot?: ShotRef;
  sampleEvent?: SampleEventRef;
  product?: ProductInput | null;
  active: boolean;
  emptyLabel: string;
}) {
  if (!shot) {
    return (
      <div
        className={`h-full min-h-[72px] rounded-lg border border-dashed px-3 py-2 flex items-center justify-center text-[10px] text-white/30 ${cardHighlight(active)}`}
      >
        {emptyLabel}
      </div>
    );
  }

  const { newAdaptation } = buildMigrationPairBrief(sampleEvent, shot, product);

  return (
    <div
      className={`h-full rounded-lg border px-3 py-2 ${
        shot.is_aigc_supplement ? "bg-[#F5B041]/10 border-[#F5B041]/20" : "bg-[#1A1F2A]"
      } ${active ? "ring-1 ring-[#00F0FF]/30" : ""}`}
    >
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[#00F0FF] font-mono text-[10px]">{shot.timeRange}</span>
        <span className="text-white/70">镜 {shot.index}</span>
        <span className="text-white/50">{formatNarrativeStage(shot.narrative_stage)}</span>
      </div>
      <ExpandableText text={newAdaptation} lines={2} className="text-[10px] text-white/70 mt-1" />
    </div>
  );
}

function MappingRow({
  row,
  product,
  gapPlan,
  active,
  onActivate,
  onDeactivate,
}: {
  row: SegmentShotRow;
  product?: ProductInput | null;
  gapPlan?: GapPlanLike | null;
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
}) {
  const emptyShotLabel =
    row.pairing === "sample_unmapped" ? "暂无对应镜头" : "—";

  return (
    <div
      role="row"
      tabIndex={0}
      className={`rounded-xl border p-2 transition-colors outline-none ${
        active
          ? "border-[#00F0FF]/50 bg-[#00F0FF]/5"
          : "border-white/5 bg-[#131821]/60 hover:border-white/15"
      }`}
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      onFocus={onActivate}
      onBlur={onDeactivate}
    >
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="text-[10px] font-mono text-white/50">第 {row.rowIndex + 1} 对</span>
        {row.pairing === "sample_unmapped" && (
          <span className="text-[10px] text-white/35">暂无对应镜头</span>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
        <SampleSegmentCard event={row.sampleEvent} active={active} pairing={row.pairing} />
        <NewShotCard
          shot={row.newShot}
          sampleEvent={row.sampleEvent}
          product={product}
          active={active}
          emptyLabel={emptyShotLabel}
        />
      </div>
      {row.gapCodes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 pl-1">
          {row.gapCodes.map((code) => {
            const resolution = Array.isArray(gapPlan?.resolutions)
              ? gapPlan.resolutions.find((r) => r.gap_code === code)
              : undefined;
            return (
              <span
                key={code}
                className="px-1.5 py-0.5 rounded bg-[#F5B041]/15 text-[#F5B041] text-[10px]"
                title={resolution?.description}
              >
                {formatGapCode(code)}
                {resolution?.ui_label
                  ? ` · ${resolution.ui_label}`
                  : resolution
                    ? ` · ${formatFallbackStrategy(resolution.strategy)}`
                    : ""}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 结构迁移总览：样例段 ↔ 新镜逐行对照 + 同步高亮 */
export default function MigrationOverviewPanel({
  sampleEvents,
  scriptBlocks,
  scriptManifest,
  gapPlan,
  product,
  className = "",
}: MigrationOverviewPanelProps) {
  const [activeRowId, setActiveRowId] = useState<string | null>(null);

  const shots = resolveShots(scriptManifest, scriptBlocks);
  const rows = buildSegmentShotRows(sampleEvents, shots, gapPlan);

  if (!sampleEvents.length && !shots.length) return null;

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="text-sm font-medium text-[#00F0FF]">结构迁移总览</div>

      <div className="bg-[#131821] rounded-xl p-3 border border-[#00F0FF]/20">
        <div className="hidden lg:grid grid-cols-2 gap-3 mb-2 px-2 text-[10px] text-white/40">
          <span>样例亮点 / 注意点</span>
          <span>新品对应改写</span>
        </div>
        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
          {rows.length ? (
            rows.map((row) => (
              <MappingRow
                key={row.id}
                row={row}
                product={product}
                gapPlan={gapPlan}
                active={activeRowId === row.id}
                onActivate={() => setActiveRowId(row.id)}
                onDeactivate={() => setActiveRowId((prev) => (prev === row.id ? null : prev))}
              />
            ))
          ) : (
            <p className="text-xs text-white/30 px-2 py-4 text-center">暂无对照数据</p>
          )}
        </div>
      </div>
    </div>
  );
}
