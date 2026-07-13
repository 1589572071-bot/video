import { formatNarrativeStage } from "@/lib/narrative-stage-labels";
import type { ScriptManifest, VideoAnalysisInput } from "@/lib/types/pipeline";

export interface XRayTrackEvent {
  start: number;
  end: number;
  label: string;
  color: string;
  title?: string;
  detail?: string;
  meta?: Record<string, string | number | null | undefined>;
}

export interface XRayTrack {
  id: string;
  name: string;
  events: XRayTrackEvent[];
}

const PHASE_COLORS: Record<string, string> = {
  hook: "#EF4444",
  problem_agitation: "#F97316",
  solution_intro: "#EAB308",
  product_detail: "#22C55E",
  usage_demo: "#22C55E",
  testimonial: "#22C55E",
  price: "#EAB308",
  cta: "#06B6D4",
  closing: "#06B6D4",
};

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function phaseColor(stage: unknown): string {
  return PHASE_COLORS[nonEmptyString(stage).toLowerCase()] ?? "#64748B";
}

/** 样例视频 · 四轨（切镜叙事 / 字幕 / 音效 / 转场） */
export function buildSampleXRayTracks(
  analysis: VideoAnalysisInput | null | undefined
): XRayTrack[] {
  if (!analysis) return [];

  const rawEvents = analysis.narrative_structure?.timeline_events;
  const rawTransitions = analysis.camera_and_composition?.camera_transitions;
  const rawTexts = analysis.on_screen_texts;
  const rawSfx = analysis.audio_and_beats?.sound_effects;
  const events = Array.isArray(rawEvents) ? rawEvents : [];
  const transitions = Array.isArray(rawTransitions) ? rawTransitions : [];
  const texts = Array.isArray(rawTexts) ? rawTexts : [];
  const sfx = Array.isArray(rawSfx) ? rawSfx : [];

  return [
    {
      id: "shots",
      name: "切镜 / 叙事",
      events: events.flatMap<XRayTrackEvent>((e) => {
        const start = finiteNumber(e?.start);
        const end = finiteNumber(e?.end);
        const stage = nonEmptyString(e?.event_name);
        if (start === null || end === null || end <= start || !stage) return [];

        const description = nonEmptyString(e?.description);
        const emotion = nonEmptyString(e?.emotion);
        const stageLabel = formatNarrativeStage(stage);
        return [{
          start,
          end,
          label: stageLabel,
          color: phaseColor(stage),
          title: description
            ? `${start.toFixed(1)}–${end.toFixed(1)}s · ${description}`
            : `${start.toFixed(1)}–${end.toFixed(1)}s`,
          detail: description || undefined,
          meta: {
            阶段: stageLabel,
            情绪: emotion || undefined,
          },
        }];
      }),
    },
    {
      id: "subtitle",
      name: "字幕 / 花字",
      events: texts.slice(0, 8).flatMap<XRayTrackEvent>((t) => {
        const content = typeof t?.content === "string" ? t.content.trim() : "";
        const time = Number(t?.time);
        if (!content || !Number.isFinite(time)) return [];

        return [{
          start: time,
          end: time + Math.min(2.5, Math.max(0.8, content.length * 0.08)),
          label: content.length > 10 ? `${content.slice(0, 10)}…` : content,
          color: "#10B981",
          title: content,
          detail: content,
          meta: { 时间: `${time.toFixed(1)}s` },
        }];
      }),
    },
    {
      id: "audio",
      name: "音效",
      events: sfx.slice(0, 8).flatMap<XRayTrackEvent>((s) => {
        const detail = s as typeof s & {
          material?: string | null;
          action?: string | null;
          ambient?: string | null;
        };
        const time = finiteNumber(s?.time);
        if (time === null) return [];

        const type = nonEmptyString(s?.type) || "音效";
        const description = [
          type,
          nonEmptyString(detail.material),
          nonEmptyString(detail.action),
          nonEmptyString(detail.ambient),
        ].filter(Boolean).join(" · ");
        return [{
          start: time,
          end: time + 0.45,
          label: type,
          color: "#F59E0B",
          detail: description,
          meta: { 时间: `${time.toFixed(1)}s` },
        }];
      }),
    },
    {
      id: "visual",
      name: "转场 / 视觉",
      events: transitions.slice(0, 8).flatMap<XRayTrackEvent>((t) => {
        const time = finiteNumber(t?.time);
        if (time === null) return [];

        const type = nonEmptyString(t?.type) || "转场";
        return [{
          start: time,
          end: time + 1.2,
          label: type,
          color: "#8B5CF6",
          detail: type,
          meta: { 时间: `${time.toFixed(1)}s` },
        }];
      }),
    },
  ];
}

