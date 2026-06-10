/** PRD §11 缺口类型枚举 */
export type GapCode =
  | "VISUAL_UNDERPROVISIONED"
  | "ACTION_MISMATCH"
  | "SCENE_MISMATCH"
  | "PERSONA_MISMATCH";

export type AssetSource =
  | "user_image"
  | "user_video_clip"
  | "aigc_keyframe"
  | "aigc_video"
  | "text_only";

export type FallbackStrategy =
  | "use_user_asset"
  | "narrative_degrade"
  | "aigc_keyframe"
  | "aigc_video"
  | "narrow_usage_demo"
  | "scene_rewrite"
  | "persona_swap"
  | "safe_template";

export type RenderMode = "T2V" | "I2V";

export interface TimelineEvent {
  start: number;
  end: number;
  event_name: string;
  description?: string;
  emotion?: string;
}

/** 热点视频 7 维内容策略拆解（Step1 content_strategy） */
export interface ContentStrategy {
  topic: string;
  hook: string;
  structure: string;
  rhythm: string;
  emotion: string;
  audience_need: string;
  expression_style: string;
  imitation_focus: string;
  viral_core_reason: string;
  reusable_template: string;
}

export interface VideoAnalysisInput {
  schema_version?: string;
  content_strategy?: ContentStrategy;
  meta_info?: {
    duration?: number;
    resolution?: string;
    aspect_ratio?: string;
  };
  narrative_structure?: {
    primary_type?: string;
    timeline_events?: TimelineEvent[];
  };
  rhythm_and_density?: {
    shot_count?: number;
    avg_shot_duration?: number;
    avg_words_per_second?: number;
  };
  camera_and_composition?: {
    camera_transitions?: Array<{ time: number; type: string }>;
  };
  on_screen_texts?: Array<{ time: number; content: string; style_hint?: string | null }>;
  audio_and_beats?: {
    sound_effects?: Array<{ time: number; type: string }>;
    bpm?: number | null;
    strong_beat_timestamps?: number[];
  };
  visual_and_color?: {
    background_type?: string;
  };
}

export interface UserAssetInventory {
  product_images_count: number;
  product_video_clips_count: number;
  has_logo_pack: boolean;
  has_endcard: boolean;
}

export interface MaterialAnalysisResult {
  highlights: Array<{
    start: number;
    end: number;
    description: string;
    tags: string[];
    recommended_for: string[];
  }>;
}

export interface ProductInput {
  schema_version?: string;
  product_name?: string;
  category?: string;
  core_selling_points?: string[];
  visual_description?: string;
  usage_method?: string;
  target_audience?: string;
  usage_scene?: string;
  pain_point_gain_point?: string;
  ingredients_material?: string | null;
  spec_size?: string | null;
  user_asset_inventory?: UserAssetInventory;
  material_analysis?: MaterialAnalysisResult;
}

export interface GapItem {
  code: GapCode;
  severity: "low" | "medium" | "high";
  description: string;
  affected_shots?: number[];
}

export interface GapResolution {
  gap_code: GapCode;
  strategy: FallbackStrategy;
  description: string;
  ui_label?: string;
}

export interface StageBriefOverride {
  shot_index: number;
  narrative_stage: string;
  stage_brief: string;
}

/** 剧本镜头包装字段（与 script-stitch prompt 输出一致） */
export interface ScriptShotPackaging {
  shot_language?: string;
  visual_interaction?: string;
  narrative_content?: string;
  voice_script?: string;
  voiceover?: string;
  sound_effects?: string;
  bgm?: string;
  on_screen_text?: string;
}

export interface GapPlan {
  gaps: GapItem[];
  resolutions: GapResolution[];
}

export interface ManifestShot {
  index: number;
  block_index: number;
  start: number;
  end: number;
  narrative_stage: string;
  asset_source: AssetSource;
  gap_codes: GapCode[];
  fallback_applied: FallbackStrategy;
  requires_image_gen: boolean;
  is_aigc_supplement: boolean;
  ui_label?: string;
  stage_brief?: string;
  degraded_narrative?: string;
  packaging?: ScriptShotPackaging;
  keyframe_url?: string | null;
}

export interface ScriptBlockManifest {
  index: number;
  start: number;
  end: number;
  render_mode: RenderMode;
  is_continuation: boolean;
  shots: ManifestShot[];
}

export type ScriptVersionType = "high_click" | "high_conversion" | "high_pace" | "high_quality";

export interface ScriptManifest {
  schema_version: "script_manifest/v1";
  version_type?: ScriptVersionType;
  total_duration: number;
  aspect_ratio: string;
  resolution: string;
  global_visual_anchor: string;
  blocks: ScriptBlockManifest[];
  cover_shot_index: number;
  gap_plan: GapPlan;
  cover_image_url?: string;
  feature_card_url?: string;
}

export interface KeyframeResult {
  shot_index: number;
  url: string;
  prompt: string;
  source: AssetSource;
  used_controlnet: boolean;
}

export interface RenderShotResult {
  shot_index: number;
  asset_source: AssetSource;
  fallback_applied: FallbackStrategy;
  keyframe_url?: string | null;
  status: "success" | "degraded" | "blocked";
  message?: string;
}

export interface ChunkRenderTelemetry {
  block_index: number;
  model: string;
  mode: string;
  task_id?: string;
  video_url?: string;
  local_url?: string;
}

export interface RenderOrchestrationResult {
  cover_thumbnail: string | null;
  keyframes: KeyframeResult[];
  shot_results: RenderShotResult[];
  chunk_videos: string[];
  chunk_telemetry?: ChunkRenderTelemetry[];
  final_video: string | null;
  gap_plan: GapPlan;
  blocked: boolean;
  block_reason?: string;
  provider?: "mock" | "bailian";
}
