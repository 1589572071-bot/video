"use client";

import {
  buildSegmentShotRows,
  flattenManifestShots,
  type TimelineEventRef,
} from "@/lib/migration-mapping";
import { buildMigrationPairBrief } from "@/lib/migration-shot-summary";
import { formatNarrativeStage } from "@/lib/narrative-stage-labels";
import { formatGapCode, type GapPlanLike } from "@/lib/gap-display-labels";
import type { ProductInput, ScriptShotPackaging } from "@/lib/types/pipeline";
import ExpandableText from "@/components/ui/ExpandableText";

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

interface StructureSlotCompareProps {
  sampleEvents: TimelineEventRef[];
  manifest?: ManifestLike | null;
  gapPlan?: GapPlanLike | null;
  product?: ProductInput | null;
  className?: string;
}

/** 样例结构槽位 ↔ 新结果逐槽位对比表（迁移可验证性） */
export default function StructureSlotCompare({
  sampleEvents,
  manifest,
  gapPlan,
  product,
  className = "",
}: StructureSlotCompareProps) {
  const shots = manifest?.blocks?.length ? flattenManifestShots(manifest.blocks) : [];
  const rows = buildSegmentShotRows(sampleEvents, shots, gapPlan);
  if (!rows.length) return null;

  return (
    <div className={`bg-[#131821] rounded-xl p-4 border border-white/10 ${className}`}>
      <div className="text-xs text-white/50 mb-3">结构槽位前后对比</div>
      <div className="grid grid-cols-[2rem_1fr_1fr] gap-2 text-[10px] text-white/40 mb-2 px-1">
        <span>槽位</span>
        <span>样例结构</span>
        <span>新结果改写</span>
      </div>
      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
        {rows.map((row) => {
          const brief = buildMigrationPairBrief(row.sampleEvent, row.newShot, product);
          return (
            <div
              key={row.id}
              className="grid grid-cols-[2rem_1fr_1fr] gap-2 items-start bg-[#0B0E14]/60 rounded-lg p-2 border border-white/5"
            >
              <div className="text-[10px] font-mono text-white/40 pt-1">#{row.rowIndex + 1}</div>

              {/* 样例 */}
              <div className="text-[11px]">
                {row.sampleEvent ? (
                  <>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[#00F0FF] font-mono text-[10px]">
                        {row.sampleEvent.start.toFixed(1)}–{row.sampleEvent.end.toFixed(1)}s
                      </span>
                      <span className="text-white/70">{formatNarrativeStage(row.sampleEvent.event_name)}</span>
                    </div>
                    <ExpandableText text={brief.sampleHighlight} lines={2} className="text-white/55 leading-snug" />
                  </>
                ) : (
                  <span className="text-white/25">样例无此段</span>
                )}
              </div>

              {/* 新结果 */}
              <div className="text-[11px]">
                {row.newShot ? (
                  <>
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <span className="text-white/60 font-mono text-[10px]">{row.newShot.timeRange}</span>
                      <span className="text-white/70">镜 {row.newShot.index}</span>
                      {row.newShot.is_aigc_supplement && (
                        <span className="px-1 py-0.5 rounded bg-[#F5B041]/15 text-[#F5B041] text-[9px]">
                          AI 补足
                        </span>
                      )}
                      {row.newShot.asset_source === "user_image" && (
                        <span className="px-1 py-0.5 rounded bg-[#22C55E]/15 text-[#22C55E] text-[9px]">
                          用户图
                        </span>
                      )}
                      {row.newShot.asset_source === "user_video_clip" && (
                        <span className="px-1 py-0.5 rounded bg-[#22C55E]/15 text-[#22C55E] text-[9px]">
                          用户视频
                        </span>
                      )}
                    </div>
                    <ExpandableText text={brief.newAdaptation} lines={2} className="text-white/70 leading-snug" />
                    {row.gapCodes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {row.gapCodes.map((c) => (
                          <span key={c} className="px-1 py-0.5 rounded bg-[#F5B041]/10 text-[#F5B041]/80 text-[9px]">
                            {formatGapCode(c)}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-white/25">暂无对应镜头</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
