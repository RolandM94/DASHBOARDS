-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0025 — Dashboard Slack integrations
-- IDEMPOTENT: safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists slack_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  webhook_url text not null,
  channel_name text,
  active boolean not null default true,
  last_shared_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, dashboard_id)
);

alter table slack_integrations enable row level security;

create index if not exists slack_integrations_user_dashboard
  on slack_integrations (user_id, dashboard_id);

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'slack_integrations' and policyname = 'Users can view own Slack integrations'
  ) then
    create policy "Users can view own Slack integrations"
      on slack_integrations for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'slack_integrations' and policyname = 'Users can insert own Slack integrations'
  ) then
    create policy "Users can insert own Slack integrations"
      on slack_integrations for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'slack_integrations' and policyname = 'Users can update own Slack integrations'
  ) then
    create policy "Users can update own Slack integrations"
      on slack_integrations for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'slack_integrations' and policyname = 'Users can delete own Slack integrations'
  ) then
    create policy "Users can delete own Slack integrations"
      on slack_integrations for delete
      using (auth.uid() = user_id);
  end if;
end $$;

create or replace trigger slack_integrations_updated_at
  before update on slack_integrations
  for each row execute function set_updated_at();
