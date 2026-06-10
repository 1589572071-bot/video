"use client";

import { resolveViralSummaryParagraph } from "@/lib/content-strategy/resolve";
import type { VideoAnalysisInput } from "@/lib/types/pipeline";

interface ContentStrategyReportProps {
  analysis: VideoAnalysisInput | null;
  compact?: boolean;
  className?: string;
}

/** 爆款拆解报告：核心原因 + 可复用模板（一段话） */
export default function ContentStrategyReport({
  analysis,
  compact = false,
  className = "",
}: ContentStrategyReportProps) {
  const summary = resolveViralSummaryParagraph(analysis);
  if (!summary) return null;

  return (
    <div className={`bg-[#131821] rounded-xl p-3 text-xs ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`text-[#00F0FF] font-medium ${compact ? "text-[10px]" : ""}`}>
          爆款拆解报告
        </div>
        {summary.isPartial && (
          <span className="text-[10px] text-amber-400/80">部分为推导值</span>
        )}
      </div>

      <p
        className={`text-white/80 leading-relaxed line-clamp-6 ${
          compact ? "text-[10px]" : ""
        }`}
      >
        {summary.text}
      </p>
    </div>
  );
}
