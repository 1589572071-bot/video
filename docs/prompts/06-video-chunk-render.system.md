# 06 · 分块视频生成（T2V / I2V）· System 或 User 模板 Prompt

> **占位文件**：按剧本「区块」调用文生视频或图生视频 API 时使用的**系统提示词**和/或**用户提示拼装规范**（不同厂商字段名不同，可在此统一描述「拼出来长什么样」）。

## 元数据（可改）

| 项 | 建议值 |
|----|--------|
| 建议环境变量 | `METACUT_PROMPT_VIDEO_CHUNK_SYSTEM`（若厂商只需要 user prompt，可改为 `..._USER_TEMPLATE`） |
| 输入 | 单区块剧本、首帧图 URL、继承的 BGM/节奏摘要（按需） |
| 对应 Pipeline | Step 4（视频子步骤；多 chunk 拼接见 PRD §12） |

## SYSTEM_PROMPT（在此填入）

```
（待填充：若该 API 支持 system 角色则写满；若不支持，此节可注明「留空，仅用 User 模板」。）
```

## User 消息 / 模板（在此填入）

```
（待填充：占位符例如 {{chunk_index}}、{{duration_cap}}、{{narrative_content}}、{{negative_prompt}} 等，由工程 replace。）
```

## 说明

- 可与 `04-first-frame` 输出的英文画面描述对齐，避免 chunk 间画风漂移；具体参数（时长上限、分辨率）由管线注入。
