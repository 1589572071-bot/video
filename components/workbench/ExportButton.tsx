"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useWorkbenchStore } from "@/lib/store/workbench-store";

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildMarkdown(state: ReturnType<typeof useWorkbenchStore.getState>): string {
  const { generatedScript, scriptManifest, gapPlan, parsedProduct, uploadedFileName } = state;
  const lines: string[] = [];
  lines.push(`# MetaCut 导出交付物`);
  lines.push("");
  lines.push(`- 导出时间：${new Date().toLocaleString()}`);
  if (uploadedFileName) lines.push(`- 参考样例：${uploadedFileName}`);
  if (parsedProduct?.product_name) lines.push(`- 商品：${String(parsedProduct.product_name)}`);
  if (scriptManifest?.version_type) lines.push(`- 版本：${scriptManifest.version_type}`);
  lines.push("");

  if (scriptManifest?.blocks?.length) {
    lines.push(`## 分镜时间线`);
    lines.push("");
    lines.push(`| 区块 | 镜头 | 时间 | 叙事阶段 | 素材来源 | 阶段说明 |`);
    lines.push(`| --- | --- | --- | --- | --- | --- |`);
    for (const b of scriptManifest.blocks) {
      for (const s of b.shots) {
        lines.push(
          `| ${b.index} | ${s.index} | ${s.start.toFixed(1)}-${s.end.toFixed(1)}s | ${s.narrative_stage} | ${s.asset_source ?? "-"} | ${(s.stage_brief ?? "").replace(/\n/g, " ")} |`
        );
      }
    }
    lines.push("");
  }

  if (gapPlan?.gaps?.length) {
    lines.push(`## 素材缺口与补全`);
    lines.push("");
    for (const g of gapPlan.gaps) {
      lines.push(`- **${g.code}**（${g.severity}）：${g.description}`);
    }
    lines.push("");
  }

  if (generatedScript) {
    lines.push(`## 剧本全文`);
    lines.push("");
    lines.push(generatedScript);
  }

  return lines.join("\n");
}

/** 一键导出脚本(md) + 项目结构(json)，支撑可验证交付与断点续作 */
export default function ExportButton() {
  const [open, setOpen] = useState(false);

  const doExport = (kind: "md" | "json" | "both") => {
    const state = useWorkbenchStore.getState();
    if (!state.scriptManifest) {
      toast.error("请先生成剧本后再导出");
      return;
    }
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

    if (kind === "md" || kind === "both") {
      downloadBlob(`metacut-script-${ts}.md`, buildMarkdown(state), "text/markdown");
    }
    if (kind === "json" || kind === "both") {
      const payload = {
        exportedAt: new Date().toISOString(),
        referenceFile: state.uploadedFileName,
        analysis: state.analysisResult,
        product: state.parsedProduct,
        scriptManifest: state.scriptManifest,
        gapPlan: state.gapPlan,
        versions: state.scriptVersions,
        assets: {
          coverImage: (state.scriptManifest as { cover_image_url?: string } | null)?.cover_image_url ?? null,
          featureCard: (state.scriptManifest as { feature_card_url?: string } | null)?.feature_card_url ?? null,
          generatedVideo: state.generatedVideoUrl,
          chunkVideos: state.chunkVideos,
        },
      };
      downloadBlob(`metacut-project-${ts}.json`, JSON.stringify(payload, null, 2), "application/json");
    }
    setOpen(false);
    toast.success("已导出交付物");
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-white/60 hover:text-white flex items-center gap-1.5"
      >
        <Download className="w-4 h-4" /> 导出
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 min-w-[180px] bg-[#1A1F2A] border border-white/10 rounded-xl shadow-lg py-1">
            <button className="w-full text-left px-3 py-2 text-xs text-white/70 hover:bg-white/5" onClick={() => doExport("both")}>
              全部导出（MD + JSON）
            </button>
            <button className="w-full text-left px-3 py-2 text-xs text-white/70 hover:bg-white/5" onClick={() => doExport("md")}>
              仅导出脚本（Markdown）
            </button>
            <button className="w-full text-left px-3 py-2 text-xs text-white/70 hover:bg-white/5" onClick={() => doExport("json")}>
              仅导出项目结构（JSON）
            </button>
          </div>
        </>
      )}
    </div>
  );
}
