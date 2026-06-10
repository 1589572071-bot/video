import { randomUUID } from "crypto";
import { orchestrateRender, summarizeRender } from "@/lib/render-orchestrator";
import { isBailianConfigured, MODEL_CONFIG } from "@/lib/model-config";
import {
  appendRenderStep,
  createRenderJob,
  getRenderJob,
  updateRenderJob,
} from "@/lib/render-job-store";
import type { ProductInput, ScriptManifest } from "@/lib/types/pipeline";

export interface RenderRequestBody {
  scriptManifest: ScriptManifest;
  product: ProductInput;
  productImageUrls?: string[];
  productVideoUrl?: string | null;
  productVideoUrls?: string[];
  referenceVideoUrl?: string | null;
  mockMode?: boolean;
  async?: boolean;
  projectId?: string | null;
}

function resolveMockMode(body: RenderRequestBody): boolean {
  if (body.mockMode === true) return true;
  if (body.mockMode === false) return !isBailianConfigured();
  return MODEL_CONFIG.render.mockMode;
}

async function runRenderJob(
  jobId: string,
  body: RenderRequestBody,
  requestOrigin?: string
) {
  await updateRenderJob(jobId, { status: "running", progress: 5 });
  await appendRenderStep(jobId, {
    id: "video",
    label: "万相2.6 分块渲染",
    status: "processing",
    at: new Date().toISOString(),
  });

  try {
    const mockMode = resolveMockMode(body);
    const result = await orchestrateRender({
      manifest: body.scriptManifest,
      product: body.product,
      productImageUrls: body.productImageUrls,
      productVideoUrl: body.productVideoUrl,
      productVideoUrls: body.productVideoUrls,
      referenceVideoUrl: body.referenceVideoUrl,
      mockMode,
      requestOrigin,
      projectId: body.projectId,
      onProgress: (progress, message) => {
        void updateRenderJob(jobId, { progress, status: "running" });
        void appendRenderStep(jobId, {
          id: `progress-${progress}`,
          label: message,
          status: progress >= 100 ? "success" : "processing",
          message,
          at: new Date().toISOString(),
        });
      },
    });

    await appendRenderStep(jobId, {
      id: "video",
      label: "万相2.6 + FFmpeg",
      status: result.blocked ? "failed" : "success",
      message: result.block_reason,
    });

    await updateRenderJob(jobId, {
      status: result.blocked ? "failed" : "succeeded",
      progress: 100,
      result: {
        ...result,
        summary: summarizeRender(result),
        scriptManifest: body.scriptManifest,
      },
      error: result.block_reason,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "渲染失败";
    await updateRenderJob(jobId, { status: "failed", progress: 100, error: msg });
    await appendRenderStep(jobId, {
      id: "error",
      label: "渲染失败",
      status: "failed",
      message: msg,
    });
  }
}

export async function handleRenderPost(
  body: RenderRequestBody,
  requestOrigin?: string
) {
  if (!body.scriptManifest?.blocks) {
    return { error: "缺少 scriptManifest", status: 400 as const };
  }

  const useAsync =
    body.async === true ||
    (!resolveMockMode(body) && isBailianConfigured());

  if (useAsync) {
    const jobId = randomUUID();
    await createRenderJob(jobId, body.projectId);
    // 后台执行（Next.js serverless 注意：dev 环境可用）
    void runRenderJob(jobId, body, requestOrigin);
    return {
      status: 202 as const,
      data: { jobId, async: true, message: "渲染任务已创建，请轮询 /api/render/jobs/{jobId}" },
    };
  }

  const mockMode = resolveMockMode(body);
  const result = await orchestrateRender({
    manifest: body.scriptManifest,
    product: body.product,
    productImageUrls: body.productImageUrls,
    productVideoUrl: body.productVideoUrl,
    productVideoUrls: body.productVideoUrls,
    referenceVideoUrl: body.referenceVideoUrl,
    mockMode,
    requestOrigin,
    projectId: body.projectId,
  });

  return {
    status: 200 as const,
    data: {
      success: !result.blocked,
      summary: summarizeRender(result),
      ...result,
      scriptManifest: body.scriptManifest,
    },
  };
}

export { getRenderJob };
