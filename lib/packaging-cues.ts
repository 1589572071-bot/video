import type { ScriptShotPackaging } from "@/lib/types/pipeline";

export type { ScriptShotPackaging };

export const SCRIPT_PACKAGING_LABELS: Array<{
  key: keyof ScriptShotPackaging;
  label: string;
}> = [
  { key: "shot_language", label: "镜头语言" },
  { key: "visual_interaction", label: "画面交互" },
  { key: "narrative_content", label: "叙事内容" },
  { key: "voice_script", label: "口播文案" },
  { key: "voiceover", label: "人声" },
  { key: "sound_effects", label: "音效" },
  { key: "bgm", label: "背景音乐" },
  { key: "on_screen_text", label: "屏幕花字" },
];

export function hasScriptPackaging(packaging?: ScriptShotPackaging | null): boolean {
  if (!packaging) return false;
  return SCRIPT_PACKAGING_LABELS.some(({ key }) => {
    const value = packaging[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

/** 区块级剧本包装摘要 */
export function getBlockScriptPackagingSummary(
  shots: Array<{ packaging?: ScriptShotPackaging | null }>
): string | null {
  const counts = {
    shot_language: 0,
    on_screen_text: 0,
    voice_script: 0,
    voiceover: 0,
    sound_effects: 0,
    bgm: 0,
  };

  for (const shot of shots) {
    const p = shot.packaging;
    if (!p) continue;
    if (p.shot_language?.trim()) counts.shot_language++;
    if (p.on_screen_text?.trim()) counts.on_screen_text++;
    if (p.voice_script?.trim()) counts.voice_script++;
    if (p.voiceover?.trim()) counts.voiceover++;
    if (p.sound_effects?.trim()) counts.sound_effects++;
    if (p.bgm?.trim()) counts.bgm++;
  }

  const parts: string[] = [];
  if (counts.shot_language) parts.push(`镜头语言 ${counts.shot_language} 镜`);
  if (counts.on_screen_text) parts.push(`花字 ${counts.on_screen_text} 镜`);
  if (counts.voice_script) parts.push(`口播 ${counts.voice_script} 镜`);
  if (counts.voiceover) parts.push(`人声 ${counts.voiceover} 镜`);
  if (counts.sound_effects) parts.push(`音效 ${counts.sound_effects} 镜`);
  if (counts.bgm) parts.push(`BGM ${counts.bgm} 镜`);

  return parts.length ? parts.join(" · ") : null;
}
