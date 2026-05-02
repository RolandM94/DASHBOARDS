-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0013 — Report approval workflow metadata
-- IDEMPOTENT: safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

alter table report_projects
  add column if not exists workflow_enabled boolean not null default false,
  add column if not exists review_requested_by uuid references auth.users on delete set null,
  add column if not exists review_requested_at timestamptz,
  add column if not exists approved_by uuid references auth.users on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists locked_by uuid references auth.users on delete set null,
  add column if not exists locked_at timestamptz;

create index if not exists report_projects_workflow_enabled on report_projects (workflow_enabled);
create index if not exists report_projects_review_requested_by on report_projects (review_requested_by);
create index if not exists report_projects_approved_by on report_projects (approved_by);
