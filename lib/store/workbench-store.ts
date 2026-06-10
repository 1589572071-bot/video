import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ScriptManifest, ScriptVersionType, ContentStrategy, MaterialAnalysisResult } from '@/lib/types/pipeline';
import type { ScriptGenPhase } from '@/components/engines/ScriptGenerationProgress';

// ==========================================
// Types (Migrated from page.tsx)
// ==========================================

export type PipelineStatus = 'waiting' | 'processing' | 'success';

export interface GapPlanState {
  gaps: Array<{
    code: string;
    severity: string;
    description: string;
    affected_shots?: number[];
  }>;
  resolutions: Array<{
    gap_code: string;
    strategy: string;
    description: string;
    ui_label?: string;
  }>;
}

export interface ScriptManifestState extends Omit<ScriptManifest, 'gap_plan'> {
  gap_plan: GapPlanState;
}

export interface SavedScriptVersion {
  id: string;
  versionType: ScriptVersionType | undefined;
  label: string;
  generatedScript: string | null;
  scriptManifest: ScriptManifestState | null;
  gapPlan: GapPlanState | null;
}

export interface AnalysisResult {
  schema_version: string;
  job_id: string;
  source_uri: string;
  meta_info: {
    duration: number;
    resolution: string;
    aspect_ratio: string;
    has_voiceover: boolean;
    has_bgm: boolean;
    language: string | null;
    estimated_fps: number;
    file_name_hint: string | null;
  };
  narrative_structure: {
    timeline_events: Array<{
      start: number;
      end: number;
      event_name: string;
      description: string;
      emotion: string;
    }>;
  };
  camera_and_composition: {
    camera_transitions: Array<{ time: number; type: string }>;
  };
  on_screen_texts: Array<{ time: number; content: string; style_hint: string | null }>;
  audio_and_beats: {
    sound_effects: Array<{ time: number; type: string }>;
    bpm: number | null;
    strong_beat_timestamps?: number[];
    bgm_details?: {
      genre?: string;
      mood?: string;
      energy_curve?: string;
    } | null;
  };
  rhythm_and_density: {
    shot_count: number;
    avg_shot_duration: number;
  };
  content_strategy?: ContentStrategy;
}

// ==========================================
// Store State & Actions
// ==========================================

export type ActiveTab = 'reference' | 'product' | 'script' | 'render';

interface WorkbenchState {
  // --- Global UI State ---
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  projectId: string | null;
  setProjectId: (projectId: string | null) => void;

  // --- Reference Stage (Stage 1) ---
  uploadedVideoUrl: string | null;
  uploadedFileName: string | null;
  isUploading: boolean;
  uploadProgress: number;
  isParsing: boolean;
  analysisProgress: number;
  analysisResult: AnalysisResult | null;
  stage1AnalysisTab: 'rhythm' | 'report';
  currentTime: number;
  realVideoDuration: number;
  pipelineSteps: Array<{ name: string; status: PipelineStatus; progress: number; message: string }>;

  setReferenceState: (state: Partial<WorkbenchState>) => void;
  resetReferenceState: () => void;

  // --- Product Stage (Stage 2) ---
  productDescription: string;
  productImages: string[];
  productVideos: string[];
  isUploadingProduct: boolean;
  isUploadingProductVideo: boolean;
  isParsingProduct: boolean;
  isAnalyzingMaterial: boolean;
  materialAnalysis: MaterialAnalysisResult | null;
  materialAnalysisError: string | null;
  parsedProduct: Record<string, unknown> | null;
  editableProduct: Record<string, unknown> | null;
  dirtyProductFields: string[];
  scriptVersion: ScriptVersionType | undefined;
  
  setProductState: (state: Partial<WorkbenchState>) => void;
  resetProductState: () => void;

  // --- Script Stage (Stage 3) ---
  generatedScript: string | null;
  scriptManifest: ScriptManifestState | null;
  gapPlan: GapPlanState | null;
  scriptVersions: SavedScriptVersion[];
  activeVersionId: string | null;
  gapStrategyChoices: Record<string, string>;
  isGeneratingScript: boolean;
  isUpdatingScript: boolean;
  scriptGenProgress: number;
  scriptGenPhase: ScriptGenPhase;
  stageBriefsDirty: boolean;
  isVideoConfirmed: boolean;
  isGeneratingPackaging: boolean;

  setScriptState: (state: Partial<WorkbenchState>) => void;
  resetScriptState: () => void;

  // --- Render Stage (Stage 4) ---
  isVideoGenerating: boolean;
  generatedVideoUrl: string | null;
  renderSummary: string | null;
  coverThumbnail: string | null;
  renderBlocked: boolean;
  renderProgress: number;
  renderSteps: Array<{ label: string; status: string }>;
  chunkVideos: string[];
  staleRerunHint: string | null;
  isConcatting: boolean;

  setRenderState: (state: Partial<WorkbenchState>) => void;
  resetRenderState: () => void;
  
  // --- Actions ---
  resetAll: () => void;
}

const initialPipelineSteps = [
  { name: 'Whisper ASR', status: 'waiting' as PipelineStatus, progress: 0, message: '' },
  { name: 'FFmpeg 切镜', status: 'waiting' as PipelineStatus, progress: 0, message: '' },
  { name: 'OpenCV + OCR', status: 'waiting' as PipelineStatus, progress: 0, message: '' },
  { name: 'Librosa 节拍', status: 'waiting' as PipelineStatus, progress: 0, message: '' },
  { name: 'Seed-light 重组', status: 'waiting' as PipelineStatus, progress: 0, message: '' },
];

