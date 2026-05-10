-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0022 — Dashboard templates marketplace
-- IDEMPOTENT: safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists dashboard_templates (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  description       text,
  category          text not null default 'general',
  thumbnail_url     text,
  author            text not null default 'Supercoolstuff',
  data              jsonb not null default '{}'::jsonb,   -- blocks + layout + worksheet config
  sample_dataset    jsonb,                                  -- sample rows for preview
  sample_dataset_fields jsonb,                              -- field definitions for sample data
  downloads         integer not null default 0,
  featured          boolean not null default false,
  created_at        timestamptz not null default now()
);

alter table dashboard_templates enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'dashboard_templates' and policyname = 'Templates are public readable'
  ) then
    create policy "Templates are public readable"
      on dashboard_templates for select
      using (true);
  end if;
end $$;

create index if not exists dashboard_templates_category on dashboard_templates (category);
create index if not exists dashboard_templates_featured on dashboard_templates (featured) where featured = true;
