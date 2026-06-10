# MetaCut · Prompt 资产管理（7 个位点）

所有 System / 模板类提示词按编号独立成文件，**正文区域预留给后期自行粘贴**；实现时建议通过环境变量或配置中心加载，便于 A/B。

共 **7** 个编号位点（01–07），另有 **4 个扩展 Prompt** 未纳入编号但已在代码中上线。

### 编号位点（01–07）

| # | 用途 | 占位文件 | 代码实现 | 状态 |
|---|------|-----------|----------|------|
| 01 | Step1 样例视频原子解析 | [01-video-analysis.system.md](01-video-analysis.system.md) | [`app/api/analyze/video/route.ts`](../../app/api/analyze/video/route.ts) | **已写入** |
| 02 | Step2 商品多模态拆解 | [02-product-parse.system.md](02-product-parse.system.md) | [`lib/prompts/product-parse-system.ts`](../../lib/prompts/product-parse-system.ts) | **已写入** |
| 03 | Step3 跨品类剧本缝合 | [03-script-stitch.system.md](03-script-stitch.system.md) | [`lib/prompts/script-stitch-system.ts`](../../lib/prompts/script-stitch-system.ts) | **已写入** |
| 04 | Step4 首帧垫图 | [04-first-frame.system.md](04-first-frame.system.md) | [`lib/keyframe-generator.ts`](../../lib/keyframe-generator.ts) `buildKeyframePrompt()` | 占位；工程拼装 |
| 05 | Step1 JSON 修复重试 | [05-json-repair.system.md](05-json-repair.system.md) | — | 仅占位，未接入 |
| 06 | Step4 分块 T2V/I2V | [06-video-chunk-render.system.md](06-video-chunk-render.system.md) | [`lib/providers/wan26-video.ts`](../../lib/providers/wan26-video.ts) `buildBlockVideoPrompt()` | 占位；工程拼装 |
| 07 | 7 维内容策略拆解 | [07-content-strategy-analysis.system.md](07-content-strategy-analysis.system.md) | [`lib/prompts/content-strategy-system.ts`](../../lib/prompts/content-strategy-system.ts)（嵌入 01） | **已写入** |

### 扩展 Prompt（未编号，已上线）

| 名称 | 代码文件 | 用途 |
|------|----------|------|
| AI 导演意图解析 | [`lib/prompts/director-intent-system.ts`](../../lib/prompts/director-intent-system.ts) | 自然语言 → Tool-Use 工具调用 |
| 商品字段润色 | [`lib/prompts/product-polish-system.ts`](../../lib/prompts/product-polish-system.ts) | 用户手改字段后润色回写 |
| 素材高光分析 | [`lib/providers/doubao-material-analyze.ts`](../../lib/providers/doubao-material-analyze.ts) | 长视频素材高光片段 JSON |
| 封面/卖点卡底图 | [`lib/providers/wan26-image.ts`](../../lib/providers/wan26-image.ts) | 万相 2.6 包装底图英文 Prompt |

### 环境变量覆盖

| # | 建议环境变量 |
|---|----------------|
| 01 | （当前内联 route，暂无 env；可改抽离） |
| 02 | `METACUT_PROMPT_PRODUCT_SYSTEM` |
| 03 | `METACUT_PROMPT_SCRIPT_STITCH_SYSTEM` |
| 04 | `METACUT_PROMPT_FIRST_FRAME_SYSTEM` |
| 05 | `METACUT_PROMPT_VIDEO_JSON_REPAIR_SYSTEM` |
| 06 | `METACUT_PROMPT_VIDEO_CHUNK_SYSTEM` |
| 07 | `METACUT_PROMPT_CONTENT_STRATEGY_SYSTEM` |
| 导演 | `METACUT_PROMPT_DIRECTOR_INTENT_SYSTEM` |
| 润色 | `METACUT_PROMPT_PRODUCT_POLISH_SYSTEM` |

## 参考填充稿（非占位）

- Step2 已由团队写过一版可参考：[_reference/02-product-parse-v1.filled.md](_reference/02-product-parse-v1.filled.md)

PRD 总览：[MetaCut-PRD-Refined.md](../MetaCut-PRD-Refined.md)
