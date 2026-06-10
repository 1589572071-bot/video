# MetaCut · Prompt 资产管理（7 个位点）

所有 System / 模板类提示词按编号独立成文件，**正文区域预留给后期自行粘贴**；实现时建议通过环境变量或配置中心加载，便于 A/B。

共 **7** 个 Prompt 位点（01–07）。

| # | 用途 | 占位文件 | 建议环境变量 |
|---|------|-----------|----------------|
| 01 | Step1 样例视频原子解析 → `video_analysis/v1` JSON | [01-video-analysis.system.md](01-video-analysis.system.md) | `METACUT_PROMPT_VIDEO_ANALYSIS_SYSTEM` |
| 02 | Step2 商品多模态拆解 → `product/v1` JSON | [02-product-parse.system.md](02-product-parse.system.md) | `METACUT_PROMPT_PRODUCT_SYSTEM` |
| 03 | Step3 跨品类剧本缝合 → Markdown 剧本 | [03-script-stitch.system.md](03-script-stitch.system.md) | `METACUT_PROMPT_SCRIPT_STITCH_SYSTEM` |
| 04 | Step4 首帧垫图 → 英文正负向等 | [04-first-frame.system.md](04-first-frame.system.md) | `METACUT_PROMPT_FIRST_FRAME_SYSTEM` |
| 05 | Step1 JSON 校验失败 → 修复重试 | [05-json-repair.system.md](05-json-repair.system.md) | `METACUT_PROMPT_VIDEO_JSON_REPAIR_SYSTEM` |
| 06 | Step4 分块 T2V/I2V → System 与/或 User 模板 | [06-video-chunk-render.system.md](06-video-chunk-render.system.md) | `METACUT_PROMPT_VIDEO_CHUNK_SYSTEM`（或按实现拆分） |
| 07 | Step1 补充 · 热点视频 7 维内容策略拆解 | [07-content-strategy-analysis.system.md](07-content-strategy-analysis.system.md) | `METACUT_PROMPT_CONTENT_STRATEGY_SYSTEM` |

## 参考填充稿（非占位）

- Step2 已由团队写过一版可参考：[_reference/02-product-parse-v1.filled.md](_reference/02-product-parse-v1.filled.md)

PRD 总览：[MetaCut-PRD-Refined.md](../MetaCut-PRD-Refined.md)
