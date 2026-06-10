"use client";

import type { ImitationComparisonBlock } from "@/lib/script-imitation-parser";

interface ImitationComparisonPanelProps {
  block: ImitationComparisonBlock | null;
  className?: string;
}

/** Step3 仿写对照展示 */
export default function ImitationComparisonPanel({
  block,
  className = "",
}: ImitationComparisonPanelProps) {
  if (!block) return null;

  return (
    <div className={`bg-[#131821] rounded-xl p-3 text-xs ${className}`}>
      <div className="text-[#00F0FF] font-medium mb-3">仿写对照</div>

      {block.preserve_structure && (
        <div className="mb-2 rounded-lg bg-white/[0.03] border border-white/5 p-2.5">
          <div className="text-white/50 mb-1">保留结构</div>
          <p className="text-white/75 leading-relaxed">{block.preserve_structure}</p>
        </div>
      )}

      {block.replace_content && (
        <div className="mb-2 rounded-lg bg-white/[0.03] border border-white/5 p-2.5">
          <div className="text-white/50 mb-1">替换内容</div>
          <p className="text-white/75 leading-relaxed">{block.replace_content}</p>
        </div>
      )}

      {block.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-white/40 border-b border-white/10">
                <th className="py-1.5 pr-2 font-normal">维度</th>
                <th className="py-1.5 pr-2 font-normal">原视频</th>
                <th className="py-1.5 font-normal">新商品</th>
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={`${row.dimension}-${i}`} className="border-b border-white/5">
                  <td className="py-2 pr-2 text-[#00F0FF]/80 whitespace-nowrap">
                    {row.dimension}
                  </td>
                  <td className="py-2 pr-2 text-white/60">{row.original}</td>
                  <td className="py-2 text-white/75">{row.adapted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
