-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0011 — AI Report Generation Engine models
-- IDEMPOTENT: safe to run multiple times.
--
-- Adds report-generation-specific persistence on top of the existing
-- dataset -> worksheet -> canvas -> dashboard architecture.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ── Report Projects ──────────────────────────────────────────────────────────

create table if not exists report_projects (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  description         text,
  source_type         text not null
                      check (source_type in ('dashboard', 'canvas')),
  source_dashboard_id uuid references dashboards(id) on delete set null,
  source_canvas_id    uuid references canvases(id) on delete set null,
  report_type         text not null default 'custom_report'
                      check (report_type in (
                        'executive_summary',
                        'management_report',
                        'technical_report',
                        'custom_report'
                      )),
  status              text not null default 'draft'
                      check (status in (
                        'draft',
                        'blueprint_generated',
                        'blueprint_approved',
                        'generating',
                        'generated',
                        'exported',
                        'review',
                        'approved',
                        'archived',
                        'failed'
                      )),
  created_by          uuid not null references auth.users on delete cascade,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint report_projects_source_target_check check (
    (source_type = 'dashboard' and source_dashboard_id is not null and source_canvas_id is null)
    or
    (source_type = 'canvas' and source_canvas_id is not null and source_dashboard_id is null)
  )
);

create or replace trigger report_projects_updated_at
  before update on report_projects
  for each row execute function set_updated_at();

-- ── Source Snapshots ─────────────────────────────────────────────────────────

create table if not exists report_source_snapshots (
  id                      uuid primary key default gen_random_uuid(),
  report_project_id       uuid not null references report_projects(id) on delete cascade,
  source_type             text not null check (source_type in ('dashboard', 'canvas')),
  source_id               uuid not null,
  active_filters_snapshot jsonb not null default '{}'::jsonb,
  widgets_snapshot        jsonb not null default '[]'::jsonb,
  worksheets_snapshot     jsonb not null default '[]'::jsonb,
  insights_snapshot       jsonb not null default '[]'::jsonb,
  query_outputs_snapshot  jsonb not null default '{}'::jsonb,
  metadata                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now()
);

-- ── Blueprints ───────────────────────────────────────────────────────────────

create table if not exists report_blueprints (
  id                uuid primary key default gen_random_uuid(),
  report_project_id uuid not null references report_projects(id) on delete cascade,
  version           integer not null default 1 check (version > 0),
  status            text not null default 'draft'
                    check (status in ('draft', 'edited', 'approved', 'locked', 'superseded')),
  title             text not null,
  objective         text,
  audience          text,
  blueprint_json    jsonb not null default '{}'::jsonb,
  generated_by_ai   boolean not null default false,
  approved_by       uuid references auth.users on delete set null,
  approved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint report_blueprints_project_version_unique unique (report_project_id, version)
);

create or replace trigger report_blueprints_updated_at
  before update on report_blueprints
  for each row execute function set_updated_at();

-- ── Sections ─────────────────────────────────────────────────────────────────

