"use client";

import {
  formatGapCode,
  getGapsForShot,
  getResolutionLabel,
  type GapPlanLike,
} from "@/lib/gap-display-labels";

interface ShotGapBadgeProps {
  shotIndex: number;
  gapPlan?: GapPlanLike | null;
  gapCodes?: string[];
  uiLabel?: string;
  compact?: boolean;
}

/** 镜头级缺口与补全策略 badge */
export default function ShotGapBadge({
  shotIndex,
  gapPlan,
  gapCodes = [],
  uiLabel,
  compact = false,
}: ShotGapBadgeProps) {
  const fromPlan = getGapsForShot(gapPlan, shotIndex);
  const codes = new Set<string>([...gapCodes, ...fromPlan.map((g) => g.code)]);

  if (codes.size === 0 && !uiLabel) return null;

  const textSize = compact ? "text-[10px]" : "text-xs";

  return (
    <div className={`flex flex-wrap gap-1 ${textSize}`}>
      {Array.from(codes).map((code) => {
        const gap = fromPlan.find((g) => g.code === code);
        const resolution = getResolutionLabel(gapPlan, code);
        return (
          <span
            key={code}
            className="px-1.5 py-0.5 rounded bg-[#F5B041]/15 text-[#F5B041] border border-[#F5B041]/25"
            title={gap?.description ?? formatGapCode(code)}
          >
            {formatGapCode(code)}
            {resolution ? ` · ${resolution}` : ""}
          </span>
        );
      })}
      {uiLabel && (
        <span className="px-1.5 py-0.5 rounded bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/20">
          {uiLabel}
        </span>
      )}
    </div>
  );
}
