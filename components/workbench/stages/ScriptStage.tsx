import React from 'react';
import { FileText, Undo2, ChevronDown, ChevronRight } from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench-store';
import { workbenchActions, GAP_FILL_STRATEGIES } from '@/lib/store/workbench-actions';
import ScriptGenerationProgress from '@/components/engines/ScriptGenerationProgress';
import MigrationOverviewPanel from '@/components/engines/MigrationOverviewPanel';
import MigrationJourneyPanel from '@/components/engines/MigrationJourneyPanel';
import ImitationComparisonPanel from '@/components/engines/ImitationComparisonPanel';
import ShotStageBriefLine from '@/components/engines/ShotStageBriefLine';
import ShotPackagingCues from '@/components/engines/ShotPackagingCues';
import ShotGapBadge from '@/components/engines/ShotGapBadge';
import { getBlockScriptPackagingSummary } from '@/lib/packaging-cues';
import { formatRenderMode } from '@/lib/narrative-stage-labels';
import { formatGapCode, formatFallbackStrategy, GAP_SEVERITY_LABELS } from '@/lib/gap-display-labels';
import { getTimelineEvents } from '@/lib/timeline-shot-align';
import { parseImitationComparisonBlock } from '@/lib/script-imitation-parser';
import ScriptVersionBar from '@/components/engines/ScriptVersionBar';
import { SCRIPT_VERSION_OPTIONS, versionKeyOf } from '@/lib/script-version-options';
import type { ProductInput, ScriptManifest, GapPlan, GapCode, FallbackStrategy, RenderMode } from '@/lib/types/pipeline';

