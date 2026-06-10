import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

export interface StoredAsset {
  key: string | null;
  url: string;
  size: number;
  contentType: string;
}

export interface ManagedAssetBytes {
  key: string;
  bytes: Buffer;
  contentType: string;
  contentLength?: number | null;
  contentRange?: string | null;
}

export interface PutObjectInput {
  bytes: Buffer;
  contentType: string;
  projectId: string;
  assetKind: string;
  filename: string;
  keyOverride?: string;
}

export interface AssetStorage {
  putObject(input: PutObjectInput): Promise<StoredAsset>;
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "asset";
}

function storagePrefix(): string {
  return (process.env.S3_PREFIX || "metacut").replace(/^\/+|\/+$/g, "");
}

export function isS3Configured(): boolean {
  return Boolean(
    process.env.S3_ENDPOINT_INTERNAL &&
      process.env.S3_ENDPOINT_EXTERNAL &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY &&
      process.env.S3_BUCKET
  );
}

function buildObjectKey(input: PutObjectInput): string {
  if (input.keyOverride) return input.keyOverride.replace(/^\/+/, "");
  const prefix = storagePrefix();
  const file = safeName(input.filename);
  return `${prefix}/${input.projectId}/${input.assetKind}/${Date.now()}-${file}`;
}

function getS3Client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT_INTERNAL,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    },
    forcePathStyle: true,
  });
}

function endpointPathname(endpoint: string): string {
  try {
    return new URL(endpoint).pathname.replace(/\/+$/g, "");
  } catch {
    return "";
  }
}

export function parseManagedObjectKey(urlOrPath: string): string | null {
  if (!isS3Configured() || !urlOrPath) return null;

  const bucket = process.env.S3_BUCKET || "";
  const prefix = `${storagePrefix()}/`;

  if (urlOrPath.startsWith("/")) {
    const key = urlOrPath.replace(/^\/+/, "");
    return key.startsWith(prefix) ? key : null;
  }

  if (!urlOrPath.startsWith("http://") && !urlOrPath.startsWith("https://")) {
    const key = urlOrPath.replace(/^\/+/, "");
    return key.startsWith(prefix) ? key : null;
  }

  try {
    const url = new URL(urlOrPath);
    const endpoints = [
      process.env.S3_ENDPOINT_EXTERNAL || "",
      process.env.S3_ENDPOINT_INTERNAL || "",
    ].filter(Boolean);

    const matchedEndpoint = endpoints.some((endpoint) => {
      try {
        const endpointUrl = new URL(endpoint);
        return endpointUrl.origin === url.origin;
      } catch {
        return false;
      }
    });
    if (!matchedEndpoint) return null;

    for (const endpoint of endpoints) {
      const endpointPath = endpointPathname(endpoint);
      const withoutEndpointPath = endpointPath && url.pathname.startsWith(`${endpointPath}/`)
        ? url.pathname.slice(endpointPath.length)
        : url.pathname;
      const path = withoutEndpointPath.replace(/^\/+/, "");
      const bucketPrefix = `${bucket}/`;
      if (path.startsWith(bucketPrefix)) {
        const key = decodeURIComponent(path.slice(bucketPrefix.length));
        return key.startsWith(prefix) ? key : null;
      }
    }

    return null;
  } catch {
    return null;
  }
}

async function objectBodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);

  const maybeTransform = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof maybeTransform.transformToByteArray === "function") {
    return Buffer.from(await maybeTransform.transformToByteArray());
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function readManagedAssetBytes(
  urlOrPath: string,
  range?: string | null
): Promise<ManagedAssetBytes | null> {
  const key = parseManagedObjectKey(urlOrPath);
  if (!key) return null;

  const result = await getS3Client().send(
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET || "",
      Key: key,
      ...(range ? { Range: range } : {}),
    })
  );

  return {
    key,
    bytes: await objectBodyToBuffer(result.Body),
    contentType: result.ContentType || "application/octet-stream",
    contentLength: result.ContentLength ?? null,
    contentRange: result.ContentRange ?? null,
  };
}

class SealosS3Storage implements AssetStorage {
  private client = getS3Client();

  async putObject(input: PutObjectInput): Promise<StoredAsset> {
    const bucket = process.env.S3_BUCKET || "";
    const key = buildObjectKey(input);
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: input.bytes,
        ContentType: input.contentType,
      })
    );
    const external = (process.env.S3_ENDPOINT_EXTERNAL || "").replace(/\/+$/g, "");
    return {
      key,
      url: `${external}/${bucket}/${key}`,
      size: input.bytes.length,
      contentType: input.contentType,
    };
  }
}

class LocalAssetStorage implements AssetStorage {
  async putObject(input: PutObjectInput): Promise<StoredAsset> {
    const key = buildObjectKey(input);
    const publicPath = join(process.cwd(), "public", key);
    const dir = publicPath.slice(0, publicPath.lastIndexOf("/"));
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    await writeFile(publicPath, input.bytes);
    return {
      key,
      url: `/${key}`,
      size: input.bytes.length,
      contentType: input.contentType,
    };
  }
}

let storage: AssetStorage | null = null;

export function getAssetStorage(): AssetStorage {
  if (!storage) storage = isS3Configured() ? new SealosS3Storage() : new LocalAssetStorage();
  return storage;
}

export async function uploadBufferToStorage(input: PutObjectInput): Promise<StoredAsset> {
  return getAssetStorage().putObject(input);
}

export async function uploadLocalFileToStorage(input: {
  localPath: string;
  contentType: string;
  projectId: string;
  assetKind: string;
  filename: string;
  keyOverride?: string;
}): Promise<StoredAsset> {
  const bytes = await readFile(input.localPath);
  return uploadBufferToStorage({ ...input, bytes });
}
