"use client";

import { formatNarrativeStage } from "@/lib/narrative-stage-labels";

interface TimelineEvent {
  start: number;
  end: number;
  event_name: string;
  description?: string;
}

interface VideoRhythmOverviewProps {
  events: TimelineEvent[];
  avgShotDuration?: number | null;
  compact?: boolean;
  className?: string;
}

/** 参考视频叙事节奏速览（原子裂解完成后展示） */
export default function VideoRhythmOverview({
  events,
  avgShotDuration,
  compact = false,
  className = "",
}: VideoRhythmOverviewProps) {
  if (!events.length) return null;

  return (
    <div className={`bg-[#131821] rounded-xl p-3 text-xs ${className}`}>
      <div className={`text-[#00F0FF] mb-2 ${compact ? "text-[10px]" : ""}`}>视频节奏速览</div>
      <div className="flex flex-wrap gap-1.5">
        {events.map((e, i) => (
          <span
            key={`${e.event_name}-${e.start}-${i}`}
            className={`px-2 py-0.5 bg-white/5 rounded text-white/70 ${compact ? "text-[10px]" : ""}`}
            title={`${e.start.toFixed(1)}s - ${e.end.toFixed(1)}s${e.description ? ` · ${e.description}` : ""}`}
          >
            {formatNarrativeStage(e.event_name)}
            {!compact && (
              <span className="text-white/30 ml-1 font-mono text-[10px]">
                {e.start.toFixed(1)}–{e.end.toFixed(1)}s
              </span>
            )}
          </span>
        ))}
      </div>
      <div className={`mt-2 text-white/40 ${compact ? "text-[10px]" : ""}`}>
        共 {events.length} 个阶段
        {avgShotDuration != null && !Number.isNaN(avgShotDuration)
          ? ` · 平均镜头 ${avgShotDuration.toFixed(1)}s`
          : ""}
      </div>
    </div>
  );
}
