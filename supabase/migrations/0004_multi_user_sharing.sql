-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0004 — Multi-user Data Sharing + Org Stakeholder Management
-- IDEMPOTENT: safe to run multiple times.
-- Run in Supabase SQL Editor AFTER 0003_field_type_override.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Organizations ──────────────────────────────────────────────────────────

create table if not exists organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null,
  owner_id   uuid not null references auth.users on delete restrict,
  created_at timestamptz not null default now(),
  constraint organizations_slug_unique unique (slug)
);

-- ── 2. Org Members ────────────────────────────────────────────────────────────

create table if not exists org_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations on delete cascade,
  user_id     uuid references auth.users on delete cascade,
  email       text not null,
  role        text not null default 'member'
              check (role in ('owner', 'admin', 'member', 'viewer')),
  status      text not null default 'pending'
              check (status in ('active', 'pending')),
  invited_by  uuid references auth.users on delete set null,
  invited_at  timestamptz not null default now(),
  constraint org_members_org_email_unique unique (org_id, email)
);

-- ── 3. Dataset Shares ─────────────────────────────────────────────────────────

create table if not exists dataset_shares (
  id                   uuid primary key default gen_random_uuid(),
  dataset_id           uuid not null references datasets on delete cascade,
  shared_with_email    text not null,
  shared_with_user_id  uuid references auth.users on delete cascade,
  permission           text not null default 'viewer'
                       check (permission in ('viewer', 'editor')),
  created_at           timestamptz not null default now(),
  constraint dataset_shares_dataset_email_unique unique (dataset_id, shared_with_email)
);

-- ── 4. Add visibility + is_seed to datasets ───────────────────────────────────

alter table datasets
  add column if not exists visibility text not null default 'private'
    check (visibility in ('private', 'org', 'public')),
  add column if not exists is_seed boolean not null default false;

-- ── 5. Row Level Security ─────────────────────────────────────────────────────

alter table organizations  enable row level security;
alter table org_members    enable row level security;
alter table dataset_shares enable row level security;

-- Drop all policies we're about to (re)create so the script is idempotent
drop policy if exists "organizations: member read"   on organizations;
drop policy if exists "organizations: owner write"   on organizations;
drop policy if exists "organizations: owner update"  on organizations;
drop policy if exists "organizations: owner delete"  on organizations;

drop policy if exists "org_members: member read"     on org_members;
drop policy if exists "org_members: admin insert"    on org_members;
drop policy if exists "org_members: admin update"    on org_members;
drop policy if exists "org_members: admin delete"    on org_members;

drop policy if exists "dataset_shares: read"         on dataset_shares;
drop policy if exists "dataset_shares: owner write"  on dataset_shares;

drop policy if exists "datasets: owner only"         on datasets;
drop policy if exists "datasets: owner full"         on datasets;
drop policy if exists "datasets: seed read"          on datasets;
drop policy if exists "datasets: public read"        on datasets;
drop policy if exists "datasets: org read"           on datasets;
drop policy if exists "datasets: share read"         on datasets;

drop policy if exists "dataset_rows: owner only"     on dataset_rows;
drop policy if exists "dataset_rows: owner full"     on dataset_rows;
drop policy if exists "dataset_rows: seed read"      on dataset_rows;
drop policy if exists "dataset_rows: public read"    on dataset_rows;
drop policy if exists "dataset_rows: org read"       on dataset_rows;
drop policy if exists "dataset_rows: share read"     on dataset_rows;

-- Also drop the new profiles policy if this script is re-run
drop policy if exists "profiles: org member read"    on profiles;

-- ── Organizations policies ────────────────────────────────────────────────────

create policy "organizations: member read"
  on organizations for select
  using (
    auth.uid() = owner_id
    or exists (
      select 1 from org_members
      where org_id = organizations.id
        and user_id = auth.uid()
        and status = 'active'
    )
  );

create policy "organizations: owner write"
  on organizations for insert
  with check (auth.uid() = owner_id);

create policy "organizations: owner update"
  on organizations for update
  using  (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "organizations: owner delete"
  on organizations for delete
  using (auth.uid() = owner_id);

-- ── Org members policies ──────────────────────────────────────────────────────

create policy "org_members: member read"
  on org_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from organizations o
      where o.id = org_id
        and (
          o.owner_id = auth.uid()
          or exists (
            select 1 from org_members om2
            where om2.org_id = org_id
              and om2.user_id = auth.uid()
              and om2.status = 'active'
          )
        )
    )
  );

create policy "org_members: admin insert"
  on org_members for insert
  with check (
    exists (
      select 1 from organizations o
      where o.id = org_id
        and (
          o.owner_id = auth.uid()
          or exists (
            select 1 from org_members om2
            where om2.org_id = org_id
              and om2.user_id = auth.uid()
              and om2.role in ('owner', 'admin')
              and om2.status = 'active'
          )
        )
    )
  );

create policy "org_members: admin update"
  on org_members for update
  using (
    exists (
      select 1 from organizations o
      where o.id = org_id
        and (
          o.owner_id = auth.uid()
          or exists (
            select 1 from org_members om2
            where om2.org_id = org_id
              and om2.user_id = auth.uid()
              and om2.role in ('owner', 'admin')
              and om2.status = 'active'
          )
        )
    )
  );

