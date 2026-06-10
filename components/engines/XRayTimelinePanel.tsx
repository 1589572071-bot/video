"use client";

import { useState } from "react";
import type { XRayTrack, XRayTrackEvent } from "@/lib/xray-timeline-tracks";

interface XRayTimelinePanelProps {
  tracks: XRayTrack[];
  totalDuration: number;
  currentTime?: number;
  onSeek?: (time: number) => void;
  title?: string;
  compact?: boolean;
  className?: string;
}

function clampTime(time: number, duration: number): number {
  if (!duration || duration <= 0) return 0;
  return Math.max(0, Math.min(time, duration));
}

function pct(time: number, duration: number): number {
  if (!duration || duration <= 0) return 0;
  return (time / duration) * 100;
}

interface TimelineEventFocus {
  key: string;
  track: XRayTrack;
  event: XRayTrackEvent;
}

function eventKey(trackId: string, ev: XRayTrackEvent, index: number): string {
  return `${trackId}-${ev.start}-${ev.end}-${index}`;
}

function eventDetail(ev: XRayTrackEvent): string {
  return ev.detail?.trim() || ev.title?.trim() || ev.label;
}

function metaEntries(ev: XRayTrackEvent): Array<[string, string | number]> {
  return Object.entries(ev.meta ?? {}).filter(
    (entry): entry is [string, string | number] =>
      entry[1] !== undefined && entry[1] !== null && String(entry[1]).trim() !== ""
  );
}

