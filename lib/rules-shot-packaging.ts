import type { ProductInput, ScriptShotPackaging, TimelineEvent } from "./types/pipeline";

interface RulesPackagingContext {
  subject: string;
  situation: string;
  baseMotion: string;
  name: string;
  pain: string;
  gain: string;
  points: string[];
  usage: string;
  visualDescription: string;
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return t.slice(0, max);
}

function cleanOverlaySource(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^(屏幕花字|花字|字幕|口播文案|人声|口播|旁白)\s*[:：]\s*/, "")
    .replace(/[“”"]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function isBrokenOverlayClause(text: string): boolean {
  if (/^(解决|改善|针对|满足).{5,}$/.test(text)) return true;
  if (/(找不|无法|可以|不同)$/.test(text)) return true;
  if (/人群/.test(text) && text.length > 8) return true;
  return false;
}

function splitCompleteClauses(text: string): string[] {
  return cleanOverlaySource(text)
    .split(/[\/｜|；;。.!！?？，,、\n\r]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && part.length <= 8)
    .filter((part) => !isBrokenOverlayClause(part));
}

function semanticOverlayFallback(source: string, fallback: string): string {
  const clean = cleanOverlaySource(source);
  if (/断发|断裂|易断/.test(clean)) return "还在断发?";
  if (/发质|人群/.test(clean)) return "适配发质";
  if (/干枯|毛躁|炸毛/.test(clean)) return "发丝干枯?";
  if (/粘腻|黏腻|油腻/.test(clean)) return "拒绝黏腻";
  if (/顺滑|亮泽|光泽|发光/.test(clean)) return "顺滑亮泽";
  if (/修护|强韧|韧性|发根/.test(clean)) return "强韧修护";
  if (/补水|保湿|水润/.test(clean)) return "水润保湿";
  if (/持久|耐用|长效/.test(clean)) return "持久在线";
  if (/便携|轻便|随身/.test(clean)) return "随手好用";
  if (/香|香气|留香/.test(clean)) return "香气在线";

  const fallbackClean = cleanOverlaySource(fallback);
  const fallbackClause = splitCompleteClauses(fallbackClean)[0];
  return fallbackClause || "亮点清晰";
}

function makeShortOverlayText(source: string, fallback: string): string {
  const exact = splitCompleteClauses(source)[0];
  if (exact) return exact;
  return semanticOverlayFallback(source, fallback);
}

function narrativeRole(stage: string, emotion?: string): string {
  const byStage: Record<string, string> = {
    hook: "建立痛点",
    problem_agitation: "放大痛点",
    solution_intro: "引发好奇",
    product_detail: "展示卖点",
    usage_demo: "演示用法",
    testimonial: "增强信任",
    price: "推动决策",
    cta: "推动行动",
    closing: "收束记忆",
  };
  if (byStage[stage]) return byStage[stage];
  if (emotion === "anxiety") return "建立痛点";
  if (emotion === "curiosity") return "引发好奇";
  return "展示爽点/满足";
}

function pickPoint(points: string[], shotIndex: number, fallback: string): string {
  if (!points.length) return fallback;
  return points[(shotIndex - 1) % points.length] ?? points[0] ?? fallback;
}

/** 规则引擎 fallback：按 narrative_stage 生成差异化的镜头包装（避免每镜相同模板） */
export function buildRulesStagePackaging(
  event: TimelineEvent,
  product: ProductInput,
  shotIndex: number,
  ctx: RulesPackagingContext
): ScriptShotPackaging {
  const stage = event.event_name;
  const role = narrativeRole(stage, event.emotion);
  const point = pickPoint(ctx.points, shotIndex, "核心卖点");
  const productName = ctx.name;
  const visual = ctx.visualDescription || productName;

  const styleSuffix = "暖黄光晕 + 霓虹高光";
  let shotLanguage = "Cut + 浅景深";
  let visualInteraction = "";
  let narrativeScene = "";
  let voiceContent = "";
  let onScreen = "";

  switch (stage) {
    case "hook":
      shotLanguage = "快切 + 浅景深";
      visualInteraction = `${ctx.subject} + 近景面对镜头 + 停顿抓注意力 + ${styleSuffix}`;
      narrativeScene = `近景 + ${ctx.subject} + 面对镜头皱眉`;
      voiceContent = ctx.pain;
      onScreen = makeShortOverlayText(ctx.pain, "还在困扰?");
      break;
    case "problem_agitation":
      shotLanguage = "Cut + 浅景深";
      visualInteraction = `${ctx.subject} + ${ctx.situation} + 抓发/摇头放大焦虑 + ${styleSuffix}`;
      narrativeScene = `中景 + ${ctx.subject} + 展示困扰状态`;
      voiceContent = ctx.pain;
      onScreen = makeShortOverlayText(ctx.pain, "痛点放大");
      break;
    case "solution_intro":
      shotLanguage = "Match Cut + 浅景深";
      visualInteraction = `${visual} + ${ctx.situation} + 产品入镜 appear + ${styleSuffix}`;
      narrativeScene = `中景 + ${visual} + 缓慢入画`;
      voiceContent = `试试${productName}`;
      onScreen = makeShortOverlayText(productName, "新品亮相");
      break;
    case "product_detail":
      shotLanguage = "Push In + 浅景深";
      visualInteraction = `${visual} + 产品特写 + 缓慢 rotate + ${styleSuffix}`;
      narrativeScene = `特写 + ${visual} + 旋转展示外观`;
      voiceContent = point;
      onScreen = makeShortOverlayText(point, "核心卖点");
      break;
    case "usage_demo":
      shotLanguage = "Cut + 浅景深";
      visualInteraction = `${ctx.subject} + ${ctx.situation} + ${ctx.baseMotion} + ${styleSuffix}`;
      narrativeScene = `中近景 + ${ctx.subject} + ${truncate(ctx.usage, 16)}`;
      voiceContent = truncate(ctx.usage, 24) || point;
      onScreen = makeShortOverlayText(ctx.usage || point, "用法清晰");
      break;
    case "testimonial":
      shotLanguage = "Cut + 浅景深";
      visualInteraction = `${ctx.subject} + 满意表情 + 竖拇指/点头 + ${styleSuffix}`;
      narrativeScene = `中景 + ${ctx.subject} + 展示使用满意`;
      voiceContent = `用了${productName}真的不一样`;
      onScreen = makeShortOverlayText(point, "效果看得见");
      break;
    case "price":
      shotLanguage = "Cut + 浅景深";
      visualInteraction = `${visual} + 价格标签/优惠卡 + zoom_in + ${styleSuffix}`;
      narrativeScene = `特写 + ${visual} + 强调优惠`;
      voiceContent = truncate(ctx.gain, 20);
      onScreen = makeShortOverlayText(ctx.gain, "入手正好");
      break;
    case "cta":
      shotLanguage = "快切 + 浅景深";
      visualInteraction = `${visual} + ${ctx.situation} + 指向购买/下单手势 + ${styleSuffix}`;
      narrativeScene = `近景 + ${visual} + 行动号召`;
      voiceContent = ctx.gain;
      onScreen = makeShortOverlayText(ctx.gain, "现在就选");
      break;
    case "closing":
      shotLanguage = "Fade + 浅景深";
      visualInteraction = `${visual} + 品牌 logo 区 + 静态展示 + ${styleSuffix}`;
      narrativeScene = `特写 + ${visual} + 品牌收束`;
      voiceContent = truncate(productName, 16);
      onScreen = makeShortOverlayText(productName, "记住这款");
      break;
    default:
      visualInteraction = `${ctx.subject} + ${ctx.situation} + ${ctx.baseMotion} + ${styleSuffix}`;
      narrativeScene = `中景 + ${ctx.subject} + ${ctx.situation}`;
      voiceContent = point;
      onScreen = makeShortOverlayText(point, "亮点清晰");
  }

  const emotionTag =
    event.emotion === "anxiety" ? "疲惫" : event.emotion === "curiosity" ? "好奇" : "满足";

  return {
    shot_language: shotLanguage,
    visual_interaction: visualInteraction,
    narrative_content: `${narrativeScene}；${role}`,
    voice_script: voiceContent,
    voiceover: `${emotionTag} + 明亮 + 中速 + 成熟女声 + 普通话`,
    sound_effects: stage === "hook" ? "心跳 + 低频氛围 + 环境音" : "环境音 + 低频氛围 + 环境音",
    bgm: "Lo-fi Chillhop + 慵懒夜间氛围",
    on_screen_text: onScreen,
  };
}

export function buildRulesNarrativeContent(
  event: TimelineEvent,
  degradedNarrative: string | undefined,
  packaging: ScriptShotPackaging
): string {
  if (degradedNarrative?.trim()) return degradedNarrative;
  return packaging.narrative_content ?? `中景；${narrativeRole(event.event_name, event.emotion)}`;
}
