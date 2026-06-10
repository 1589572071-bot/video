"use client";

function isAlreadyProxied(value: string): boolean {
  return value.startsWith("/api/assets/public") || value.includes("/api/assets/public?");
}

function isLocalUploads(value: string): boolean {
  return value.startsWith("/uploads/") || value.startsWith("uploads/");
}

function isManagedKey(value: string): boolean {
  return value.startsWith("/metacut/") || value.startsWith("metacut/");
}

function isManagedObjectUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.hostname.includes("objectstorage") || url.pathname.includes("/metacut/");
  } catch {
    return false;
  }
}

/** UI 预览专用：把本地/对象存储资源转成同源代理 URL，不改变 store 中保存的原始 URL。 */
export function previewAssetUrl(url?: string | null): string {
  if (!url) return "";
  if (url.startsWith("data:") || url.startsWith("blob:") || isAlreadyProxied(url)) return url;

  if (isLocalUploads(url)) {
    const normalized = url.startsWith("/") ? url : `/${url}`;
    return `/api/assets/public?path=${encodeURIComponent(normalized)}`;
  }

  if (isManagedKey(url)) {
    const key = url.replace(/^\/+/, "");
    return `/api/assets/public?key=${encodeURIComponent(key)}`;
  }

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return isManagedObjectUrl(url)
      ? `/api/assets/public?url=${encodeURIComponent(url)}`
      : url;
  }

  return url;
}
