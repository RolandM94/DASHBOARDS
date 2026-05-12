-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0027 — Dashboard view tracking
-- IDEMPOTENT: safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists dashboard_views (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  is_anonymous boolean not null default false,
  ip_address text,
  user_agent text,
  referrer text,
  viewed_at timestamptz not null default now()
);

alter table dashboard_views add column if not exists ip_address text;
alter table dashboard_views add column if not exists user_agent text;
alter table dashboard_views add column if not exists referrer text;

create index if not exists dashboard_views_time_idx
  on dashboard_views (dashboard_id, viewed_at desc);

alter table dashboard_views enable row level security;

drop policy if exists "dashboard_views: owner read" on dashboard_views;

create policy "dashboard_views: owner read"
  on dashboard_views for select
  using (
    exists (
      select 1 from dashboards
      where dashboards.id = dashboard_views.dashboard_id
        and dashboards.user_id = auth.uid()
    )
  );