create table if not exists report_sections (
  id                   uuid primary key default gen_random_uuid(),
  report_project_id    uuid not null references report_projects(id) on delete cascade,
  report_blueprint_id  uuid references report_blueprints(id) on delete cascade,
  parent_section_id    uuid references report_sections(id) on delete cascade,
  section_key          text not null,
  title                text not null,
  section_type         text not null default 'custom'
                       check (section_type in (
                         'executive_summary',
                         'introduction',
                         'methodology',
                         'chart_analysis',
                         'table_analysis',
                         'kpi_summary',
                         'risk_analysis',
                         'recommendation',
                         'appendix',
                         'custom'
                       )),
  order_index          integer not null default 0,
  source_widget_ids    text[] not null default '{}'::text[],
  source_worksheet_ids uuid[] not null default '{}'::uuid[],
  source_insight_ids   text[] not null default '{}'::text[],
  section_prompt       text,
  section_config       jsonb not null default '{}'::jsonb,
  status               text not null default 'pending'
                       check (status in ('pending', 'generating', 'generated', 'edited', 'approved', 'failed')),
  generated_content    text,
  edited_content       text,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create or replace trigger report_sections_updated_at
  before update on report_sections
  for each row execute function set_updated_at();

-- ── Exports ──────────────────────────────────────────────────────────────────

create table if not exists report_exports (
  id                  uuid primary key default gen_random_uuid(),
  report_project_id   uuid not null references report_projects(id) on delete cascade,
  report_blueprint_id uuid references report_blueprints(id) on delete set null,
  format              text not null check (format in ('docx', 'pdf', 'excel', 'html')),
  file_url            text,
  file_path           text,
  export_config       jsonb not null default '{}'::jsonb,
  status              text not null default 'pending'
                      check (status in ('pending', 'exporting', 'exported', 'failed')),
  exported_by         uuid references auth.users on delete set null,
  exported_at         timestamptz,
  created_at          timestamptz not null default now()
);

-- ── Generation Logs ──────────────────────────────────────────────────────────

create table if not exists report_generation_logs (
  id                uuid primary key default gen_random_uuid(),
  report_project_id uuid references report_projects(id) on delete cascade,
  user_id           uuid not null references auth.users on delete cascade,
  action_type       text not null,
  input_payload     jsonb not null default '{}'::jsonb,
  output_summary    jsonb not null default '{}'::jsonb,
  ai_model          text,
  status            text not null default 'success'
                    check (status in ('pending', 'success', 'failed')),
  error_message     text,
  created_at        timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists report_projects_created_by on report_projects (created_by);
create index if not exists report_projects_dashboard on report_projects (source_dashboard_id);
create index if not exists report_projects_canvas on report_projects (source_canvas_id);
create index if not exists report_source_snapshots_project on report_source_snapshots (report_project_id);
create index if not exists report_blueprints_project on report_blueprints (report_project_id);
create index if not exists report_sections_project on report_sections (report_project_id);
create index if not exists report_sections_blueprint on report_sections (report_blueprint_id);
create index if not exists report_exports_project on report_exports (report_project_id);
create index if not exists report_generation_logs_project on report_generation_logs (report_project_id);
create index if not exists report_generation_logs_user on report_generation_logs (user_id);

-- ── Row Level Security ───────────────────────────────────────────────────────

alter table report_projects          enable row level security;
alter table report_source_snapshots  enable row level security;
alter table report_blueprints        enable row level security;
alter table report_sections          enable row level security;
alter table report_exports           enable row level security;
alter table report_generation_logs   enable row level security;

drop policy if exists "report_projects: owner full access" on report_projects;
drop policy if exists "report_source_snapshots: project owner full access" on report_source_snapshots;
drop policy if exists "report_blueprints: project owner full access" on report_blueprints;
drop policy if exists "report_sections: project owner full access" on report_sections;
drop policy if exists "report_exports: project owner full access" on report_exports;
drop policy if exists "report_generation_logs: owner read" on report_generation_logs;
drop policy if exists "report_generation_logs: owner insert" on report_generation_logs;

create policy "report_projects: owner full access"
  on report_projects for all
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "report_source_snapshots: project owner full access"
  on report_source_snapshots for all
  using (
    exists (
      select 1 from report_projects
      where report_projects.id = report_source_snapshots.report_project_id
        and report_projects.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from report_projects
      where report_projects.id = report_source_snapshots.report_project_id
        and report_projects.created_by = auth.uid()
    )
  );

create policy "report_blueprints: project owner full access"
  on report_blueprints for all
  using (
    exists (
      select 1 from report_projects
      where report_projects.id = report_blueprints.report_project_id
        and report_projects.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from report_projects
      where report_projects.id = report_blueprints.report_project_id
        and report_projects.created_by = auth.uid()
    )
  );

create policy "report_sections: project owner full access"
  on report_sections for all
  using (
    exists (
      select 1 from report_projects
      where report_projects.id = report_sections.report_project_id
        and report_projects.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from report_projects
      where report_projects.id = report_sections.report_project_id
        and report_projects.created_by = auth.uid()
    )
  );

create policy "report_exports: project owner full access"
  on report_exports for all
  using (
    exists (
      select 1 from report_projects
      where report_projects.id = report_exports.report_project_id
        and report_projects.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from report_projects
      where report_projects.id = report_exports.report_project_id
        and report_projects.created_by = auth.uid()
    )
  );

create policy "report_generation_logs: owner read"
  on report_generation_logs for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from report_projects
      where report_projects.id = report_generation_logs.report_project_id
        and report_projects.created_by = auth.uid()
    )
  );

create policy "report_generation_logs: owner insert"
  on report_generation_logs for insert
  with check (
    user_id = auth.uid()
    and (
      report_project_id is null
      or exists (
        select 1 from report_projects
        where report_projects.id = report_generation_logs.report_project_id
          and report_projects.created_by = auth.uid()
      )
    )
  );
