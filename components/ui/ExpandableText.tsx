"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface ExpandableTextProps {
  text?: string | null;
  empty?: string;
  lines?: 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
  buttonClassName?: string;
  initiallyExpanded?: boolean;
}

const LINE_CLAMP_CLASS: Record<NonNullable<ExpandableTextProps["lines"]>, string> = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
  5: "line-clamp-5",
  6: "line-clamp-6",
};

export default function ExpandableText({
  text,
  empty = "暂无内容",
  lines = 2,
  className = "",
  buttonClassName = "",
  initiallyExpanded = false,
}: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const value = text?.trim() ?? "";
  const shouldToggle = value.length > 34;
  const clampClass = expanded ? "" : LINE_CLAMP_CLASS[lines];

  if (!value) {
    return <span className={`text-white/25 ${className}`}>{empty}</span>;
  }

  return (
    <span className={`block min-w-0 ${className}`}>
      <span title={value} className={`block whitespace-pre-wrap break-words ${clampClass}`}>
        {value}
      </span>
      {shouldToggle && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className={`mt-1 inline-flex items-center gap-1 text-[10px] text-[#00F0FF]/80 hover:text-[#00F0FF] ${buttonClassName}`}
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {expanded ? "收起" : "展开全文"}
        </button>
      )}
    </span>
  );
}
