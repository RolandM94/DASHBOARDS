-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0015 — Report Templates & Reference Documents
-- IDEMPOTENT: safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Templates ────────────────────────────────────────────────────────────────

create table if not exists report_templates (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  description             text,
  layout_json             jsonb not null default '{}'::jsonb,
  reference_document_ids  uuid[] not null default '{}'::uuid[],
  created_by              uuid not null references auth.users on delete cascade,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create or replace trigger report_templates_updated_at
  before update on report_templates
  for each row execute function set_updated_at();

-- ── Reference Documents ─────────────────────────────────────────────────────

create table if not exists template_reference_documents (
  id                uuid primary key default gen_random_uuid(),
  template_id       uuid references report_templates(id) on delete cascade,
  report_project_id uuid references report_projects(id) on delete cascade,
  filename          text not null,
  file_url          text not null,
  file_type         text not null
                    check (file_type in ('pdf', 'docx', 'txt', 'md')),
  extracted_text    text,
  page_count        integer not null default 0,
  metadata          jsonb not null default '{}'::jsonb,
  created_by        uuid not null references auth.users on delete cascade,
  created_at        timestamptz not null default now(),
  constraint template_reference_documents_scope_check check (
    (template_id is not null and report_project_id is null)
    or
    (template_id is null and report_project_id is not null)
  )
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists report_templates_created_by on report_templates (created_by);
create index if not exists template_ref_docs_template on template_reference_documents (template_id);
create index if not exists template_ref_docs_project on template_reference_documents (report_project_id);
create index if not exists template_ref_docs_created_by on template_reference_documents (created_by);

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table report_templates                enable row level security;
alter table template_reference_documents    enable row level security;

drop policy if exists "report_templates: owner full access" on report_templates;
drop policy if exists "template_ref_docs: template owner full access" on template_reference_documents;
drop policy if exists "template_ref_docs: project owner full access" on template_reference_documents;

create policy "report_templates: owner full access"
  on report_templates for all
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "template_ref_docs: template owner full access"
  on template_reference_documents for all
  using (
    exists (
      select 1 from report_templates
      where report_templates.id = template_reference_documents.template_id
        and report_templates.created_by = auth.uid()
    )
  )
  with check (
    template_id is not null
    and exists (
      select 1 from report_templates
      where report_templates.id = template_reference_documents.template_id
        and report_templates.created_by = auth.uid()
    )
  );

create policy "template_ref_docs: project owner full access"
  on template_reference_documents for all
  using (
    exists (
      select 1 from report_projects
      where report_projects.id = template_reference_documents.report_project_id
        and report_projects.created_by = auth.uid()
    )
  )
  with check (
    report_project_id is not null
    and exists (
      select 1 from report_projects
      where report_projects.id = template_reference_documents.report_project_id
        and report_projects.created_by = auth.uid()
    )
  );
