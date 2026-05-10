-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0021 — API keys for programmatic dashboard access
-- IDEMPOTENT: safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists api_keys (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  key_prefix  text not null,           -- first 8 chars of the key for identification
  key_hash    text not null unique,    -- sha256 hash of the full key
  scopes      text[] not null default '{read}' check (scopes <@ '{read,write,admin}'::text[]),
  created_at  timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at  timestamptz
);

alter table api_keys enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'api_keys' and policyname = 'Users can manage own API keys'
  ) then
    create policy "Users can manage own API keys"
      on api_keys for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists api_keys_hash_idx on api_keys (key_hash);
