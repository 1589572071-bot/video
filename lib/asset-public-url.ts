import { MODEL_CONFIG } from "@/lib/model-config";
import { readLocalAssetBase64 } from "@/lib/local-asset";

const PLACEHOLDER_MARKERS = ["your-public-domain", "example.com"];

function isPlaceholderOrigin(origin: string): boolean {
  const lower = origin.toLowerCase();
  return PLACEHOLDER_MARKERS.some((m) => lower.includes(m));
}

function isLocalOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      host.endsWith(".local")
    );
  } catch {
    return true;
  }
}

/** 解析可供百炼拉取素材的 Origin（配置优先，其次请求 Origin） */
export function resolveAssetServingOrigin(requestOrigin?: string): string | null {
  const configured = (MODEL_CONFIG.bailian.publicOrigin || "").trim();
  if (configured && !isPlaceholderOrigin(configured) && !isLocalOrigin(configured)) {
    return configured.replace(/\/$/, "");
  }

  const fromEnv = (process.env.NEXT_PUBLIC_APP_ORIGIN || "").trim();
  if (fromEnv && !isPlaceholderOrigin(fromEnv) && !isLocalOrigin(fromEnv)) {
    return fromEnv.replace(/\/$/, "");
  }

  const req = (requestOrigin || "").trim();
  if (req && !isLocalOrigin(req)) {
    return req.replace(/\/$/, "");
  }

  return null;
}

function isImagePath(path: string): boolean {
  return /\.(jpe?g|png|webp|gif)$/i.test(path);
}

/** 从 Next 请求解析对外 Origin（支持反向代理） */
export function originFromRequestHeaders(
  nextOrigin: string,
  headers: { get(name: string): string | null }
): string {
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (nextOrigin.startsWith("https") ? "https" : "http");
  const host =
    headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    headers.get("host") ||
    "";
  if (host) return `${proto}://${host}`;
  return nextOrigin;
}

/** 将本地 /uploads 路径转为百炼可拉取的公网 URL（同步，无 base64 兜底） */
export function resolvePublicAssetUrl(
  pathOrUrl: string,
  requestOrigin?: string
): string {
  if (!pathOrUrl) return pathOrUrl;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  if (pathOrUrl.startsWith("data:")) return pathOrUrl;

  const normalized = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  const origin = resolveAssetServingOrigin(requestOrigin);
  if (!origin) {
    throw new Error(
      "素材公网地址不可用：请在 .env.local 配置 METACUT_PUBLIC_ORIGIN 为你的公网访问域名（勿用 localhost 或占位符）"
    );
  }

  return `${origin}/api/assets/public?path=${encodeURIComponent(normalized)}`;
}

/**
 * 万相 / 百炼媒体入参：优先公网 URL；无公网时对图片使用 base64（与豆包商品解析一致）
 */
export async function resolveDashScopeMediaUrl(
  pathOrUrl: string,
  requestOrigin?: string
): Promise<string> {
  if (!pathOrUrl) return pathOrUrl;
  if (
    pathOrUrl.startsWith("http://") ||
    pathOrUrl.startsWith("https://") ||
    pathOrUrl.startsWith("data:")
  ) {
    return pathOrUrl;
  }

  const normalized = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  const origin = resolveAssetServingOrigin(requestOrigin);
  if (origin) {
    return `${origin}/api/assets/public?path=${encodeURIComponent(normalized)}`;
  }

  if (isImagePath(normalized)) {
    const { base64, mimeType } = await readLocalAssetBase64(normalized);
    return `data:${mimeType};base64,${base64}`;
  }

  throw new Error(
    "百炼无法下载本地视频素材：请配置 METACUT_PUBLIC_ORIGIN 为公网域名，或仅使用商品图片进行图生视频"
  );
}

/** 批量公网化 */
export function resolvePublicAssetUrls(
  paths: string[],
  requestOrigin?: string
): string[] {
  return paths.map((p) => resolvePublicAssetUrl(p, requestOrigin));
}

export async function resolveDashScopeMediaUrls(
  paths: string[],
  requestOrigin?: string
): Promise<string[]> {
  return Promise.all(paths.map((p) => resolveDashScopeMediaUrl(p, requestOrigin)));
}

export function isPublicUrlAccessible(url: string): boolean {
  if (url.startsWith("data:")) return true;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return !isLocalOrigin(url) && !isPlaceholderOrigin(url);
  }
  return Boolean(resolveAssetServingOrigin());
}
