-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0026 — Canvas sharing and realtime publication
-- IDEMPOTENT: safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists canvas_shares (
  id uuid primary key default gen_random_uuid(),
  canvas_id uuid not null references canvases(id) on delete cascade,
  shared_with_email text not null,
  shared_with_user_id uuid references auth.users(id) on delete cascade,
  permission text not null default 'editor' check (permission in ('editor', 'viewer')),
  shared_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(canvas_id, shared_with_email)
);

alter table canvas_shares enable row level security;

create index if not exists canvas_shares_canvas_id_idx on canvas_shares(canvas_id);
create index if not exists canvas_shares_user_id_idx on canvas_shares(shared_with_user_id);
create unique index if not exists canvas_shares_canvas_user_unique
  on canvas_shares(canvas_id, shared_with_user_id)
  where shared_with_user_id is not null;

create or replace function auth_owns_canvas(p_canvas_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from canvases
    where id = p_canvas_id
      and user_id = auth.uid()
  );
$$;

grant execute on function auth_owns_canvas(uuid) to authenticated;

create or replace function auth_can_read_canvas(p_canvas_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from canvases
    where id = p_canvas_id
      and user_id = auth.uid()
  )
  or exists (
    select 1 from canvas_shares
    where canvas_id = p_canvas_id
      and shared_with_user_id = auth.uid()
      and permission in ('viewer', 'editor')
  );
$$;

grant execute on function auth_can_read_canvas(uuid) to authenticated;

create or replace function auth_can_edit_canvas(p_canvas_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from canvases
    where id = p_canvas_id
      and user_id = auth.uid()
  )
  or exists (
    select 1 from canvas_shares
    where canvas_id = p_canvas_id
      and shared_with_user_id = auth.uid()
      and permission = 'editor'
  );
$$;

grant execute on function auth_can_edit_canvas(uuid) to authenticated;

drop policy if exists "canvas_shares: owner manage" on canvas_shares;
drop policy if exists "canvas_shares: shared user read" on canvas_shares;

create policy "canvas_shares: owner manage"
  on canvas_shares for all
  using (auth_owns_canvas(canvas_id))
  with check (auth_owns_canvas(canvas_id));

create policy "canvas_shares: shared user read"
  on canvas_shares for select
  using (shared_with_user_id = auth.uid());

drop policy if exists "canvases: owner only" on canvases;
drop policy if exists "canvases: owner full access" on canvases;
drop policy if exists "canvases: shared read" on canvases;
drop policy if exists "canvases: shared editor update" on canvases;

create policy "canvases: owner full access"
  on canvases for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "canvases: shared read"
  on canvases for select
  using (auth_can_read_canvas(id));

create policy "canvases: shared editor update"
  on canvases for update
  using (auth_can_edit_canvas(id))
  with check (auth_can_edit_canvas(id));

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'canvases'
  ) then
    alter publication supabase_realtime add table canvases;
  end if;
end $$;
