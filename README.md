# MetaCut · AI 短视频创作迁移平台

> 爆款方法论迁移 · 智能素材补全 · 一键生成专业短视频

本仓库为 **MetaCut** 平台的 MVP 前端实现，严格遵循 [PRD 精炼版](docs/MetaCut-PRD-Refined.md) 与原 PRD 中的 UI/交互规范。

## 核心特性（已实现）

- **X-Ray Timeline**：4 轨道可视化（切镜 / 字幕 / 音效 / 视觉标签）+ 红色时间指针 + 点击跳转
- **对比模式**：原视频 / 生成剧本 / 并排对比 三态切换
- **Asset Dock**：动态资产卡片 + 5 个可编辑语义槽（HOOK→CTA）
- **Pipeline Telemetry**：实时状态轮询模拟（5 模型）
- **CTA 汇聚动画**：卡片路径汇聚 + 芯片旋转 + 跳过按钮 + 槽位渐次填充
- **剧本预览面板**：折叠展开 + 编辑后即时反馈
- **完整暗色主题**：#0B0E14 + 霓虹蓝/香槟金 + 磨砂玻璃 + 阶段色映射

## 快速开始

```bash
npm install
npm run dev
```

打开 http://localhost:3000 即可体验完整交互。

## 技术栈

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS + Framer Motion
- Sonner (优雅 Toast)
- Lucide Icons

## Prompt 资产

共 **7 个编号位点**（`docs/prompts/01`–`07`）+ **4 个扩展 Prompt**（导演/润色/素材/包装），详见 [docs/prompts/README.md](docs/prompts/README.md)。

| 编号 | 用途 | 状态 |
|------|------|------|
| 01 | Step1 视频原子解析 | 已写入（`docs` + `app/api/analyze/video/route.ts`） |
| 02 | Step2 商品多模态解析 | 已写入（`docs` + `lib/prompts/product-parse-system.ts`） |
| 03 | Step3 剧本缝合 | 已写入（`docs` + `lib/prompts/script-stitch-system.ts`） |
| 07 | 7 维内容策略 | 已写入（嵌入 01 + `lib/prompts/content-strategy-system.ts`） |
| 04 | 首帧垫图 | 占位；实际由 `lib/keyframe-generator.ts` 工程拼装 |
| 06 | 分块 T2V/I2V | 占位；实际由 `lib/providers/wan26-video.ts` 工程拼装 |
| 05 | JSON 修复重试 | 仅占位，尚未接入代码 |

扩展（不在 01–07 编号内，但已上线）：
- AI 导演意图解析 → `lib/prompts/director-intent-system.ts`
- 商品字段润色 → `lib/prompts/product-polish-system.ts`
- 素材高光分析 → `lib/providers/doubao-material-analyze.ts`（内联）
- 封面/卖点卡底图 → `lib/providers/wan26-image.ts` `buildPackagingPrompt()`

## 模型配置

- 模型 API 配置占位文件：[lib/model-config.ts](lib/model-config.ts)
- 环境变量示例：`.env.example`
- 当前使用模型：Doubao-Seed-2.0-lite（EP: ep-20260508213828-7ntjl）

## 下一步（建议）

1. 接入真实后端 API（FastAPI + Celery）
2. 实现 Step1~4 真实调用与 `script_manifest.json` 解析
3. 视频真实播放器 + 字幕 Karaoke 逐字高亮
4. 增加 Supabase Realtime 或轮询真实状态

## 文档

- [**代码使用说明**](docs/CODE-USAGE.md) — 环境配置、四步流程、API 与常见问题
- [项目说明文档](docs/Project-Documentation.md)
- [精炼 PRD](docs/MetaCut-PRD-Refined.md)
- [Prompt 管理](docs/prompts/README.md)

---

**MetaCut** — 方法迁移，而非内容复制。
