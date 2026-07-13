"use client";

import {
  SCRIPT_VERSION_OPTIONS,
  versionKeyOf,
} from "@/lib/script-version-options";
import type { SavedScriptVersion } from "@/lib/store/workbench-store";
import type { ScriptVersionType } from "@/lib/types/pipeline";

interface ScriptVersionBarProps {
  scriptVersions: SavedScriptVersion[];
  activeVersionId: string | null;
  isGenerating: boolean;
  onSwitch: (id: string) => void;
  onGenerate: (type: ScriptVersionType | undefined) => void;
}

/** 阶段③ · 多版本剧本切换与补生成 */
export default function ScriptVersionBar({
  scriptVersions,
  activeVersionId,
  isGenerating,
  onSwitch,
  onGenerate,
}: ScriptVersionBarProps) {
  const availableKeys = new Set(
    scriptVersions.map((v) => versionKeyOf(v.versionType))
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-sm font-medium text-white/70 mb-3">剧本版本</div>
      <div className="flex flex-wrap gap-2">
        {scriptVersions.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onSwitch(v.id)}
            disabled={isGenerating || v.id === activeVersionId}
            className={`text-xs px-3 py-2 rounded-lg border transition-all disabled:opacity-50 ${
              v.id === activeVersionId
                ? "border-[#00F0FF] bg-[#00F0FF]/10 text-[#00F0FF]"
                : "border-white/10 bg-white/5 text-white/60 hover:text-white hover:border-white/30"
            }`}
          >
            {v.label}
          </button>
        ))}
        {SCRIPT_VERSION_OPTIONS.filter(
          (o) => !availableKeys.has(o.value)
        ).map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onGenerate(o.value)}
            disabled={isGenerating}
            className="text-xs px-3 py-2 rounded-lg border border-dashed border-white/15 text-white/40 hover:text-[#00F0FF] hover:border-[#00F0FF]/40 transition-all disabled:opacity-50"
          >
            + {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
