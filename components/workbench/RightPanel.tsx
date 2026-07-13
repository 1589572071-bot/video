import React from 'react';
import { useWorkbenchStore } from '@/lib/store/workbench-store';
import DirectorChatPanel from '@/components/engines/DirectorChatPanel';
import type { DirectorActionResult } from '@/lib/director/tools';
import { alignChunkVideos, buildStaleHint, diffManifestBlocks } from '@/lib/editor/manifest-chunk-sync';
import { alignMarkdownToTimelineEvents, getTimelineEvents } from '@/lib/timeline-shot-align';
import { toast } from 'sonner';
import type { ScriptManifest } from '@/lib/types/pipeline';
import type { GapPlanState, ScriptManifestState } from '@/lib/store/workbench-store';

const STAGE_PROMPTS: Record<string, string[]> = {
  reference: ['分析更细一些', '突出节奏与转场', '提取更多花字信息'],
  product: ['卖点更聚焦', '补充使用场景', '语气更年轻化'],
  script: ['开头更抓人', '减少字幕密度', '加强 CTA 紧迫感'],
  render: ['重跑区块 2', '区块 1 改用 r2v', '整体节奏更紧凑'],
};

interface DirectorUndoSnapshot {
  scriptManifest: ScriptManifestState | null;
  generatedScript: string | null;
  gapPlan: GapPlanState | null;
  chunkVideos: string[];
  generatedVideoUrl: string | null;
}

export default function RightPanel() {
  const {
    activeTab,
    scriptManifest,
    chunkVideos,
    generatedVideoUrl,
    renderSummary,
    gapPlan,
    parsedProduct,
    productDescription,
    productImages,
    productVideos,
    analysisResult,
    projectId,
    setScriptState,
    setRenderState,
  } = useWorkbenchStore();

  const [undoSnapshot, setUndoSnapshot] = React.useState<DirectorUndoSnapshot | null>(null);

  const handleUndo = () => {
    if (!undoSnapshot) return;
    setScriptState({
      scriptManifest: undoSnapshot.scriptManifest,
      generatedScript: undoSnapshot.generatedScript,
      gapPlan: undoSnapshot.gapPlan,
      staleRerunHint: null,
    });
    setRenderState({
      chunkVideos: undoSnapshot.chunkVideos,
      generatedVideoUrl: undoSnapshot.generatedVideoUrl,
    });
    setUndoSnapshot(null);
    toast.success('已撤销上次导演改动');
  };

  const handleDirectorResults = (results: DirectorActionResult[]): string | void => {
    // 应用前先快照，支持一键撤销
    const before = useWorkbenchStore.getState();
    setUndoSnapshot({
      scriptManifest: before.scriptManifest,
      generatedScript: before.generatedScript,
      gapPlan: before.gapPlan,
      chunkVideos: before.chunkVideos,
      generatedVideoUrl: before.generatedVideoUrl,
    });
    const changedBlockSet = new Set<number>();
    let localManifest = scriptManifest;
    let localChunks = chunkVideos;
    const localHasVideo = Boolean(generatedVideoUrl) || chunkVideos.some(Boolean);

    for (const result of results) {
      if (result.scriptManifest) {
        const prev = localManifest;
        const next = result.scriptManifest as unknown as ScriptManifest; // Cast for now
        localManifest = next;

        if (result.updated_chunks?.length) {
          localChunks = result.updated_chunks;
        } else if (localHasVideo || localChunks.some(Boolean)) {
          localChunks = alignChunkVideos(next, localChunks).aligned;
        }

        setScriptState({ stageBriefsDirty: false });
        setRenderState({ chunkVideos: localChunks });

        if (prev) {
          for (const idx of diffManifestBlocks(prev as unknown as ScriptManifest, next).changedBlockIndices) {
            changedBlockSet.add(idx);
          }
        }

        const hint =
          result.stale_hint ??
          (prev && (localHasVideo || localChunks.some(Boolean))
            ? buildStaleHint(
                diffManifestBlocks(prev as unknown as ScriptManifest, next),
                alignChunkVideos(next, localChunks),
                true
              )
            : null);
        if (hint) setRenderState({ staleRerunHint: hint });
        
        setScriptState({ scriptManifest: next });
      }

      if (result.scriptMarkdown) {
        setScriptState({
          generatedScript:
            analysisResult && getTimelineEvents(analysisResult).length > 0
              ? alignMarkdownToTimelineEvents(result.scriptMarkdown, analysisResult)
              : result.scriptMarkdown
        });
      }
      
      if (result.gapPlan) {
        setScriptState({ gapPlan: result.gapPlan as unknown as GapPlanState });
      }

      if (result.updated_chunks?.length && !result.scriptManifest) {
        localChunks = result.updated_chunks;
        setRenderState({ chunkVideos: result.updated_chunks });
      } else if (result.success && result.block_index != null && result.local_url) {
        localChunks = [...localChunks];
        while (localChunks.length < result.block_index!) {
          localChunks.push("");
        }
        localChunks[result.block_index! - 1] = result.local_url!;
        setRenderState({ chunkVideos: localChunks });
      }

      if (result.final_video) {
        setRenderState({ generatedVideoUrl: result.final_video, staleRerunHint: null });
      }
    }

    if (changedBlockSet.size > 0) {
      const blocks = Array.from(changedBlockSet).sort((a, b) => a - b);
      return `改动对比：已更新区块 ${blocks.join('、')}（可点下方「撤销上次导演改动」回退）`;
    }
  };

  const scriptBlocks = Array.isArray(scriptManifest?.blocks)
    ? scriptManifest.blocks
    : [];
  const scriptBlocksCount = scriptBlocks.length;
  const scriptShotsCount = scriptBlocks.reduce(
    (sum, block) => sum + (Array.isArray(block.shots) ? block.shots.length : 0),
    0
  );

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/10 shrink-0">
        <div className="text-sm font-medium text-[#00F0FF] flex items-center gap-2">
          AI 导演
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <DirectorChatPanel
          compact
          scriptSummary={renderSummary ?? (scriptBlocksCount ? `${scriptBlocksCount} 区块 · ${scriptShotsCount} 镜` : undefined)}
          gapSummary={gapPlan ? `${gapPlan.gaps?.length ?? 0} 项缺口` : undefined}
          productSummary={(parsedProduct?.product_name as string | undefined) ?? (productDescription.slice(0, 80) || undefined)}
          scriptManifest={scriptManifest as ScriptManifest | null}
          product={parsedProduct}
          productImageUrls={productImages}
          productVideoUrls={productVideos}
          videoAnalysis={analysisResult}
          chunkVideos={chunkVideos}
          projectId={projectId}
          quickPrompts={STAGE_PROMPTS[activeTab]}
          canUndo={Boolean(undoSnapshot)}
          onUndo={handleUndo}
          onDirectorResults={handleDirectorResults}
        />
      </div>
    </div>
  );
}
