import type { ScriptManifest } from "@/lib/types/pipeline";

export type RerunStrategy = "single" | "cascade";

export interface BlockMeta {
  index: number;
  render_mode: string;
  is_continuation: boolean;
  isFirst: boolean;
  isLast: boolean;
}

export interface RerunPlan {
  blocksToRun: number[];
  downstreamCount: number;
  strategy: RerunStrategy;
}

export function getBlockMeta(manifest: ScriptManifest, blockIndex: number): BlockMeta {
  const block = manifest.blocks.find((b) => b.index === blockIndex);
  if (!block) throw new Error(`区块 ${blockIndex} 不存在`);
  const sorted = [...manifest.blocks].sort((a, b) => a.index - b.index);
  return {
    index: block.index,
    render_mode: block.render_mode,
    is_continuation: block.is_continuation,
    isFirst: sorted[0]?.index === blockIndex,
    isLast: sorted[sorted.length - 1]?.index === blockIndex,
  };
}

export function getRerunPlan(
  manifest: ScriptManifest,
  startBlockIndex: number,
  strategy: RerunStrategy = "cascade"
): RerunPlan {
  const sorted = [...manifest.blocks].sort((a, b) => a.index - b.index);
  const startIdx = sorted.findIndex((b) => b.index === startBlockIndex);
  if (startIdx < 0) throw new Error(`区块 ${startBlockIndex} 不存在`);

  const blocksToRun =
    strategy === "cascade"
      ? sorted.slice(startIdx).map((b) => b.index)
      : [startBlockIndex];

  const downstreamCount = sorted.length - startIdx - 1;

  return {
    blocksToRun,
    downstreamCount: strategy === "single" ? downstreamCount : 0,
    strategy,
  };
}
