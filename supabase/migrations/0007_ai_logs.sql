-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0007 — AI Assistant audit log
-- IDEMPOTENT: safe to run multiple times.
--
-- Stores every AI generation attempt so that:
--   - admins can audit what the AI created and when
--   - users can trace which prompt produced which worksheet
--   - failed attempts are captured with their error message
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists ai_logs (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users on delete cascade,
  dataset_id    uuid        references datasets(id)   on delete set null,
  canvas_id     uuid        references canvases(id)   on delete set null,
  worksheet_id  uuid        references worksheets(id) on delete set null,

  -- What the user asked
  prompt        text        not null,

  -- What the AI produced (null if the call failed before parsing)
  config        jsonb,

  -- If something went wrong
  error         text,

  created_at    timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
create index if not exists ai_logs_user_id    on ai_logs (user_id);
create index if not exists ai_logs_dataset_id on ai_logs (dataset_id);
create index if not exists ai_logs_canvas_id  on ai_logs (canvas_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table ai_logs enable row level security;

-- Users see only their own log entries
create policy "ai_logs: owner read"
  on ai_logs for select
  using (user_id = auth.uid());

-- Server-side inserts/updates use the service role and bypass RLS.
-- The authenticated role is still granted insert so the route's
-- session client can write log rows directly.
create policy "ai_logs: owner insert"
  on ai_logs for insert
  with check (user_id = auth.uid());

create policy "ai_logs: owner update"
  on ai_logs for update
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());