export const useWorkbenchStore = create<WorkbenchState>()(persist((set) => ({
  // --- Global UI State ---
  activeTab: 'reference',
  setActiveTab: (tab) => set({ activeTab: tab }),
  projectId: null,
  setProjectId: (projectId) => set({ projectId }),

  // --- Reference Stage ---
  uploadedVideoUrl: null,
  uploadedFileName: null,
  isUploading: false,
  uploadProgress: 0,
  isParsing: false,
  analysisProgress: 0,
  analysisResult: null,
  stage1AnalysisTab: 'rhythm',
  currentTime: 0,
  realVideoDuration: 0,
  pipelineSteps: initialPipelineSteps,

  setReferenceState: (state) => set(state),
  resetReferenceState: () => set({
    uploadedVideoUrl: null,
    uploadedFileName: null,
    analysisResult: null,
    stage1AnalysisTab: 'rhythm',
    uploadProgress: 0,
    analysisProgress: 0,
    currentTime: 0,
    realVideoDuration: 0,
    pipelineSteps: initialPipelineSteps,
  }),

  // --- Product Stage ---
  productDescription: '',
  productImages: [],
  productVideos: [],
  isUploadingProduct: false,
  isUploadingProductVideo: false,
  isParsingProduct: false,
  isAnalyzingMaterial: false,
  materialAnalysis: null,
  materialAnalysisError: null,
  parsedProduct: null,
  editableProduct: null,
  dirtyProductFields: [],
  scriptVersion: undefined,

  setProductState: (state) => set(state),
  resetProductState: () => set({
    productDescription: '',
    productImages: [],
    productVideos: [],
    isParsingProduct: false,
    isAnalyzingMaterial: false,
    materialAnalysis: null,
    materialAnalysisError: null,
    parsedProduct: null,
    editableProduct: null,
    dirtyProductFields: [],
    scriptVersion: undefined,
  }),

  // --- Script Stage ---
  generatedScript: null,
  scriptManifest: null,
  gapPlan: null,
  scriptVersions: [],
  activeVersionId: null,
  gapStrategyChoices: {},
  isGeneratingScript: false,
  isUpdatingScript: false,
  scriptGenProgress: 0,
  scriptGenPhase: 'idle',
  stageBriefsDirty: false,
  isVideoConfirmed: false,
  isGeneratingPackaging: false,

  setScriptState: (state) => set(state),
  resetScriptState: () => set({
    generatedScript: null,
    scriptManifest: null,
    gapPlan: null,
    scriptVersions: [],
    activeVersionId: null,
    gapStrategyChoices: {},
    isGeneratingScript: false,
    isUpdatingScript: false,
    scriptGenProgress: 0,
    scriptGenPhase: 'idle',
    stageBriefsDirty: false,
    isVideoConfirmed: false,
    isGeneratingPackaging: false,
  }),

  // --- Render Stage ---
  isVideoGenerating: false,
  generatedVideoUrl: null,
  renderSummary: null,
  coverThumbnail: null,
  renderBlocked: false,
  renderProgress: 0,
  renderSteps: [],
  chunkVideos: [],
  staleRerunHint: null,
  isConcatting: false,

  setRenderState: (state) => set(state),
  resetRenderState: () => set({
    isVideoGenerating: false,
    generatedVideoUrl: null,
    renderSummary: null,
    coverThumbnail: null,
    renderBlocked: false,
    renderProgress: 0,
    renderSteps: [],
    chunkVideos: [],
    staleRerunHint: null,
    isConcatting: false,
  }),

  // --- Actions ---
  resetAll: () => {
    set((state) => {
      state.resetReferenceState();
      state.resetProductState();
      state.resetScriptState();
      state.resetRenderState();
      return { activeTab: 'reference', projectId: null };
    });
  }
}), {
  name: 'metacut-workbench',
  storage: createJSONStorage(() => localStorage),
  // 仅持久化数据产物，瞬时状态（上传中/进度/轮询标记）不入库，避免刷新后卡在 loading
  partialize: (state) => ({
    activeTab: state.activeTab,
    projectId: state.projectId,
    uploadedVideoUrl: state.uploadedVideoUrl,
    uploadedFileName: state.uploadedFileName,
    analysisResult: state.analysisResult,
    realVideoDuration: state.realVideoDuration,
    productDescription: state.productDescription,
    productImages: state.productImages,
    productVideos: state.productVideos,
    materialAnalysis: state.materialAnalysis,
    parsedProduct: state.parsedProduct,
    editableProduct: state.editableProduct,
    dirtyProductFields: state.dirtyProductFields,
    scriptVersion: state.scriptVersion,
    generatedScript: state.generatedScript,
    scriptManifest: state.scriptManifest,
    gapPlan: state.gapPlan,
    scriptVersions: state.scriptVersions,
    activeVersionId: state.activeVersionId,
    gapStrategyChoices: state.gapStrategyChoices,
    isVideoConfirmed: state.isVideoConfirmed,
    generatedVideoUrl: state.generatedVideoUrl,
    chunkVideos: state.chunkVideos,
    renderSummary: state.renderSummary,
    coverThumbnail: state.coverThumbnail,
  }),
}));
