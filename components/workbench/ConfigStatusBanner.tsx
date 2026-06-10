"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfigStatus {
  doubao: boolean;
  bailian: boolean;
  renderMock: boolean;
  ffmpeg: boolean;
  subtitleFilter?: boolean;
  cjkFont?: boolean;
  textOverlay?: boolean;
  publicOriginValid: boolean;
  database: boolean;
  objectStorage: boolean;
  reviewAuth: boolean;
}

export default function ConfigStatusBanner() {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/config/status")
      .then((r) => r.json())
      .then((d) => alive && setStatus(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!status || dismissed) return null;

  const warnings: string[] = [];
  if (!status.doubao) warnings.push("未配置 DOUBAO_APIKEY/DOUBAO_EP，视频解析与剧本生成将不可用");
  if (status.renderMock) warnings.push("渲染处于 Mock 模式（缺少 DASHSCOPE_API_KEY），成片为占位示例");
  if (!status.ffmpeg) warnings.push("未检测到 FFmpeg，多区块成片无法自动拼接");
  if (!status.renderMock && status.ffmpeg && !status.textOverlay) {
    if (!status.subtitleFilter) {
      warnings.push("当前 FFmpeg 不支持 subtitles/libass，成片无法烧录花字/字幕");
    } else if (!status.cjkFont) {
      warnings.push("未检测到中文字体，成片无法烧录中文花字/字幕（建议安装 fonts-noto-cjk）");
    }
  }
  if (!status.database) warnings.push("未配置 DATABASE_URL，项目和渲染任务无法跨重启恢复");
  if (!status.objectStorage) warnings.push("未配置对象存储，上传与生成资产将回退到本地文件");
  if (!status.reviewAuth) warnings.push("未配置 METACUT_REVIEW_ACCESS_CODE，公网入口没有访问码保护");
  if (status.bailian && !status.objectStorage && !status.publicOriginValid)
    warnings.push("METACUT_PUBLIC_ORIGIN 未配置为公网地址，本地 /uploads 素材代理可能无法被模型拉取");

  if (warnings.length === 0) return null;

  return (
    <div className="bg-[#F5B041]/10 border border-[#F5B041]/30 text-[#F5B041] px-4 py-2.5 rounded-xl flex items-start gap-3 text-xs mb-4">
      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1 space-y-0.5">
        <div className="font-medium text-[#F5B041]/90">环境能力提示</div>
        <ul className="list-disc list-inside text-[#F5B041]/70 space-y-0.5">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        aria-label="关闭提示"
        onClick={() => setDismissed(true)}
        className="text-[#F5B041]/60 hover:text-[#F5B041] shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
