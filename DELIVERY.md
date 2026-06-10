# MetaCut · 工程训练营交付物汇总

> **爆款结构迁移引擎**：从样例拆解、素材补全到视频重组的 AI 创作平台  
> 本文档为评委**一站式入口**，汇总全部交付物链接与查阅指引。

---

## 一、快速访问（评委优先看这里）

| 项目 | 链接 / 信息 |
|------|-------------|
| **在线体验（网页）** | https://rvqeidcdanic.sealosbja.site/ |
| **项目使用邀请码** | `metacut2026` |
| **代码仓库** | https://github.com/1589572071-bot/Metacut-Project |
| **代码运行说明** | [CODE-USAGE.md](CODE-USAGE.md) |
| **项目说明文档** | [docs/Project-Documentation.md](docs/Project-Documentation.md) |

**体验步骤**：打开网页 → 输入邀请码 `metacut2026` → 按 Tab 1→2→3→4 顺序操作（详见下方「MVP 使用流程」）。

---

## 二、交付物对照（课题要求）

| 课题要求 | 交付物 | 状态 | 查阅方式 |
|----------|--------|------|----------|
| 项目说明 | 含整体 AI 架构、工具协议、安全边界 | ✅ 已完成 | [docs/Project-Documentation.md](docs/Project-Documentation.md) |
| 代码 + 运行说明 | GitHub 仓库 + 使用文档 | ✅ 已完成 | 仓库 + [CODE-USAGE.md](CODE-USAGE.md) |
| 演示视频 | MVP 全流程操作录屏 | ⚠️ 见飞书 | 下方「§三·演示视频」填入链接 |
| 产出视频 | 多场景成片 Case | ⚠️ 见飞书 | 下方「§四·效果展示」填入链接 |

### 项目说明文档覆盖范围

[Project-Documentation.md](docs/Project-Documentation.md) 已包含课题要求的三大块：

1. **整体 AI 架构**（§1）：四步 Pipeline、横切能力、结构定义、缺口治理
2. **工具协议**（§2）：数据契约、AI 导演 Tool-Use、Prompt 协议、渲染编排、外部模型调用
3. **安全边界**（§4）：密钥安全、访问控制、内容合规、工程防幻觉、数据存储、运行稳定性

补充材料：[MetaCut-PRD-Refined.md](docs/MetaCut-PRD-Refined.md)、[docs/prompts/README.md](docs/prompts/README.md)

---

## 三、MVP 使用流程 & 演示视频

### 3.1 标准操作流程（四 Tab）

```
Tab 1 样例解析 → Tab 2 商品解析 → Tab 3 剧本编排 → Tab 4 视频生成
```

| 步骤 | 操作要点 |
|------|----------|
| Tab 1 | 上传样例爆款视频（**建议 ~30 秒**），点击解析，查看 X-Ray 时间轴 |
| Tab 2 | 输入商品信息 / 上传商品图或演示视频，完成多模态解析 |
| Tab 3 | 选择剧本版本策略，生成剧本，可按需处理素材缺口 |
| Tab 4 | 确认剧本后全片渲染，可重跑区块、生成封面/卖点卡，对比样例与成片 |

### 3.2 演示视频（MVP 全流程录屏）

> **请将飞书文档中的演示视频链接粘贴到此处**，确保评委无需飞书权限即可观看（建议同步上传至 B 站 / 飞书公开链接 / GitHub Release）。

| 视频 | 说明 | 链接（待填） |
|------|------|--------------|
| MVP 使用流程演示 | 从上传到出片的完整操作 | _（飞书内视频，请补充可公开访问的 URL）_ |

---

## 四、效果展示 · 产出视频 Case

以下三种场景对应课题中「素材充足 / 素材不足 / 长样例分块」的典型情况。

### Case 1 · 标准情况（推荐评审优先看）

**条件**：样例视频时长合理（~30s）、商品素材充足

| 阶段 | 说明 | 截图/视频（待填） |
|------|------|-------------------|
| Step 1 样例视频 | 参考爆款输入 | _飞书图片/视频链接_ |
| Step 2 商品素材 | 图文/演示视频齐全 | _飞书图片/视频链接_ |
| 最终结果 | 迁移后成片 | _飞书图片/视频链接_ |

### Case 2 · 商品素材很少

**条件**：仅文字描述，如「好吃的脆脆角」，几乎无图无视频

| 阶段 | 说明 | 截图/视频（待填） |
|------|------|-------------------|
| Step 1 样例视频 | 参考爆款输入 | _飞书图片/视频链接_ |
| Step 2 商品素材 | 仅文字，触发缺口检测与 AIGC 补全 | _飞书图片/视频链接_ |
| 最终结果 | 依赖缺口治理后的成片 | _飞书图片/视频链接_ |

### Case 3 · 样例视频较长（多区块渲染）

**条件**：样例超过 30s，系统按 15s/块拆分渲染

| 阶段 | 说明 | 截图/视频（待填） |
|------|------|-------------------|
| Step 1 样例视频 | 较长样例，多区块 | _飞书图片/视频链接_ |
| Step 2 商品素材 | 商品信息输入 | _飞书图片/视频链接_ |
| 最终结果 | 多 chunk 拼接成片 | _飞书图片/视频链接_ |

> **说明**：飞书内嵌的「暂时无法在飞书文档外展示此内容」对评委不可见。提交前请将上述截图/视频转为**公开可访问链接**（或放入本仓库 `docs/delivery-assets/` 并在上表填入 GitHub 直链）。

---

## 五、代码仓库结构（评委速览）

```
Metacut-Project/
├── DELIVERY.md              ← 本文档（交付物入口）
├── CODE-USAGE.md            ← 代码运行说明
├── README.md                ← 项目概览
├── docs/
│   └── Project-Documentation.md  ← 项目说明（架构/协议/安全边界）
├── app/api/                 ← 21 个 API 路由
├── components/              ← 工作台 UI
└── lib/                     ← Pipeline 核心逻辑
```

本地运行：`git clone` → `npm install` → 配置 `.env.local`（参考 `.env.example`）→ `npm run dev`。  
**注意**：API Key 不在仓库中，评委体验请优先使用上方**在线网页 + 邀请码**。

---

## 六、权限与提交检查清单

提交前请确认：

- [ ] GitHub 仓库 `Metacut-Project` 对评委**可读**（Public 或已添加 Collaborator）
- [ ] 在线网页 https://rvqeidcdanic.sealosbja.site/ 可访问，邀请码 `metacut2026` 有效
- [ ] 本文件 `DELIVERY.md` 中演示视频、产出 Case 的**外链已填全**（非飞书内嵌）
- [ ] 飞书交付文档已设为**评委可查阅**（提前开放权限）
- [ ] 项目说明、代码、演示视频、产出视频四部分均可从本文档一键跳转

---

## 七、相关链接索引

| 文档 | 路径 |
|------|------|
| 交付物汇总（本文档） | [DELIVERY.md](DELIVERY.md) |
| 代码运行说明 | [CODE-USAGE.md](CODE-USAGE.md) |
| 项目说明（架构/协议/安全边界） | [docs/Project-Documentation.md](docs/Project-Documentation.md) |
| 产品需求文档 | [docs/MetaCut-PRD-Refined.md](docs/MetaCut-PRD-Refined.md) |
| Prompt 资产 | [docs/prompts/README.md](docs/prompts/README.md) |

---

*MetaCut — 方法迁移，而非内容复制。*
