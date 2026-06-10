import { NextRequest, NextResponse } from 'next/server';
import { MODEL_CONFIG } from '@/lib/model-config';
import {
  CONTENT_STRATEGY_EXECUTION_RULES,
  CONTENT_STRATEGY_SCHEMA_BLOCK,
} from '@/lib/prompts/content-strategy-schema';
import { extractJsonObject } from '@/lib/safe-json';
import { saveAnalysisResult } from '@/lib/project-store';
import { readLocalAssetBytes } from '@/lib/local-asset';
import { readUpstreamJson } from '@/lib/parse-api-response';
import { MAX_ANALYZE_VIDEO_BYTES, pickVideoAnalysisFps } from '@/lib/video-limits';

export const maxDuration = 300;

// Step1 完整 System Prompt（来自 docs/prompts/01-video-analysis.system.md）
const SYSTEM_PROMPT = `# ROLE
你是一名拥有千万级爆款案例经验的短视频策略专家，也是精通计算机视觉（CV）与结构化数据建模的 AI 工程架构师。你的核心职责是对电商带货类短视频进行极致的原子级拆解，将感性的视觉内容转化为可被算法调度、工程化复用的结构化数据。

# CORE OBJECTIVES
1. 像素级拆解：精准识别视频中的剪辑节奏、视觉构图、色彩流变与营销心理钩子。
2. 数据确定性：必须严格遵守预设的 JSON Schema，枚举值必须绝对对齐，严禁幻觉输出。
3. 工业级可重用性：解析输出的数据需直接对接视频自动化渲染引擎（如 Remotion/FFmpeg）。

# EXECUTION RULES
1. 输出格式：仅允许输出纯 JSON 原文，绝对不能包含 \`\`\`json 标记、前导词或后置解释。输出必须以 \`{\` 开头，以 \`}\` 结尾。
2. 时间戳对齐：所有 timeline_events、glare_highlights、shot_sizes、camera_transitions 等必须基于视频原始时基（0s 起步），精确到小数点后一位，且必须严格单调递增。
3. 动态兜底：枚举项内未覆盖的特征，必须使用 \`_custom\` 字段进行补充说明，保持数据的完整性。
4. 逻辑一致性：确保 \`rhythm_and_density\` 与 \`timeline_events\` 的时长统计在数学上自洽。

# STRUCTURED_SCHEMA_DEFINITION
你必须严格按照下方的 JSON 结构输出。对于无法解析的字段，统一填入 null 或 []。新增字段均为可选，不影响已有结构。

{
  "meta_info": {
    "duration": "float, 视频总时长",
    "resolution": "string, 格式如 1080x1920",
    "aspect_ratio": "string, 枚举: 9:16/16:9/1:1/4:5",
    "has_voiceover": "bool",
    "has_bgm": "bool",
    "language": "string|null, ISO 639-1",
    "estimated_fps": "int",
    "file_name_hint": "string|null"
  },
  "narrative_structure": {
    "primary_type": "string, 核心叙事类型",
    "secondary_types": ["string"],
    "custom_type_name": "string|null",
    "custom_description": "string|null",
    "timeline_events": [
      {
        "start": "float", "end": "float",
        "event_name": "string, 标签: hook/problem_agitation/solution_intro/product_detail/usage_demo/testimonial/price/cta/closing",
        "description": "string, 详细动作/文案描述",
        "emotion": "string, 标签: curiosity/anxiety/surprise/joy/trust/urgency/satisfaction/neutral",
        "emotion_custom": "string|null"
      }
    ]
  },
  "visual_and_color": {
    "overall_color_tone": "string, 枚举: warm/cool/neutral/high_contrast/low_contrast",
    "color_curve_description": "string, 色彩流变描述",
    "brightness_curve": "string, 枚举: constant/gradual_increase/gradual_decrease/pulse/dramatic_shift",
    "saturation_curve": "string, 枚举: constant/low_then_high/high_then_low/pulse",
    "glare_highlights": [
      { "time": "float", "type": "string, 枚举: lens_flare/glow_ring/sparkle/light_leak/other", "position": "string", "type_custom": "string|null" }
    ],
    "background_type": "string, 枚举: solid_color/indoor_scene/outdoor_nature/urban_city/studio_cyclorama/blurred_bokeh/product_on_table",
    "background_stability": "string, 枚举: static/slow_pan/dynamic_shaky/scene_cut"
  },
  "audio_and_beats": {
    "bpm": "int|null",
    "strong_beat_timestamps": ["float"],
    "sound_effects": [
      {
        "time": "float",
        "type": "string, 枚举: ding/whoosh/bass_drop/click/swish/pop/crunch/camera_shutter/heartbeat/alarm/other",
        "type_custom": "string|null",
        "material": "string|null, 音源材质，如 aluminum_foil/glass/cloth/none",
        "action": "string|null, 行为，如 drop/rub/sweep/crunch",
        "ambient": "string|null, 环境音，如 office_keyboard/silent_room/city_traffic"
      }
    ],
    "voiceover_style": "string, 枚举: excited/calm_professional/urgent/whisper_intimate/neutral",
    "voiceover_details": {
      "text": "string|null, 旁白原文（如有）",
      "emotion": "string|null, 情绪（焦虑/兴奋/平静等）",
      "tone": "string|null, 语调（rising/falling/flat/wavering）",
      "speed": "string|null, 语速（slow/medium/fast）",
      "voice_character": "string|null, 音色（young_female_energetic/mature_male_calm等）",
      "accent": "string|null, 口音（standard_mandarin/southern_accent等）"
    }
  },
  "camera_and_composition": {
    "composition_pattern": "string, 枚举: center_subject/rule_of_thirds/leading_lines/frame_in_frame/symmetry/negative_space_left/negative_space_right/top_heavy/bottom_heavy",
    "focus_flow_path": [
      { "start_time": "float", "end_time": "float", "from_object": "string", "to_object": "string" }
    ],
    "product_screen_ratio_curve": [
      { "time": "float", "ratio": "float" }
    ],
    "shot_sizes": [
      { "start_time": "float", "end_time": "float", "size": "string, 枚举: extreme_long/long/full/medium/close_up/extreme_close_up" }
    ],
    "camera_movement": "string, 枚举: static/handheld_shaky/smooth_pan/dolly_in/dolly_out/zoom_in/zoom_out/rotation",
    "camera_transitions": [
      { "time": "float, 切镜发生的时间点", "type": "string, 枚举: cut/fade/dissolve/wipe/zoom_through" }
    ],
    "depth_of_field": [
      { "start_time": "float", "end_time": "float", "level": "string, 枚举: shallow/medium/deep" }
    ]
  },
  "marketing_hooks": {
    "comment_triggers": ["string"],
    "tag_friends_text": "string|null",
    "save_guide": "bool",
    "potential_controversy": "string|null",
    "cta_type": "string, 枚举: click_cart/comment_yes_no/swipe_up/go_live/link_in_bio/other",
    "cta_custom": "string|null",
    "urgency_tactic": "string|null, 枚举: limited_stock/flash_sale/expiring_coupon/seasonal/social_proof"
  },
  "rhythm_and_density": {
    "avg_shot_duration": "float",
    "shot_count": "int",
    "avg_words_per_second": "float",
    "peak_info_density_window": ["float", "float"],
    "motion_intensity_curve": "string, 枚举: low/medium/high/increasing/pulsing",
    "text_overlay_density": "string, 枚举: none/sparse/medium/dense"
  },
  "product_fit_info": {
    "original_product_category": "string",
    "product_actions": ["string, 枚举: unscrew/scoop/spray/pour/shake/click/fold/wipe/apply/hold/rotate/other"],
    "action_custom": "string|null",
    "product_shape": "string, 枚举: cylinder/box/bottle/jar/tube/irregular/flat",
    "product_color": "string",
    "human_interaction_type": "string, 枚举: hand_only/full_body/face_expression/none/other",
    "interaction_custom": "string|null",
    "product_motion_trajectory": [
      { "time": "float", "x_percent": "float", "y_percent": "float" }
    ]
  },
  "compliance_risk": {
    "absolute_words": ["string"],
    "risk_level": "string, 枚举: low/medium/high",
    "sensitive_claims": ["string"],
    "risk_reason": "string|null",
    "suggested_replacements": "object"
  },
  "style_aesthetics": {
    "overall_style": "string|null, 风格化标签，如 premium_e_commerce/cyberpunk/ins_vlog/luxury/minimalist",
    "custom_style": "string|null"
  },
  "on_screen_texts": [
    {
      "time": "float, 出现时间",
      "content": "string, 字幕/花字原文",
      "style_hint": "string|null, 如 bold_white_shadow/glow_gold/color_pop"
    }
  ],
  "bgm_details": {
    "genre": "string|null, 枚举: bass_electronic/healing_piano/pop_dance/ambient/other",
    "style": "string|null, 枚举: tense_suspense/dynamic_energetic/calm_relaxing/upbeat_happy",
    "genre_custom": "string|null",
    "style_custom": "string|null"
  },
${CONTENT_STRATEGY_SCHEMA_BLOCK}
}

${CONTENT_STRATEGY_EXECUTION_RULES}

# INPUT DATA
解析当前的视频素材，将提取结果严格填入上述 Schema。如果视频中存在未在定义中列出的关键特征，请务必使用 \`_custom\` 字段进行扩展。若某个新增字段无法提取（如无字幕、无BGM类型），则填入 null 或 []。\`product_motion_trajectory\` 难以追踪时输出空数组 []。`;

