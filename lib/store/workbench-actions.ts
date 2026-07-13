import { toast } from 'sonner';
import { useWorkbenchStore } from './workbench-store';
import { alignMarkdownToTimelineEvents, getTimelineEvents } from '@/lib/timeline-shot-align';
import type { ScriptManifestState, GapPlanState, SavedScriptVersion, AnalysisResult } from './workbench-store';
import type { MaterialAnalysisResult, ScriptVersionType } from '@/lib/types/pipeline';
import { versionKeyOf, versionLabelOf } from '@/lib/script-version-options';

/** 素材缺口的 5 种可干预补全策略（对应课题任务6） */
export const GAP_FILL_STRATEGIES: Array<{ key: string; label: string; instruction: string }> = [
  { key: 'restructure', label: '结构重排', instruction: '调整本段叙事结构，降低对缺失镜头的依赖' },
  { key: 'copy_fill', label: '文案补全', instruction: '用字幕/旁白文案信息替代本段画面表达' },
  { key: 'packaging_fill', label: '包装补全', instruction: '用标题条/卖点卡片/贴纸/转场补足本段表达' },
  { key: 'aigc_fill', label: 'AIGC 生成', instruction: '使用 AIGC 生成补充画面/封面/配音补足本段' },
  { key: 'reuse_fill', label: '素材复用', instruction: '通过裁切/重复/局部放大现有素材补足本段' },
];

const get = () => useWorkbenchStore.getState();
const set = (state: Partial<ReturnType<typeof useWorkbenchStore.getState>>) => useWorkbenchStore.setState(state);

let scriptGenAbortController: AbortController | null = null;
let renderPollGen = 0;
const RENDER_POLL_TIMEOUT_MS = 12 * 60 * 1000;

function mergeMaterialAnalysis<T extends Record<string, unknown> | null | undefined>(
  product: T,
  materialAnalysis: MaterialAnalysisResult | null = get().materialAnalysis
): T {
  if (!product || !materialAnalysis) return product;
  return { ...product, material_analysis: materialAnalysis } as T;
}

function currentProductWithMaterialAnalysis(state: ReturnType<typeof get>) {
  const product = state.parsedProduct
    ? {
        ...state.parsedProduct,
        ...(state.editableProduct ?? {}),
      }
    : undefined;
  return mergeMaterialAnalysis(product, state.materialAnalysis);
}

function buildSavedScriptVersion(input: {
  versionType: ScriptVersionType | undefined;
  generatedScript: string | null;
  scriptManifest: ScriptManifestState | null;
  gapPlan: GapPlanState | null;
  id?: string;
}): SavedScriptVersion {
  const key = versionKeyOf(input.versionType);
  return {
    id: input.id ?? `ver-${key}-${Date.now()}`,
    versionType: input.versionType,
    label: versionLabelOf(input.versionType),
    generatedScript: input.generatedScript,
    scriptManifest: input.scriptManifest,
    gapPlan: input.gapPlan,
  };
}

function upsertScriptVersion(
  versions: SavedScriptVersion[],
  version: SavedScriptVersion
): SavedScriptVersion[] {
  const key = versionKeyOf(version.versionType);
  const filtered = versions.filter((v) => versionKeyOf(v.versionType) !== key);
  return [...filtered, version];
}

function syncActiveScriptVersion(input: {
  generatedScript: string | null;
  scriptManifest: ScriptManifestState | null;
  gapPlan: GapPlanState | null;
  versionType: ScriptVersionType | undefined;
}) {
  const state = get();
  const activeId = state.activeVersionId;
  const activeVersion = activeId
    ? state.scriptVersions.find((v) => v.id === activeId)
    : null;

  const version = buildSavedScriptVersion({
    id: activeVersion?.id,
    versionType: input.versionType,
    generatedScript: input.generatedScript,
    scriptManifest: input.scriptManifest,
    gapPlan: input.gapPlan,
  });

  return {
    scriptVersions: upsertScriptVersion(state.scriptVersions, version),
    activeVersionId: version.id,
  };
}

async function ensureCurrentProject(): Promise<string | null> {
  const existing = get().projectId;
  if (existing) return existing;
  try {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: get().uploadedFileName ?? "MetaCut Project" }),
    });
    const data = await res.json();
    if (res.ok && data.projectId) {
      set({ projectId: data.projectId });
      return data.projectId as string;
    }
  } catch {
    // DB 未配置时允许继续走本地演示流程
  }
  return null;
}

