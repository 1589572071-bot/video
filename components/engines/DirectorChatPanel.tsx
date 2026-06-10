"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { DirectorActionResult } from "@/lib/director/tools";
import type { ProductInput, ScriptManifest, VideoAnalysisInput } from "@/lib/types/pipeline";

interface DirectorChatPanelProps {
  scriptSummary?: string;
  gapSummary?: string;
  productSummary?: string;
  compact?: boolean;
  scriptManifest?: ScriptManifest | null;
  product?: ProductInput | null;
  productImageUrls?: string[];
  productVideoUrls?: string[];
  videoAnalysis?: VideoAnalysisInput | null;
  chunkVideos?: string[];
  projectId?: string | null;
  quickPrompts?: string[];
  onUndo?: () => void;
  canUndo?: boolean;
  /** 返回字符串则作为「改动说明」追加到对话中 */
  onDirectorResults?: (results: DirectorActionResult[]) => string | void;
}

const DEFAULT_PROMPTS = [
  "开场钩子改成突出修护力",
  "重跑区块 2",
  "区块 1 改用 r2v",
];

function TypingIndicator() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce [animation-delay:300ms]" />
    </span>
  );
}

/** AI 导演对话面板：解析意图并执行剧本/区块操作 */
export default function DirectorChatPanel({
  scriptSummary,
  gapSummary,
  productSummary,
  compact = false,
  scriptManifest,
  product,
  productImageUrls = [],
  productVideoUrls = [],
  videoAnalysis,
  chunkVideos = [],
  projectId,
  quickPrompts,
  onUndo,
  canUndo = false,
  onDirectorResults,
}: DirectorChatPanelProps) {
  const examplePrompts = quickPrompts && quickPrompts.length > 0 ? quickPrompts : DEFAULT_PROMPTS;
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const ready = Boolean(scriptManifest);

  const send = async (text?: string) => {
    const userMsg = (text ?? input).trim();
    if (!userMsg || loading) return;
    if (!ready) {
      toast.info("请先生成剧本，再用 AI 导演改片");
      return;
    }
    setInput("");
    setMessages((m) => [...m, { role: "user", text: userMsg }]);
    setLoading(true);
    try {
      const res = await fetch("/api/director/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          execute: true,
          context: { scriptSummary, gapSummary, productSummary },
          scriptManifest,
          product,
          productImageUrls,
          productVideoUrls,
          videoAnalysis,
          chunkVideos,
          projectId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "请求失败");

      const reply = data.reply || data.error || "无回复";
      setMessages((m) => [...m, { role: "assistant", text: reply }]);

      if (data.results?.length) {
        const diffNote = onDirectorResults?.(data.results as DirectorActionResult[]);
        if (typeof diffNote === "string" && diffNote) {
          setMessages((m) => [...m, { role: "assistant", text: diffNote }]);
        }
        const ok = (data.results as DirectorActionResult[]).filter((r) => r.success);
        if (ok.length > 0) {
          toast.success(ok.map((r) => r.message).join(" · "));
        }
        const failed = (data.results as DirectorActionResult[]).filter((r) => !r.success);
        if (failed.length > 0) {
          toast.error(failed.map((r) => r.message).join(" · "));
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "请求失败";
      setMessages((m) => [...m, { role: "assistant", text: msg }]);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const shellClass = compact
    ? "bg-[#131821] rounded-lg p-3 h-full min-h-[20rem] flex flex-col overflow-hidden"
    : "glass-card p-4 flex flex-col h-64";

  const textSize = compact ? "text-xs" : "text-sm";

  return (
    <div className={shellClass}>
      {!compact && (
        <div className="font-medium text-white shrink-0 text-sm mb-3">
          AI 导演
        </div>
      )}

      {!ready && (
        <div className="shrink-0 mb-2 text-[11px] text-[#F5B041]/80 bg-[#F5B041]/10 border border-[#F5B041]/20 rounded-lg px-2.5 py-1.5">
          剧本生成后即可用一句话改片（如「开头更抓人」「重跑区块 2」）
        </div>
      )}

      <div className={`flex-1 overflow-y-auto min-h-0 space-y-3 pr-1 ${textSize}`}>
        {messages.length === 0 && !loading && (
          <div className="flex justify-start">
            <div className="max-w-[88%]">
              <div className="text-[10px] text-white/40 mb-1 ml-1">AI 导演</div>
              <div className="rounded-2xl rounded-tl-md bg-[#1A1F2A] border border-white/8 px-3 py-2.5 text-white/55 leading-relaxed shadow-sm">
                <p className="mb-2">你可以直接告诉我怎么改片，例如：</p>
                <ul className="space-y-1.5">
                  {examplePrompts.map((prompt) => (
                    <li key={prompt}>
                      <button
                        type="button"
                        onClick={() => void send(prompt)}
                        className="text-left w-full rounded-xl bg-white/5 hover:bg-[#00F0FF]/10 border border-white/8 hover:border-[#00F0FF]/25 px-2.5 py-1.5 text-white/70 hover:text-[#00F0FF]/90 transition-colors"
                      >
                        「{prompt}」
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%]">
                <div className="text-[10px] text-white/40 mb-1 mr-1 text-right">你</div>
                <div className="rounded-2xl rounded-tr-md bg-[#00F0FF]/18 border border-[#00F0FF]/25 px-3 py-2 text-white/90 leading-relaxed shadow-sm">
                  {m.text}
                </div>
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="max-w-[88%]">
                <div className="text-[10px] text-white/40 mb-1 ml-1">AI 导演</div>
                <div className="rounded-2xl rounded-tl-md bg-[#1A1F2A] border border-white/8 px-3 py-2 text-white/80 leading-relaxed shadow-sm whitespace-pre-wrap">
                  {m.text}
                </div>
              </div>
            </div>
          )
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="max-w-[88%]">
              <div className="text-[10px] text-white/40 mb-1 ml-1">AI 导演</div>
              <div className="rounded-2xl rounded-tl-md bg-[#1A1F2A] border border-white/8 px-3 py-2.5 text-white/50 shadow-sm">
                <TypingIndicator />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {canUndo && onUndo && (
        <div className="shrink-0 pt-2">
          <button
            type="button"
            onClick={onUndo}
            className="w-full text-[11px] py-1.5 rounded-lg border border-white/10 text-white/55 hover:text-white/85 hover:bg-white/5 transition-colors"
          >
            ↩ 撤销上次导演改动
          </button>
        </div>
      )}

      <div className="flex gap-2 shrink-0 mt-auto pt-3 border-t border-white/5">
        <input
          className={`flex-1 bg-[#0B0E14] border border-white/10 rounded-2xl px-3 py-2 text-white/80 placeholder:text-white/30 focus:outline-none focus:border-[#00F0FF]/40 ${textSize}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && void send()}
          placeholder={ready ? "例：开场钩子改成…" : "请先生成剧本"}
          disabled={loading || !ready}
        />
        <button
          onClick={() => void send()}
          disabled={loading || !ready || !input.trim()}
          className={`px-4 py-2 rounded-2xl bg-[#00F0FF]/20 text-[#00F0FF] hover:bg-[#00F0FF]/30 disabled:opacity-40 disabled:hover:bg-[#00F0FF]/20 transition-colors ${textSize}`}
        >
          {loading ? "…" : "发送"}
        </button>
      </div>
    </div>
  );
}