export async function POST(request: NextRequest) {
  try {
    const { videoUrl, fileName, projectId } = await request.json();
    console.log('\n========== [Step1] 原子裂解请求 ==========');
    console.log('文件名:', fileName);
    console.log('视频路径:', videoUrl);

    if (!videoUrl) {
      return NextResponse.json({ error: '缺少 videoUrl' }, { status: 400 });
    }

    const { endpoint, apiKey, baseUrl, model } = MODEL_CONFIG.videoAnalysis;
    if (!apiKey || !endpoint) {
      return NextResponse.json({ error: '未配置 DOUBAO_APIKEY 或 DOUBAO_EP' }, { status: 500 });
    }

    // 读取视频文件并转为 base64（豆包 Base64 方式：视频 < 50MB，请求体 < 64MB）
    let videoBase64 = '';
    let analysisFps = 1;
    try {
      const { buffer: videoBuffer, mimeType } = await readLocalAssetBytes(videoUrl);
      console.log('视频 MIME:', mimeType);
      console.log('视频文件大小:', (videoBuffer.length / 1024 / 1024).toFixed(2) + ' MB');
      if (videoBuffer.length > MAX_ANALYZE_VIDEO_BYTES) {
        return NextResponse.json(
          { error: '视频文件不能超过 50MB，长视频请压缩后再解析（建议 2 分钟以内）' },
          { status: 400 }
        );
      }
      videoBase64 = videoBuffer.toString('base64');
      analysisFps = pickVideoAnalysisFps(videoBuffer.length);
      console.log('视频分析采样 fps:', analysisFps);
    } catch (e) {
      const message = e instanceof Error ? e.message : '未知错误';
      console.error('读取视频文件失败:', message);
      return NextResponse.json({ error: `无法读取视频文件: ${message}` }, { status: 500 });
    }

    const doubaoUrl = `${baseUrl}/chat/completions`;
    console.log('调用豆包模型:', model, 'EP:', endpoint);

    const response = await fetch(doubaoUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: endpoint,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'video_url',
                video_url: {
                  url: `data:video/mp4;base64,${videoBase64}`,
                  fps: analysisFps,
                },
              },
              {
                type: 'text',
                text: '请解析当前的视频素材，将提取结果严格填入 Schema。',
              },
            ],
          },
        ],
        temperature: 0.1,
      }),
    });

    let data: { choices?: Array<{ message?: { content?: string } }> };
    try {
      data = await readUpstreamJson(response, '豆包视频解析');
    } catch (e) {
      const message = e instanceof Error ? e.message : '模型调用失败';
      console.error('豆包 API 调用失败:', message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ error: '模型返回为空' }, { status: 500 });
    }

    console.log('\n--- 豆包原始返回内容 ---');
    console.log(content.substring(0, 500) + (content.length > 500 ? '...' : ''));

    // 解析模型返回的 JSON（稳健提取，容忍围栏/解释文字/尾随逗号）
    const parsed = extractJsonObject<Record<string, unknown>>(content);
    if (!parsed) {
      console.error('解析模型返回 JSON 失败:', content.substring(0, 800));
      return NextResponse.json(
        { error: '模型返回格式错误，请重试（可能为模型输出漂移）' },
        { status: 502 }
      );
    }

    // 补充必要字段
    parsed.schema_version = 'video_analysis/v1';
    parsed.job_id = `job_${Date.now()}`;
    parsed.source_uri = videoUrl;

    const narrative = parsed.narrative_structure as { timeline_events?: unknown[] } | undefined;
    console.log('\n--- 最终解析结果（已保存到 analysisResult） ---');
    console.log('meta_info:', JSON.stringify(parsed.meta_info, null, 2));
    console.log('timeline_events 数量:', narrative?.timeline_events?.length || 0);
    console.log('timeline_events:', JSON.stringify(narrative?.timeline_events, null, 2));
    console.log('rhythm_and_density:', JSON.stringify(parsed.rhythm_and_density, null, 2));
    console.log('content_strategy:', JSON.stringify(parsed.content_strategy, null, 2));
    console.log('========================================\n');

    await saveAnalysisResult(projectId, parsed);

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('视频分析失败:', error);
    return NextResponse.json({ error: '分析失败' }, { status: 500 });
  }
}