/** X-Ray 多轨时间轴：切镜 / 字幕 / 音效 / 转场（或生成分镜轨） */
export default function XRayTimelinePanel({
  tracks,
  totalDuration,
  currentTime = 0,
  onSeek,
  title = "X-Ray 时间轴",
  compact = false,
  className = "",
}: XRayTimelinePanelProps) {
  const [selected, setSelected] = useState<TimelineEventFocus | null>(null);
  const [hovered, setHovered] = useState<TimelineEventFocus | null>(null);
  const duration = totalDuration > 0 ? totalDuration : 1;
  const hasEvents = tracks.some((t) => t.events.length > 0);
  if (!hasEvents) return null;

  const handleSeek = (clientX: number, rect: DOMRect) => {
    if (!onSeek) return;
    // 轨道区域的左侧偏移为 5rem (80px)，右侧偏移为 0.5rem (8px)
    const trackLeft = rect.left + 80;
    const trackWidth = rect.width - 88;
    const ratio = Math.max(0, Math.min(1, (clientX - trackLeft) / trackWidth));
    onSeek(clampTime(ratio * duration, duration));
  };

  return (
    <div
      className={`relative bg-[#131821] rounded-xl border border-[#00F0FF]/15 p-3 ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className={`font-medium text-[#00F0FF] ${compact ? "text-[10px]" : "text-xs"}`}>
          {title}
        </div>
        <div className="text-[10px] font-mono text-white/40">
          {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
        </div>
      </div>

      <div
        className="relative rounded-lg bg-[#0B0E14]/80 border border-white/5 overflow-hidden"
        role={onSeek ? "slider" : undefined}
        aria-label={onSeek ? "时间轴，点击跳转" : undefined}
        onClick={
          onSeek
            ? (e) => handleSeek(e.clientX, e.currentTarget.getBoundingClientRect())
            : undefined
        }
        onKeyDown={
          onSeek
            ? (e) => {
                if (e.key === "ArrowRight") onSeek(clampTime(currentTime + 0.5, duration));
                if (e.key === "ArrowLeft") onSeek(clampTime(currentTime - 0.5, duration));
              }
            : undefined
        }
        tabIndex={onSeek ? 0 : undefined}
      >
        <div className="absolute inset-y-0 left-[5rem] right-2 pointer-events-none z-10">
          <div
            className="timeline-pointer"
            style={{ left: `${pct(currentTime, duration)}%` }}
          />
        </div>

        <div className={`space-y-1 p-2 ${compact ? "py-1.5" : ""}`}>
          {tracks.map((track) => (
            <div key={track.id} className="flex items-stretch gap-2 min-h-[32px]">
              <div
                className={`shrink-0 w-16 text-white/35 leading-tight pt-1 ${
                  compact ? "text-[9px]" : "text-[10px]"
                }`}
              >
                {track.name}
              </div>
              <div className="timeline-track flex-1 min-h-[32px]">
                {track.events.map((ev, i) => {
                  const left = pct(ev.start, duration);
                  const width = Math.max(pct(ev.end, duration) - left, 1.2);
                  const key = eventKey(track.id, ev, i);
                  const isSelected = selected?.key === key;
                  return (
                    <div
                      key={key}
                      className={`absolute top-1 bottom-1 z-30 rounded px-1 flex items-center overflow-hidden cursor-pointer transition-[filter,box-shadow,border-color] ${
                        isSelected
                          ? "brightness-125 shadow-[0_0_0_1px_rgba(255,255,255,0.45),0_0_16px_rgba(0,240,255,0.24)]"
                          : "hover:brightness-110"
                      }`}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        backgroundColor: `${ev.color}33`,
                        borderLeft: `2px solid ${ev.color}`,
                        borderTop: isSelected ? `1px solid ${ev.color}` : undefined,
                        borderBottom: isSelected ? `1px solid ${ev.color}` : undefined,
                      }}
                      title={ev.title ?? `${ev.start.toFixed(1)}–${ev.end.toFixed(1)}s · ${ev.label}`}
                      onMouseEnter={() => setHovered({ key, track, event: ev })}
                      onMouseLeave={() => setHovered((current) => (current?.key === key ? null : current))}
                      onClick={
                        onSeek
                          ? (e) => {
                              e.stopPropagation();
                              setSelected({ key, track, event: ev });
                              onSeek(ev.start);
                            }
                          : (e) => {
                              e.stopPropagation();
                              setSelected({ key, track, event: ev });
                            }
                      }
                      onKeyDown={
                        onSeek
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelected({ key, track, event: ev });
                                onSeek(ev.start);
                              }
                            }
                          : undefined
                      }
                      role="button"
                      tabIndex={0}
                    >
                      <span
                        className={`truncate text-white/80 ${
                          compact ? "text-[9px]" : "text-[10px]"
                        }`}
                      >
                        {ev.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {hovered && (
        <div className="pointer-events-none absolute right-3 top-10 z-50 max-w-sm rounded-xl border border-[#00F0FF]/25 bg-[#0B0E14]/95 px-3 py-2 shadow-2xl backdrop-blur">
          <div className="mb-1 flex items-center gap-2 text-[10px] text-white/45">
            <span>{hovered.track.name}</span>
            <span className="font-mono text-[#00F0FF]/80">
              {hovered.event.start.toFixed(1)}–{hovered.event.end.toFixed(1)}s
            </span>
          </div>
          <div className="line-clamp-4 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-white/80">
            {eventDetail(hovered.event)}
          </div>
        </div>
      )}

      {selected && (
        <div className="mt-2 rounded-lg border border-white/10 bg-[#0B0E14]/75 px-3 py-2">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] text-white/40">
            <span className="text-[#00F0FF]/80">{selected.track.name}</span>
            <span className="font-mono">
              {selected.event.start.toFixed(1)}–{selected.event.end.toFixed(1)}s
            </span>
            {metaEntries(selected.event).map(([key, value]) => (
              <span key={key} className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5">
                {key}: {value}
              </span>
            ))}
          </div>
          <div className="select-text whitespace-pre-wrap break-words text-[11px] leading-relaxed text-white/75">
            {eventDetail(selected.event)}
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-white/35">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-[#FF3366] shadow-[0_0_4px_#FF3366]" />
          播放指针
        </span>
        {onSeek && <span>点击轨道或片段跳转播放</span>}
      </div>
    </div>
  );
}
