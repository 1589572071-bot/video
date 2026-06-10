import { rerunBlocks } from "@/lib/editor/rerun-block";
import {
  alignChunkVideos,
  buildStaleHint,
  diffManifestBlocks,
} from "@/lib/editor/manifest-chunk-sync";
import { stitchWithGaps } from "@/lib/script-stitch";
import { collectStageOverrides, applyStageOverrides } from "@/lib/script-stage-brief";
import {
  alignManifestToTimelineEvents,
  getTimelineEvents,
} from "@/lib/timeline-shot-align";
import type {
  ProductInput,
  ScriptManifest,
  StageBriefOverride,
  VideoAnalysisInput,
} from "@/lib/types/pipeline";
import type { Wan26VideoMode } from "@/lib/providers/wan26-video";
import type { DirectorAction, DirectorActionResult } from "./tools";

export interface DirectorExecuteContext {
  scriptManifest?: ScriptManifest | null;
  product?: ProductInput | null;
  productImageUrls?: string[];
  productVideoUrls?: string[];
  videoAnalysis?: VideoAnalysisInput | null;
  requestOrigin?: string;
  chunkVideos?: string[];
  projectId?: string | null;
}

function patchManifestBriefs(
  manifest: ScriptManifest,
  params: Record<string, unknown>
): ScriptManifest {
  const brief = String(params.stage_brief ?? "").trim();
  if (!brief) return manifest;

  const shotIndex = params.shot_index as number | undefined;
  const narrativeStage = params.narrative_stage as string | undefined;
  const shotIndices = params.shot_indices as number[] | undefined;

  const overrides: StageBriefOverride[] = [];

  if (shotIndex) {
    const shot = manifest.blocks.flatMap((b) => b.shots).find((s) => s.index === shotIndex);
    if (shot) {
      overrides.push({
        shot_index: shotIndex,
        narrative_stage: shot.narrative_stage,
        stage_brief: brief,
      });
    }
  } else if (shotIndices?.length) {
    for (const idx of shotIndices) {
      const shot = manifest.blocks.flatMap((b) => b.shots).find((s) => s.index === idx);
      if (shot) {
        overrides.push({
          shot_index: idx,
          narrative_stage: shot.narrative_stage,
          stage_brief: brief,
        });
      }
    }
  } else if (narrativeStage) {
    for (const shot of manifest.blocks.flatMap((b) => b.shots)) {
      if (shot.narrative_stage === narrativeStage) {
        overrides.push({
          shot_index: shot.index,
          narrative_stage: shot.narrative_stage,
          stage_brief: brief,
        });
      }
    }
  }

  return applyStageOverrides(manifest, overrides);
}

function ensureSampleTimelineAligned(
  manifest: ScriptManifest,
  ctx: DirectorExecuteContext
): ScriptManifest {
  if (!ctx.videoAnalysis || getTimelineEvents(ctx.videoAnalysis).length === 0) {
    return manifest;
  }
  return alignManifestToTimelineEvents(
    manifest,
    ctx.videoAnalysis,
    ctx.product ?? undefined
  );
}

function withChunkSync(
  result: DirectorActionResult,
  prevManifest: ScriptManifest | null,
  nextManifest: ScriptManifest,
  chunkVideos: string[],
  ctx: DirectorExecuteContext
): DirectorActionResult {
  const aligned = ensureSampleTimelineAligned(nextManifest, ctx);
  const hasVideo = chunkVideos.some(Boolean);
  const align = alignChunkVideos(aligned, chunkVideos);
  const diff = prevManifest ? diffManifestBlocks(prevManifest, aligned) : null;
  const stale_hint = buildStaleHint(diff, align, hasVideo);
  const affected_blocks =
    diff?.changedBlockIndices.length
      ? diff.changedBlockIndices
      : diff?.staleFromBlock
        ? [diff.staleFromBlock]
        : undefined;

  return {
    ...result,
    scriptManifest: aligned,
    ...(hasVideo ? { updated_chunks: align.aligned } : {}),
    affected_blocks,
    stale_hint: stale_hint ?? undefined,
  };
}

