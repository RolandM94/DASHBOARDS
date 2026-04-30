-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0005 — Fix RLS infinite recursion
-- IDEMPOTENT: safe to run multiple times.
--
-- Two separate recursion cycles are fixed here:
--
-- Cycle A — datasets ↔ dataset_shares
--   "datasets: share read"        queries dataset_shares
--   "dataset_shares: read"        queries datasets   ← cycle
--   "dataset_shares: owner write" queries datasets   ← cycle
--
-- Cycle B — organizations ↔ org_members (also self-referential)
--   "organizations: member read"  queries org_members
--   "org_members: member read"    queries organizations AND itself (om2)
--   "org_members: admin *"        queries org_members itself (om2)
--
-- Fix: replace recursive sub-selects with SECURITY DEFINER helper functions.
-- SECURITY DEFINER functions run with the function owner's privileges and do
-- NOT have RLS applied to the tables they query — breaking every cycle.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══════════════════════════════════════════════════════════════════════════
-- CYCLE A — datasets / dataset_shares helpers
-- ═══════════════════════════════════════════════════════════════════════════

-- True when the calling user owns the dataset (bypasses RLS on datasets).
create or replace function auth_owns_dataset(p_dataset_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from datasets
    where id = p_dataset_id and user_id = auth.uid()
  );
$$;

grant execute on function auth_owns_dataset to authenticated;

-- Rebuild dataset_shares policies that queried datasets directly.
drop policy if exists "dataset_shares: read"        on dataset_shares;
drop policy if exists "dataset_shares: owner write" on dataset_shares;

create policy "dataset_shares: read"
  on dataset_shares for select
  using (
    shared_with_user_id = auth.uid()
    or auth_owns_dataset(dataset_id)
  );

create policy "dataset_shares: owner write"
  on dataset_shares for all
  using  (auth_owns_dataset(dataset_id))
  with check (auth_owns_dataset(dataset_id));


-- ═══════════════════════════════════════════════════════════════════════════
-- CYCLE B — organizations / org_members helpers
-- ═══════════════════════════════════════════════════════════════════════════

-- True when the calling user is an active member of the org (any role).
-- Bypasses RLS on org_members — breaks self-referential recursion.
create or replace function auth_is_org_member(p_org_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from org_members
    where org_id = p_org_id
      and user_id = auth.uid()
      and status  = 'active'
  );
$$;

grant execute on function auth_is_org_member to authenticated;

-- True when the calling user is the org owner (via organizations table).
-- Bypasses RLS on organizations — safe to call from org_members policies.
create or replace function auth_is_org_owner(p_org_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from organizations
    where id = p_org_id and owner_id = auth.uid()
  );
$$;

grant execute on function auth_is_org_owner to authenticated;

-- True when the calling user is owner OR an active admin/owner-role member.
-- Combines the above two checks — bypasses RLS on both tables.
create or replace function auth_is_org_admin(p_org_id uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select (
    auth_is_org_owner(p_org_id)
    or exists (
      select 1 from org_members
      where org_id = p_org_id
        and user_id = auth.uid()
        and role    in ('owner', 'admin')
        and status  = 'active'
    )
  );
$$;

grant execute on function auth_is_org_admin to authenticated;

-- ── Rebuild organizations policies ────────────────────────────────────────

drop policy if exists "organizations: member read"  on organizations;
drop policy if exists "organizations: owner write"  on organizations;
drop policy if exists "organizations: owner update" on organizations;
drop policy if exists "organizations: owner delete" on organizations;

-- Any active member (or the owner) can read the org row.
create policy "organizations: member read"
  on organizations for select
  using (auth.uid() = owner_id or auth_is_org_member(id));

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

-- ── Rebuild org_members policies ─────────────────────────────────────────

drop policy if exists "org_members: member read"  on org_members;
drop policy if exists "org_members: admin insert" on org_members;
drop policy if exists "org_members: admin update" on org_members;
drop policy if exists "org_members: admin delete" on org_members;

-- A member can see their own row; the org owner and any active member
-- of the same org can also see all rows for that org.
create policy "org_members: member read"
  on org_members for select
  using (
    user_id = auth.uid()
    or auth_is_org_owner(org_id)
    or auth_is_org_member(org_id)
  );

-- Only owners and admins can invite (insert) new members.
create policy "org_members: admin insert"
  on org_members for insert
  with check (auth_is_org_admin(org_id));

-- Only owners and admins can update roles / statuses.
create policy "org_members: admin update"
  on org_members for update
  using (auth_is_org_admin(org_id));

-- A member may remove themselves; owners and admins may remove anyone.
create policy "org_members: admin delete"
  on org_members for delete
  using (
    user_id = auth.uid()
    or auth_is_org_admin(org_id)
  );
