-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0016 — Link report projects to templates
-- IDEMPOTENT: safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

alter table report_projects
  add column if not exists template_id uuid references report_templates(id) on delete set null;

create index if not exists report_projects_template_id on report_projects (template_id);