async function execRegenerateScript(
  ctx: DirectorExecuteContext,
  manifest: ScriptManifest
): Promise<DirectorActionResult> {
  const product = ctx.product;
  if (!product) {
    return { tool: "regenerateScript", success: false, message: "缺少商品信息，无法重生成剧本" };
  }

  const videoUrls = ctx.productVideoUrls ?? [];
  const stitched = await stitchWithGaps({
    videoAnalysis: ctx.videoAnalysis ?? null,
    product,
    productImageUrls: ctx.productImageUrls ?? [],
    productVideoUrl: videoUrls[0] ?? null,
    productVideoUrls: videoUrls,
    stageOverrides: collectStageOverrides(manifest),
  });

  return {
    tool: "regenerateScript",
    success: true,
    message: "剧本已重生成",
    scriptMarkdown: stitched.scriptMarkdown,
    scriptManifest: stitched.scriptManifest,
    gapPlan: stitched.gapPlan,
  };
}

export async function executeDirectorActions(
  actions: DirectorAction[],
  ctx: DirectorExecuteContext
): Promise<DirectorActionResult[]> {
  const results: DirectorActionResult[] = [];
  let manifest = ctx.scriptManifest ?? null;

  for (const action of actions) {
    try {
      if (action.tool === "updateStageBrief") {
        if (!manifest) {
          results.push({
            tool: action.tool,
            success: false,
            message: "缺少剧本 manifest",
          });
          continue;
        }
        const prevManifest = manifest;
        manifest = patchManifestBriefs(manifest, action.params);
        const autoRegenerate = action.params.auto_regenerate !== false;
        if (autoRegenerate && ctx.product) {
          const regen = await execRegenerateScript(ctx, manifest);
          const nextManifest = regen.scriptManifest ?? manifest;
          results.push(
            withChunkSync(
              {
                tool: action.tool,
                success: regen.success,
                message: regen.success ? "阶段说明已更新并重生成剧本" : regen.message,
                scriptMarkdown: regen.scriptMarkdown,
                scriptManifest: nextManifest,
                gapPlan: regen.gapPlan,
              },
              prevManifest,
              nextManifest,
              ctx.chunkVideos ?? [],
              ctx
            )
          );
          if (regen.scriptManifest) manifest = regen.scriptManifest;
        } else {
          results.push(
            withChunkSync(
              {
                tool: action.tool,
                success: true,
                message: "阶段说明已更新",
                scriptManifest: manifest,
              },
              prevManifest,
              manifest,
              ctx.chunkVideos ?? [],
              ctx
            )
          );
        }
        continue;
      }

      if (action.tool === "regenerateScript") {
        if (!manifest) {
          results.push({
            tool: action.tool,
            success: false,
            message: "缺少剧本 manifest",
          });
          continue;
        }
        const prevManifest = manifest;
        const regen = await execRegenerateScript(ctx, manifest);
        const nextManifest = regen.scriptManifest ?? manifest;
        results.push(
          withChunkSync(
            regen,
            prevManifest,
            nextManifest,
            ctx.chunkVideos ?? [],
            ctx
          )
        );
        if (regen.scriptManifest) manifest = regen.scriptManifest;
        continue;
      }

      if (action.tool === "rerunBlock" || action.tool === "switchRenderModel") {
        if (!manifest || !ctx.product) {
          results.push({
            tool: action.tool,
            success: false,
            message: "缺少剧本或商品信息",
          });
          continue;
        }
        const blockIndex = Number(action.params.block_index);
        const forcedMode =
          action.tool === "switchRenderModel"
            ? (action.params.mode as Wan26VideoMode)
            : undefined;

        const batch = await rerunBlocks({
          manifest,
          product: ctx.product,
          startBlockIndex: blockIndex,
          strategy: "cascade",
          existingChunkVideos: ctx.chunkVideos ?? [],
          productImageUrls: ctx.productImageUrls,
          requestOrigin: ctx.requestOrigin,
          projectId: ctx.projectId,
          forcedMode,
        });

        const last = batch.results[batch.results.length - 1];
        const reran = batch.reran_blocks;
        const rangeLabel =
          reran.length > 1 ? `区块 ${reran[0]}–${reran[reran.length - 1]}` : `区块 ${blockIndex}`;

        results.push({
          tool: action.tool,
          success: true,
          message: `${rangeLabel} 已重跑 · ${last?.mode ?? "ok"}${batch.final_video ? " · 已更新成片" : ""}`,
          block_index: blockIndex,
          local_url: last?.local_url,
          mode: last?.mode,
          updated_chunks: batch.updated_chunks,
          final_video: batch.final_video,
          reran_blocks: reran,
          strategy: "cascade",
        });
        continue;
      }

      results.push({
        tool: action.tool,
        success: false,
        message: `未知工具：${action.tool}`,
      });
    } catch (e) {
      results.push({
        tool: action.tool,
        success: false,
        message: e instanceof Error ? e.message : "执行失败",
      });
    }
  }

  return results;
}
