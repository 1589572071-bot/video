/** content_strategy 字段 Schema 片段（嵌入 Step1 / Prompt 07） */

export const CONTENT_STRATEGY_SCHEMA_BLOCK = `  "content_strategy": {
    "topic": "string, 50-200字：选题角度、热点关联、人群共鸣点，回答「为什么这个选题有吸引力」",
    "hook": "string, 50-200字：开头 3 秒钩子类型（悬念/对比/痛点/反常识等）+ 具体文案或画面描述",
    "structure": "string, 50-200字：叙事结构特点（如 PAS/AIDA/清单体/前后对比），结合 timeline_events 阶段说明",
    "rhythm": "string, 50-200字：剪辑与信息节奏特点（切镜密度、口播语速、高潮窗口）",
    "emotion": "string, 50-200字：情绪曲线与设计意图，从焦虑到满足等转变",
    "audience_need": "string, 50-200字：从视频内容反推受众需求（功能/情感/社交/省钱等），非商品卖点",
    "expression_style": "string, 50-200字：表达类型 taxonomy（口播体/剧情体/测评体/悬念式/对比式等）+ 可借鉴手法",
    "imitation_focus": "string, 50-200字：最值得仿写的 1-2 个部分（结构/钩子/节奏/表达），说明保留什么、替换什么",
    "viral_core_reason": "string, 30-100字：一句话总结这条视频爆的核心原因",
    "reusable_template": "string, 80-300字：可复用的创作模板公式，含占位符如 [痛点]→[产品]→[爽点]"
  }`;

export const CONTENT_STRATEGY_EXECUTION_RULES = `# CONTENT STRATEGY ANALYSIS（7 维内容策略拆解）
在完成原子级 JSON 拆解的同时，必须填写 content_strategy 对象，扮演「视频趋势顾问」依次回答：
1. 选题：为什么这个选题有吸引力？
2. 钩子：开头的钩子是什么？
3. 结构：结构有什么特点？
4. 节奏：节奏有什么特点？
5. 情绪：唤起了受众什么情绪？
6. 需求：满足了受众什么需求？（从视频反推，非臆测商品）
7. 表达方式：有哪些值得借鉴的表达方式？
8. 仿写：最值得借鉴的是哪一部分？
最后填写 viral_core_reason（爆款核心原因）与 reusable_template（可复用模板公式）。
各字段须基于视频实际内容，可与 narrative_structure / rhythm_and_density / voiceover_details 交叉引用，禁止空泛套话。`;
