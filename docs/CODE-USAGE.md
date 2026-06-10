# MetaCut 代码使用说明

> 本文档面向开发者与评审人员，说明如何拉取代码、配置环境、运行项目，以及四步 Pipeline 与核心模块的用法。  
> 仓库地址：https://github.com/1589572071-bot/Metacut-Project

---

## 1. 项目是什么

MetaCut 是一个 **爆款结构迁移引擎**：从样例视频拆解叙事骨架，结合新商品信息与用户素材，经剧本缝合后分块渲染为成片。

四步主流程：

| Tab | 步骤 | 能力 | 核心输出 |
|-----|------|------|----------|
| 1 | 样例解析 | 豆包 VLM 视频理解 | `video_analysis/v1` JSON |
| 2 | 商品解析 | 豆包多模态 + 素材高光 | `product/v1` JSON |
| 3 | 剧本编排 | 缺口检测 + 剧本缝合 | Markdown 剧本 → `script_manifest/v1` |
| 4 | 视频生成 | 万相 2.6 生图/生视频 + FFmpeg | 分块视频、封面/卖点卡、成片 |

更完整的架构说明见 [Project-Documentation.md](Project-Documentation.md)，产品需求见 [MetaCut-PRD-Refined.md](MetaCut-PRD-Refined.md)。

---

## 2. 环境要求

| 依赖 | 版本/说明 | 必需 |
|------|-----------|------|
| Node.js | ≥ 18 | 是 |
| npm | ≥ 9 | 是 |
| FFmpeg | 系统级安装，用于拼接与花字烧录 | 渲染成片时必需 |
| 中文字体 | 如 `fonts-noto-cjk`，用于 FFmpeg 烧录中文 | 烧录花字时建议 |
| PostgreSQL | 项目与渲染任务持久化 | 可选（未配置则无法跨重启恢复） |
| S3 兼容存储 | Sealos / MinIO 等 | 可选（未配置则回退 `public/uploads`） |

---

## 3. 快速开始

### 3.1 克隆与安装

```bash
git clone https://github.com/1589572071-bot/Metacut-Project.git
cd Metacut-Project
npm install
```

### 3.2 配置环境变量

```bash
cp .env.example .env.local
```

编辑 `.env.local`，填入真实密钥。**切勿将 `.env.local` 提交到 Git**（已在 `.gitignore` 中排除）。

最少可跑通「解析 + 剧本」的配置：

```env
DOUBAO_APIKEY=your_doubao_api_key
DOUBAO_EP=your_doubao_endpoint_id
```

要跑通「真实渲染」还需：

```env
DASHSCOPE_API_KEY=your_dashscope_api_key
METACUT_PUBLIC_ORIGIN=https://你的公网域名
```

### 3.3 启动开发服务器

```bash
npm run dev
```

浏览器打开 http://127.0.0.1:3000 。

### 3.4 生产构建与启动

```bash
npm run build
npm run start
```

Sealos DevBox 可使用根目录 `entrypoint.sh` 自动 `npm ci` → `npm run build` → `npm run start`。

---

## 4. 环境变量说明

完整示例见仓库根目录 [`.env.example`](../.env.example)。

| 变量 | 用途 | 未配置时的行为 |
|------|------|----------------|
| `DOUBAO_APIKEY` / `DOUBAO_EP` | Step1/2/3、AI 导演、素材分析 | 视频解析与剧本生成不可用，顶部告警 |
| `DASHSCOPE_API_KEY` | Step4 万相 2.6 生图/生视频 | 渲染进入 Mock 模式，成片为占位示例 |
| `METACUT_PUBLIC_ORIGIN` | 百炼拉取本地上传素材的公网地址 | 图生视频/参考图可能失败 |
| `DATABASE_URL` | PostgreSQL 持久化 | 项目无法跨重启恢复 |
| `S3_*` | 对象存储 | 上传回退到本地 `public/uploads` |
| `METACUT_REVIEW_ACCESS_CODE` | 公网评审访问码 | 入口无访问码保护 |
| `METACUT_RENDER_MOCK=true` | 强制 Mock 渲染 | 忽略百炼 Key，输出占位视频 |
| `METACUT_PROMPT_*` | 覆盖各 Step 的 System Prompt | 使用 `lib/prompts/` 内置默认 |

启动后访问 `GET /api/config/status` 或在页面顶部查看 **ConfigStatusBanner**，可诚实了解当前环境能力。

---

## 5. 工作台使用流程

