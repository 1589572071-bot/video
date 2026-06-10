import React, { useMemo } from 'react';
import { useWorkbenchStore } from '@/lib/store/workbench-store';
import XRayTimelinePanel from '@/components/engines/XRayTimelinePanel';
import { buildManifestXRayTracks, buildSampleXRayTracks } from '@/lib/xray-timeline-tracks';
import type { ScriptManifest } from '@/lib/types/pipeline';

export default function BottomTimeline() {
  const {
    analysisResult,
    scriptManifest,
    currentTime,
    realVideoDuration,
    uploadedVideoUrl,
    setReferenceState
  } = useWorkbenchStore();

  const totalDuration = realVideoDuration || (analysisResult?.meta_info?.duration ?? 0);

  const sampleXRayTracks = useMemo(
    () => buildSampleXRayTracks(analysisResult),
    [analysisResult]
  );

  const manifestXRayTracks = useMemo(
    () => buildManifestXRayTracks(scriptManifest as ScriptManifest | null),
    [scriptManifest]
  );

  // 同步播放游标并跳转参考视频（样例与生成分镜共用时基）
  const seekVideo = (time: number) => {
    setReferenceState({ currentTime: time });
    const event = new CustomEvent('seek-video', { detail: time });
    window.dispatchEvent(event);
  };

  const hasManifest = manifestXRayTracks.some((t) => t.events.length > 0);
  const hasSample = sampleXRayTracks.some((t) => t.events.length > 0);

  if (!hasSample && !hasManifest) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-white/30">
        时间轴暂无数据
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* 样例与生成分镜双轨并列，保留参考视频 seek 联动 */}
      {hasSample && (
        <XRayTimelinePanel
          title="X-Ray · 样例四轨时间轴"
          tracks={sampleXRayTracks}
          totalDuration={totalDuration}
          currentTime={currentTime}
          onSeek={uploadedVideoUrl ? seekVideo : undefined}
          compact
        />
      )}
      {hasManifest && (
        <XRayTimelinePanel
          title="X-Ray · 生成分镜时间轴"
          tracks={manifestXRayTracks}
          totalDuration={scriptManifest?.total_duration ?? totalDuration}
          currentTime={currentTime}
          onSeek={seekVideo}
          compact
        />
      )}
    </div>
  );
}
