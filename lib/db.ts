import { Pool, type QueryResultRow } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __metacutPgPool?: Pool;
  __metacutDbReady?: Promise<void>;
};

function getDatabaseUrl(): string | null {
  return process.env.DATABASE_URL || null;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getDatabaseUrl());
}

function getPool(): Pool {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("未配置 DATABASE_URL");
  }
  if (!globalForDb.__metacutPgPool) {
    globalForDb.__metacutPgPool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX || "5"),
    });
  }
  return globalForDb.__metacutPgPool;
}

export async function ensureDbSchema(): Promise<void> {
  if (!isDatabaseConfigured()) return;
  if (!globalForDb.__metacutDbReady) {
    globalForDb.__metacutDbReady = (async () => {
      await getPool().query(`
        create table if not exists projects (
          id uuid primary key,
          title text,
          current_stage text not null default 'reference',
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );

        create table if not exists assets (
          id uuid primary key,
          project_id uuid references projects(id) on delete cascade,
          kind text not null,
          object_key text,
          url text not null,
          content_type text,
          size_bytes bigint,
          original_name text,
          created_at timestamptz not null default now()
        );

        create table if not exists analysis_results (
          project_id uuid primary key references projects(id) on delete cascade,
          data jsonb not null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );

        create table if not exists product_profiles (
          project_id uuid primary key references projects(id) on delete cascade,
          data jsonb not null,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );

        create table if not exists script_versions (
          id uuid primary key,
          project_id uuid references projects(id) on delete cascade,
          version_type text,
          label text,
          script_markdown text,
          script_manifest jsonb,
          gap_plan jsonb,
          is_current boolean not null default false,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );

        create table if not exists render_jobs (
          id uuid primary key,
          project_id uuid references projects(id) on delete set null,
          status text not null,
          progress integer not null default 0,
          steps jsonb not null default '[]'::jsonb,
          result jsonb,
          error text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );

        create index if not exists assets_project_id_idx on assets(project_id);
        create index if not exists script_versions_project_id_idx on script_versions(project_id);
        create index if not exists render_jobs_project_id_idx on render_jobs(project_id);
      `);
    })();
  }
  await globalForDb.__metacutDbReady;
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = []
) {
  await ensureDbSchema();
  return getPool().query<T>(sql, values);
}