function cleanLegacyVoiceover(voiceover?: string): string {
  if (!voiceover?.trim()) return "";
  return voiceover.split(/[+＋]/)[0]?.trim() ?? "";
}

function voiceSnippet(packaging?: { voice_script?: string; voiceover?: string } | null): string {
  const direct = packaging?.voice_script?.trim();
  if (direct) return direct;
  return cleanLegacyVoiceover(packaging?.voiceover);
}

/** 生成剧本 · 分镜四轨（镜头 / 花字 / 口播 / 渲染区块） */
export function buildManifestXRayTracks(
  manifest: ScriptManifest | null | undefined
): XRayTrack[] {
  if (!manifest?.blocks?.length) return [];

  const shots = manifest.blocks.flatMap((b) => b.shots);
  const shotEvents: XRayTrackEvent[] = shots.map((s) => ({
    start: s.start,
    end: s.end,
    label: `镜${s.index}`,
    color: s.is_aigc_supplement ? "#F5B041" : phaseColor(s.narrative_stage),
    title: [
      `${s.start.toFixed(1)}–${s.end.toFixed(1)}s`,
      formatNarrativeStage(s.narrative_stage),
      s.stage_brief,
      s.is_aigc_supplement ? s.ui_label ?? "AI 补足" : undefined,
    ]
      .filter(Boolean)
      .join(" · "),
    detail: [s.stage_brief, s.packaging?.narrative_content]
      .filter(Boolean)
      .join("\n"),
    meta: {
      阶段: formatNarrativeStage(s.narrative_stage),
      资产: s.asset_source,
      渲染: s.fallback_applied,
    },
  }));

  const subtitleEvents: XRayTrackEvent[] = [];
  const voiceEvents: XRayTrackEvent[] = [];

  for (const s of shots) {
    const text = s.packaging?.on_screen_text?.trim();
    if (text) {
      subtitleEvents.push({
        start: s.start,
        end: Math.min(s.end, s.start + 2.2),
        label: text.length > 10 ? `${text.slice(0, 10)}…` : text,
        color: "#10B981",
        title: text,
        detail: text,
        meta: {
          镜头: `镜${s.index}`,
          阶段: formatNarrativeStage(s.narrative_stage),
        },
      });
    }
    const voice = voiceSnippet(s.packaging);
    if (voice) {
      voiceEvents.push({
        start: s.start,
        end: Math.min(s.end, s.start + Math.min(3, s.end - s.start)),
        label: voice.length > 12 ? `${voice.slice(0, 12)}…` : voice,
        color: "#F59E0B",
        title: voice,
        detail: voice,
        meta: {
          镜头: `镜${s.index}`,
          阶段: formatNarrativeStage(s.narrative_stage),
        },
      });
    }
  }

  const blockEvents: XRayTrackEvent[] = manifest.blocks.map((b) => ({
    start: b.start,
    end: b.end,
    label: `区块${b.index}`,
    color: b.render_mode.includes("I2V") ? "#8B5CF6" : "#00F0FF",
    title: `${b.render_mode} · ${b.shots.length} 镜`,
    detail: `${b.render_mode} · ${b.shots.length} 镜`,
    meta: {
      起止: `${b.start.toFixed(1)}–${b.end.toFixed(1)}s`,
      模式: b.render_mode,
    },
  }));

  return [
    { id: "shots", name: "分镜 / 叙事", events: shotEvents },
    { id: "subtitle", name: "花字", events: subtitleEvents },
    { id: "voice", name: "口播", events: voiceEvents },
    { id: "blocks", name: "渲染区块", events: blockEvents },
  ];
}
