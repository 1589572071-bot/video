import { randomUUID } from "crypto";
import { dbQuery, isDatabaseConfigured } from "@/lib/db";

export interface ProjectSnapshot {
  project: {
    id: string;
    title: string | null;
    current_stage: string;
    created_at: string;
    updated_at: string;
  };
  assets: Array<Record<string, unknown>>;
  analysisResult: Record<string, unknown> | null;
  productProfile: Record<string, unknown> | null;
  currentScript: {
    id: string;
    version_type: string | null;
    label: string | null;
    script_markdown: string | null;
    script_manifest: Record<string, unknown> | null;
    gap_plan: Record<string, unknown> | null;
  } | null;
  latestRenderJob: Record<string, unknown> | null;
}

export async function createProject(title?: string | null): Promise<string> {
  const id = randomUUID();
  if (isDatabaseConfigured()) {
    await dbQuery(
      "insert into projects (id, title) values ($1, $2)",
      [id, title ?? "MetaCut Project"]
    );
  }
  return id;
}

export async function ensureProject(projectId?: string | null, title?: string | null): Promise<string> {
  if (!projectId) return createProject(title);
  if (!isDatabaseConfigured()) return projectId;
  await dbQuery(
    `insert into projects (id, title)
     values ($1, $2)
     on conflict (id) do update set updated_at = now()`,
    [projectId, title ?? "MetaCut Project"]
  );
  return projectId;
}

export async function updateProjectStage(projectId: string | null | undefined, stage: string): Promise<void> {
  if (!projectId || !isDatabaseConfigured()) return;
  await dbQuery(
    "update projects set current_stage = $2, updated_at = now() where id = $1",
    [projectId, stage]
  );
}

export async function createAssetRecord(input: {
  projectId?: string | null;
  kind: string;
  objectKey?: string | null;
  url: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  originalName?: string | null;
}): Promise<string> {
  const id = randomUUID();
  if (isDatabaseConfigured()) {
    const projectId = await ensureProject(input.projectId);
    await dbQuery(
      `insert into assets
        (id, project_id, kind, object_key, url, content_type, size_bytes, original_name)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        projectId,
        input.kind,
        input.objectKey ?? null,
        input.url,
        input.contentType ?? null,
        input.sizeBytes ?? null,
        input.originalName ?? null,
      ]
    );
  }
  return id;
}

export async function saveAnalysisResult(projectId: string | null | undefined, data: unknown): Promise<void> {
  if (!projectId || !isDatabaseConfigured()) return;
  await ensureProject(projectId);
  await dbQuery(
    `insert into analysis_results (project_id, data)
     values ($1, $2::jsonb)
     on conflict (project_id) do update set data = excluded.data, updated_at = now()`,
    [projectId, JSON.stringify(data)]
  );
  await updateProjectStage(projectId, "product");
}

export async function saveProductProfile(projectId: string | null | undefined, data: unknown): Promise<void> {
  if (!projectId || !isDatabaseConfigured()) return;
  await ensureProject(projectId);
  await dbQuery(
    `insert into product_profiles (project_id, data)
     values ($1, $2::jsonb)
     on conflict (project_id) do update set data = excluded.data, updated_at = now()`,
    [projectId, JSON.stringify(data)]
  );
  await updateProjectStage(projectId, "script");
}

export async function saveScriptVersion(input: {
  projectId?: string | null;
  versionType?: string | null;
  label?: string | null;
  scriptMarkdown?: string | null;
  scriptManifest?: unknown;
  gapPlan?: unknown;
}): Promise<string | null> {
  if (!input.projectId || !isDatabaseConfigured()) return null;
  const id = randomUUID();
  await ensureProject(input.projectId);
  await dbQuery("update script_versions set is_current = false where project_id = $1", [input.projectId]);
  await dbQuery(
    `insert into script_versions
      (id, project_id, version_type, label, script_markdown, script_manifest, gap_plan, is_current)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, true)`,
    [
      id,
      input.projectId,
      input.versionType ?? null,
      input.label ?? null,
      input.scriptMarkdown ?? null,
      input.scriptManifest ? JSON.stringify(input.scriptManifest) : null,
      input.gapPlan ? JSON.stringify(input.gapPlan) : null,
    ]
  );
  await updateProjectStage(input.projectId, "render");
  return id;
}

export async function getProjectSnapshot(projectId: string): Promise<ProjectSnapshot | null> {
  if (!isDatabaseConfigured()) return null;
  const projectRes = await dbQuery<ProjectSnapshot["project"]>(
    "select id, title, current_stage, created_at::text, updated_at::text from projects where id = $1",
    [projectId]
  );
  const project = projectRes.rows[0];
  if (!project) return null;

  const [assets, analysis, product, script, render] = await Promise.all([
    dbQuery("select * from assets where project_id = $1 order by created_at asc", [projectId]),
    dbQuery("select data from analysis_results where project_id = $1", [projectId]),
    dbQuery("select data from product_profiles where project_id = $1", [projectId]),
    dbQuery(
      `select id, version_type, label, script_markdown, script_manifest, gap_plan
       from script_versions
       where project_id = $1
       order by is_current desc, created_at desc
       limit 1`,
      [projectId]
    ),
    dbQuery(
      `select id, status, progress, steps, result, error, created_at::text, updated_at::text
       from render_jobs
       where project_id = $1
       order by updated_at desc
       limit 1`,
      [projectId]
    ),
  ]);

  return {
    project,
    assets: assets.rows,
    analysisResult: analysis.rows[0]?.data ?? null,
    productProfile: product.rows[0]?.data ?? null,
    currentScript: (script.rows[0] as ProjectSnapshot["currentScript"]) ?? null,
    latestRenderJob: render.rows[0] ?? null,
  };
}
