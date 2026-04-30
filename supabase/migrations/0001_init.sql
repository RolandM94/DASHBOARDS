-- ─────────────────────────────────────────────────────────────────────────────
-- Eyemark Dashboards — initial schema
-- Run this in your Supabase project's SQL editor (Database → SQL Editor).
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable pgcrypto for gen_random_uuid() if not already enabled
create extension if not exists "pgcrypto";

-- ── profiles ─────────────────────────────────────────────────────────────────
-- One row per authenticated user. Created automatically via trigger on sign-up.

create table if not exists profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text,
  org_id       text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

-- ── datasets ─────────────────────────────────────────────────────────────────
-- Stores parsed CSV/XLSX data. `rows` holds the full parsed payload as JSON.

create table if not exists datasets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  file_name   text not null,
  uploaded_at timestamptz not null default now(),
  fields      jsonb not null default '[]'::jsonb,
  rows        jsonb not null default '[]'::jsonb,
  row_count   integer not null default 0
);

-- ── worksheets ───────────────────────────────────────────────────────────────
-- A saved chart configuration bound to a dataset.

create table if not exists worksheets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  dataset_id  uuid not null references datasets on delete cascade,
  name        text not null,
  description text,
  config      jsonb not null default '{}'::jsonb,
  status      text not null default 'draft'
               check (status in ('draft', 'saved')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── canvases ─────────────────────────────────────────────────────────────────
-- A 2-D layout of blocks (widgets, text, filters).

create table if not exists canvases (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users on delete cascade,
  name                 text not null,
  blocks               jsonb not null default '[]'::jsonb,
  layout               jsonb,
  published            boolean not null default false,
  published_title      text,
  published_permission text check (published_permission in ('private', 'org', 'public')),
  published_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ── dashboards ───────────────────────────────────────────────────────────────
-- Published snapshot of a canvas. id = canvas id (one dashboard per canvas).

create table if not exists dashboards (
  id           uuid primary key,
  canvas_id    uuid not null references canvases on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  title        text not null,
  permission   text not null check (permission in ('private', 'org', 'public')),
  published_at timestamptz not null,
  blocks       jsonb not null default '[]'::jsonb,
  layout       jsonb
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-update `updated_at` trigger
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace trigger worksheets_updated_at
  before update on worksheets
  for each row execute function set_updated_at();

create or replace trigger canvases_updated_at
  before update on canvases
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-create profile on sign-up
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table profiles    enable row level security;
alter table datasets    enable row level security;
alter table worksheets  enable row level security;
alter table canvases    enable row level security;
alter table dashboards  enable row level security;

-- profiles: only the owner
create policy "profiles: owner only"
  on profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- datasets: only the owner
create policy "datasets: owner only"
  on datasets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- worksheets: only the owner
create policy "worksheets: owner only"
  on worksheets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- canvases: only the owner
create policy "canvases: owner only"
  on canvases for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- dashboards: owner can do anything; others can SELECT public or org dashboards
create policy "dashboards: owner full access"
  on dashboards for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "dashboards: public read"
  on dashboards for select
  using (permission = 'public');

create policy "dashboards: org read"
  on dashboards for select
  using (
    permission = 'org'
    and auth.uid() is not null
    and (
      select org_id from profiles where id = auth.uid()
    ) = (
      select org_id from profiles where id = dashboards.user_id
    )
    and (
      select org_id from profiles where id = auth.uid()
    ) is not null
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes for common queries
-- ─────────────────────────────────────────────────────────────────────────────

create index if not exists datasets_user_id    on datasets   (user_id);
create index if not exists worksheets_user_id  on worksheets (user_id);
create index if not exists worksheets_dataset  on worksheets (dataset_id);
create index if not exists canvases_user_id    on canvases   (user_id);
create index if not exists dashboards_canvas   on dashboards (canvas_id);
create index if not exists dashboards_perm     on dashboards (permission);
