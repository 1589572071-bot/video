"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { previewAssetUrl } from "@/lib/client-asset-preview";

interface SampleVsGeneratedCompareProps {
  referenceVideoUrl?: string | null;
  generatedVideoUrl?: string | null;
  /** 无成片时右侧内容（如「开始生成视频」按钮） */
  rightPanel?: ReactNode;
  /** 有成片时视频下方的操作按钮 */
  generatedActions?: ReactNode;
  rightLabel?: string;
  className?: string;
  compact?: boolean;
  onPlaybackTimeChange?: (time: number) => void;
  onReferenceDurationChange?: (duration: number) => void;
}

function getSeekTime(detail: unknown): number | null {
  if (typeof detail === "number" && Number.isFinite(detail)) return detail;
  if (
    detail &&
    typeof detail === "object" &&
    "time" in detail &&
    typeof detail.time === "number" &&
    Number.isFinite(detail.time)
  ) {
    return detail.time;
  }
  return null;
}

function seekVideoElement(video: HTMLVideoElement | null, time: number) {
  if (!video) return;
  const wasPlaying = !video.paused && !video.ended;
  video.currentTime = time;
  if (wasPlaying) {
    void video.play().catch(() => undefined);
  }
}

/** 样例参考视频 vs 生成成片（或右侧操作区） */
export default function SampleVsGeneratedCompare({
  referenceVideoUrl,
  generatedVideoUrl,
  rightPanel,
  generatedActions,
  rightLabel = "生成成片",
  className = "",
  compact = false,
  onPlaybackTimeChange,
  onReferenceDurationChange,
}: SampleVsGeneratedCompareProps) {
  const referenceVideoRef = useRef<HTMLVideoElement | null>(null);
  const generatedVideoRef = useRef<HTMLVideoElement | null>(null);
  const referencePreviewUrl = previewAssetUrl(referenceVideoUrl);
  const generatedPreviewUrl = previewAssetUrl(generatedVideoUrl);

  useEffect(() => {
    const handleSeek = (event: Event) => {
      const time = getSeekTime((event as CustomEvent<unknown>).detail);
      if (time === null) return;
      seekVideoElement(referenceVideoRef.current, time);
      seekVideoElement(generatedVideoRef.current, time);
    };

    window.addEventListener("seek-video", handleSeek);
    return () => window.removeEventListener("seek-video", handleSeek);
  }, []);

  if (!referenceVideoUrl && !generatedVideoUrl && !rightPanel) return null;

  const videoClass = compact
    ? "w-full rounded-lg bg-black aspect-[9/16] max-h-[20rem] object-contain"
    : "w-full rounded-lg bg-black aspect-[9/16] max-h-64 object-contain";

  const placeholderClass = compact
    ? "aspect-[9/16] max-h-[20rem] rounded-lg bg-[#1A1F2A] flex items-center justify-center text-white/30 text-xs"
    : "aspect-[9/16] max-h-64 rounded-lg bg-[#1A1F2A] flex items-center justify-center text-white/30 text-xs";

  const rightMinH = compact ? "min-h-[20rem]" : "min-h-[16rem]";

  return (
    <div className={`bg-[#131821] rounded-xl p-4 border border-white/10 ${className}`}>
      <div className="text-xs text-white/50 mb-3">样例 vs 成片对比</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
        <div>
          <div className="text-[10px] text-white/40 mb-1">参考样例</div>
          {referenceVideoUrl ? (
            <video
              ref={referenceVideoRef}
              src={referencePreviewUrl}
              controls
              className={videoClass}
              onTimeUpdate={(event) => onPlaybackTimeChange?.(event.currentTarget.currentTime)}
              onLoadedMetadata={(event) => {
                const duration = event.currentTarget.duration;
                if (Number.isFinite(duration) && duration > 0) {
                  onReferenceDurationChange?.(duration);
                }
              }}
            />
          ) : (
            <div className={placeholderClass}>未上传样例</div>
          )}
        </div>
        <div className={`flex flex-col ${rightMinH}`}>
          <div className="text-[10px] text-white/40 mb-1">{rightLabel}</div>
          {generatedVideoUrl ? (
            <>
              {generatedVideoUrl.endsWith(".svg") || generatedVideoUrl.includes("/keyframes/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={generatedPreviewUrl} alt="生成结果" className={videoClass} />
              ) : (
                <video
                  ref={generatedVideoRef}
                  src={generatedPreviewUrl}
                  controls
                  className={videoClass}
                  onTimeUpdate={(event) => onPlaybackTimeChange?.(event.currentTarget.currentTime)}
                />
              )}
              {generatedActions && (
                <div className="mt-2 flex flex-wrap gap-2 justify-center">{generatedActions}</div>
              )}
            </>
          ) : rightPanel ? (
            <div
              className={`flex-1 flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-[#1A1F2A] px-4 py-6 ${rightMinH}`}
            >
              {rightPanel}
            </div>
          ) : (
            <div className={placeholderClass}>尚未生成成片</div>
          )}
        </div>
      </div>
    </div>
  );
}
