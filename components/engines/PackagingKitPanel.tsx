"use client";

import { useState } from "react";
import { Sparkles, Image as ImageIcon, Tag, Type, Wand2, Shuffle } from "lucide-react";
import type { ScriptManifest, ProductInput } from "@/lib/types/pipeline";
import ExpandableText from "@/components/ui/ExpandableText";
import { previewAssetUrl } from "@/lib/client-asset-preview";

interface PackagingKitPanelProps {
  manifest: ScriptManifest | null;
  product: ProductInput | null;
  transitionCount?: number;
  isGenerating?: boolean;
  onGenerateAll?: () => void;
  onRegenerate?: (type: "cover" | "feature_card", prompt: string) => void;
  className?: string;
}

function CueCard({
  icon,
  title,
  items,
  empty,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="bg-[#131821] rounded-xl border border-white/5 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-white/70 mb-2">
        {icon}
        {title}
      </div>
      {items.length > 0 ? (
        <ul className="space-y-1">
          {items.slice(0, 4).map((t, i) => (
            <li key={i} className="text-[11px] text-white/60 leading-snug flex gap-1.5">
              <span className="text-[#00F0FF]/50">·</span>
              <ExpandableText text={t} lines={2} className="flex-1" />
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-[11px] text-white/30">{empty}</div>
      )}
    </div>
  );
}

/** 画面包装套件：封面 / 标题条 / 卖点卡 / 贴纸 / 转场 集中可调 */
export default function PackagingKitPanel({
  manifest,
  product,
  transitionCount = 0,
  isGenerating = false,
  onGenerateAll,
  onRegenerate,
  className = "",
}: PackagingKitPanelProps) {
  const shots = manifest?.blocks?.flatMap((b) => b.shots) ?? [];
  const sellingPoints = (product?.core_selling_points as string[] | undefined) ?? [];
  const onScreenTexts = shots
    .map((s) => s.packaging?.on_screen_text)
    .filter((t): t is string => Boolean(t && t.trim()));
  const stickers = shots
    .map((s) => s.packaging?.visual_interaction)
    .filter((t): t is string => Boolean(t && t.trim()));

  const [coverPrompt, setCoverPrompt] = useState("");
  const [featurePrompt, setFeaturePrompt] = useState("");

  const coverUrl = (manifest as { cover_image_url?: string } | null)?.cover_image_url;
  const featureUrl = (manifest as { feature_card_url?: string } | null)?.feature_card_url;

  return (
    <div className={`bg-black/20 rounded-2xl p-5 border border-[#00F0FF]/20 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-medium text-[#00F0FF] flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> 画面包装套件
        </div>
        {onGenerateAll && (
          <button
            type="button"
            onClick={onGenerateAll}
            disabled={isGenerating}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/30 hover:bg-[#00F0FF]/20 transition-colors disabled:opacity-50"
          >
            {isGenerating ? "生成中…" : "一键生成封面+卖点卡"}
          </button>
        )}
      </div>

      {/* 封面 + 卖点卡（可调 prompt 重生成） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-4">
        {[
          { type: "cover" as const, title: "视频封面", url: coverUrl, prompt: coverPrompt, setPrompt: setCoverPrompt, ph: "只描述底图氛围，如：清爽桌面自然光、商品居中留白" },
          { type: "feature_card" as const, title: "卖点卡片", url: featureUrl, prompt: featurePrompt, setPrompt: setFeaturePrompt, ph: "只描述底图氛围，如：干净编辑页、左侧信息留白" },
        ].map((item) => (
          <div key={item.type} className="bg-[#131821] rounded-xl border border-white/5 p-3 space-y-2">
            <div className="text-xs font-medium text-white/70 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-[#00F0FF]" /> {item.title}
            </div>
            <div className="bg-black/40 rounded-lg overflow-hidden border border-white/5 aspect-[9/16] max-h-72 flex items-center justify-center">
              {item.url ? (
                <img src={previewAssetUrl(item.url)} alt={item.title} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[11px] text-white/30">尚未生成</span>
              )}
            </div>
            <input
              value={item.prompt}
              onChange={(e) => item.setPrompt(e.target.value)}
              placeholder={item.ph}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-white/80 placeholder:text-white/25 focus:outline-none focus:border-[#00F0FF]/40"
            />
            <button
              type="button"
              onClick={() => onRegenerate?.(item.type, item.prompt)}
              disabled={isGenerating}
              className="w-full text-[11px] py-1.5 rounded-lg border border-[#00F0FF]/30 text-[#00F0FF] hover:bg-[#00F0FF]/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Wand2 className="w-3 h-3" /> {item.url ? "重新生成" : "生成"}
            </button>
          </div>
        ))}
      </div>

      {/* 文案/贴纸/转场建议 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <CueCard icon={<Type className="w-3.5 h-3.5 text-[#F5B041]" />} title="标题条 / 花字" items={onScreenTexts} empty="暂无花字建议" />
        <CueCard icon={<Tag className="w-3.5 h-3.5 text-[#22C55E]" />} title="卖点卡文案" items={sellingPoints} empty="暂无卖点" />
        <CueCard icon={<Sparkles className="w-3.5 h-3.5 text-[#A78BFA]" />} title="贴纸 / 交互" items={stickers} empty="暂无贴纸建议" />
        <CueCard
          icon={<Shuffle className="w-3.5 h-3.5 text-[#00F0FF]" />}
          title="转场建议"
          items={transitionCount > 0 ? [`样例含 ${transitionCount} 处转场，建议在区块切点沿用同款节奏`] : []}
          empty="暂无转场参考"
        />
      </div>
    </div>
  );
}
