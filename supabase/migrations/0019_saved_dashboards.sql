-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0019 — Saved dashboards (bookmarks for authenticated users)
-- IDEMPOTENT: safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists saved_dashboards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  saved_at timestamptz not null default now(),
  unique(user_id, dashboard_id)
);

alter table saved_dashboards enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'saved_dashboards' and policyname = 'Users can view own saved dashboards'
  ) then
    create policy "Users can view own saved dashboards"
      on saved_dashboards for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'saved_dashboards' and policyname = 'Users can insert own saved dashboards'
  ) then
    create policy "Users can insert own saved dashboards"
      on saved_dashboards for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'saved_dashboards' and policyname = 'Users can delete own saved dashboards'
  ) then
    create policy "Users can delete own saved dashboards"
      on saved_dashboards for delete
      using (auth.uid() = user_id);
  end if;
end $$;
