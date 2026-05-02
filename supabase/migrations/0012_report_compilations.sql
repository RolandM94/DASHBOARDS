-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0012 — Compiled report document payloads
-- IDEMPOTENT: safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

create table if not exists report_compilations (
  id                  uuid primary key default gen_random_uuid(),
  report_project_id   uuid not null references report_projects(id) on delete cascade,
  report_blueprint_id uuid references report_blueprints(id) on delete set null,
  source_snapshot_id  uuid references report_source_snapshots(id) on delete set null,
  title               text not null,
  compiled_payload    jsonb not null default '{}'::jsonb,
  status              text not null default 'compiled'
                      check (status in ('compiled', 'superseded')),
  compiled_by         uuid references auth.users on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create or replace trigger report_compilations_updated_at
  before update on report_compilations
  for each row execute function set_updated_at();

create index if not exists report_compilations_project on report_compilations (report_project_id);
create index if not exists report_compilations_blueprint on report_compilations (report_blueprint_id);
create index if not exists report_compilations_snapshot on report_compilations (source_snapshot_id);

alter table report_compilations enable row level security;

drop policy if exists "report_compilations: project owner full access" on report_compilations;

create policy "report_compilations: project owner full access"
  on report_compilations for all
  using (
    exists (
      select 1 from report_projects
      where report_projects.id = report_compilations.report_project_id
        and report_projects.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from report_projects
      where report_projects.id = report_compilations.report_project_id
        and report_projects.created_by = auth.uid()
    )
  );
