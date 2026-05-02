-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0015 — Report Background Jobs and Progress Tracking
-- IDEMPOTENT: safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Report Jobs ──────────────────────────────────────────────────────────────

create table if not exists report_jobs (
  id                uuid primary key default gen_random_uuid(),
  report_project_id uuid not null references report_projects(id) on delete cascade,
  job_type          text not null
                    check (job_type in (
                      'capture_source_snapshot',
                      'generate_blueprint',
                      'generate_section',
                      'generate_all_sections',
                      'compile_report',
                      'export_report'
                    )),
  status            text not null default 'queued'
                    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  progress_percent  integer not null default 0
                    check (progress_percent >= 0 and progress_percent <= 100),
  current_step      text not null default '',
  total_steps       integer not null default 1
                    check (total_steps > 0),
  completed_steps   integer not null default 0
                    check (completed_steps >= 0),
  error_message     text,
  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create or replace trigger report_jobs_updated_at
  before update on report_jobs
  for each row execute function set_updated_at();

-- ── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists report_jobs_project on report_jobs (report_project_id);
create index if not exists report_jobs_project_status on report_jobs (report_project_id, status);
create index if not exists report_jobs_project_type on report_jobs (report_project_id, job_type);

-- ── Row Level Security ───────────────────────────────────────────────────────

alter table report_jobs enable row level security;

drop policy if exists "report_jobs: project owner full access" on report_jobs;

create policy "report_jobs: project owner full access"
  on report_jobs for all
  using (
    exists (
      select 1 from report_projects
      where report_projects.id = report_jobs.report_project_id
        and report_projects.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from report_projects
      where report_projects.id = report_jobs.report_project_id
        and report_projects.created_by = auth.uid()
    )
  );
