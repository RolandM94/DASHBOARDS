-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0006 — User type (owner vs member)
-- IDEMPOTENT: safe to run multiple times.
--
-- Adds user_type to profiles so the app can distinguish:
--   "owner"  — signed up directly; must create an org before using the platform
--   "member" — joined via an org invite; skips org creation, goes to Analytics Home
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add user_type column ───────────────────────────────────────────────────
-- Defaults to 'owner' so all existing rows are covered without a full table scan.

alter table profiles
  add column if not exists user_type text not null default 'owner'
  check (user_type in ('owner', 'member'));

-- ── 2. Backfill existing data ─────────────────────────────────────────────────
-- Users who are already in an org but are NOT that org's owner are members.

update profiles p
set    user_type = 'member'
where  p.org_id is not null
  and  p.org_id != ''
  and  not exists (
         select 1
         from   organizations o
         where  o.id       = p.org_id::uuid
           and  o.owner_id = p.id
       );

-- ── 3. Update handle_new_user trigger ────────────────────────────────────────
-- Direct sign-ups are always 'owner'. The column now has an explicit value
-- rather than relying on the default.

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, display_name, user_type)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'owner'
  );
  return new;
end;
$$;

-- ── 4. Update accept_org_invites ──────────────────────────────────────────────
-- When a user accepts an invite, also mark their profile as 'member'.
-- Keeps the same semantics as before; only adds the user_type update.

create or replace function accept_org_invites(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Activate all pending invites for this email
  update org_members
  set    user_id = p_user_id,
         status  = 'active'
  where  email   = lower(p_email)
    and  status  = 'pending'
    and  user_id is null;

  -- Set org_id + mark as member on profile (only if not already in an org)
  update profiles
  set    org_id    = (
           select org_id::text
           from   org_members
           where  user_id = p_user_id
             and  status  = 'active'
           order  by invited_at
           limit  1
         ),
         user_type = 'member'
  where  id      = p_user_id
    and  (org_id is null or org_id = '');
end;
$$;

grant execute on function accept_org_invites to service_role, authenticated;
