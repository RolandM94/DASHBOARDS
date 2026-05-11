# Week 3 Plan — Scheduled Dashboard Delivery + Slack Integration

## Summary

Build scheduled dashboard delivery first, then Slack as a separate chunk. The
scheduled delivery layer must reuse existing dashboard, widget, PDF, and export
logic. It must not invent metrics or hardcode a domain; exported content comes
from published dashboard blocks and system-calculated widget outputs.

## Chunk 1 — Scheduled Reports

Users who own a dashboard can schedule daily, weekly, or monthly delivery to
email recipients. Delivery supports PDF and Excel annex exports. The cron route
is triggered externally and secured with a shared secret.

### Architecture

```text
Owner setup
  -> GET/POST/DELETE /api/dashboards/[id]/schedule
  -> report_schedules table

External cron every 15 minutes
  -> GET /api/cron/process-schedules
  -> validates CRON_SECRET
  -> claims due schedules in small batches
  -> generates dashboard PDF/XLSX server-side
  -> sends via Resend REST API
  -> records report_schedule_runs
  -> advances next_send_at
```

### Security Corrections

- Schedule CRUD requires an authenticated user.
- The authenticated user must own the dashboard: `dashboards.user_id = auth.uid()`.
- Published public/org access is not enough to create or manage schedules.
- Cron requires `CRON_SECRET` through `Authorization: Bearer <secret>` or
  `x-cron-secret`.
- Scheduled email generation uses trusted server-side paths and service-role
  reads only inside the cron processor.

### Migration — `0024_report_schedules.sql`

Tables:

- `report_schedules`
  - `user_id`, `dashboard_id`
  - `frequency`: `daily | weekly | monthly`
  - `time_of_day`: `HH:mm`
  - `timezone`: IANA timezone, default `UTC`
  - `day_of_week`: `0..6`, Sunday = 0
  - `day_of_month`: `1..28`
  - `format`: `pdf | xlsx`
  - `recipients`: `text[]`
  - `active`
  - `last_sent_at`, `last_attempt_at`, `next_send_at`
  - `processing_at`, `failure_count`, `last_error`
  - timestamps
  - unique `(user_id, dashboard_id)`

- `report_schedule_runs`
  - `schedule_id`, `dashboard_id`, `user_id`
  - `status`: `sent | skipped | failed`
  - `format`, `recipients`, `message`, `error`
  - `started_at`, `finished_at`

RLS:

- Users can select/insert/update/delete their own schedules.
- Users can select their own runs.
- Cron uses the service role.

### API Endpoints

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/dashboards/[id]/schedule` | GET | Owner | Get current schedule |
| `/api/dashboards/[id]/schedule` | POST | Owner | Create/update schedule |
| `/api/dashboards/[id]/schedule` | DELETE | Owner | Remove schedule |
| `/api/cron/process-schedules` | GET | Secret | Process due schedules |

### Email Delivery

Use Resend REST API through `fetch`, not a new package dependency.

Required env:

- `RESEND_API_KEY`
- `CRON_SECRET`

Recommended env:

- `RESEND_FROM_EMAIL`, for example `Supercoolstuff <reports@example.com>`
- `NEXT_PUBLIC_APP_URL`, defaults to `https://supercool-stuff.vercel.app`

Email content:

- Subject: `[Daily] Dashboard Title — May 12, 2026`
- Body: dashboard title, generated date, format, live dashboard link, and a
  short note that values come from the dashboard source.
- Attachment: generated PDF or XLSX.
- No hardcoded KPI names or domain examples.

### Export Rules

- PDF reuses the existing dashboard PDF renderer.
- XLSX is generated server-side with workbook sheets for dashboard summary,
  widget outputs, and preview/table blocks where available.
- Each delivery reflects the current published dashboard snapshot at send time.
- No caching in this chunk.

### ScheduleModal UI

New file: `components/analytics/dashboard/ScheduleModal.tsx`

Triggered by a dashboard header button for authenticated users.

Controls:

- frequency dropdown
- time input
- timezone input, defaulting to browser timezone
- day-of-week or day-of-month when needed
- PDF/XLSX segmented format buttons
- recipients textarea
- next delivery preview
- save/remove buttons

UI notes:

- Warn when no recipients are configured.
- Keep the design restrained and consistent with dashboard controls.
- Do not expose cron or service configuration in the UI.

### Edge Cases

| Scenario | Handling |
|---|---|
| Dashboard deleted | Cron marks schedule inactive/skipped |
| No recipients | Save allowed, cron records skipped and advances schedule |
| Email fails | Cron records failed run and leaves schedule due for retry next cycle |
| Slow export | Cron processes a small batch and uses `processing_at` claim state |
| Stale claim | Cron may reclaim rows after a timeout |

## Chunk 2 — Slack Integration

Slack will be implemented after scheduled reports.

Corrections for the Slack chunk:

- Store incoming webhook URLs server-side only.
- Return only masked status/channel metadata to the client.
- Validate webhook host, e.g. `hooks.slack.com`.
- Manual share requires dashboard ownership.
- Slack messages must be dataset-agnostic:
  - dashboard title
  - generated date
  - live dashboard link
  - actual KPI widgets when available, otherwise no fake metric examples
- Scheduled delivery can later call the Slack helper after email delivery.

## Implementation Order

1. Revise this plan.
2. Implement scheduled delivery migration and helper services.
3. Implement schedule CRUD and cron processing routes.
4. Add schedule modal and dashboard header action.
5. Run `npx tsc --noEmit`, focused tests, `npm test`, `npm run lint`, and
   `npm run build`.
6. Stop and review before implementing Slack.
