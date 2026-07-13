const MB = 1024 * 1024;

/** 参考视频 / 商品演示视频上传上限 */
export const MAX_UPLOAD_VIDEO_BYTES = 50 * MB;

/** 送入豆包 VLM 分析的视频体积极限 */
export const MAX_ANALYZE_VIDEO_BYTES = 50 * MB;

/** 按体积分档降低 VLM 采样 fps，兼顾理解精度与 token 成本 */
export function pickVideoAnalysisFps(sizeBytes: number): number {
  if (sizeBytes <= 8 * MB) return 1;
  if (sizeBytes <= 20 * MB) return 0.5;
  return 0.3;
}
