"use client";

import { useState } from "react";
import { ChevronRight, Undo2, X } from "lucide-react";

export const PRODUCT_EDIT_FIELDS: Array<{
  key: string;
  label: string;
  rows: number;
  isArray?: boolean;
}> = [
  { key: "product_name", label: "商品名称", rows: 1 },
  { key: "category", label: "类目", rows: 1 },
  { key: "visual_description", label: "外观描述", rows: 4 },
  { key: "usage_method", label: "使用方式", rows: 3 },
  { key: "core_selling_points", label: "核心卖点", rows: 2, isArray: true },
  { key: "target_audience", label: "目标人群", rows: 2 },
  { key: "usage_scene", label: "使用场景", rows: 2 },
  { key: "pain_point_gain_point", label: "痛点/爽点", rows: 2 },
];

type ProductRecord = Record<string, unknown>;

function fieldDisplayValue(product: ProductRecord, key: string, isArray?: boolean): string {
  const raw = product[key];
  if (isArray && Array.isArray(raw)) return raw.join("；");
  if (raw == null) return "";
  if (typeof raw === "object") return JSON.stringify(raw, null, 2);
  return String(raw);
}

interface ProductFeatureEditorProps {
  product: ProductRecord;
  onChange: (next: ProductRecord) => void;
  onPolishField?: (fieldKey: string, draft: string, isArray?: boolean) => Promise<string>;
  compact?: boolean;
}

/** 商品特征：摘要展示 + 点击弹层全文编辑 */
export default function ProductFeatureEditor({
  product,
  onChange,
  onPolishField,
  compact = false,
}: ProductFeatureEditorProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [originalDraft, setOriginalDraft] = useState("");
  const [polishingInModal, setPolishingInModal] = useState(false);

  const openEditor = (key: string, isArray?: boolean) => {
    const value = fieldDisplayValue(product, key, isArray);
    setEditingKey(key);
    setDraft(value);
    setOriginalDraft(value);
  };

  const revertDraft = () => setDraft(originalDraft);
  const draftDirty = draft !== originalDraft;

  const saveEditor = () => {
    if (!editingKey) return;
    const field = PRODUCT_EDIT_FIELDS.find((f) => f.key === editingKey);
    onChange({
      ...product,
      [editingKey]: field?.isArray ? draft.split(/[；;]/).map((s) => s.trim()).filter(Boolean) : draft,
    });
    setEditingKey(null);
    setDraft("");
  };

  const polishDraft = async () => {
    if (!editingKey || !editingField || !onPolishField || !draft.trim()) return;
    setPolishingInModal(true);
    try {
      const polished = await onPolishField(editingKey, draft, editingField.isArray);
      setDraft(polished);
    } finally {
      setPolishingInModal(false);
    }
  };

  const editingField = PRODUCT_EDIT_FIELDS.find((f) => f.key === editingKey);
  const canPolish =
    Boolean(onPolishField) &&
    draft.trim() !== "" &&
    draft !== originalDraft &&
    !polishingInModal;

  return (
    <>
      <div className={compact ? "space-y-1" : "space-y-2"}>
        {PRODUCT_EDIT_FIELDS.map(({ key, label, isArray }) => {
          const value = fieldDisplayValue(product, key, isArray);
          return (
            <button
              key={key}
              type="button"
              onClick={() => openEditor(key, isArray)}
              className={`w-full text-left rounded-lg border border-white/10 bg-[#131821] hover:border-[#00F0FF]/40 hover:bg-[#1A1F2A] transition-colors group ${
                compact ? "px-2.5 py-1.5" : "px-3 py-2"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-white/40 shrink-0 ${compact ? "text-[10px] w-14" : "text-xs w-16"}`}>
                  {label}
                </span>
                <span
                  title={value}
                  className={`flex-1 min-w-0 whitespace-pre-wrap break-words text-white/80 ${
                    compact ? "text-[11px] line-clamp-1" : "text-xs line-clamp-2"
                  }`}
                >
                  {value || <span className="text-white/25">点击填写</span>}
                </span>
                <ChevronRight className="w-3 h-3 text-white/20 group-hover:text-[#00F0FF]/60 shrink-0" />
              </div>
            </button>
          );
        })}
      </div>

      {editingKey && editingField && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-lg bg-[#131821] border border-[#00F0FF]/30 rounded-2xl shadow-xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="text-sm font-medium text-[#00F0FF]">编辑 · {editingField.label}</span>
              <button
                type="button"
                onClick={() => setEditingKey(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 p-4 min-h-0">
              <textarea
                autoFocus
                className="w-full h-full min-h-[200px] max-h-[50vh] bg-[#0B0E14] border border-white/10 rounded-xl px-3 py-2 text-sm text-white/90 resize-y focus:outline-none focus:border-[#00F0FF]/50"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={editingField.isArray ? "多个卖点用中文分号；分隔" : `请输入${editingField.label}`}
              />
              {editingField.isArray && (
                <p className="text-[10px] text-white/30 mt-2">多个卖点请用「；」分隔</p>
              )}
            </div>
            <div className="flex justify-between gap-2 px-4 py-3 border-t border-white/10">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={revertDraft}
                  disabled={!draftDirty || polishingInModal}
                  title="撤销本次编辑"
                  className="flex items-center gap-1 text-xs px-3 py-2 rounded-lg border border-white/15 text-white/50 hover:text-white/70 disabled:opacity-40"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  回退
                </button>
                {onPolishField && (
                  <button
                    type="button"
                    onClick={polishDraft}
                    disabled={!canPolish}
                    title={!draftDirty ? "请先修改内容" : !draft.trim() ? "内容为空" : undefined}
                    className="text-xs px-3 py-2 rounded-lg border border-[#00F0FF]/40 text-[#00F0FF] hover:bg-[#00F0FF]/10 disabled:opacity-40"
                  >
                    {polishingInModal ? "润色中…" : "AI 润色"}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingKey(null)}
                  disabled={polishingInModal}
                  className="text-xs px-4 py-2 rounded-lg border border-white/15 text-white/60 hover:bg-white/5 disabled:opacity-40"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={saveEditor}
                  disabled={polishingInModal}
                  className="text-xs px-4 py-2 rounded-lg bg-[#00F0FF]/20 text-[#00F0FF] border border-[#00F0FF]/40 disabled:opacity-40"
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
