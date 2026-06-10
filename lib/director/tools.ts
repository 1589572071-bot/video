/** AI 导演工具定义与类型 */

export const DIRECTOR_TOOLS = [
  {
    name: "updateStageBrief",
    description: "更新镜头阶段说明并重生成剧本",
    parameters: { narrative_stage: "string", stage_brief: "string", shot_index: "number?" },
  },
  {
    name: "regenerateScript",
    description: "根据当前 stage_brief 重生成剧本",
    parameters: {},
  },
  {
    name: "rerunBlock",
    description: "重跑指定区块视频",
    parameters: { block_index: "number" },
  },
  {
    name: "switchRenderModel",
    description: "指定 t2v/i2v/r2v 模式重跑区块",
    parameters: { block_index: "number", mode: "t2v|i2v|r2v" },
  },
] as const;

export type DirectorToolName =
  | "updateStageBrief"
  | "regenerateScript"
  | "rerunBlock"
  | "switchRenderModel";

export interface DirectorAction {
  tool: DirectorToolName;
  params: Record<string, unknown>;
}

export interface DirectorActionResult {
  tool: string;
  success: boolean;
  message: string;
  scriptMarkdown?: string;
  scriptManifest?: import("@/lib/types/pipeline").ScriptManifest;
  gapPlan?: import("@/lib/types/pipeline").GapPlan;
  block_index?: number;
  local_url?: string;
  mode?: string;
  updated_chunks?: string[];
  final_video?: string | null;
  reran_blocks?: number[];
  strategy?: "single" | "cascade";
  affected_blocks?: number[];
  stale_hint?: string | null;
}

export interface DirectorIntentResult {
  reply: string;
  actions: DirectorAction[];
}

export interface DirectorMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface DirectorContext {
  productSummary?: string;
  gapSummary?: string;
  scriptSummary?: string;
}

export interface DirectorChatRequest {
  message: string;
  context?: DirectorContext;
  scriptManifest?: import("@/lib/types/pipeline").ScriptManifest | null;
  product?: import("@/lib/types/pipeline").ProductInput | null;
  productImageUrls?: string[];
  productVideoUrls?: string[];
  videoAnalysis?: import("@/lib/types/pipeline").VideoAnalysisInput | null;
  chunkVideos?: string[];
  projectId?: string | null;
  execute?: boolean;
}

export interface DirectorChatResponse {
  success: boolean;
  reply: string;
  actions?: DirectorAction[];
  results?: DirectorActionResult[];
  toolsAvailable: string[];
}
