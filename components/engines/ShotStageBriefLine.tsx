"use client";

import { useState } from "react";
import { ChevronRight, Undo2, X } from "lucide-react";
import { formatNarrativeStage } from "@/lib/narrative-stage-labels";

interface ShotStageBriefLineProps {
  stage: string;
  brief: string;
  onSave: (brief: string) => void;
  compact?: boolean;
  className?: string;
}

/** 叙事阶段 + 可编辑说明，如「开场钩子：突出卡诗…」 */
export default function ShotStageBriefLine({
  stage,
  brief,
  onSave,
  compact = false,
  className = "",
}: ShotStageBriefLineProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(brief);
  const [originalDraft, setOriginalDraft] = useState(brief);

  const openEditor = () => {
    setDraft(brief);
    setOriginalDraft(brief);
    setOpen(true);
  };

  const revertDraft = () => setDraft(originalDraft);
  const draftDirty = draft !== originalDraft;

  const save = () => {
    onSave(draft.trim());
    setOpen(false);
  };

  const clear = () => {
    onSave("");
    setDraft("");
    setOpen(false);
  };

  const label = formatNarrativeStage(stage);
  const displayBrief = brief.trim() || "点击补充本镜说明";

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        className={`w-full text-left rounded-lg border border-white/10 bg-[#1A1F2A]/80 hover:border-[#00F0FF]/40 transition-colors group ${compact ? "px-2 py-1" : "px-2.5 py-1.5"} ${className}`}
      >
        <div className={`flex items-start gap-1 ${compact ? "text-[10px]" : "text-xs"}`}>
          <span className="text-[#00F0FF]/90 shrink-0">{label}：</span>
          <span
            title={displayBrief}
            className={`flex-1 whitespace-pre-wrap break-words ${brief ? "text-white/75" : "text-white/30 italic"} ${
              compact ? "line-clamp-2" : "line-clamp-3"
            }`}
          >
            {displayBrief}
          </span>
          <ChevronRight className="w-3 h-3 text-white/20 group-hover:text-[#00F0FF]/60 shrink-0 mt-0.5" />
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-md bg-[#131821] border border-[#00F0FF]/30 rounded-2xl shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="text-sm font-medium text-[#00F0FF]">编辑 · {label}</span>
              <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-white/10 text-white/50">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4">
              <textarea
                autoFocus
                className="w-full min-h-[100px] bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-sm text-white/90 resize-y focus:outline-none focus:border-[#00F0FF]/50"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`${label}：…`}
              />
            </div>
            <div className="flex justify-between gap-2 px-4 py-3 border-t border-white/10">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={revertDraft}
                  disabled={!draftDirty}
                  title="撤销本次编辑"
                  className="flex items-center gap-1 text-xs px-3 py-2 rounded-lg border border-white/15 text-white/50 hover:text-white/70 disabled:opacity-40"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  回退
                </button>
                <button
                  type="button"
                  onClick={clear}
                  className="text-xs px-3 py-2 rounded-lg border border-white/15 text-white/50 hover:text-white/70"
                >
                  清除说明
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs px-4 py-2 rounded-lg border border-white/15 text-white/60"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={save}
                  className="text-xs px-4 py-2 rounded-lg bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/40"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
