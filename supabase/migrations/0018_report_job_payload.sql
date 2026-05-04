-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0018 — Add job_payload column to report_jobs
-- Stores route-specific parameters for background worker execution.
-- IDEMPOTENT: safe to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

alter table report_jobs
  add column if not exists job_payload jsonb default '{}'::jsonb;
