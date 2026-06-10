"use client";

import { AlertTriangle, Image as ImageIcon, RefreshCw, Video, Zap, LayoutTemplate } from "lucide-react";
import { previewAssetUrl } from "@/lib/client-asset-preview";

interface Highlight {
  start: number;
  end: number;
  description?: string;
  tags?: string[];
  recommended_for?: string[];
}

interface MaterialLibraryPanelProps {
  images: string[];
  videos: string[];
  highlights?: Highlight[];
  isAnalyzing?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

/** 把推荐环节归一到 开头 / 中段 / 结尾 三个槽位桶 */
function bucketPosition(recommendedFor: string[] = []): string[] {
  const buckets = new Set<string>();
  for (const r of recommendedFor) {
    const s = r.toLowerCase();
    if (/hook|开头|开场|首/.test(s)) buckets.add("开头");
    else if (/cta|结尾|收尾|尾/.test(s)) buckets.add("结尾");
    else buckets.add("中段");
  }
  return Array.from(buckets);
}

/** 统一素材库 + 自动理解：镜头分类 / 高光筛选 / 适配位置推荐 */
export default function MaterialLibraryPanel({
  images,
  videos,
  highlights = [],
  isAnalyzing = false,
  error = null,
  onRetry,
  className = "",
}: MaterialLibraryPanelProps) {
  const total = images.length + videos.length;
  if (total === 0) return null;
  const statusText = isAnalyzing
    ? "素材理解中，正在提取高光片段…"
    : error
      ? error
      : videos.length === 0
        ? "上传商品演示视频后，可自动提取高光片段"
        : highlights.length > 0
          ? `已提取 ${highlights.length} 个高光片段，推荐回填到剧本槽位`
          : "尚未提取高光片段，可重新触发素材理解";

  // 汇总各槽位推荐覆盖情况，体现「反哺槽位分配」
  const slotCoverage: Record<string, number> = { 开头: 0, 中段: 0, 结尾: 0 };
  for (const h of highlights) {
    for (const b of bucketPosition(h.recommended_for)) slotCoverage[b] += 1;
  }

  return (
    <div className={`bg-black/20 border border-white/8 rounded-xl p-4 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="text-sm font-medium text-[#00F0FF] flex items-center gap-2">
          <LayoutTemplate className="w-4 h-4" /> 素材库 · 自动理解
        </div>
        {videos.length > 0 && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={isAnalyzing}
            className="text-[11px] px-2 py-1 rounded-md border border-white/10 text-white/50 hover:text-[#00F0FF] hover:border-[#00F0FF]/30 disabled:opacity-40 disabled:hover:text-white/50 disabled:hover:border-white/10 transition-colors flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${isAnalyzing ? "animate-spin" : ""}`} />
            {isAnalyzing ? "理解中" : "重试理解"}
          </button>
        )}
      </div>
      <div className={`text-xs mb-4 flex items-center gap-1.5 ${error ? "text-[#F5B041]" : "text-white/40"}`}>
        {error && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
        <span>共 {total} 项素材 · {statusText}</span>
      </div>

      {/* 槽位覆盖概览 */}
      <div className="flex gap-2 mb-4">
        {(["开头", "中段", "结尾"] as const).map((slot) => (
          <div
            key={slot}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-center text-[11px] ${
              slotCoverage[slot] > 0
                ? "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#22C55E]"
                : "border-white/10 bg-white/5 text-white/40"
            }`}
          >
            <div className="font-medium">{slot}</div>
            <div className="text-[10px] opacity-80">{slotCoverage[slot]} 个候选</div>
          </div>
        ))}
      </div>

      {/* 素材网格 */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
        {images.map((url, i) => (
          <div key={`img-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-white/10 bg-black/40">
            <img src={previewAssetUrl(url)} alt={`图 ${i + 1}`} className="w-full h-full object-cover" />
            <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-black/70 text-[9px] text-white/70 flex items-center gap-0.5">
              <ImageIcon className="w-2.5 h-2.5" /> 图片
            </span>
          </div>
        ))}
        {videos.map((url, i) => (
          <div key={`vid-${i}`} className="relative aspect-square rounded-lg overflow-hidden border border-white/10 bg-black">
            <video src={previewAssetUrl(url)} className="w-full h-full object-cover" muted playsInline preload="metadata" />
            <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-black/70 text-[9px] text-white/70 flex items-center gap-0.5">
              <Video className="w-2.5 h-2.5" /> {highlights.length > 0 ? "已分析" : "视频"}
            </span>
          </div>
        ))}
      </div>

      {/* 高光片段 + 适配位置 */}
      {highlights.length > 0 && (
        <div className="space-y-1.5">
          {highlights.map((h, i) => (
            <div key={i} className="text-[11px] bg-[#131821] p-2.5 rounded-lg border border-white/5 flex items-start gap-2">
              <Zap className="w-3.5 h-3.5 text-[#F5B041] mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-[#00F0FF] font-mono text-[10px]">
                    {Number(h.start).toFixed(1)}s–{Number(h.end).toFixed(1)}s
                  </span>
                  {bucketPosition(h.recommended_for).map((b) => (
                    <span key={b} className="px-1.5 py-0.5 rounded bg-[#22C55E]/15 text-[#22C55E] text-[9px]">
                      适配{b}
                    </span>
                  ))}
                  {(h.tags ?? []).map((t, j) => (
                    <span key={j} className="px-1.5 py-0.5 rounded bg-white/5 text-white/55 text-[9px]">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="text-white/70 line-clamp-2 leading-snug">{h.description}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
