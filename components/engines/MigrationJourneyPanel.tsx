"use client";

import { ScanLine, GitCompareArrows, AlertTriangle, Wand2, ChevronRight } from "lucide-react";
import { formatNarrativeStage } from "@/lib/narrative-stage-labels";
import { formatGapCode } from "@/lib/gap-display-labels";
import type { TimelineEventRef } from "@/lib/migration-mapping";

interface ManifestShot {
  asset_source?: string;
  fallback_applied?: string;
  is_aigc_supplement?: boolean;
  narrative_stage?: string;
}
interface ManifestLike {
  blocks: Array<{ shots: ManifestShot[] }>;
}
interface GapLike {
  gaps: Array<{ code: string }>;
}

interface MigrationJourneyPanelProps {
  sampleEvents: TimelineEventRef[];
  manifest?: ManifestLike | null;
  gapPlan?: GapLike | null;
  className?: string;
}

function StepCard({
  icon,
  title,
  accent,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-w-[150px] bg-[#131821] rounded-xl border border-white/8 p-3.5">
      <div className="flex items-center gap-2 mb-2.5" style={{ color: accent }}>
        {icon}
        <span className="text-xs font-medium">{title}</span>
      </div>
      <div className="space-y-1.5 text-[11px] text-white/70">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/45">{label}</span>
      <span className="text-white/85 font-medium">{value}</span>
    </div>
  );
}

/** 迁移过程全景：抽取 → 映射 → 缺口 → 补全 四段贯穿可视化 */
export default function MigrationJourneyPanel({
  sampleEvents,
  manifest,
  gapPlan,
  className = "",
}: MigrationJourneyPanelProps) {
  const shots: ManifestShot[] = manifest?.blocks?.flatMap((b) => b.shots) ?? [];
  if (!sampleEvents.length && !shots.length) return null;

  // 抽取
  const stageNames = Array.from(new Set(sampleEvents.map((e) => e.event_name)));
  const sampleDuration = sampleEvents.length
    ? sampleEvents[sampleEvents.length - 1].end - sampleEvents[0].start
    : 0;

  // 映射
  const mappedCount = Math.min(sampleEvents.length, shots.length);

  // 缺口
  const gaps = gapPlan?.gaps ?? [];
  const gapCodes = Array.from(new Set(gaps.map((g) => g.code)));

  // 补全
  const userAsset = shots.filter(
    (s) => s.asset_source === "user_image" || s.asset_source === "user_video_clip"
  ).length;
  const aigc = shots.filter((s) => s.is_aigc_supplement).length;
  const degraded = shots.filter((s) => s.fallback_applied === "narrative_degrade").length;
  const textOnly = shots.filter((s) => s.asset_source === "text_only").length;

  const Arrow = () => (
    <ChevronRight className="w-4 h-4 text-white/20 shrink-0 self-center hidden lg:block" />
  );

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="text-sm font-medium text-[#00F0FF]">迁移过程全景</div>
      <div className="flex flex-col lg:flex-row gap-2 items-stretch">
        <StepCard icon={<ScanLine className="w-4 h-4" />} title="1 · 样例结构抽取" accent="#00F0FF">
          <Stat label="叙事段数" value={sampleEvents.length} />
          <Stat label="结构阶段" value={stageNames.length} />
          <Stat label="样例时长" value={`${sampleDuration.toFixed(1)}s`} />
          {stageNames.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {stageNames.slice(0, 4).map((n) => (
                <span key={n} className="px-1.5 py-0.5 rounded bg-white/5 text-white/55 text-[10px]">
                  {formatNarrativeStage(n)}
                </span>
              ))}
            </div>
          )}
        </StepCard>

        <Arrow />

        <StepCard icon={<GitCompareArrows className="w-4 h-4" />} title="2 · 映射到新内容" accent="#A78BFA">
          <Stat label="新方案镜头" value={shots.length} />
          <Stat label="逐段对应" value={`${mappedCount} 对`} />
          <Stat
            label="覆盖率"
            value={sampleEvents.length ? `${Math.round((mappedCount / sampleEvents.length) * 100)}%` : "—"}
          />
        </StepCard>

        <Arrow />

        <StepCard icon={<AlertTriangle className="w-4 h-4" />} title="3 · 素材缺口识别" accent="#F5B041">
          <Stat label="检测缺口" value={`${gaps.length} 项`} />
          {gapCodes.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {gapCodes.map((c) => (
                <span key={c} className="px-1.5 py-0.5 rounded bg-[#F5B041]/15 text-[#F5B041] text-[10px]">
                  {formatGapCode(c)}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-white/40 text-[10px] pt-1">素材充足，无明显缺口</div>
          )}
        </StepCard>

        <Arrow />

        <StepCard icon={<Wand2 className="w-4 h-4" />} title="4 · 缺口补全方式" accent="#22C55E">
          <Stat label="复用用户素材" value={`${userAsset} 镜`} />
          <Stat label="AIGC 补足" value={`${aigc} 镜`} />
          <Stat label="叙事降级" value={`${degraded} 镜`} />
          {textOnly > 0 && <Stat label="文案替代" value={`${textOnly} 镜`} />}
        </StepCard>
      </div>
    </div>
  );
}