### Tab 1 · 参考视频解析

1. 上传样例爆款视频（≤ 50MB）
2. 可选填写基础信息
3. 点击解析，等待豆包 VLM 输出 `video_analysis/v1`
4. 底部 **X-Ray 时间轴** 可查看切镜、字幕、音效、视觉标签四轨

### Tab 2 · 商品多模态解析

1. 输入商品文本 / 上传商品图 / 演示视频
2. 解析得到 8 字段 `product/v1`（名称、品类、卖点、场景等）
3. 可在 **ProductFeatureEditor** 中手改字段，支持单字段润色回写
4. 长视频素材可走高光分析（`material_analysis`）

### Tab 3 · 剧本编排

1. 确保 Tab 1、2 已完成
2. 选择剧本版本策略（高点击 / 高转化 / 高节奏 / 高质感），支持多版本并行生成
3. 生成 Markdown 剧本，服务端解析为 `script_manifest/v1`
4. 若有素材缺口，可为每个 Gap 选择补全策略后重写剧本
5. 可编辑各镜 `stage_brief`，或通过右侧 **AI 导演** 自然语言修改

### Tab 4 · 视频生成

1. 确认剧本后进入渲染
2. 全片渲染为异步 Job，前端轮询 `GET /api/render/jobs/{id}`
3. 支持单区块重跑（T2V / I2V / R2V）与重新拼接
4. **画面包装套件** 可生成封面卡、卖点卡（独立静态资产，导出 JSON 时附带）
5. 样例 vs 成片对比、结构槽位对照可验证迁移效果

---

## 6. 目录结构

```
Metacut-Project/
├── app/                    # Next.js App Router
│   ├── api/                # 21 个 API 路由（见下文）
│   └── page.tsx            # 工作台入口
├── components/
│   ├── engines/            # 业务面板（X-Ray、包装套件、迁移总览等）
│   └── workbench/          # 四 Tab 舞台与侧栏
├── lib/
│   ├── providers/          # 豆包 / 百炼万相 模型调用
│   ├── prompts/            # System Prompt 源码
│   ├── store/              # Zustand 工作台状态与 actions
│   ├── director/           # AI 导演 Tool-Use
│   ├── editor/             # 区块重跑、manifest 同步
│   ├── types/pipeline.ts   # 各 Step 数据契约
│   ├── render-orchestrator.ts  # 渲染编排主逻辑
│   └── script-stitch.ts    # 规则版剧本缝合 fallback
├── docs/
│   ├── CODE-USAGE.md       # 本文档
│   ├── Project-Documentation.md
│   ├── MetaCut-PRD-Refined.md
│   └── prompts/            # 7 个 Prompt 位点（01–07）
├── .env.example            # 环境变量模板（可提交）
└── .env.local              # 真实密钥（禁止提交）
```

---

