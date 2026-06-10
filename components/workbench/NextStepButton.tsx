"use client";

import { ArrowRight } from "lucide-react";
import { useWorkbenchStore, type ActiveTab } from "@/lib/store/workbench-store";

/** 全局「下一步」引导：把当前最该做的动作显性化 */
export default function NextStepButton() {
  const activeTab = useWorkbenchStore((s) => s.activeTab);
  const setActiveTab = useWorkbenchStore((s) => s.setActiveTab);
  const analysisResult = useWorkbenchStore((s) => s.analysisResult);
  const parsedProduct = useWorkbenchStore((s) => s.parsedProduct);
  const scriptManifest = useWorkbenchStore((s) => s.scriptManifest);

  let target: ActiveTab | null = null;
  let label = "";

  if (activeTab === "reference" && analysisResult) {
    target = "product";
    label = "下一步：商品多模态";
  } else if (activeTab === "product" && parsedProduct) {
    target = "script";
    label = "下一步：剧本编排";
  } else if (activeTab === "script" && scriptManifest) {
    target = "render";
    label = "下一步：视频生成";
  }

  if (!target) return null;

  return (
    <button
      type="button"
      onClick={() => setActiveTab(target as ActiveTab)}
      className="absolute bottom-5 right-6 z-40 cta-button px-5 py-2.5 rounded-full font-medium text-sm flex items-center gap-2 shadow-lg shadow-[#00F0FF]/10"
    >
      {label}
      <ArrowRight className="w-4 h-4" />
    </button>
  );
}