export default function ScriptStage() {
  const {
    scriptManifest,
    generatedScript,
    scriptGenPhase,
    scriptGenProgress,
    isUpdatingScript,
    isGeneratingScript,
    stageBriefsDirty,
    gapPlan,
    analysisResult,
    parsedProduct,
    editableProduct,
    scriptVersions,
    activeVersionId,
    gapStrategyChoices,
    setProductState,
    setReferenceState
  } = useWorkbenchStore();

  // 点击分镜定位到时间轴播放游标（并联动参考视频）
  const seekTo = (time: number) => {
    setReferenceState({ currentTime: time });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('seek-video', { detail: time }));
    }
  };

  const [showFullScript, setShowFullScript] = React.useState(false);
  const [selectedVersions, setSelectedVersions] = React.useState<Set<string>>(new Set(['default']));

  const toggleVersion = (v: (typeof SCRIPT_VERSION_OPTIONS)[number]['value']) => {
    const k = versionKeyOf(v);
    setSelectedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      if (next.size === 0) next.add('default');
      return next;
    });
  };

  const handleGenerate = () => {
    const picked = SCRIPT_VERSION_OPTIONS.filter((o) => selectedVersions.has(versionKeyOf(o.value)));
    if (picked.length <= 1) {
      setProductState({ scriptVersion: picked[0]?.value });
      workbenchActions.performScriptGeneration(true);
    } else {
      workbenchActions.generateScriptVersions(picked.map((o) => o.value));
    }
  };

  const showPlaceholder = scriptGenPhase === "stitching_script" && !generatedScript;
  const showProgressOverlay = scriptGenPhase === "stitching_script" && Boolean(generatedScript);

  const imitationComparison = React.useMemo(
    () => parseImitationComparisonBlock(generatedScript),
    [generatedScript]
  );

  const sampleEvents = getTimelineEvents(analysisResult);
  
  // Transform manifest blocks to the format needed by UI
  const alignedScriptBlocks = React.useMemo(() => {
    if (!scriptManifest) return [];
    return scriptManifest.blocks.map(block => ({
      index: block.index,
      timeRange: `${block.start.toFixed(1)}s - ${block.end.toFixed(1)}s`,
      renderMode: block.render_mode === "T2V" ? "纯文本生成 (T2V)" : "图生视频 (I2V)",
      shotCount: block.shots.length,
      shots: block.shots.map(s => ({
        index: s.index,
        timeRange: `${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s`,
        start: s.start,
        end: s.end,
        phase: s.narrative_stage,
        stageBrief: s.stage_brief,
        packaging: s.packaging,
        asset_source: s.asset_source,
        is_aigc_supplement: s.is_aigc_supplement,
        ui_label: s.ui_label,
        requires_image_gen: s.requires_image_gen,
        keyframe_url: s.keyframe_url,
        gap_codes: s.gap_codes,
      }))
    }));
  }, [scriptManifest]);

  const migrationProduct = React.useMemo((): ProductInput | null => {
    if (!parsedProduct) return null;
    return { ...parsedProduct, ...editableProduct } as ProductInput;
  }, [parsedProduct, editableProduct]);

  if (!generatedScript && !isGeneratingScript) {
    return (
      <div className="glass-card p-6 h-full flex flex-col items-center justify-center text-center">
        <FileText className="w-16 h-16 text-[#00F0FF]/20 mb-6" />
        <div className="text-lg font-medium mb-2">剧本尚未生成</div>
        <div className="text-sm text-white/40 max-w-md mb-8">
          请确保已完成参考视频解析，并填写了商品信息。
        </div>
        
        <div className="w-full max-w-md bg-black/20 p-6 rounded-2xl border border-white/5">
          <div className="text-sm font-medium text-white/70 mb-1 text-left">选择生成版本</div>
          <div className="text-xs text-white/40 mb-4 text-left">勾选多个版本可并行生成并对比</div>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {SCRIPT_VERSION_OPTIONS.map(v => {
              const checked = selectedVersions.has(versionKeyOf(v.value));
              return (
                <button
                  key={versionKeyOf(v.value)}
                  onClick={() => toggleVersion(v.value)}
                  className={`text-sm py-2.5 rounded-xl border transition-all flex items-center justify-center gap-2 ${
                    checked
                      ? 'border-[#00F0FF] bg-[#00F0FF]/10 text-[#00F0FF] shadow-[0_0_10px_rgba(0,240,255,0.2)]'
                      : 'border-white/10 bg-[#131821] text-white/60 hover:text-white hover:border-white/30'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] ${checked ? 'border-[#00F0FF] bg-[#00F0FF]/20' : 'border-white/30'}`}>
                    {checked ? '✓' : ''}
                  </span>
                  {v.label}
                </button>
              );
            })}
          </div>
          <button
            onClick={handleGenerate}
            className="cta-button w-full py-3.5 rounded-xl font-semibold text-sm tracking-wider"
          >
            {selectedVersions.size > 1 ? `并行生成 ${selectedVersions.size} 个版本` : '开始生成剧本'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 h-full flex flex-col relative">
      {showPlaceholder && (
        <ScriptGenerationProgress progress={scriptGenProgress} phase={scriptGenPhase} className="mb-2" />
      )}
      
      {showProgressOverlay && (
        <ScriptGenerationProgress progress={scriptGenProgress} phase={scriptGenPhase} overlay />
      )}

      <div className="font-semibold text-lg mb-6 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-[#00F0FF]" />
          剧本区块概览
          {scriptManifest?.version_type && (
            <span className="text-xs px-2.5 py-1 rounded-md bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/20 font-normal">
              {scriptManifest.version_type === 'high_click' ? '高点击版' :
               scriptManifest.version_type === 'high_conversion' ? '高转化版' :
               scriptManifest.version_type === 'high_pace' ? '高节奏版' :
               scriptManifest.version_type === 'high_quality' ? '高质感版' : ''}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => workbenchActions.performScriptGeneration(true)}
            disabled={isGeneratingScript || isUpdatingScript}
            className="text-xs px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50"
          >
            重新生成全篇
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-8">
        {generatedScript && (
          <ScriptVersionBar
            scriptVersions={scriptVersions}
            activeVersionId={activeVersionId}
            isGenerating={isGeneratingScript || isUpdatingScript}
            onSwitch={(id) => workbenchActions.selectScriptVersion(id)}
            onGenerate={(type) => workbenchActions.generateSingleScriptVersion(type)}
          />
        )}

        <MigrationJourneyPanel
          sampleEvents={sampleEvents}
          manifest={scriptManifest}
          gapPlan={gapPlan}
        />

        <MigrationOverviewPanel
          sampleEvents={sampleEvents}
          scriptBlocks={alignedScriptBlocks}
          scriptManifest={scriptManifest as unknown as ScriptManifest}
          gapPlan={gapPlan as unknown as GapPlan}
          product={migrationProduct}
        />

        {imitationComparison && (
          <ImitationComparisonPanel block={imitationComparison} />
        )}

        {/* 素材缺口检测与交互式补全 */}
        {gapPlan && gapPlan.gaps.length > 0 && (
          <div className="bg-black/20 rounded-2xl p-5 border border-[#F5B041]/30">
            <div className="text-sm font-medium text-[#F5B041] mb-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#F5B041]" />
              素材缺口检测与补全
            </div>
            <div className="text-xs text-white/40 mb-4">为每个缺口选择补全策略，应用后重写剧本</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {gapPlan.gaps.map((g, i) => (
                <div key={i} className="text-xs bg-[#131821] p-4 rounded-xl border border-white/5">
                  <div className="flex flex-wrap gap-2 items-center mb-3">
                    <span className={`px-2 py-1 rounded text-[10px] font-medium ${
                      g.severity === 'high' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                      g.severity === 'medium' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                      'bg-white/10 text-white/60 border border-white/20'
                    }`}>
                      {formatGapCode(g.code as unknown as GapCode)}
                    </span>
                    <span className="text-white/40">
                      严重度 {GAP_SEVERITY_LABELS[g.severity as unknown as "high" | "medium" | "low"] ?? g.severity}
                    </span>
                  </div>
                  <p className="text-white/80 mb-3 leading-relaxed">{g.description}</p>

                  <div className="mt-3 pt-3 border-t border-white/5">
                    <div className="text-[#00F0FF]/80 font-medium mb-2">选择补全策略</div>
                    <div className="flex flex-wrap gap-1.5">
                      {GAP_FILL_STRATEGIES.map((s) => {
                        const active = gapStrategyChoices[g.code] === s.key;
                        return (
                          <button
                            key={s.key}
                            type="button"
                            onClick={() => workbenchActions.setGapStrategyChoice(g.code, s.key)}
                            title={s.instruction}
                            className={`px-2 py-1 rounded-lg border text-[10px] transition-colors ${
                              active
                                ? 'border-[#00F0FF] bg-[#00F0FF]/10 text-[#00F0FF]'
                                : 'border-white/10 bg-white/5 text-white/55 hover:text-white/80 hover:border-white/25'
                            }`}
                          >
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                    {gapPlan.resolutions
                      .filter((r) => r.gap_code === g.code)
                      .slice(0, 1)
                      .map((r, j) => (
                        <div key={j} className="mt-2 text-white/40 text-[10px]">
                          系统建议：{r.ui_label || formatFallbackStrategy(r.strategy as unknown as FallbackStrategy)}
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            {Object.keys(gapStrategyChoices).length > 0 && (
              <div className="mt-4 flex items-center justify-end gap-3">
                <span className="text-[10px] text-white/40">已选 {Object.keys(gapStrategyChoices).length} 项补全策略</span>
                <button
                  type="button"
                  onClick={() => workbenchActions.applyGapStrategies()}
                  disabled={isUpdatingScript}
                  className="text-xs px-4 py-2 rounded-lg bg-[#F5B041]/15 text-[#F5B041] border border-[#F5B041]/30 hover:bg-[#F5B041]/25 transition-colors disabled:opacity-50"
                >
                  {isUpdatingScript ? '应用中…' : '应用补全策略并重写剧本'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 区块卡片 */}
        <div className="space-y-6">
          <div className="text-sm font-medium text-white/70 flex items-center justify-between">
            <span>分块渲染剧本详情</span>
            {stageBriefsDirty && (
              <button
                type="button"
                onClick={() => workbenchActions.regenerateScriptWithStageBriefs()}
                disabled={isUpdatingScript}
                className="text-xs text-[#00F0FF] hover:underline flex items-center gap-1"
              >
                <Undo2 className="w-3.5 h-3.5" /> 应用修改并重写剧本
              </button>
            )}
          </div>
          
          {alignedScriptBlocks.map((block) => {
            const blockPackagingSummary = getBlockScriptPackagingSummary(block.shots);

            return (
              <div key={block.index} className="bg-black/20 rounded-2xl p-5 border border-white/5">
                <div className="flex items-center justify-between mb-4">
                  <div className="font-medium text-sm flex items-center gap-3">
                    <span className="bg-white/10 px-2.5 py-1 rounded-lg">区块 {block.index}</span>
                    <span className="font-mono text-[#00F0FF]">{block.timeRange}</span>
                      <span className="text-white/40 text-xs px-2 py-1 rounded border border-white/10 bg-[#131821]">
                      {formatRenderMode(block.renderMode as unknown as RenderMode)}
                    </span>
                  </div>
                  <div className="text-xs text-white/40 bg-white/5 px-3 py-1 rounded-full">
                    {block.shotCount} 个镜头
                  </div>
                </div>
                
                {blockPackagingSummary && (
                  <div className="text-xs text-white/50 mb-4 px-3 py-2 rounded-xl bg-[#131821] border border-white/5 flex items-center gap-2">
                    <span className="text-[#00F0FF]/60 font-medium">区块包装概览</span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    {blockPackagingSummary}
                  </div>
                )}
                
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 text-xs">
                  {block.shots.map((shot) => (
                    <div key={shot.index} className={`rounded-xl p-4 space-y-3 transition-colors ${
                      shot.is_aigc_supplement 
                        ? 'bg-[#F5B041]/5 border border-[#F5B041]/20 hover:border-[#F5B041]/40' 
                        : 'bg-[#131821] border border-white/5 hover:border-white/10'
                    }`}>
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => seekTo(shot.start)}
                          title="定位到时间轴"
                          className="text-[#00F0FF] font-mono text-[11px] bg-[#00F0FF]/10 px-2 py-0.5 rounded hover:bg-[#00F0FF]/20 transition-colors"
                        >
                          {shot.timeRange}
                        </button>
                        <div className="flex flex-wrap gap-1.5 justify-end">
                          {shot.requires_image_gen && !shot.is_aigc_supplement && (
                            <span className="text-white/40 text-[10px] bg-white/5 px-1.5 py-0.5 rounded">需生图</span>
                          )}
                          {shot.asset_source === 'user_image' && (
                            <span className="text-[#22C55E] text-[10px] bg-[#22C55E]/10 border border-[#22C55E]/20 px-1.5 py-0.5 rounded">用户商品图</span>
                          )}
                          {shot.asset_source === 'user_video_clip' && (
                            <span className="text-[#22C55E] text-[10px] bg-[#22C55E]/10 border border-[#22C55E]/20 px-1.5 py-0.5 rounded">用户演示视频</span>
                          )}
                        </div>
                      </div>
                      
                      <ShotStageBriefLine
                        stage={shot.phase}
                        brief={shot.stageBrief ?? ''}
                        onSave={(brief) => workbenchActions.handleShotBriefSave(shot.index, brief)}
                      />
                      
                      <ShotPackagingCues packaging={shot.packaging} compact={false} />
                      
                          <ShotGapBadge
                        shotIndex={shot.index}
                        gapPlan={gapPlan as unknown as GapPlan}
                        gapCodes={shot.gap_codes as unknown as GapCode[]}
                        uiLabel={shot.is_aigc_supplement ? shot.ui_label : undefined}
                        compact={false}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* 完整剧本文案（Markdown 全文） */}
        {generatedScript && (
          <div className="bg-black/20 rounded-2xl border border-white/5 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowFullScript((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-colors"
            >
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#00F0FF]" />
                完整剧本文案（Markdown）
              </span>
              {showFullScript ? (
                <ChevronDown className="w-4 h-4 opacity-60" />
              ) : (
                <ChevronRight className="w-4 h-4 opacity-60" />
              )}
            </button>
            {showFullScript && (
              <pre className="px-5 pb-5 pt-1 text-xs text-white/70 leading-relaxed whitespace-pre-wrap font-mono border-t border-white/5">
                {generatedScript}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