## 7. API 路由一览

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/analyze/video` | POST | Step1 样例视频原子解析 |
| `/api/product/parse` | POST | Step2 商品多模态解析 |
| `/api/product/polish` | POST | 商品字段润色 |
| `/api/material/analyze` | POST | 素材视频高光分析 |
| `/api/script/generate` | POST | Step3 剧本缝合 |
| `/api/render/video` | POST | Step4 全片渲染（支持 `async: true`） |
| `/api/render/jobs/[id]` | GET | 渲染 Job 轮询 |
| `/api/render/block` | POST | 单区块重跑 |
| `/api/render/concat` | POST | 多区块 FFmpeg 拼接 |
| `/api/render/keyframes` | POST | 首帧/关键帧生成 |
| `/api/packaging/generate` | POST | 封面 / 卖点卡生成 |
| `/api/director/chat` | POST | AI 导演意图解析与执行 |
| `/api/projects` | GET/POST | 项目列表 / 创建 |
| `/api/projects/[id]` | GET | 项目快照恢复 |
| `/api/projects/[id]/script` | PUT | 持久化剧本 |
| `/api/upload/video` | POST | 样例视频上传 |
| `/api/upload/product/image` | POST | 商品图上传 |
| `/api/upload/product/video` | POST | 商品演示视频上传 |
| `/api/assets/public` | GET | 资产公网 URL 代理 |
| `/api/config/status` | GET | 环境能力状态 |
| `/api/auth/review` | POST | 评审访问码校验 |

---

## 8. 核心数据契约

各 Step 之间通过固定 Schema 传递，类型定义在 [`lib/types/pipeline.ts`](../lib/types/pipeline.ts)：

| 契约 | 版本 | 关键字段 |
|------|------|----------|
| 样例解析 | `video_analysis/v1` | `narrative_structure.timeline_events`、`content_strategy` |
| 商品解析 | `product/v1` | `product_name`、`core_selling_points`、`visual_description` 等 8 字段 |
| 剧本清单 | `script_manifest/v1` | `blocks[]`（≤15s 分块）、`shots[]` |
| 缺口计划 | `gap_plan` | `gaps[]`、`resolutions[]` |

LLM 负责创意文案；`asset_source`、`gap_codes`、`fallback_applied` 由服务端 `resolveShotFallback` 确定性叠加，防止幻觉。

---

## 9. Prompt 自定义

7 个 Prompt 位点位于 `docs/prompts/01`–`07`，详见 [prompts/README.md](prompts/README.md)。

运行时覆盖方式：在 `.env.local` 设置对应变量，例如：

```env
METACUT_PROMPT_SCRIPT_STITCH_SYSTEM=你的自定义 Prompt
```

未设置时，代码回退到 `lib/prompts/*.ts` 内置版本；部分 Provider 也会尝试读取 `docs/prompts/*.system.md`。

---

## 10. 渲染模式说明

| 模式 | 条件 | 行为 |
|------|------|------|
| 真实渲染 | 有 `DASHSCOPE_API_KEY` 且未设 `METACUT_RENDER_MOCK` | 万相 2.6 分块生视频 + FFmpeg 花字烧录 + 拼接 |
| Mock 渲染 | 无百炼 Key 或强制 Mock | 输出占位 SVG/示例视频，前端横幅明示 |
| 区块重跑 | Tab4 或 AI 导演 `rerunBlock` | 单块 T2V/I2V/R2V，可选 cascade 联动后续块 |

渲染编排入口：[`lib/render-orchestrator.ts`](../lib/render-orchestrator.ts)  
分块 Prompt 拼装：[`lib/providers/wan26-video.ts`](../lib/providers/wan26-video.ts) `buildBlockVideoPrompt()`

---

## 11. AI 导演（自然语言编辑）

右侧 **AI 导演** 面板支持自然语言修改，意图解析后映射为 `DirectorAction` 并执行：

| 工具 | 功能 |
|------|------|
| `updateStageBrief` | 更新镜头阶段说明并重生成剧本 |
| `regenerateScript` | 重生成全篇剧本 |
| `rerunBlock` | 重跑指定渲染区块 |
| `switchRenderModel` | 切换 T2V/I2V/R2V 并重跑 |

定义见 [`lib/director/tools.ts`](../lib/director/tools.ts)。执行前自动快照，支持撤销。

---

## 12. 常见问题

### Q：页面顶部出现黄色告警横幅？

调用 `GET /api/config/status` 查看缺项。常见原因：未配豆包 Key、未配百炼 Key、未装 FFmpeg、未配中文字体。

### Q：渲染一直 Mock / 占位视频？

检查 `DASHSCOPE_API_KEY` 是否有效，且未设置 `METACUT_RENDER_MOCK=true`。

### Q：I2V / 参考图生成失败？

`METACUT_PUBLIC_ORIGIN` 必须是百炼能访问的公网 HTTPS 地址，不能填 `localhost`。

### Q：项目刷新后丢失？

配置 `DATABASE_URL` 后，项目元数据与剧本会写入 PostgreSQL。

### Q：封面/卖点卡会合成进成片吗？

当前封面卡（`cover_image_url`）与卖点卡（`feature_card_url`）为**独立静态资产**，用于预览与导出 JSON；成片内烧录的是剧本各镜的花字/字幕（FFmpeg `subtitles`）。

### Q：如何邀请他人访问私有仓库？

GitHub 仓库 **Settings → Collaborators → Add people**，授予 Read 或 Write 权限。

---

## 13. 开发命令

```bash
npm run dev      # 开发模式（127.0.0.1:3000）
npm run build    # 生产构建
npm run start    # 生产启动
npm run lint     # ESLint 检查
```

---

## 14. 相关文档

- [README.md](../README.md) — 项目概览
- [Project-Documentation.md](Project-Documentation.md) — 架构与自主设计说明
- [MetaCut-PRD-Refined.md](MetaCut-PRD-Refined.md) — 产品需求
- [prompts/README.md](prompts/README.md) — Prompt 资产管理

---

*MetaCut — 方法迁移，而非内容复制。*
