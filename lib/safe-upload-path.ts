import { join, resolve, sep } from 'path';

/**
 * 将客户端传入的 `/uploads/...` 相对路径安全解析为磁盘绝对路径。
 * 仅允许落在 `public/uploads` 目录内，杜绝 `../` 路径遍历读取仓库其他文件（如 .env）。
 *
 * @returns 解析后的绝对路径；非法路径返回 null。
 */
export function resolveSafeUploadPath(urlPath: string | null | undefined): string | null {
  if (!urlPath || typeof urlPath !== 'string') return null;

  // 去掉可能的查询串，仅允许以 /uploads/ 开头
  const cleaned = urlPath.split('?')[0].split('#')[0];
  if (!cleaned.startsWith('/uploads/')) return null;

  const uploadsRoot = resolve(process.cwd(), 'public', 'uploads');
  const candidate = resolve(join(process.cwd(), 'public', cleaned.replace(/^\//, '')));

  // 确保解析结果仍在 uploads 根目录之内
  if (candidate !== uploadsRoot && !candidate.startsWith(uploadsRoot + sep)) {
    return null;
  }
  return candidate;
}
