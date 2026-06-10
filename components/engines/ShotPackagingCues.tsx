"use client";

import {
  hasScriptPackaging,
  SCRIPT_PACKAGING_LABELS,
  type ScriptShotPackaging,
} from "@/lib/packaging-cues";
import ExpandableText from "@/components/ui/ExpandableText";

interface ShotPackagingCuesProps {
  packaging?: ScriptShotPackaging | null;
  compact?: boolean;
}

/** 镜头级包装对照：展示剧本 Markdown 中的包装字段（非样例视频解析） */
export default function ShotPackagingCues({
  packaging,
  compact = true,
}: ShotPackagingCuesProps) {
  if (!hasScriptPackaging(packaging)) return null;

  const textSize = compact ? "text-[10px]" : "text-xs";

  return (
    <div className={`mt-1.5 pt-1.5 border-t border-white/5 space-y-1 ${textSize}`}>
      <div className="text-white/35">包装对照</div>
      {SCRIPT_PACKAGING_LABELS.map(({ key, label }) => {
        const value = packaging?.[key]?.trim();
        if (!value) return null;
        return (
          <div key={key} className="grid grid-cols-[4.5rem,minmax(0,1fr)] gap-2 text-white/55 leading-relaxed">
            <span className="text-white/35">{label}</span>
            <ExpandableText text={value} lines={compact ? 1 : 2} />
          </div>
        );
      })}
    </div>
  );
}
