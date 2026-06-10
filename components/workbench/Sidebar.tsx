import React from 'react';
import { toast } from 'sonner';
import { useWorkbenchStore, type ActiveTab } from '@/lib/store/workbench-store';
import { Video, Image as ImageIcon, FileText, Film, ChevronRight, Check, Lock } from 'lucide-react';

const TABS: Array<{ id: ActiveTab; label: string; icon: React.ReactNode }> = [
  { id: 'reference', label: '参考视频解析', icon: <Video className="w-4 h-4" /> },
  { id: 'product', label: '商品多模态', icon: <ImageIcon className="w-4 h-4" /> },
  { id: 'script', label: '剧本编排', icon: <FileText className="w-4 h-4" /> },
  { id: 'render', label: '视频生成', icon: <Film className="w-4 h-4" /> },
];

export default function Sidebar() {
  const activeTab = useWorkbenchStore((s) => s.activeTab);
  const setActiveTab = useWorkbenchStore((s) => s.setActiveTab);
  const analysisResult = useWorkbenchStore((s) => s.analysisResult);
  const parsedProduct = useWorkbenchStore((s) => s.parsedProduct);
  const scriptManifest = useWorkbenchStore((s) => s.scriptManifest);
  const generatedVideoUrl = useWorkbenchStore((s) => s.generatedVideoUrl);

  // 各步完成状态
  const done: Record<ActiveTab, boolean> = {
    reference: Boolean(analysisResult),
    product: Boolean(parsedProduct),
    script: Boolean(scriptManifest),
    render: Boolean(generatedVideoUrl),
  };

  // 前置未满足则锁定（给出"去补齐"提示）
  const lockReason: Partial<Record<ActiveTab, string>> = {
    script: !analysisResult
      ? '请先完成参考视频解析'
      : !parsedProduct
      ? '请先在「商品多模态」解析商品特征'
      : undefined,
    render: !scriptManifest ? '请先在「剧本编排」生成剧本' : undefined,
  };

  const handleClick = (tab: ActiveTab) => {
    const reason = lockReason[tab];
    if (reason) {
      toast.info(reason);
      return;
    }
    setActiveTab(tab);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/10">
        <div className="text-xs font-medium text-white/50 mb-3 uppercase tracking-wider">
          工作流
        </div>
        <div className="space-y-1">
          {TABS.map((tab, idx) => {
            const isActive = activeTab === tab.id;
            const isDone = done[tab.id];
            const isLocked = Boolean(lockReason[tab.id]);
            return (
              <button
                key={tab.id}
                onClick={() => handleClick(tab.id)}
                title={lockReason[tab.id]}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-[#00F0FF]/10 text-[#00F0FF]'
                    : isLocked
                    ? 'text-white/30 hover:bg-white/5'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/5 text-[10px] font-mono shrink-0">
                    {isDone ? <Check className="w-3 h-3 text-[#22C55E]" /> : idx + 1}
                  </span>
                  {tab.icon}
                  {tab.label}
                </div>
                {isLocked ? (
                  <Lock className="w-3.5 h-3.5 opacity-50" />
                ) : isActive ? (
                  <ChevronRight className="w-4 h-4 opacity-50" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        <div className="text-xs font-medium text-white/50 mb-3 uppercase tracking-wider">
          项目大纲
        </div>
        {analysisResult?.narrative_structure?.timeline_events ? (
          <div className="space-y-2">
            {analysisResult.narrative_structure.timeline_events.map((ev, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00F0FF] mt-1.5 shrink-0" />
                <div>
                  <div className="text-white/80">{ev.event_name}</div>
                  <div className="text-white/40 font-mono text-[10px]">
                    {ev.start.toFixed(1)}s - {ev.end.toFixed(1)}s
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-white/30">
            暂无大纲，请先解析参考视频
          </div>
        )}
      </div>
    </div>
  );
}
