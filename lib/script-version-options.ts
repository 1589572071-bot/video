import type { ScriptVersionType } from "@/lib/types/pipeline";

export const SCRIPT_VERSION_OPTIONS: Array<{
  value: ScriptVersionType;
  label: string;
}> = [
  { value: "high_click", label: "高点击版" },
  { value: "high_conversion", label: "高转化版" },
  { value: "high_pace", label: "高节奏版" },
  { value: "high_quality", label: "高质感版" },
];

const DEFAULT_KEY = "default";

export function versionKeyOf(type: ScriptVersionType | undefined): string {
  return type ?? DEFAULT_KEY;
}

export function versionLabelOf(type: ScriptVersionType | undefined): string {
  if (!type) return "默认版";
  return SCRIPT_VERSION_OPTIONS.find((o) => o.value === type)?.label ?? type;
}
