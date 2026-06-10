# 05 · 视频解析 JSON · Schema 校验失败 · Repair System Prompt

> **占位文件**：当 Step1 输出未通过 JSON Schema 校验时，将**违规摘要 + 上一次模型输出**发给本 Prompt，要求输出**修复后的唯一 JSON**。

## 元数据（可改）

| 项 | 建议值 |
|----|--------|
| 建议环境变量 | `METACUT_PROMPT_VIDEO_JSON_REPAIR_SYSTEM` |
| 关联 Schema | 同 `video_analysis/v1` |
| 对应 Pipeline | Step 1 重试路径（见 [PRD §7.5](../MetaCut-PRD-Refined.md#75-重试策略)） |

## SYSTEM_PROMPT（在此填入）

```
（待填充：强调仅输出合法 JSON、时间轴单调、枚举对齐、与 repair 指令配合等。）
```

## User 消息约定（工程侧 · 可改）

- （待填充：`validation_errors` JSONPath 或人类可读列表、`previous_output` 原始字符串、可选视频时长等。）
