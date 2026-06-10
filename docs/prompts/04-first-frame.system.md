# 04 · 首帧垫图（I2V 起点）· System Prompt

> **占位文件**：根据全局视觉锚点、Shot1 拆解、商品特征生成**英文**正向/反向提示词与工程建议。

## 元数据（可改）

| 项 | 建议值 |
|----|--------|
| 建议环境变量 | `METACUT_PROMPT_FIRST_FRAME_SYSTEM` |
| 输出 | 结构化文本（正向 Prompt、Negative Prompt、宽高比、ControlNet 建议等，见 [PRD §12](../MetaCut-PRD-Refined.md#12-step-4首帧垫图与视频生成) / 附录 B） |
| 对应 Pipeline | Step 4（图像子步骤） |

## SYSTEM_PROMPT（在此填入）

```
（待填充：静态帧法则、材质-光影绑定、色彩锚点注入等；输出格式需便于下游 API 解析。）
```

## User 消息约定（工程侧 · 可改）

- （待填充：剧本 Shot1 片段、全局锚点、商品 visual 摘要、用户参考图说明等。）