export const workbenchActions = {
  async persistCurrentScript() {
    const state = get();
    if (!state.projectId || !state.scriptManifest) return;
    await fetch(`/api/projects/${state.projectId}/script`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        versionType: state.scriptVersion,
        scriptMarkdown: state.generatedScript,
        scriptManifest: state.scriptManifest,
        gapPlan: state.gapPlan,
      }),
    }).catch(() => {});
  },

  async restoreProject(projectId: string) {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "项目恢复失败");

      const snapshot = data.snapshot as {
        assets?: Array<{ kind?: string; url?: string; original_name?: string }>;
        analysisResult?: AnalysisResult | null;
        productProfile?: Record<string, unknown> | null;
        currentScript?: {
          script_markdown?: string | null;
          script_manifest?: ScriptManifestState | null;
          gap_plan?: GapPlanState | null;
          version_type?: ScriptVersionType | null;
        } | null;
        latestRenderJob?: {
          status?: string;
          progress?: number;
          steps?: Array<{ label: string; status: string }>;
          result?: Record<string, unknown> | null;
          error?: string | null;
        } | null;
      };

      const assets = snapshot.assets ?? [];
      const reference = [...assets].reverse().find((a) => a.kind === "reference_video" && a.url);
      const productImages = assets.filter((a) => a.kind === "product_image" && a.url).map((a) => a.url!) ?? [];
      const productVideos = assets.filter((a) => a.kind === "product_video" && a.url).map((a) => a.url!) ?? [];
      const productProfile = snapshot.productProfile ?? null;
      const materialAnalysis =
        (productProfile?.material_analysis as MaterialAnalysisResult | undefined) ?? null;

      const restoredScript = snapshot.currentScript?.script_markdown ?? null;
      const restoredManifest = snapshot.currentScript?.script_manifest ?? null;
      const restoredGapPlan =
        snapshot.currentScript?.gap_plan ?? restoredManifest?.gap_plan ?? null;
      const restoredVersionType = snapshot.currentScript?.version_type ?? undefined;
      const restoredVersion =
        restoredScript && restoredManifest
          ? buildSavedScriptVersion({
              versionType: restoredVersionType,
              generatedScript: restoredScript,
              scriptManifest: restoredManifest,
              gapPlan: restoredGapPlan,
            })
          : null;

      set({
        projectId,
        uploadedVideoUrl: reference?.url ?? null,
        uploadedFileName: reference?.original_name ?? null,
        analysisResult: snapshot.analysisResult ?? null,
        productImages,
        productVideos,
        materialAnalysis,
        materialAnalysisError: null,
        isAnalyzingMaterial: false,
        parsedProduct: productProfile,
        editableProduct: null,
        dirtyProductFields: [],
        generatedScript: restoredScript,
        scriptManifest: restoredManifest,
        gapPlan: restoredGapPlan,
        scriptVersion: restoredVersionType,
        scriptVersions: restoredVersion ? [restoredVersion] : [],
        activeVersionId: restoredVersion?.id ?? null,
        activeTab: snapshot.latestRenderJob?.result
          ? "render"
          : snapshot.currentScript?.script_manifest
            ? "render"
            : snapshot.productProfile
              ? "script"
              : snapshot.analysisResult
                ? "product"
                : "reference",
      });

      if (snapshot.latestRenderJob?.result) {
        workbenchActions.applyRenderResult(snapshot.latestRenderJob.result);
      } else if (snapshot.latestRenderJob?.status === "failed") {
        set({
          renderBlocked: true,
          renderSummary: snapshot.latestRenderJob.error ?? "渲染失败",
          renderProgress: snapshot.latestRenderJob.progress ?? 100,
          renderSteps: snapshot.latestRenderJob.steps ?? [],
        });
      }
      toast.success("项目已恢复");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "项目恢复失败");
    }
  },

  async handleVideoUpload(file: File) {
    if (!file.type.startsWith('video/')) {
      toast.error('请选择视频文件');
      return;
    }
    const { MAX_UPLOAD_VIDEO_BYTES } = await import('@/lib/video-limits');
    if (file.size > MAX_UPLOAD_VIDEO_BYTES) {
      toast.error('参考视频不能超过 50MB', {
        description: '长视频易导致解析超时，建议压缩到 2 分钟以内',
      });
      return;
    }
    set({ isUploading: true, uploadProgress: 0 });

    const formData = new FormData();
    formData.append('video', file);
    if (get().projectId) formData.append('projectId', get().projectId!);

    const uploadInterval = setInterval(() => {
      set({ uploadProgress: Math.min(get().uploadProgress + 18, 92) });
    }, 180);

    try {
      const { readResponseJson } = await import('@/lib/parse-api-response');
      const uploadRes = await fetch('/api/upload/video', { method: 'POST', body: formData });
      const uploadData = await readResponseJson<{ error?: string; url?: string; originalName?: string; projectId?: string }>(uploadRes);
      clearInterval(uploadInterval);
      set({ uploadProgress: 100 });

      if (!uploadRes.ok || !uploadData.url) {
        throw new Error(uploadData.error || '上传失败：响应缺少视频地址');
      }

      const videoUrl = uploadData.url;
      if (uploadData.projectId) set({ projectId: uploadData.projectId });
      set({ uploadedVideoUrl: videoUrl, uploadedFileName: uploadData.originalName });
      toast.success(`视频上传成功`);

      workbenchActions.startRealParsing(
        videoUrl,
        uploadData.originalName || file.name
      );
    } catch (err: unknown) {
      clearInterval(uploadInterval);
      toast.error(err instanceof Error ? err.message : '上传失败');
      set({ uploadProgress: 0 });
    } finally {
      set({ isUploading: false });
    }
  },

  async startRealParsing(videoUrl: string, fileName: string) {
    set({ isParsing: true, analysisProgress: 0, analysisResult: null });
    get().resetScriptState();
    get().resetRenderState();
    
    set({
      pipelineSteps: get().pipelineSteps.map((s, i) => ({
        ...s,
        status: i === 0 ? 'processing' : 'waiting',
        progress: i === 0 ? 20 : 0,
        message: i === 0 ? '正在调用豆包解析…' : '',
      }))
    });

    let softProgress = 0;
    const softInterval = setInterval(() => {
      softProgress = Math.min(88, softProgress + (softProgress < 30 ? 3 : softProgress < 60 ? 2 : 1));
      set({ analysisProgress: softProgress });

      if (softProgress >= 18 && softProgress < 40) {
        set({
          pipelineSteps: get().pipelineSteps.map((s, i) =>
            i === 1 ? { ...s, status: 'processing', progress: 40, message: '检测切镜点…' } : s
          )
        });
      } else if (softProgress >= 40 && softProgress < 65) {
        set({
          pipelineSteps: get().pipelineSteps.map((s, i) => {
            if (i === 1) return { ...s, status: 'success', progress: 100, message: '' };
            if (i === 2) return { ...s, status: 'processing', progress: 50, message: '识别花字…' };
            return s;
          })
        });
      } else if (softProgress >= 65) {
        set({
          pipelineSteps: get().pipelineSteps.map((s, i) => {
            if (i <= 2) return { ...s, status: 'success', progress: 100, message: '' };
            if (i === 3) return { ...s, status: 'processing', progress: 60, message: '等待模型返回…' };
            return s;
          })
        });
      }
    }, 500);

    try {
      const { readResponseJson } = await import('@/lib/parse-api-response');
      const res = await fetch('/api/analyze/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl, fileName, projectId: get().projectId }),
      });
      const data = await readResponseJson<AnalysisResult & { error?: string }>(res);
      if (!res.ok) throw new Error(data.error || '解析失败');

      set({ analysisResult: data, analysisProgress: 100 });
      set({
        pipelineSteps: get().pipelineSteps.map(s => ({ ...s, status: 'success', progress: 100, message: '' }))
      });
      toast.success('视频原子化拆解完成！');
    } catch (e) {
      set({ analysisProgress: 0 });
      set({
        pipelineSteps: get().pipelineSteps.map(s => ({ ...s, status: 'waiting', progress: 0, message: '' }))
      });
      toast.error(e instanceof Error ? e.message : '解析失败');
    } finally {
      clearInterval(softInterval);
      set({ isParsing: false });
    }
  },

  async handleParseProductFeatures() {
    const state = get();
    if (!state.productDescription.trim() && state.productImages.length === 0 && state.productVideos.length === 0) {
      toast.error('请先填写商品描述或上传商品素材');
      return;
    }
    if (state.isAnalyzingMaterial) {
      toast.info('素材理解中，完成后再解析商品特征');
      return;
    }

    set({ isParsingProduct: true });
    try {
      const projectId = await ensureCurrentProject();
      const res = await fetch('/api/product/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productDescription: state.productDescription,
          productImageUrls: state.productImages,
          productVideoUrl: state.productVideos[0] ?? null,
          productVideoUrls: state.productVideos,
          materialAnalysis: state.materialAnalysis,
          projectId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '解析失败');

      const currentParsed = get().parsedProduct ?? {};
      const newParsed = mergeMaterialAnalysis(
        { ...currentParsed, ...data.product },
        get().materialAnalysis
      );
      
      set({
        parsedProduct: newParsed,
        editableProduct: null, // Reset editable product so it reflects newly parsed data
        dirtyProductFields: [],
      });
      toast.success('商品特征解析完成');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '解析失败');
    } finally {
      set({ isParsingProduct: false });
    }
  },

  async performScriptGeneration(showToast = true) {
    const state = get();
    if (state.isAnalyzingMaterial) {
      if (showToast) toast.info('素材理解中，完成后再生成剧本');
      return;
    }
    
    if (scriptGenAbortController) {
      scriptGenAbortController.abort();
    }
    scriptGenAbortController = new AbortController();
    const signal = scriptGenAbortController.signal;

    set({ isGeneratingScript: true, scriptGenPhase: 'stitching_script', scriptGenProgress: 20 });

    try {
      const projectId = await ensureCurrentProject();
      const res = await fetch('/api/script/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          videoAnalysis: state.analysisResult,
          productDescription: state.productDescription.trim() || '未知商品',
          productImageUrls: state.productImages,
          productVideoUrl: state.productVideos[0] ?? null,
          productVideoUrls: state.productVideos,
          product: currentProductWithMaterialAnalysis(state),
          materialAnalysis: state.materialAnalysis,
          versionType: state.scriptVersion,
          projectId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '生成失败');

      set({ scriptGenProgress: 100, scriptGenPhase: 'done' });

      if (data.product) {
        set({
          parsedProduct: mergeMaterialAnalysis(data.product, get().materialAnalysis),
          editableProduct: null,
          dirtyProductFields: [],
        });
      }

      // 新剧本生成后，旧成片/确认态全部失效，避免对着旧剧本渲染
      get().resetRenderState();
      const generatedScript =
        state.analysisResult && getTimelineEvents(state.analysisResult).length > 0
          ? alignMarkdownToTimelineEvents(data.scriptMarkdown, state.analysisResult)
          : data.scriptMarkdown;
      const scriptManifest = data.scriptManifest as ScriptManifestState;
      const gapPlan = (data.scriptManifest?.gap_plan ?? data.gapPlan) as GapPlanState;
      const version = buildSavedScriptVersion({
        versionType: state.scriptVersion,
        generatedScript,
        scriptManifest,
        gapPlan,
      });

      set({
        generatedScript,
        gapPlan,
        scriptManifest,
        scriptVersions: upsertScriptVersion(state.scriptVersions, version),
        activeVersionId: version.id,
        stageBriefsDirty: false,
        isVideoConfirmed: false,
      });

      if (showToast) {
        toast.success("剧本已生成");
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : '生成失败';
      if (showToast) toast.error(msg);
    } finally {
      set({ isGeneratingScript: false, scriptGenPhase: 'idle', scriptGenProgress: 0 });
    }
  },

  /** 并行生成多个策略版本，并存供对比 */
  async generateScriptVersions(types: Array<ScriptVersionType | undefined>) {
    const state = get();
    if (types.length === 0) return;
    if (state.isAnalyzingMaterial) {
      toast.info('素材理解中，完成后再生成多版本剧本');
      return;
    }

    set({ isGeneratingScript: true, scriptGenPhase: 'stitching_script', scriptGenProgress: 20 });
    const projectId = await ensureCurrentProject();

    const baseBody = {
      videoAnalysis: state.analysisResult,
      productDescription: state.productDescription.trim() || '未知商品',
      productImageUrls: state.productImages,
      productVideoUrl: state.productVideos[0] ?? null,
      productVideoUrls: state.productVideos,
      product: currentProductWithMaterialAnalysis(state),
      materialAnalysis: state.materialAnalysis,
      projectId,
    };

    try {
      const results = await Promise.allSettled(
        types.map(async (versionType) => {
          const res = await fetch('/api/script/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...baseBody, versionType }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '生成失败');
          return { versionType, data };
        })
      );

      let mergedVersions = [...state.scriptVersions];
      const newVersions: SavedScriptVersion[] = [];
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const { versionType, data } = r.value;
        const version = buildSavedScriptVersion({
          versionType,
          generatedScript:
            state.analysisResult && getTimelineEvents(state.analysisResult).length > 0
              ? alignMarkdownToTimelineEvents(data.scriptMarkdown, state.analysisResult)
              : data.scriptMarkdown,
          scriptManifest: data.scriptManifest as ScriptManifestState,
          gapPlan: (data.scriptManifest?.gap_plan ?? data.gapPlan) as GapPlanState,
        });
        mergedVersions = upsertScriptVersion(mergedVersions, version);
        newVersions.push(version);
      }

      if (newVersions.length === 0) throw new Error('全部版本生成失败');

      get().resetRenderState();
      const first = newVersions[0];
      set({
        scriptVersions: mergedVersions,
        activeVersionId: first.id,
        generatedScript: first.generatedScript,
        scriptManifest: first.scriptManifest,
        gapPlan: first.gapPlan,
        scriptVersion: first.versionType,
        stageBriefsDirty: false,
        isVideoConfirmed: false,
        scriptGenProgress: 100,
        scriptGenPhase: 'done',
      });

      const failed = results.filter((r) => r.status === 'rejected').length;
      toast.success(`已生成 ${newVersions.length} 个版本${failed ? `（${failed} 个失败）` : ''}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '多版本生成失败');
    } finally {
      set({ isGeneratingScript: false, scriptGenPhase: 'idle', scriptGenProgress: 0 });
    }
  },

  /** 生成单个策略版本并切换为当前方案 */
  async generateSingleScriptVersion(versionType: ScriptVersionType | undefined) {
    const state = get();
    if (state.isAnalyzingMaterial) {
      toast.info('素材理解中，完成后再生成剧本');
      return;
    }
    if (state.isGeneratingScript) return;

    const existing = state.scriptVersions.find(
      (v) => versionKeyOf(v.versionType) === versionKeyOf(versionType)
    );
    if (existing) {
      workbenchActions.selectScriptVersion(existing.id);
      return;
    }

    set({ isGeneratingScript: true, scriptGenPhase: 'stitching_script', scriptGenProgress: 20 });
    try {
      const projectId = await ensureCurrentProject();
      const res = await fetch('/api/script/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoAnalysis: state.analysisResult,
          productDescription: state.productDescription.trim() || '未知商品',
          productImageUrls: state.productImages,
          productVideoUrl: state.productVideos[0] ?? null,
          productVideoUrls: state.productVideos,
          product: currentProductWithMaterialAnalysis(state),
          materialAnalysis: state.materialAnalysis,
          versionType,
          projectId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '生成失败');

      if (data.product) {
        set({
          parsedProduct: mergeMaterialAnalysis(data.product, get().materialAnalysis),
          editableProduct: null,
          dirtyProductFields: [],
        });
      }

      get().resetRenderState();
      const generatedScript =
        state.analysisResult && getTimelineEvents(state.analysisResult).length > 0
          ? alignMarkdownToTimelineEvents(data.scriptMarkdown, state.analysisResult)
          : data.scriptMarkdown;
      const scriptManifest = data.scriptManifest as ScriptManifestState;
      const gapPlan = (data.scriptManifest?.gap_plan ?? data.gapPlan) as GapPlanState;
      const version = buildSavedScriptVersion({
        versionType,
        generatedScript,
        scriptManifest,
        gapPlan,
      });

      set({
        scriptVersions: upsertScriptVersion(get().scriptVersions, version),
        activeVersionId: version.id,
        generatedScript,
        scriptManifest,
        gapPlan,
        scriptVersion: versionType,
        stageBriefsDirty: false,
        isVideoConfirmed: false,
        scriptGenProgress: 100,
        scriptGenPhase: 'done',
      });
      toast.success(`「${version.label}」已生成`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '版本生成失败');
    } finally {
      set({ isGeneratingScript: false, scriptGenPhase: 'idle', scriptGenProgress: 0 });
    }
  },

  /** 记录某缺口的补全策略选择（不立即重算） */
  setGapStrategyChoice(gapCode: string, strategyKey: string) {
    const choices = { ...get().gapStrategyChoices };
    if (choices[gapCode] === strategyKey) delete choices[gapCode];
    else choices[gapCode] = strategyKey;
    set({ gapStrategyChoices: choices });
  },

  /** 将已选补全策略写入受影响镜头的 stage_brief 并重写剧本 */
  async applyGapStrategies() {
    const state = get();
    if (!state.scriptManifest || !state.gapPlan) return;
    const blocks = Array.isArray(state.scriptManifest.blocks)
      ? state.scriptManifest.blocks
      : [];
    const gaps = Array.isArray(state.gapPlan.gaps) ? state.gapPlan.gaps : [];
    if (!blocks.length || !gaps.length) {
      toast.error('剧本数据不完整，请重新生成剧本');
      return;
    }
    const choices = state.gapStrategyChoices;
    if (Object.keys(choices).length === 0) {
      toast.info('请先为缺口选择补全策略');
      return;
    }

    // 收集每个镜头需要追加的补全指令
    const shotInstructions = new Map<number, string[]>();
    for (const gap of gaps) {
      const strategyKey = choices[gap.code];
      if (!strategyKey) continue;
      const strategy = GAP_FILL_STRATEGIES.find((s) => s.key === strategyKey);
      if (!strategy) continue;
      const affected =
        gap.affected_shots && gap.affected_shots.length > 0
          ? gap.affected_shots
          : blocks.flatMap((b) =>
              Array.isArray(b.shots) ? b.shots.map((s) => s.index) : []
            );
      for (const idx of affected) {
        const arr = shotInstructions.get(idx) ?? [];
        arr.push(strategy.instruction);
        shotInstructions.set(idx, arr);
      }
    }

    const next = {
      ...state.scriptManifest,
      blocks: blocks.map((block) => ({
        ...block,
        shots: (Array.isArray(block.shots) ? block.shots : []).map((s) => {
          const extra = shotInstructions.get(s.index);
          if (!extra?.length) return s;
          const base = s.stage_brief?.trim();
          const additions = extra.filter((t) => !base?.includes(t));
          if (additions.length === 0) return s;
          const merged = [base, ...additions].filter(Boolean).join('；');
          return { ...s, stage_brief: merged };
        }),
      })),
    };

    set({ scriptManifest: next, stageBriefsDirty: true });
    await workbenchActions.regenerateScriptWithStageBriefs();
  },

  /** 切换已生成的版本为当前活动版本 */
  selectScriptVersion(id: string) {
    const state = get();
    const version = state.scriptVersions.find((v) => v.id === id);
    if (!version || id === state.activeVersionId) return;

    get().resetRenderState();
    set({
      activeVersionId: id,
      generatedScript: version.generatedScript,
      scriptManifest: version.scriptManifest,
      gapPlan: version.gapPlan,
      scriptVersion: version.versionType,
      stageBriefsDirty: false,
      isVideoConfirmed: false,
    });
    toast.success(`已切换到「${version.label}」`);
  },

  async regenerateScriptWithStageBriefs() {
    const state = get();
    if (!state.scriptManifest) return;
    const blocks = Array.isArray(state.scriptManifest.blocks)
      ? state.scriptManifest.blocks
      : [];
    if (!blocks.length) {
      toast.error('剧本数据不完整，请重新生成剧本');
      return;
    }
    if (state.isAnalyzingMaterial) {
      toast.info('素材理解中，完成后再更新剧本');
      return;
    }
    
    set({ isUpdatingScript: true });
    
    try {
      const projectId = await ensureCurrentProject();
      const overrides = blocks
        .flatMap((b) => (Array.isArray(b.shots) ? b.shots : []))
        .filter((s) => s.stage_brief?.trim())
        .map((s) => ({
          shot_index: s.index,
          narrative_stage: s.narrative_stage,
          stage_brief: s.stage_brief!.trim(),
        }));

      const res = await fetch('/api/script/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoAnalysis: state.analysisResult,
          product: currentProductWithMaterialAnalysis(state),
          materialAnalysis: state.materialAnalysis,
          productDescription: state.productDescription.trim() || '未知商品',
          productImageUrls: state.productImages,
          productVideoUrl: state.productVideos[0] ?? null,
          productVideoUrls: state.productVideos,
          stageOverrides: overrides,
          versionType: state.scriptVersion,
          projectId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // 剧本被改写，旧成片失效
      get().resetRenderState();
      const generatedScript =
        state.analysisResult && getTimelineEvents(state.analysisResult).length > 0
          ? alignMarkdownToTimelineEvents(data.scriptMarkdown, state.analysisResult)
          : data.scriptMarkdown;
      const scriptManifest = data.scriptManifest as ScriptManifestState;
      const gapPlan = (data.scriptManifest?.gap_plan ?? data.gapPlan) as GapPlanState;
      const versionSync = syncActiveScriptVersion({
        generatedScript,
        scriptManifest,
        gapPlan,
        versionType: state.scriptVersion,
      });

      set({
        generatedScript,
        gapPlan,
        scriptManifest,
        ...versionSync,
        stageBriefsDirty: false,
        isVideoConfirmed: false,
      });

      toast.success('已根据阶段说明更新剧本');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '剧本更新失败');
    } finally {
      set({ isUpdatingScript: false });
    }
  },

  handleShotBriefSave(shotIndex: number, brief: string) {
    const state = get();
    if (!state.scriptManifest) return;
    const blocks = Array.isArray(state.scriptManifest.blocks)
      ? state.scriptManifest.blocks
      : [];
    if (!blocks.length) {
      toast.error('剧本数据不完整，请重新生成剧本');
      return;
    }
    
    const next = {
      ...state.scriptManifest,
      blocks: blocks.map((block) => ({
        ...block,
        shots: (Array.isArray(block.shots) ? block.shots : []).map((s) =>
          s.index === shotIndex
            ? { ...s, stage_brief: brief.trim() || undefined }
            : s
        ),
      })),
    };
    
    set({ scriptManifest: next, stageBriefsDirty: true });
  },

  async handleGeneratePackaging() {
    const state = get();
    if (!state.scriptManifest || !state.parsedProduct) {
      toast.error('请先生成剧本');
      return;
    }
    set({ isGeneratingPackaging: true });
    try {
      const projectId = await ensureCurrentProject();
      const coverPrompt = "清爽商业广告底图，单一商品英雄位，画面下方保留标题空间";
      const featurePrompt = "干净电商编辑页底图，商品靠右展示，左侧保留信息空间";
      const product = currentProductWithMaterialAnalysis(state) ?? state.parsedProduct;

      const [coverRes, featureRes] = await Promise.all([
        fetch('/api/packaging/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product,
            prompt: coverPrompt,
            productImageUrls: state.productImages,
            type: 'cover',
            projectId,
          }),
        }),
        fetch('/api/packaging/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product,
            prompt: featurePrompt,
            productImageUrls: state.productImages,
            type: 'feature_card',
            projectId,
          }),
        }),
      ]);

      const coverData = await coverRes.json();
      const featureData = await featureRes.json();

      if (!coverRes.ok) throw new Error(coverData.error || '封面生成失败');
      if (!featureRes.ok) throw new Error(featureData.error || '卖点卡片生成失败');

      set({
        scriptManifest: {
          ...state.scriptManifest,
          cover_image_url: coverData.url,
          feature_card_url: featureData.url,
        }
      });
      await workbenchActions.persistCurrentScript();
      toast.success('画面包装生成成功');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '画面包装生成失败');
    } finally {
      set({ isGeneratingPackaging: false });
    }
  },

  /** 重新生成单个包装资产（封面 / 卖点卡），支持自定义 prompt */
  async regeneratePackagingItem(type: 'cover' | 'feature_card', prompt: string) {
    const state = get();
    if (!state.scriptManifest || !state.parsedProduct) {
      toast.error('请先生成剧本');
      return;
    }
    set({ isGeneratingPackaging: true });
    try {
      const projectId = await ensureCurrentProject();
      const product = currentProductWithMaterialAnalysis(state) ?? state.parsedProduct;
      const res = await fetch('/api/packaging/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product,
          prompt: prompt.trim() || (type === 'cover'
            ? '清爽商业广告底图，单一商品英雄位，画面下方保留标题空间'
            : '干净电商编辑页底图，商品靠右展示，左侧保留信息空间'),
          productImageUrls: state.productImages,
          type,
          projectId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '包装生成失败');
      set({
        scriptManifest: {
          ...state.scriptManifest,
          ...(type === 'cover' ? { cover_image_url: data.url } : { feature_card_url: data.url }),
        },
      });
      await workbenchActions.persistCurrentScript();
      toast.success(type === 'cover' ? '封面已重新生成' : '卖点卡已重新生成');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '包装生成失败');
    } finally {
      set({ isGeneratingPackaging: false });
    }
  },

  async handleRenderVideo() {
    const state = get();
    if (!state.scriptManifest || !state.parsedProduct) {
      toast.error('请先生成剧本');
      return;
    }
    
    const projectId = await ensureCurrentProject();
    set({
      isVideoGenerating: true,
      renderBlocked: false,
      renderSummary: null,
      renderProgress: 0,
      renderSteps: [],
    });

    const pollGen = ++renderPollGen;

    const payload = {
      scriptManifest: state.scriptManifest,
      product: currentProductWithMaterialAnalysis(state) ?? state.parsedProduct,
      productImageUrls: state.productImages,
      productVideoUrl: state.productVideos[0] ?? null,
      productVideoUrls: state.productVideos,
      referenceVideoUrl: state.uploadedVideoUrl,
      async: true,
      projectId,
    };

    try {
      const res = await fetch('/api/render/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.status === 202 && data.jobId) {
        toast.info('百炼渲染任务已创建，正在轮询进度...');
        const jobId = data.jobId as string;
        let done = false;
        const pollDeadline = Date.now() + RENDER_POLL_TIMEOUT_MS;
        while (!done) {
          if (pollGen !== renderPollGen) return;
          if (Date.now() >= pollDeadline) {
            throw new Error('渲染等待超时，请稍后重试或重新生成');
          }

          await new Promise((r) => setTimeout(r, 2000));

          if (pollGen !== renderPollGen) return;

          const poll = await fetch(`/api/render/jobs/${jobId}`);
          const job = await poll.json();

          if (pollGen !== renderPollGen) return;

          if (!poll.ok) {
            const msg =
              poll.status === 404
                ? '渲染任务已丢失（开发环境热更新可能导致），请重新点击生成'
                : job.error || '查询渲染进度失败';
            throw new Error(msg);
          }

          set({ renderProgress: job.progress ?? 0 });
          if (job.steps?.length) {
            set({
              renderSteps: job.steps.slice(-6).map((s: { label: string; status: string }) => ({
                label: s.label,
                status: s.status,
              }))
            });
          }
          if (job.status === 'succeeded' && job.result) {
            workbenchActions.applyRenderResult(job.result);
            toast.success(`视频生成完成 · ${job.result.summary}`);
            done = true;
          } else if (job.status === 'failed') {
            set({ renderBlocked: true });
            toast.error(job.error || '渲染失败');
            done = true;
          }
        }
        return;
      }

      if (!res.ok) throw new Error(data.error || '渲染失败');
      workbenchActions.applyRenderResult(data);
      if (data.blocked) {
        toast.error(data.block_reason || '渲染被阻塞');
      } else if (data.final_video) {
        toast.success(`视频生成完成 · ${data.summary}`);
      }
    } catch (err: unknown) {
      if (pollGen === renderPollGen) {
        const msg = err instanceof Error ? err.message : '渲染失败';
        toast.error(msg);
      }
    } finally {
      if (pollGen === renderPollGen) {
        set({ isVideoGenerating: false });
      }
    }
  },

  applyRenderResult(data: Record<string, unknown>) {
    if (data.scriptManifest) {
      const manifest = data.scriptManifest as unknown as ScriptManifestState;
      set({ scriptManifest: manifest });
      // gapPlan 以 manifest.gap_plan 为权威来源，保持两处同步
      if (manifest.gap_plan) set({ gapPlan: manifest.gap_plan });
    }
    if (data.gap_plan) set({ gapPlan: data.gap_plan as unknown as GapPlanState });
    set({
      coverThumbnail: (data.cover_thumbnail as string) ?? null,
      renderSummary: (data.summary as string) ?? null,
      renderBlocked: (data.blocked as boolean) ?? false,
    });
    if (data.chunk_videos) set({ chunkVideos: data.chunk_videos as string[] });
    if (data.final_video) set({ generatedVideoUrl: data.final_video as string });
  },

  async handleConcatOnly() {
    const state = get();
    if (state.chunkVideos.filter(Boolean).length < 2) {
      toast.error("至少需要 2 个区块视频才能拼接");
      return;
    }
    set({ isConcatting: true });
    try {
      const res = await fetch("/api/render/concat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chunkVideos: state.chunkVideos,
          projectId: state.projectId,
          scriptManifest: state.scriptManifest,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "拼接失败");
      set({ generatedVideoUrl: data.final_video, staleRerunHint: null });
      toast.success("成片已重新拼接");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "拼接失败");
    } finally {
      set({ isConcatting: false });
    }
  }
};
