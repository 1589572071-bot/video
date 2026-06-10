import React from 'react';
import { Film } from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench-store';
import { workbenchActions } from '@/lib/store/workbench-actions';
import SampleVsGeneratedCompare from '@/components/engines/SampleVsGeneratedCompare';
import OnlineEditorPanel, { type BlocksRerunResult } from '@/components/engines/OnlineEditorPanel';
import StructureSlotCompare from '@/components/engines/StructureSlotCompare';
import PackagingKitPanel from '@/components/engines/PackagingKitPanel';
import { getTimelineEvents } from '@/lib/timeline-shot-align';
import type { ProductInput, ScriptManifest } from '@/lib/types/pipeline';

export default function RenderStage() {
  const {
    scriptManifest,
    parsedProduct,
    isVideoConfirmed,
    isVideoGenerating,
    generatedVideoUrl,
    renderSummary,
    renderBlocked,
    renderProgress,
    renderSteps,
    chunkVideos,
    staleRerunHint,
    isConcatting,
    uploadedVideoUrl,
    productImages,
    editableProduct,
    gapPlan,
    analysisResult,
    projectId,
    isGeneratingPackaging,
    setScriptState,
    setRenderState,
    setReferenceState
  } = useWorkbenchStore();

  const editorBlocks = React.useMemo(
    () =>
      (scriptManifest?.blocks ?? []).map((b) => ({
        index: b.index,
        timeRange: `${b.start.toFixed(1)}s - ${b.end.toFixed(1)}s`,
        renderMode: b.render_mode === 'T2V' ? '纯文本生成 (T2V)' : '图生视频 (I2V)',
        shotCount: b.shots.length,
      })),
    [scriptManifest]
  );

  const handleBlocksRerunResult = (result: BlocksRerunResult) => {
    setRenderState({
      chunkVideos: result.chunkVideos,
      ...(result.finalVideo ? { generatedVideoUrl: result.finalVideo, staleRerunHint: null } : {}),
    });
  };

  if (!scriptManifest || !parsedProduct) {
    return (
      <div className="glass-card p-6 h-full flex flex-col items-center justify-center text-center">
        <Film className="w-16 h-16 text-[#00F0FF]/20 mb-6" />
        <div className="text-lg font-medium mb-2">等待剧本确认</div>
        <div className="text-sm text-white/40 max-w-md">
          请先在「剧本编排」阶段生成并确认剧本，然后才能进入视频生成流程。
        </div>
      </div>
    );
  }

  if (!isVideoConfirmed) {
    return (
      <div className="glass-card p-6 h-full flex flex-col items-center justify-center text-center">
        <Film className="w-16 h-16 text-[#00F0FF]/40 mb-6" />
        <div className="text-lg font-medium mb-4">剧本已就绪</div>
        <div className="text-sm text-white/40 max-w-md mb-8">
          请仔细检查剧本各个镜头的描述和包装，确认无误后即可开始调用 AIGC 模型进行渲染。
        </div>
        <button
          onClick={() => {
            setScriptState({ isVideoConfirmed: true });
            // Optionally auto-start render here, or let user click again
          }}
          className="cta-button px-8 py-3.5 rounded-xl font-semibold text-sm tracking-wider"
        >
          确认剧本 · 进入渲染
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 h-full flex flex-col relative">
      <div className="font-semibold text-lg mb-6 flex items-center gap-3 shrink-0">
        <Film className="w-5 h-5 text-[#00F0FF]" />
        视频生成与预览
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 flex flex-col">
        {staleRerunHint && (
          <div className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-6 shrink-0 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            {staleRerunHint}
          </div>
        )}

        <div className="flex-1 min-h-[400px]">
          <SampleVsGeneratedCompare
            className="h-full"
            referenceVideoUrl={uploadedVideoUrl}
            generatedVideoUrl={generatedVideoUrl}
            onPlaybackTimeChange={(time) => setReferenceState({ currentTime: time })}
            onReferenceDurationChange={(duration) => setReferenceState({ realVideoDuration: duration })}
            rightLabel={
              isVideoGenerating
                ? "生成中"
                : generatedVideoUrl
                  ? "生成成片"
                  : "生成操作"
            }
            generatedActions={
              generatedVideoUrl ? (
                <div className="w-full flex flex-col items-center gap-3">
                  {renderSummary && (
                    <div className="text-xs text-[#00F0FF]/80 bg-[#00F0FF]/10 px-4 py-2 rounded-lg border border-[#00F0FF]/20 text-center max-w-md">
                      {renderSummary}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3 justify-center mt-2">
                    <button
                      onClick={() => {
                        workbenchActions.handleRenderVideo();
                      }}
                      className="text-sm px-6 py-2.5 rounded-xl border border-white/20 hover:bg-white/10 transition-colors"
                    >
                      全片重新生成
                    </button>
                    {chunkVideos.filter(Boolean).length >= 2 && (
                      <button
                        type="button"
                        onClick={() => workbenchActions.handleConcatOnly()}
                        disabled={isConcatting}
                        className="text-sm px-6 py-2.5 rounded-xl border border-[#00F0FF]/40 text-[#00F0FF] hover:bg-[#00F0FF]/10 transition-colors disabled:opacity-50"
                      >
                        {isConcatting ? "拼接中…" : "重新拼接成片"}
                      </button>
                    )}
                  </div>
                </div>
              ) : undefined
            }
            rightPanel={
              !generatedVideoUrl ? (
                isVideoGenerating ? (
                  <div className="flex flex-col items-center justify-center h-full p-8">
                    <div className="w-12 h-12 rounded-full border-4 border-[#00F0FF] border-t-transparent animate-spin mb-6" />
                    <div className="text-sm text-white/80 mb-4 font-medium">万相2.6 分块 → FFmpeg 拼接</div>
                    <div className="w-full max-w-md mb-6 bg-black/40 p-5 rounded-2xl border border-white/5">
                      <div className="flex justify-between text-xs text-white/60 mb-2">
                        <span>总渲染进度</span>
                        <span className="font-mono text-[#00F0FF]">{renderProgress}%</span>
                      </div>
                      <div className="pipeline-main-bar h-2">
                        <div className="progress" style={{ width: `${renderProgress}%` }} />
                      </div>
                    </div>
                    {renderSteps.length > 0 && (
                      <div className="w-full max-w-md text-xs text-white/50 space-y-2 bg-black/20 p-4 rounded-xl border border-white/5">
                        {renderSteps.slice(-4).map((s, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-[#00F0FF]/60 shrink-0">[{s.status}]</span>
                            <span className="truncate">{s.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full p-8">
                    {renderSummary && (
                      <div className="text-xs text-white/50 mb-6 text-center max-w-md bg-white/5 p-4 rounded-xl border border-white/10">
                        {renderSummary}
                      </div>
                    )}
                    {renderBlocked && (
                      <div className="text-center text-amber-400 text-sm mb-6 bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 max-w-md">
                        渲染已阻塞：请上传商品图或补充素材后重试
                      </div>
                    )}
                    <button
                      onClick={() => workbenchActions.handleRenderVideo()}
                      className="cta-button px-10 py-4 rounded-2xl font-semibold text-base tracking-wider shadow-lg"
                    >
                      开始生成视频
                    </button>
                  </div>
                )
              ) : undefined
            }
          />
        </div>

        {/* 结构槽位前后对比 */}
        <div className="mt-6">
          <StructureSlotCompare
            sampleEvents={getTimelineEvents(analysisResult)}
            manifest={scriptManifest}
            gapPlan={gapPlan}
            product={parsedProduct ? ({ ...parsedProduct, ...editableProduct } as ProductInput) : null}
          />
        </div>

        {/* 区块重跑（块级人机协同编辑） */}
        {generatedVideoUrl && editorBlocks.length > 0 && (
          <div className="mt-6">
            <OnlineEditorPanel
              blocks={editorBlocks}
              scriptManifest={scriptManifest}
              product={parsedProduct}
              productImageUrls={productImages}
              chunkVideos={chunkVideos}
              projectId={projectId}
              onBlocksRerunResult={handleBlocksRerunResult}
              onFullRegenerate={() => workbenchActions.handleRenderVideo()}
              onConcatOnly={() => workbenchActions.handleConcatOnly()}
              isFullRegenerating={isVideoGenerating}
              isConcatting={isConcatting}
            />
          </div>
        )}

        {/* 画面包装套件（集中可调） */}
        <PackagingKitPanel
          className="mt-6"
          manifest={scriptManifest as unknown as ScriptManifest}
          product={parsedProduct ? ({ ...parsedProduct, ...editableProduct } as ProductInput) : null}
          transitionCount={analysisResult?.camera_and_composition?.camera_transitions?.length ?? 0}
          isGenerating={isGeneratingPackaging}
          onGenerateAll={() => workbenchActions.handleGeneratePackaging()}
          onRegenerate={(type, prompt) => workbenchActions.regeneratePackagingItem(type, prompt)}
        />
      </div>
    </div>
  );
}
