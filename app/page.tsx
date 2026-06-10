"use client";

import React, { useEffect, useRef } from 'react';
import WorkbenchLayout from '@/components/workbench/WorkbenchLayout';
import Sidebar from '@/components/workbench/Sidebar';
import RightPanel from '@/components/workbench/RightPanel';
import BottomTimeline from '@/components/workbench/BottomTimeline';
import ReferenceStage from '@/components/workbench/stages/ReferenceStage';
import ProductStage from '@/components/workbench/stages/ProductStage';
import ScriptStage from '@/components/workbench/stages/ScriptStage';
import RenderStage from '@/components/workbench/stages/RenderStage';
import { useWorkbenchStore } from '@/lib/store/workbench-store';
import { workbenchActions } from '@/lib/store/workbench-actions';

function ReviewAccessGate({ onReady }: { onReady: () => void }) {
  const [checking, setChecking] = React.useState(true);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState("");

  useEffect(() => {
    fetch("/api/auth/review")
      .then((r) => r.json())
      .then((data) => {
        if (!data.enabled || data.authed) onReady();
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [onReady]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/auth/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "访问码错误");
      return;
    }
    onReady();
  };

  if (checking) {
    return <div className="h-screen w-screen bg-[#0B0E14] text-white flex items-center justify-center text-sm text-white/50">正在校验访问权限...</div>;
  }

  return (
    <div className="h-screen w-screen bg-[#0B0E14] text-white flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#131821] p-6 shadow-2xl">
        <div className="text-lg font-semibold mb-1">MetaCut 评审访问</div>
        <div className="text-xs text-white/45 mb-5">请输入访问码后继续使用。</div>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          type="password"
          autoFocus
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none focus:border-[#00F0FF]/60"
          placeholder="访问码"
        />
        {error && <div className="mt-3 text-xs text-red-400">{error}</div>}
        <button type="submit" className="cta-button mt-5 w-full rounded-xl py-3 text-sm font-semibold">
          进入工作台
        </button>
      </form>
    </div>
  );
}

export default function MetaCutPlatform() {
  const [accessReady, setAccessReady] = React.useState(false);
  const activeTab = useWorkbenchStore((s) => s.activeTab);
  const isVideoConfirmed = useWorkbenchStore((s) => s.isVideoConfirmed);
  const setActiveTab = useWorkbenchStore((s) => s.setActiveTab);
  const projectId = useWorkbenchStore((s) => s.projectId);

  // 仅在「未确认 -> 确认」的瞬间跳转一次，之后允许用户自由切换 Tab 而不被强制拉回
  const prevConfirmed = useRef(isVideoConfirmed);
  useEffect(() => {
    if (isVideoConfirmed && !prevConfirmed.current) {
      setActiveTab('render');
    }
    prevConfirmed.current = isVideoConfirmed;
  }, [isVideoConfirmed, setActiveTab]);

  useEffect(() => {
    if (!accessReady) return;
    const id = new URLSearchParams(window.location.search).get("projectId");
    if (id && id !== projectId) {
      workbenchActions.restoreProject(id);
    }
  }, [accessReady, projectId]);

  useEffect(() => {
    if (!accessReady || !projectId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("projectId") === projectId) return;
    url.searchParams.set("projectId", projectId);
    window.history.replaceState(null, "", url.toString());
  }, [accessReady, projectId]);

  if (!accessReady) {
    return <ReviewAccessGate onReady={() => setAccessReady(true)} />;
  }

  const renderMainContent = () => {
    switch (activeTab) {
      case 'reference':
        return <ReferenceStage />;
      case 'product':
        return <ProductStage />;
      case 'script':
        return <ScriptStage />;
      case 'render':
        return <RenderStage />;
      default:
        return <ReferenceStage />;
    }
  };

  return (
    <WorkbenchLayout
      sidebar={<Sidebar />}
      main={renderMainContent()}
      rightPanel={<RightPanel />}
      bottomTimeline={<BottomTimeline />}
    />
  );
}