create policy "org_members: admin delete"
  on org_members for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from organizations o
      where o.id = org_id
        and (
          o.owner_id = auth.uid()
          or exists (
            select 1 from org_members om2
            where om2.org_id = org_id
              and om2.user_id = auth.uid()
              and om2.role in ('owner', 'admin')
              and om2.status = 'active'
          )
        )
    )
  );

-- ── Dataset shares policies ───────────────────────────────────────────────────

create policy "dataset_shares: read"
  on dataset_shares for select
  using (
    shared_with_user_id = auth.uid()
    or exists (select 1 from datasets where id = dataset_id and user_id = auth.uid())
  );

create policy "dataset_shares: owner write"
  on dataset_shares for all
  using  (exists (select 1 from datasets where id = dataset_id and user_id = auth.uid()))
  with check (exists (select 1 from datasets where id = dataset_id and user_id = auth.uid()));

-- ── Datasets policies (replaces the original single "owner only" policy) ──────

create policy "datasets: owner full"
  on datasets for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "datasets: seed read"
  on datasets for select
  using (is_seed = true and auth.uid() is not null);

create policy "datasets: public read"
  on datasets for select
  using (visibility = 'public');

create policy "datasets: org read"
  on datasets for select
  using (
    visibility = 'org'
    and auth.uid() is not null
    and (select org_id from profiles where id = auth.uid()) is not null
    and (select org_id from profiles where id = auth.uid()) = (
      select org_id from profiles where id = user_id
    )
  );

create policy "datasets: share read"
  on datasets for select
  using (
    exists (
      select 1 from dataset_shares
      where dataset_id = datasets.id
        and shared_with_user_id = auth.uid()
    )
  );

-- ── Dataset rows policies (replaces the original single "owner only" policy) ──

create policy "dataset_rows: owner full"
  on dataset_rows for all
  using  (exists (select 1 from datasets where id = dataset_id and user_id = auth.uid()))
  with check (exists (select 1 from datasets where id = dataset_id and user_id = auth.uid()));

create policy "dataset_rows: seed read"
  on dataset_rows for select
  using (
    exists (select 1 from datasets where id = dataset_id and is_seed = true)
    and auth.uid() is not null
  );

create policy "dataset_rows: public read"
  on dataset_rows for select
  using (
    exists (select 1 from datasets where id = dataset_id and visibility = 'public')
  );

create policy "dataset_rows: org read"
  on dataset_rows for select
  using (
    exists (
      select 1 from datasets d
      where d.id = dataset_id
        and d.visibility = 'org'
        and auth.uid() is not null
        and (select org_id from profiles where id = auth.uid()) is not null
        and (select org_id from profiles where id = auth.uid()) = (
          select org_id from profiles p where p.id = d.user_id
        )
    )
  );

create policy "dataset_rows: share read"
  on dataset_rows for select
  using (
    exists (
      select 1 from dataset_shares ds
      where ds.dataset_id = dataset_id
        and ds.shared_with_user_id = auth.uid()
    )
  );

-- ── 6. Profiles: allow org members to read each other's profiles ──────────────
-- The original "profiles: owner only" policy in 0001 only allows a user to
-- see their own profile. This supplemental SELECT policy allows org members
-- to see each other's display_name and avatar_url in the member list UI.
-- The INSERT/UPDATE/DELETE restriction from the "owner only" policy is unchanged.

create policy "profiles: org member read"
  on profiles for select
  using (
    auth.uid() = id
    or exists (
      select 1
      from org_members om1
      join org_members om2 on om1.org_id = om2.org_id
      where om1.user_id = profiles.id
        and om2.user_id = auth.uid()
        and om2.status = 'active'
    )
  );

-- ── 7. Indexes ────────────────────────────────────────────────────────────────

create index if not exists org_members_org_id      on org_members    (org_id);
create index if not exists org_members_user_id     on org_members    (user_id);
create index if not exists org_members_email       on org_members    (email);
create index if not exists dataset_shares_ds_id    on dataset_shares (dataset_id);
create index if not exists dataset_shares_user_id  on dataset_shares (shared_with_user_id);
create index if not exists datasets_visibility     on datasets       (visibility);
create index if not exists datasets_is_seed        on datasets       (is_seed) where (is_seed = true);

-- ── 8. Function: accept_org_invites ──────────────────────────────────────────
-- Activates pending org invites that match this user's email, and sets
-- profiles.org_id if the profile doesn't already belong to an org.
-- Called server-side from /api/auth/accept-invites on every sign-in.

create or replace function accept_org_invites(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update org_members
  set user_id = p_user_id,
      status  = 'active'
  where email = lower(p_email)
    and status = 'pending'
    and user_id is null;

  -- Set profiles.org_id to the first active org if not already set
  update profiles
  set org_id = (
    select org_id::text
    from org_members
    where user_id = p_user_id
      and status = 'active'
    order by invited_at
    limit 1
  )
  where id = p_user_id
    and (org_id is null or org_id = '');
end;
$$;

-- Grant to both service_role (server-side service client) and authenticated
-- (server-side anon+session client used in /api/auth/accept-invites).
grant execute on function accept_org_invites to service_role, authenticated;
