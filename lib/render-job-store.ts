import type { RenderOrchestrationResult } from "@/lib/types/pipeline";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { dbQuery, isDatabaseConfigured } from "@/lib/db";

export type RenderJobStatus = "queued" | "running" | "succeeded" | "failed";

export interface RenderProgressStep {
  id: string;
  label: string;
  status: "waiting" | "processing" | "success" | "failed";
  message?: string;
  at?: string;
}

export interface RenderJob {
  id: string;
  status: RenderJobStatus;
  progress: number;
  steps: RenderProgressStep[];
  result?: RenderOrchestrationResult & { summary?: string; scriptManifest?: unknown };
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/** Dev/HMR 下模块重载会清空模块级 Map，挂到 globalThis 保留任务状态 */
const globalForJobs = globalThis as typeof globalThis & {
  __metacutRenderJobs?: Map<string, RenderJob>;
};

const jobs =
  globalForJobs.__metacutRenderJobs ??
  (globalForJobs.__metacutRenderJobs = new Map<string, RenderJob>());

// 磁盘兜底：进程重启（非热更新）后仍可恢复任务进度，供前端轮询
const JOB_DIR = join(tmpdir(), "metacut-render-jobs");

function jobFile(id: string): string {
  return join(JOB_DIR, `${id}.json`);
}

function persist(job: RenderJob): void {
  try {
    if (!existsSync(JOB_DIR)) mkdirSync(JOB_DIR, { recursive: true });
    writeFileSync(jobFile(job.id), JSON.stringify(job));
  } catch {
    // 持久化失败不影响内存态，忽略
  }
}

function readFromDisk(id: string): RenderJob | undefined {
  try {
    const path = jobFile(id);
    if (!existsSync(path)) return undefined;
    return JSON.parse(readFileSync(path, "utf-8")) as RenderJob;
  } catch {
    return undefined;
  }
}

export async function createRenderJob(id: string, projectId?: string | null): Promise<RenderJob> {
  const job: RenderJob = {
    id,
    status: "queued",
    progress: 0,
    steps: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(id, job);
  persist(job);
  if (isDatabaseConfigured()) {
    await dbQuery(
      `insert into render_jobs (id, project_id, status, progress, steps)
       values ($1, $2, $3, $4, $5::jsonb)
       on conflict (id) do nothing`,
      [id, projectId ?? null, job.status, job.progress, JSON.stringify(job.steps)]
    );
  }
  return job;
}

export async function getRenderJob(id: string): Promise<RenderJob | undefined> {
  if (isDatabaseConfigured()) {
    const res = await dbQuery<{
      id: string;
      status: RenderJobStatus;
      progress: number;
      steps: RenderProgressStep[];
      result?: RenderJob["result"];
      error?: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `select id, status, progress, steps, result, error, created_at::text, updated_at::text
       from render_jobs
       where id = $1`,
      [id]
    );
    const row = res.rows[0];
    if (row) {
      const job: RenderJob = {
        id: row.id,
        status: row.status,
        progress: row.progress,
        steps: row.steps ?? [],
        result: row.result,
        error: row.error ?? undefined,
        createdAt: Date.parse(row.created_at),
        updatedAt: Date.parse(row.updated_at),
      };
      jobs.set(id, job);
      return job;
    }
  }
  const inMemory = jobs.get(id);
  if (inMemory) return inMemory;
  // 内存丢失（重启）时从磁盘恢复
  const onDisk = readFromDisk(id);
  if (onDisk) jobs.set(id, onDisk);
  return onDisk;
}

export async function updateRenderJob(id: string, patch: Partial<RenderJob>): Promise<RenderJob | undefined> {
  const job = jobs.get(id) ?? (await getRenderJob(id));
  if (!job) return undefined;
  Object.assign(job, patch, { updatedAt: Date.now() });
  persist(job);
  if (isDatabaseConfigured()) {
    await dbQuery(
      `update render_jobs
       set status = $2,
           progress = $3,
           steps = $4::jsonb,
           result = $5::jsonb,
           error = $6,
           updated_at = now()
       where id = $1`,
      [
        id,
        job.status,
        job.progress,
        JSON.stringify(job.steps ?? []),
        job.result ? JSON.stringify(job.result) : null,
        job.error ?? null,
      ]
    );
  }
  return job;
}

export async function appendRenderStep(id: string, step: RenderProgressStep): Promise<void> {
  const job = jobs.get(id) ?? (await getRenderJob(id));
  if (!job) return;
  const idx = job.steps.findIndex((s) => s.id === step.id);
  if (idx >= 0) job.steps[idx] = step;
  else job.steps.push(step);
  job.updatedAt = Date.now();
  persist(job);
  if (isDatabaseConfigured()) {
    await dbQuery(
      `update render_jobs
       set steps = $2::jsonb, updated_at = now()
       where id = $1`,
      [id, JSON.stringify(job.steps)]
    );
  }
}

export function listRenderJobs(limit = 20): RenderJob[] {
  return Array.from(jobs.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}
