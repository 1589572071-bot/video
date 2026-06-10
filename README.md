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

7 个可配置 System Prompt 位于 `docs/prompts/`，对应 Step1~4 及修复逻辑，详见 [docs/prompts/README.md](docs/prompts/README.md)。

已完整写入的 Prompt：
- Step1 视频原子化解析：[docs/prompts/01-video-analysis.system.md](docs/prompts/01-video-analysis.system.md)
- Step2 商品多模态解析（已更新为原子级提取版）：[docs/prompts/02-product-parse.system.md](docs/prompts/02-product-parse.system.md)

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

- [精炼 PRD](docs/MetaCut-PRD-Refined.md)
- [Prompt 管理](docs/prompts/README.md)

---

**MetaCut** — 方法迁移，而非内容复制。
