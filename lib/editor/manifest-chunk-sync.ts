export interface AlignChunkResult {
  aligned: string[];
  removedIndices: number[];
  addedSlots: number;
  truncated: boolean;
}

export interface ManifestDiff {
  changed: boolean;
  staleFromBlock: number | null;
  blockCountChanged: boolean;
  blockCountDelta: number;
  changedBlockIndices: number[];
  reasons: string[];
}

interface ManifestBlockLike {
  index: number;
  start: number;
  end: number;
  render_mode?: string;
  shots: Array<{
    index: number;
    start: number;
    end: number;
    narrative_stage: string;
    stage_brief?: string;
  }>;
}

type ManifestLike = { blocks: ManifestBlockLike[] };

function sortedBlocks(manifest: ManifestLike): ManifestBlockLike[] {
  return [...manifest.blocks].sort((a, b) => a.index - b.index);
}

function shotSignature(shot: ManifestBlockLike["shots"][number]): string {
  return [
    shot.index,
    shot.start.toFixed(1),
    shot.end.toFixed(1),
    shot.narrative_stage,
    (shot.stage_brief ?? "").trim(),
  ].join(":");
}

function blockSignature(block: ManifestBlockLike): string {
  return [
    block.index,
    block.start.toFixed(1),
    block.end.toFixed(1),
    block.render_mode ?? "",
    block.shots.map(shotSignature).join("|"),
  ].join("#");
}

/** 按 manifest.blocks.length 截断或补空 chunk 槽位 */
export function alignChunkVideos(
  manifest: ManifestLike,
  chunkVideos: string[]
): AlignChunkResult {
  const blockCount = manifest.blocks.length;
  const aligned = [...chunkVideos];
  const removedIndices: number[] = [];

  if (aligned.length > blockCount) {
    for (let i = blockCount; i < aligned.length; i++) {
      if (aligned[i]) removedIndices.push(i);
    }
    aligned.length = blockCount;
  }

  while (aligned.length < blockCount) {
    aligned.push("");
  }

  return {
    aligned,
    removedIndices,
    addedSlots: Math.max(0, blockCount - chunkVideos.length),
    truncated: chunkVideos.length > blockCount,
  };
}

/** 对比前后 manifest，找出需重跑的区块与原因 */
export function diffManifestBlocks(
  prev: ManifestLike,
  next: ManifestLike
): ManifestDiff {
  const prevBlocks = sortedBlocks(prev);
  const nextBlocks = sortedBlocks(next);
  const reasons: string[] = [];
  const changedBlockIndices: number[] = [];

  const blockCountDelta = nextBlocks.length - prevBlocks.length;
  const blockCountChanged = blockCountDelta !== 0;

  if (blockCountChanged) {
    reasons.push(
      blockCountDelta > 0
        ? `区块数 ${prevBlocks.length} → ${nextBlocks.length}`
        : `区块数 ${prevBlocks.length} → ${nextBlocks.length}`
    );
  }

  const prevByIndex = new Map(prevBlocks.map((b) => [b.index, b]));
  const nextByIndex = new Map(nextBlocks.map((b) => [b.index, b]));

  for (const block of nextBlocks) {
    const old = prevByIndex.get(block.index);
    if (!old) {
      changedBlockIndices.push(block.index);
      reasons.push(`新增区块 ${block.index}`);
      continue;
    }
    if (blockSignature(old) !== blockSignature(block)) {
      changedBlockIndices.push(block.index);
      reasons.push(`区块 ${block.index} 结构或内容变更`);
    }
  }

  for (const block of prevBlocks) {
    if (!nextByIndex.has(block.index)) {
      reasons.push(`移除区块 ${block.index}`);
    }
  }

  const changed =
    blockCountChanged ||
    changedBlockIndices.length > 0 ||
    prevBlocks.some((b) => !nextByIndex.has(b.index));

  let staleFromBlock: number | null = null;
  if (changed) {
    if (changedBlockIndices.length > 0) {
      staleFromBlock = Math.min(...changedBlockIndices);
    } else if (blockCountChanged && nextBlocks.length > 0) {
      staleFromBlock = nextBlocks[0].index;
    } else if (prevBlocks.length > nextBlocks.length && nextBlocks.length > 0) {
      staleFromBlock = nextBlocks[nextBlocks.length - 1].index;
    } else {
      staleFromBlock = 1;
    }
  }

  return {
    changed,
    staleFromBlock,
    blockCountChanged,
    blockCountDelta,
    changedBlockIndices: Array.from(new Set(changedBlockIndices)).sort((a, b) => a - b),
    reasons,
  };
}

/** 根据 diff / align 生成用户可见的过期提示 */
export function buildStaleHint(
  diff: ManifestDiff | null,
  align: AlignChunkResult,
  hasVideo: boolean
): string | null {
  if (!hasVideo) return null;

  if (align.truncated && align.removedIndices.length > 0) {
    return "剧本区块已减少，已移除多余区块视频，请重新拼接或从剩余区块批量重跑";
  }

  if (!diff?.changed && align.addedSlots > 0) {
    const firstEmpty = align.aligned.findIndex((c) => !c);
    const blockNum = firstEmpty >= 0 ? firstEmpty + 1 : 1;
    return `剧本新增区块，请全片重新生成或从区块 ${blockNum} 批量重跑`;
  }

  if (!diff?.changed) return null;

  const n = diff.staleFromBlock ?? 1;

  if (diff.blockCountDelta > 0) {
    return `剧本已变更（新增 ${diff.blockCountDelta} 个区块），建议从区块 ${n} 批量重跑或全片重新生成`;
  }

  if (diff.blockCountDelta < 0) {
    return "剧本已变更（区块减少），请重新拼接成片或全片重新生成";
  }

  if (diff.changedBlockIndices.length > 0) {
    return `剧本已更新，视频未变，建议从区块 ${n} 批量重跑或全片重新生成`;
  }

  return "剧本已变更，建议全片重新生成";
}

export function buildAssetStaleHint(): string {
  return "商品素材已变更，建议全片重新生成";
}
