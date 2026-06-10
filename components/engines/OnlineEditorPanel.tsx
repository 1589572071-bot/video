"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatRenderMode } from "@/lib/narrative-stage-labels";

interface BlockInfo {
  index: number;
  timeRange: string;
  renderMode: string;
  shotCount: number;
}

export type RerunStrategy = "single" | "cascade";

export interface BlocksRerunResult {
  chunkVideos: string[];
  finalVideo?: string | null;
  reranBlocks: number[];
  strategy: RerunStrategy;
}

interface OnlineEditorPanelProps {
  blocks: BlockInfo[];
  scriptManifest: unknown;
  product: unknown;
  productImageUrls: string[];
  chunkVideos?: string[];
  projectId?: string | null;
  compact?: boolean;
  onBlocksRerunResult?: (result: BlocksRerunResult) => void;
  onFullRegenerate?: () => void;
  onConcatOnly?: () => void;
  isFullRegenerating?: boolean;
  isConcatting?: boolean;
}

/** 在线剪辑：区块批量重跑 + 全片重生 */
export default function OnlineEditorPanel({
  blocks,
  scriptManifest,
  product,
  productImageUrls,
  chunkVideos = [],
  projectId,
  compact = false,
  onBlocksRerunResult,
  onFullRegenerate,
  onConcatOnly,
  isFullRegenerating = false,
  isConcatting = false,
}: OnlineEditorPanelProps) {
  const [rerunning, setRerunning] = useState<number | null>(null);
  const [menuBlock, setMenuBlock] = useState<number | null>(null);

  const rerun = async (blockIndex: number, strategy: RerunStrategy) => {
    if (!scriptManifest || !product) {
      toast.error("缺少剧本数据");
      return;
    }
    setMenuBlock(null);
    setRerunning(blockIndex);
    try {
      const res = await fetch("/api/render/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scriptManifest,
          product,
          blockIndex,
          productImageUrls,
          chunkVideos,
          strategy,
          projectId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const reranBlocks = (data.reran_blocks as number[]) ?? [blockIndex];
      const updatedChunks = (data.updated_chunks as string[]) ?? chunkVideos;

      if (strategy === "cascade" && reranBlocks.length > 1) {
        toast.success(`已重跑区块 ${reranBlocks[0]}–${reranBlocks[reranBlocks.length - 1]}${data.final_video ? " · 已更新成片" : ""}`);
      } else {
        toast.success(`区块 ${blockIndex} 已重跑 · ${data.mode}`);
        if (strategy === "single" && blockIndex < blocks.length && !data.final_video) {
          toast.warning("仅重跑本区块：块间切点可能视觉不连续，可选批量重跑或全片重新生成");
        }
      }

      onBlocksRerunResult?.({
        chunkVideos: updatedChunks,
        finalVideo: data.final_video ?? null,
        reranBlocks,
        strategy,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "重跑失败");
    } finally {
      setRerunning(null);
    }
  };

  if (blocks.length === 0) {
    return null;
  }

  const busy = rerunning !== null || isFullRegenerating || isConcatting;
  const hasChunks = chunkVideos.some(Boolean);

  return (
    <div className={compact ? "shrink-0 space-y-2" : "glass-card p-4 space-y-3"}>
      <div className={`font-medium text-[#00F0FF] ${compact ? "text-[10px]" : "text-sm"}`}>
        区块重跑
      </div>
      <div className={compact ? "flex flex-wrap gap-1" : "space-y-2"}>
        {blocks.map((block, i) => (
          <div
            key={block.index}
            className={`relative flex items-center justify-between bg-[#131821] rounded-lg text-[10px] ${
              compact ? "px-2 py-1 flex-1 min-w-[45%]" : "px-3 py-2 text-xs"
            }`}
          >
            <div className="truncate mr-1 min-w-0">
              <span className="text-white/70">B{block.index}</span>
              {!compact && (
                <>
                  <span className="text-white/40"> · {block.timeRange}</span>
                  <span className="text-white/30"> · {formatRenderMode(block.renderMode)}</span>
                </>
              )}
              {chunkVideos[i] && <span className="text-[#22C55E] ml-1">✓</span>}
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => rerun(block.index, "cascade")}
                disabled={busy}
                className="text-[9px] px-1.5 py-0.5 rounded border border-[#00F0FF]/40 text-[#00F0FF] disabled:opacity-50"
                title="从本区块批量重跑到结尾并拼接（推荐）"
              >
                {rerunning === block.index ? "…" : "重跑"}
              </button>
              <button
                type="button"
                onClick={() => setMenuBlock(menuBlock === block.index ? null : block.index)}
                disabled={busy}
                className="text-[9px] px-1 py-0.5 rounded border border-white/15 text-white/40 disabled:opacity-50"
                aria-label="更多选项"
              >
                ▾
              </button>
            </div>
            {menuBlock === block.index && (
              <div className="absolute right-0 top-full mt-1 z-20 min-w-[140px] bg-[#1A1F2A] border border-white/10 rounded-lg shadow-lg py-1">
                <button
                  type="button"
                  className="w-full text-left px-2.5 py-1.5 text-[10px] text-white/70 hover:bg-white/5"
                  onClick={() => rerun(block.index, "single")}
                >
                  仅重跑本区块
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={`flex flex-col gap-1 ${compact ? "" : "pt-1"}`}>
        {onFullRegenerate && (
          <button
            type="button"
            onClick={onFullRegenerate}
            disabled={busy}
            className={`w-full py-1.5 rounded-lg border border-[#00F0FF]/40 text-[#00F0FF] disabled:opacity-50 ${
              compact ? "text-[9px]" : "text-xs"
            }`}
          >
            {isFullRegenerating ? "全片生成中…" : "全片重新生成"}
          </button>
        )}
        {onConcatOnly && hasChunks && (
          <button
            type="button"
            onClick={onConcatOnly}
            disabled={busy || chunkVideos.filter(Boolean).length < 2}
            className={`w-full py-1.5 rounded-lg border border-white/15 text-white/50 hover:text-white/70 disabled:opacity-40 ${
              compact ? "text-[9px]" : "text-xs"
            }`}
          >
            {isConcatting ? "拼接中…" : "仅重新拼接成片"}
          </button>
        )}
      </div>
    </div>
  );
}
