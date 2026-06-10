"use client";

export type ScriptGenPhase = "idle" | "parsing_product" | "stitching_script" | "done";

const STEPS = [
  { label: "缺口检测", minProgress: 0 },
  { label: "样例结构 1:1 映射", minProgress: 30 },
  { label: "生成 Markdown 分镜剧本", minProgress: 60 },
] as const;

interface ScriptGenerationProgressProps {
  progress: number;
  phase: ScriptGenPhase;
  /** 已有剧本内容时，仅显示顶部进度条 */
  overlay?: boolean;
  className?: string;
}

/** 阶段③ · 剧本生成进度（软进度 + 子步骤） */
export default function ScriptGenerationProgress({
  progress,
  phase,
  overlay = false,
  className = "",
}: ScriptGenerationProgressProps) {
  if (phase === "idle" || phase === "done") return null;

  const title =
    phase === "parsing_product"
      ? "商品多模态解析中"
      : "正在跨品类缝合剧本";

  const barProgress = phase === "parsing_product" ? Math.min(progress, 40) : progress;

  const activeStepIndex = STEPS.reduce(
    (acc, step, i) => (barProgress >= step.minProgress ? i : acc),
    0
  );

  if (overlay) {
    return (
      <div
        className={`mb-4 rounded-xl border border-[#00F0FF]/30 bg-[#00F0FF]/5 p-3 ${className}`}
      >
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-[#00F0FF] flex items-center gap-2">
            <span className="inline-block w-3.5 h-3.5 border-2 border-[#00F0FF] border-t-transparent rounded-full animate-spin shrink-0" />
            {title}…
          </span>
          <span className="font-mono text-white/50">{barProgress}%</span>
        </div>
        <div className="pipeline-main-bar">
          <div className="progress" style={{ width: `${barProgress}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-[#00F0FF]">
          <span className="inline-block w-4 h-4 border-2 border-[#00F0FF] border-t-transparent rounded-full animate-spin shrink-0" />
          剧本生成中
        </div>
        <span className="text-xs font-mono text-white/50">{barProgress}%</span>
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1.5 text-[#00F0FF]">
          <span>{title}</span>
        </div>
        <div className="pipeline-main-bar">
          <div className="progress" style={{ width: `${barProgress}%` }} />
          {phase === "stitching_script" && barProgress < 92 && (
            <div
              className="scan-line"
              style={{ left: `${Math.max(barProgress - 18, 0)}%` }}
            />
          )}
        </div>
      </div>

      {phase === "stitching_script" && (
        <ul className="space-y-1.5 text-[11px]">
          {STEPS.map((step, i) => {
            const active = i <= activeStepIndex;
            const current = i === activeStepIndex;
            return (
              <li
                key={step.label}
                className={`flex items-center gap-2 ${
                  active ? "text-white/70" : "text-white/30"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    current
                      ? "bg-[#00F0FF] shadow-[0_0_6px_#00F0FF]"
                      : active
                        ? "bg-[#00F0FF]/50"
                        : "bg-white/20"
                  }`}
                />
                {step.label}
                {current && (
                  <span className="text-[#00F0FF]/60 text-[10px]">进行中</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-3 pt-1">
        <div className="h-24 rounded-xl bg-white/[0.03] border border-white/5 animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-16 rounded-lg bg-white/[0.03] border border-white/5 animate-pulse" />
          <div className="h-16 rounded-lg bg-white/[0.03] border border-white/5 animate-pulse" />
        </div>
        <div className="h-20 rounded-xl bg-white/[0.03] border border-white/5 animate-pulse" />
      </div>
    </div>
  );
}
