/** 7 维热点视频内容策略拆解维度定义与 MVP 优先级 */

export interface ContentStrategyDimensionDef {
  id: keyof Omit<
    import("@/lib/types/pipeline").ContentStrategy,
    "viral_core_reason" | "reusable_template"
  >;
  label: string;
  question: string;
  /** MVP 必须输出；false 表示可后续迭代增强 */
  mvpRequired: boolean;
  priority: number;
}

export const CONTENT_STRATEGY_DIMENSIONS: ContentStrategyDimensionDef[] = [
  {
    id: "topic",
    label: "选题",
    question: "这个视频的选题为什么有吸引力？",
    mvpRequired: true,
    priority: 1,
  },
  {
    id: "hook",
    label: "钩子",
    question: "开头的钩子是什么？",
    mvpRequired: true,
    priority: 2,
  },
  {
    id: "structure",
    label: "结构",
    question: "它的结构有什么特点？",
    mvpRequired: true,
    priority: 3,
  },
  {
    id: "rhythm",
    label: "节奏",
    question: "它的节奏有什么特点？",
    mvpRequired: true,
    priority: 4,
  },
  {
    id: "emotion",
    label: "情绪",
    question: "它唤起了受众什么情绪？",
    mvpRequired: true,
    priority: 5,
  },
  {
    id: "audience_need",
    label: "需求",
    question: "它满足了受众什么需求？",
    mvpRequired: true,
    priority: 6,
  },
  {
    id: "expression_style",
    label: "表达方式",
    question: "有哪些值得借鉴的表达方式？",
    mvpRequired: true,
    priority: 7,
  },
  {
    id: "imitation_focus",
    label: "仿写",
    question: "如果我要仿写，最值得借鉴的是哪一部分？",
    mvpRequired: true,
    priority: 8,
  },
];

/** MVP：7 维 + 爆款总结 + 可复用模板，全部在 Step1 content_strategy 中输出 */
export const CONTENT_STRATEGY_MVP_SCOPE = {
  dimensions: CONTENT_STRATEGY_DIMENSIONS.filter((d) => d.mvpRequired).map((d) => d.id),
  includesViralSummary: true,
  includesReusableTemplate: true,
} as const;
