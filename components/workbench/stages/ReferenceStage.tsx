import React, { useEffect, useRef } from 'react';
import { Upload } from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench-store';
import { workbenchActions } from '@/lib/store/workbench-actions';
import VideoRhythmOverview from '@/components/engines/VideoRhythmOverview';
import ContentStrategyReport from '@/components/engines/ContentStrategyReport';
import { toast } from 'sonner';
import { previewAssetUrl } from '@/lib/client-asset-preview';

export default function ReferenceStage() {
  const {
    uploadedVideoUrl,
    uploadedFileName,
    uploadProgress,
    isParsing,
    analysisProgress,
    analysisResult,
    stage1AnalysisTab,
    currentTime,
    realVideoDuration,
    setReferenceState,
    resetScriptState,
    resetRenderState
  } = useWorkbenchStore();

  const sampleVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  useEffect(() => {
    const handleSeek = (e: CustomEvent<number>) => {
      if (sampleVideoRef.current) {
        sampleVideoRef.current.currentTime = e.detail;
      }
    };
    window.addEventListener('seek-video', handleSeek as EventListener);
    return () => window.removeEventListener('seek-video', handleSeek as EventListener);
  }, []);

  const totalDuration = realVideoDuration || (analysisResult?.meta_info?.duration ?? 0);
  const uploadedVideoPreviewUrl = previewAssetUrl(uploadedVideoUrl);
  const rhythmEvents = analysisResult?.narrative_structure?.timeline_events ?? [];
  const analysisComplete = rhythmEvents.length > 0;
  const analysisBarProgress = analysisComplete ? 100 : isParsing ? analysisProgress : 0;

  const triggerFileSelect = () => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = 'video/*';
    i.onchange = e => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) workbenchActions.handleVideoUpload(f);
    };
    i.click();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (uploadedVideoUrl) return;
    const f = e.dataTransfer.files?.[0];
    if (f) workbenchActions.handleVideoUpload(f);
  };

  return (
    <div className="glass-card p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <div className="font-semibold text-lg">参考视频解析</div>
          <div className="text-xs text-white/50 mt-1">
            {uploadedFileName ? `已上传：${uploadedFileName}` : '请上传爆款参考视频'}
          </div>
        </div>
        <div className="text-xs text-white/40 font-mono bg-black/20 px-3 py-1.5 rounded-lg border border-white/5">
          {currentTime.toFixed(1)}s / {totalDuration ? totalDuration.toFixed(1) : '--'}s
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
        {/* 左边：视频播放器 */}
        <div className="flex flex-col">
          <div 
            onClick={!uploadedVideoUrl ? triggerFileSelect : undefined}
            onDragOver={!uploadedVideoUrl ? (e) => { e.preventDefault(); setIsDragging(true); } : undefined}
            onDragLeave={!uploadedVideoUrl ? () => setIsDragging(false) : undefined}
            onDrop={!uploadedVideoUrl ? handleDrop : undefined}
            className={`relative bg-black rounded-xl overflow-hidden aspect-video flex items-center justify-center cursor-pointer border shadow-inner transition-colors ${
              isDragging ? 'border-[#00F0FF]/60 bg-[#00F0FF]/5' : 'border-white/5'
            }`}
          >
            {uploadedVideoUrl ? (
              <video
                ref={sampleVideoRef}
                key={uploadedVideoUrl}
                src={uploadedVideoPreviewUrl}
                className="w-full h-full object-contain"
                controls
                muted
                onTimeUpdate={e => setReferenceState({ currentTime: (e.target as HTMLVideoElement).currentTime })}
                onLoadedMetadata={e => setReferenceState({ realVideoDuration: (e.target as HTMLVideoElement).duration })}
              />
            ) : (
              <div className="text-center z-10 p-6">
                <div className="w-16 h-16 rounded-full bg-[#00F0FF]/10 flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-[#00F0FF]" />
                </div>
                <div className="text-[#00F0FF] text-lg tracking-wider mb-2 font-medium">拖拽或点击上传爆款参考视频</div>
                <div className="text-xs text-white/40">支持 MP4 / MOV / AVI，最大 100MB</div>
              </div>
            )}
          </div>

          {uploadedVideoUrl && (
            <button 
              onClick={() => {
                setReferenceState({
                  uploadedVideoUrl: null,
                  uploadedFileName: null,
                  analysisResult: null,
                  stage1AnalysisTab: 'rhythm',
                  uploadProgress: 0,
                  analysisProgress: 0,
                  currentTime: 0,
                  realVideoDuration: 0,
                });
                resetScriptState();
                resetRenderState();
                toast.info('已清空参考视频');
              }}
              className="mt-4 w-full py-2.5 text-sm rounded-xl border border-white/10 hover:bg-white/5 text-white/60 hover:text-white transition-colors"
            >
              重新上传参考视频
            </button>
          )}
        </div>

        {/* 右边：Pipeline Telemetry + 有趣信息 */}
        <div className="flex flex-col overflow-y-auto pr-2 custom-scrollbar">
          <div className="mb-4">
            <div className="text-sm font-medium text-[#00F0FF] mb-4 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] animate-pulse" />
              Pipeline Telemetry
            </div>
            
            <div className="space-y-5 bg-black/20 rounded-xl p-4 border border-white/5">
              <div>
                <div className="flex justify-between text-xs mb-2 text-white/70">
                  <span>素材注入</span>
                  <span className="font-mono text-[#00F0FF]">{uploadProgress}%</span>
                </div>
                <div className="pipeline-main-bar">
                  <div className="progress" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-2 text-white/70">
                  <span>原子裂解</span>
                  <span className="font-mono text-[#00F0FF]">
                    {isParsing && !analysisComplete
                      ? `${analysisBarProgress}% · 解析中`
                      : analysisComplete
                        ? '100% · 已完成'
                        : '0%'}
                  </span>
                </div>
                <div className="pipeline-main-bar">
                  <div className="progress" style={{ width: `${analysisBarProgress}%` }} />
                  {isParsing && !analysisComplete && (
                    <div className="scan-line" style={{ left: `${Math.max(analysisBarProgress - 18, 0)}%` }} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 视频节奏速览 */}
          {isParsing && !analysisComplete && (
            <div className="bg-[#00F0FF]/5 border border-[#00F0FF]/20 rounded-xl p-4 text-xs text-[#00F0FF]/80 flex items-center gap-3">
              <span className="inline-block w-4 h-4 border-2 border-[#00F0FF] border-t-transparent rounded-full animate-spin shrink-0" />
              正在提取视频叙事节奏与多模态特征…
            </div>
          )}
          
          {rhythmEvents.length > 0 && (
            <div className="mt-2 flex-1">
              <div className="flex gap-1 mb-3 p-1 rounded-lg bg-black/30 border border-white/5 w-fit">
                <button
                  type="button"
                  onClick={() => setReferenceState({ stage1AnalysisTab: 'rhythm' })}
                  className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                    stage1AnalysisTab === 'rhythm'
                      ? 'bg-[#00F0FF]/15 text-[#00F0FF] shadow-sm'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                  }`}
                >
                  节奏速览
                </button>
                <button
                  type="button"
                  onClick={() => setReferenceState({ stage1AnalysisTab: 'report' })}
                  className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                    stage1AnalysisTab === 'report'
                      ? 'bg-[#00F0FF]/15 text-[#00F0FF] shadow-sm'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                  }`}
                >
                  爆款拆解报告
                </button>
              </div>
              
              <div className="bg-black/20 rounded-xl border border-white/5 p-1">
                {stage1AnalysisTab === 'rhythm' ? (
                  <VideoRhythmOverview
                    events={rhythmEvents}
                    avgShotDuration={analysisResult?.rhythm_and_density?.avg_shot_duration}
                  />
                ) : (
                  <ContentStrategyReport analysis={analysisResult as unknown as Record<string, unknown>} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
