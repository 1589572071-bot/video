import React, { useRef, useEffect } from 'react';
import { Image as ImageIcon, Plus, X, Video, Undo2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkbenchStore } from '@/lib/store/workbench-store';
import { workbenchActions } from '@/lib/store/workbench-actions';
import ProductFeatureEditor, { PRODUCT_EDIT_FIELDS } from '@/components/engines/ProductFeatureEditor';
import MaterialLibraryPanel from '@/components/engines/MaterialLibraryPanel';
import { previewAssetUrl } from '@/lib/client-asset-preview';
import type { MaterialAnalysisResult } from '@/lib/types/pipeline';

function serializeProductFieldValue(value: unknown, isArray?: boolean): string {
  if (isArray && Array.isArray(value)) return value.join("；");
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function computeDirtyProductFields(
  current: Record<string, unknown>,
  baseline: Record<string, unknown>
): string[] {
  const dirty: string[] = [];
  for (const { key, isArray } of PRODUCT_EDIT_FIELDS) {
    const cur = serializeProductFieldValue(current[key], isArray);
    const base = serializeProductFieldValue(baseline[key], isArray);
    if (cur !== base) dirty.push(key);
  }
  return dirty;
}

function pickEditableProduct(product: Record<string, unknown> | null) {
  if (!product) return null;
  const next: Record<string, unknown> = {};
  for (const { key } of PRODUCT_EDIT_FIELDS) {
    if (product[key] !== undefined) next[key] = product[key];
  }
  return next;
}

export default function ProductStage() {
  const {
    productDescription,
    productImages,
    productVideos,
    isUploadingProduct,
    isUploadingProductVideo,
    isAnalyzingMaterial,
    materialAnalysis,
    materialAnalysisError,
    parsedProduct,
    editableProduct,
    dirtyProductFields,
    setProductState,
    isParsingProduct,
    isGeneratingScript,
    scriptGenPhase,
    projectId,
  } = useWorkbenchStore();

  const productFeaturesBaselineRef = useRef<Record<string, unknown> | null>(null);
  const productImageInputRef = useRef<HTMLInputElement | null>(null);
  const productVideoInputRef = useRef<HTMLInputElement | null>(null);

  // 每次解析出新的商品特征（尚未编辑时），记录基线，用于「回退修改」与脏字段计算
  const parsedSchemaVersion = (parsedProduct as Record<string, unknown> | null)?.schema_version;
  const hasParsedProduct = Boolean(parsedSchemaVersion);
  const materialHighlights = materialAnalysis?.highlights;
  useEffect(() => {
    if (parsedProduct && editableProduct === null) {
      productFeaturesBaselineRef.current = pickEditableProduct(parsedProduct);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedSchemaVersion]);

  const ensureClientProject = async (): Promise<string | null> => {
    const current = useWorkbenchStore.getState().projectId;
    if (current) return current;
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: productDescription.slice(0, 60) || 'MetaCut Project' }),
    });
    const data = await res.json();
    if (!res.ok || !data.projectId) return null;
    setProductState({ projectId: data.projectId });
    return data.projectId as string;
  };

  const mergeMaterialAnalysisIntoProduct = (
    product: Record<string, unknown> | null,
    analysis: MaterialAnalysisResult | null = useWorkbenchStore.getState().materialAnalysis
  ) => {
    if (!product || !analysis) return product;
    return { ...product, material_analysis: analysis };
  };

  const runMaterialAnalysis = async (videoUrl: string, activeProjectId?: string | null) => {
    setProductState({ isAnalyzingMaterial: true, materialAnalysisError: null });
    try {
      const latestProduct = useWorkbenchStore.getState().parsedProduct;
      const analyzeRes = await fetch('/api/material/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl,
          projectId: activeProjectId ?? useWorkbenchStore.getState().projectId,
          product: latestProduct,
        }),
      });
      const { readResponseJson } = await import('@/lib/parse-api-response');
      const analyzeData = await readResponseJson<{ error?: string; result?: MaterialAnalysisResult }>(analyzeRes);
      if (!analyzeRes.ok) {
        throw new Error(analyzeData.error || '素材理解失败，可稍后重试');
      }

      const result = analyzeData.result as MaterialAnalysisResult;
      const currentProduct = useWorkbenchStore.getState().parsedProduct;
      setProductState({
        materialAnalysis: result,
        materialAnalysisError: null,
        parsedProduct: mergeMaterialAnalysisIntoProduct(currentProduct, result),
      });
      toast.success('素材理解完成，已提取高光片段');
    } catch (e) {
      const message = e instanceof Error ? e.message : '素材理解失败，可稍后重试';
      setProductState({ materialAnalysisError: message });
      toast.warning(message);
    } finally {
      setProductState({ isAnalyzingMaterial: false });
    }
  };

  const handleRetryMaterialAnalysis = () => {
    const latest = useWorkbenchStore.getState().productVideos;
    const videoUrl = latest[latest.length - 1];
    if (!videoUrl) {
      toast.error('请先上传商品演示视频');
      return;
    }
    void runMaterialAnalysis(videoUrl, useWorkbenchStore.getState().projectId);
  };

  const handleProductImageUpload = async (files: FileList) => {
    const selectedFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (!selectedFiles.length) {
      toast.error('请选择图片文件');
      return;
    }

    setProductState({ isUploadingProduct: true });
    const loadingToast = toast.loading(`正在上传 ${selectedFiles.length} 张商品图…`);

    try {
      const activeProjectId = await ensureClientProject();
      const urls: string[] = [];
      const errors: string[] = [];

      for (const file of selectedFiles) {
        const fd = new FormData();
        fd.append('image', file);
        if (activeProjectId) fd.append('projectId', activeProjectId);

        try {
          const res = await fetch('/api/upload/product/image', { method: 'POST', body: fd });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.url) {
            urls.push(data.url);
            if (data.projectId) setProductState({ projectId: data.projectId });
          } else {
            errors.push(`${file.name}: ${data.error || `上传失败 (${res.status})`}`);
          }
        } catch (e) {
          errors.push(`${file.name}: ${e instanceof Error ? e.message : '网络异常'}`);
        }
      }

      if (urls.length) {
        const latestImages = useWorkbenchStore.getState().productImages;
        setProductState({ productImages: [...latestImages, ...urls] });
      }

      toast.dismiss(loadingToast);
      if (urls.length) toast.success(`已上传 ${urls.length} 张商品图`);
      if (errors.length) {
        toast.error(errors[0], {
          description: errors.length > 1 ? `另有 ${errors.length - 1} 张图片上传失败` : undefined,
        });
      }
    } catch (e) {
      toast.dismiss(loadingToast);
      toast.error(e instanceof Error ? e.message : '商品图片上传失败');
    } finally {
      setProductState({ isUploadingProduct: false });
    }
  };

  const handleProductVideoUpload = async (file: File) => {
    if (!file.type.startsWith('video/')) {
      toast.error('请选择视频文件');
      return;
    }
    const maxBytes = 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error('商品演示视频不能超过 50MB', {
        description: '长视频易导致素材理解超时，建议压缩后再上传',
      });
      return;
    }
    setProductState({ isUploadingProductVideo: true });
    try {
      const activeProjectId = await ensureClientProject();
      const fd = new FormData();
      fd.append('video', file);
      if (activeProjectId) fd.append('projectId', activeProjectId);
      const res = await fetch('/api/upload/product/video', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || '商品演示视频上传失败');
      } else if (data.url) {
        if (data.projectId) setProductState({ projectId: data.projectId });
        const latestVideos = useWorkbenchStore.getState().productVideos;
        setProductState({ productVideos: [...latestVideos, data.url] });
        toast.success('商品演示视频上传成功');
        void runMaterialAnalysis(data.url, data.projectId ?? activeProjectId ?? projectId);
      } else {
        toast.error('上传失败：未返回视频地址');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '商品演示视频上传失败');
    } finally {
      setProductState({ isUploadingProductVideo: false });
    }
  };

  const removeProductImage = (index: number) => {
    setProductState({ productImages: productImages.filter((_, i) => i !== index) });
  };

  const removeProductVideo = (index: number) => {
    const nextVideos = productVideos.filter((_, i) => i !== index);
    setProductState({
      productVideos: nextVideos,
      ...(nextVideos.length === 0
        ? { materialAnalysis: null, materialAnalysisError: null, isAnalyzingMaterial: false }
        : {}),
    });
  };

  const handleProductFeatureChange = (next: Record<string, unknown>) => {
    setProductState({ editableProduct: next });
    setProductState({
      parsedProduct: mergeMaterialAnalysisIntoProduct(parsedProduct ? { ...parsedProduct, ...next } : { ...next })
    });
    if (productFeaturesBaselineRef.current) {
      setProductState({
        dirtyProductFields: computeDirtyProductFields(next, productFeaturesBaselineRef.current)
      });
    }
  };

  const handleRevertProductFeatures = () => {
    if (!productFeaturesBaselineRef.current) {
      toast.error("暂无可回退的商品特征版本");
      return;
    }
    const baseline = { ...productFeaturesBaselineRef.current };
    setProductState({ editableProduct: baseline });
    setProductState({
      parsedProduct: mergeMaterialAnalysisIntoProduct(parsedProduct ? { ...parsedProduct, ...baseline } : { ...baseline })
    });
    setProductState({ dirtyProductFields: [] });
    toast.success("已回退商品特征修改");
  };

  const handlePolishSingleField = async (
    key: string,
    draft: string,
    isArray?: boolean
  ): Promise<string> => {
    const fieldValue = isArray
      ? draft.split(/[；;]/).map((s) => s.trim()).filter(Boolean)
      : draft;
    const product = {
      ...(parsedProduct ?? {}),
      ...(editableProduct ?? {}),
      [key]: fieldValue,
    };
    const res = await fetch("/api/product/polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product, dirtyFields: [key] }),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data.error || "润色失败";
      toast.error(msg);
      throw new Error(msg);
    }

    const polished = data.product as Record<string, unknown>;
    const raw = polished[key];
    const text =
      isArray && Array.isArray(raw) ? raw.map(String).join("；") : String(raw ?? draft);

    const sourceLabel = data.polish_source === "doubao" ? "豆包" : "本地规则";
    toast.success(`字段已润色 · ${sourceLabel}`);
    if (data.polish_source === "mock" && data.polish_fallback_reason) {
      toast.warning(`润色回退 Mock：${data.polish_fallback_reason}`);
    }
    return text;
  };

  const stage2ProgressText =
    isGeneratingScript && scriptGenPhase === "stitching_script"
      ? "剧本缝合中…"
      : null;

  return (
    <div className="glass-card p-6 h-full flex flex-col">
      <div className="font-semibold text-lg mb-6 shrink-0">
        商品多模态信息
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1 min-h-0">
        {/* 左侧：输入区 */}
        <div className="flex flex-col min-h-0 overflow-y-auto pr-2 custom-scrollbar">
          <div className="mb-6">
            <div className="text-sm font-medium text-white/70 mb-3">商品描述</div>
            <textarea
              className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-[#00F0FF]/50 focus:ring-1 focus:ring-[#00F0FF]/50 transition-all resize-none h-24"
              placeholder="例如：火辣脆脆角，香辣过瘾不油腻。适合追剧、露营等场景..."
              value={productDescription}
              onChange={e => setProductState({ productDescription: e.target.value })}
            />
          </div>

          <div className="mb-6">
            <div className="text-sm font-medium text-white/70 mb-3 flex items-center justify-between">
              <span>商品图片</span>
              <span className="text-xs text-[#00F0FF] bg-[#00F0FF]/10 px-2 py-0.5 rounded">{productImages.length} 张已上传</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {productImages.map((url, i) => (
                <div key={`${url}-${i}`} className="relative group aspect-square rounded-xl overflow-hidden border border-white/10 bg-black/40">
                  <img src={previewAssetUrl(url)} alt={`商品图 ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeProductImage(i)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity hover:bg-red-500/80"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => productImageInputRef.current?.click()}
                disabled={isUploadingProduct}
                className="aspect-square rounded-xl border-2 border-dashed border-white/10 hover:border-[#00F0FF]/50 hover:bg-[#00F0FF]/5 flex flex-col items-center justify-center text-white/40 hover:text-[#00F0FF] transition-all disabled:opacity-50"
              >
                {isUploadingProduct ? (
                  <span className="text-xs animate-pulse">上传中...</span>
                ) : (
                  <>
                    <Plus className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium">上传图片</span>
                  </>
                )}
              </button>
            </div>
            <input
              ref={productImageInputRef}
              id="product-image-input"
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={e => {
                if (e.target.files?.length) handleProductImageUpload(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          <div className="mb-6">
            <div className="text-sm font-medium text-white/70 mb-3 flex items-center justify-between">
              <span>商品演示视频</span>
              <span className="text-xs text-[#00F0FF] bg-[#00F0FF]/10 px-2 py-0.5 rounded">{productVideos.length} 段已上传</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {productVideos.map((url, i) => (
                <div key={`${url}-${i}`} className="relative group aspect-video rounded-xl overflow-hidden border border-white/10 bg-black">
                  <video src={previewAssetUrl(url)} className="w-full h-full object-cover" muted playsInline preload="metadata" />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/20">
                    <Video className="w-6 h-6 text-white/70 drop-shadow-md" />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeProductVideo(i)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity hover:bg-red-500/80"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => productVideoInputRef.current?.click()}
                disabled={isUploadingProductVideo}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) handleProductVideoUpload(f);
                }}
                onDragOver={e => e.preventDefault()}
                className="aspect-video rounded-xl border-2 border-dashed border-white/10 hover:border-[#00F0FF]/50 hover:bg-[#00F0FF]/5 flex flex-col items-center justify-center text-white/40 hover:text-[#00F0FF] transition-all disabled:opacity-50"
              >
                {isUploadingProductVideo ? (
                  <span className="text-xs animate-pulse">上传中...</span>
                ) : (
                  <>
                    <Plus className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium">上传视频</span>
                  </>
                )}
              </button>
            </div>
            <input
              ref={productVideoInputRef}
              id="product-video-input"
              type="file"
              accept="video/*"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleProductVideoUpload(f);
                e.target.value = '';
              }}
            />

            {/* 统一素材库 + 自动理解 */}
            {(productImages.length > 0 || productVideos.length > 0) && (
              <MaterialLibraryPanel
                className="mt-4"
                images={productImages}
                videos={productVideos}
                highlights={
                  materialHighlights as unknown as
                    | Array<{ start: number; end: number; description?: string; tags?: string[]; recommended_for?: string[] }>
                    | undefined
                }
                isAnalyzing={isAnalyzingMaterial}
                error={materialAnalysisError}
                onRetry={handleRetryMaterialAnalysis}
              />
            )}
          </div>
        </div>

        {/* 右侧：商品特征解析结果 */}
        <div className="flex flex-col min-h-0 border-l border-white/5 pl-8">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="text-sm font-medium text-white/70">商品特征解析结果</div>
            <div className="flex items-center gap-2">
              {hasParsedProduct && dirtyProductFields.length > 0 && (
                <button
                  type="button"
                  onClick={handleRevertProductFeatures}
                  className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors bg-white/5 px-3 py-1.5 rounded-lg"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  回退修改
                </button>
              )}
              {hasParsedProduct && (
                <button
                  onClick={() => workbenchActions.handleParseProductFeatures()}
                  disabled={isParsingProduct || isAnalyzingMaterial}
                  className="flex items-center gap-1.5 text-xs text-[#00F0FF] hover:bg-[#00F0FF]/10 transition-colors bg-[#00F0FF]/5 border border-[#00F0FF]/20 px-3 py-1.5 rounded-lg disabled:opacity-50"
                  title={isAnalyzingMaterial ? "素材理解中，完成后再解析商品特征" : undefined}
                >
                  <Zap className="w-3.5 h-3.5" />
                  {isAnalyzingMaterial ? "素材理解中" : "重新解析"}
                </button>
              )}
            </div>
          </div>

          {hasParsedProduct ? (
            <div className="flex-1 min-h-0 flex flex-col bg-black/20 rounded-xl p-4 border border-white/5">
              {isParsingProduct && (
                <div className="mb-4 flex items-center gap-2 text-sm text-[#00F0FF] shrink-0 bg-[#00F0FF]/10 px-3 py-2 rounded-lg">
                  <span className="inline-block w-4 h-4 border-2 border-[#00F0FF] border-t-transparent rounded-full animate-spin shrink-0" />
                  商品特征解析中…
                </div>
              )}
              {stage2ProgressText && !isParsingProduct && (
                <div className="mb-4 flex items-center gap-2 text-sm text-[#00F0FF] shrink-0 bg-[#00F0FF]/10 px-3 py-2 rounded-lg">
                  <span className="inline-block w-4 h-4 border-2 border-[#00F0FF] border-t-transparent rounded-full animate-spin shrink-0" />
                  {stage2ProgressText}
                </div>
              )}
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-2">
                <ProductFeatureEditor
                  product={editableProduct ?? pickEditableProduct(parsedProduct) ?? {}}
                  onChange={handleProductFeatureChange}
                  onPolishField={handlePolishSingleField}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-sm text-white/30 bg-black/20 rounded-xl p-6 border border-white/5 border-dashed">
              {isParsingProduct ? (
                <div className="flex flex-col items-center gap-3 text-[#00F0FF]">
                  <span className="inline-block w-6 h-6 border-2 border-[#00F0FF] border-t-transparent rounded-full animate-spin" />
                  商品多模态解析中…
                </div>
              ) : stage2ProgressText ? (
                <div className="flex flex-col items-center gap-3 text-[#00F0FF]">
                  <span className="inline-block w-6 h-6 border-2 border-[#00F0FF] border-t-transparent rounded-full animate-spin" />
                  {stage2ProgressText}
                </div>
              ) : (
                <div className="text-center max-w-xs flex flex-col items-center">
                  <ImageIcon className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <div className="mb-6">填写商品描述或上传素材后，点击按钮提取商品特征</div>
                  <button
                    onClick={() => workbenchActions.handleParseProductFeatures()}
                    disabled={isParsingProduct || isAnalyzingMaterial}
                    className="cta-button px-6 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 disabled:opacity-50"
                    title={isAnalyzingMaterial ? "素材理解中，完成后再解析商品特征" : undefined}
                  >
                    <Zap className="w-4 h-4" /> 
                    {isAnalyzingMaterial ? "素材理解中…" : "AI 解析特征"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
