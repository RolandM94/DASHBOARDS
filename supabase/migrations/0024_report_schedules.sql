-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0024 — Scheduled dashboard deliveries
-- IDEMPOTENT: safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists report_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  time_of_day text not null default '09:00',
  timezone text not null default 'UTC',
  day_of_week int check (day_of_week between 0 and 6),
  day_of_month int check (day_of_month between 1 and 28),
  format text not null default 'pdf' check (format in ('pdf', 'xlsx')),
  recipients text[] not null default '{}',
  active boolean not null default true,
  last_sent_at timestamptz,
  last_attempt_at timestamptz,
  next_send_at timestamptz,
  processing_at timestamptz,
  failure_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, dashboard_id)
);

create table if not exists report_schedule_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references report_schedules(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  dashboard_id uuid references dashboards(id) on delete set null,
  status text not null check (status in ('sent', 'skipped', 'failed')),
  format text not null check (format in ('pdf', 'xlsx')),
  recipients text[] not null default '{}',
  message text,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table report_schedules enable row level security;
alter table report_schedule_runs enable row level security;

create index if not exists report_schedules_due
  on report_schedules (next_send_at)
  where active = true;

create index if not exists report_schedules_user_dashboard
  on report_schedules (user_id, dashboard_id);

create index if not exists report_schedule_runs_schedule
  on report_schedule_runs (schedule_id, started_at desc);

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'report_schedules' and policyname = 'Users can view own report schedules'
  ) then
    create policy "Users can view own report schedules"
      on report_schedules for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'report_schedules' and policyname = 'Users can insert own report schedules'
  ) then
    create policy "Users can insert own report schedules"
      on report_schedules for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'report_schedules' and policyname = 'Users can update own report schedules'
  ) then
    create policy "Users can update own report schedules"
      on report_schedules for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'report_schedules' and policyname = 'Users can delete own report schedules'
  ) then
    create policy "Users can delete own report schedules"
      on report_schedules for delete
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where tablename = 'report_schedule_runs' and policyname = 'Users can view own report schedule runs'
  ) then
    create policy "Users can view own report schedule runs"
      on report_schedule_runs for select
      using (auth.uid() = user_id);
  end if;
end $$;

create or replace trigger report_schedules_updated_at
  before update on report_schedules
  for each row execute function set_updated_at();
