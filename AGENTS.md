<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AGENTS.md

## Product Context

We are building an **AI Report Generation Engine** that sits on top of an already-built analytics dashboard system.

The dashboard system already exists and already includes AI integration. Do **not** rebuild the dashboard, worksheet builder, widget system, canvas builder, filter system, or existing AI dashboard assistant unless a small extension is explicitly required for report generation.

The existing dashboard architecture is:

```text
Dataset -> Worksheet -> Widget -> Canvas -> Published Dashboard
```

The new feature is a report-generation layer that uses existing dashboard/canvas/widget/worksheet outputs as its source of truth.

The engine should support:

- selecting an existing Dashboard or Canvas as the report source
- reading widgets, charts, KPIs, tables, filters, worksheet outputs, AI insight blocks, and metadata
- generating a report blueprint/outline
- allowing users to edit and approve the report blueprint
- generating report sections from dashboard data
- compiling the report into a structured document
- exporting to Word, PDF, and Excel annex
- storing audit metadata, report versions, and source references
- supporting approval workflow where required

## Critical Rule

Do not duplicate existing dashboard functionality.

Only build what is needed for AI report generation from existing dashboards/canvases.

## Product Principle

AI writes analysis and narrative. The system calculates values.

AI must not invent figures. It must use:

- worksheet query outputs
- widget data snapshots
- dashboard/canvas filter states
- existing AI insight blocks
- validated system metrics

## Dataset-Agnostic Rule

The dashboard tool is generic and can connect to any dataset. Do not hardcode Eyemark, government, MDA, ministry, project, budget, state, or completion-rate logic. Those are only examples.

The report engine must work with any dataset by relying on:

- dataset schema metadata
- worksheet configurations
- widget configurations
- field labels and semantic metadata
- chart data outputs
- active filters
- user-defined report purpose

## Engineering Rules

- Follow the existing codebase structure.
- Reuse existing authentication, permissions, dashboard, canvas, widget, worksheet, query, and AI services where available.
- Add only the new models/services/endpoints needed for report generation.
- Use migrations for new persistent models.
- Use flexible JSON fields for blueprint, section configuration, source snapshots, export configuration, and audit metadata.
- Add tests for every new service and endpoint.
- Keep report generation asynchronous where long-running work is expected.
- Store traceability metadata for every AI-generated output.

## Stack Translation Rules

The report-generation plan may describe generic backend files such as `services/reports/*.py`, models, serializers, schemas, or background workers. This repository is a TypeScript/Next.js/Supabase application, so translate those instructions into the existing stack:

- Implement report services as TypeScript modules under `lib/reports/*.ts`.
- Implement HTTP endpoints as Next.js App Router route handlers under `app/api/reports/**/route.ts`.
- Implement persistent models as Supabase SQL tables in `supabase/migrations/*.sql`.
- Use snake_case table and column names in Postgres, and map to camelCase objects at the API/type boundary.
- Use TypeScript types and validation helpers instead of Python models, serializers, or schemas.
- Use Supabase clients from `lib/supabase/server.ts` and the existing session/RLS patterns.
- Reuse existing dashboard, canvas, worksheet, dataset, aggregation, filter, and AI helpers before adding new abstractions.
- Do not add Python, Django, FastAPI, Celery, or ORM scaffolding unless the project is explicitly migrated to that stack.

When a plan chunk references a Python file, use this mapping:

```text
services/reports/source_reader.py            -> lib/reports/sourceReader.ts
services/reports/ai_blueprint_generator.py   -> lib/reports/blueprintGenerator.ts
services/reports/section_generator.py        -> lib/reports/sectionGenerator.ts
services/reports/report_compiler.py          -> lib/reports/reportCompiler.ts
services/reports/export_engine.py            -> lib/reports/exportEngine.ts
```

## Supabase Persistence Rules

- Create idempotent migrations that follow the existing migration style.
- Enable row level security for report tables.
- Scope report rows to `created_by` or equivalent owner columns.
- Link report records to existing `dashboards`, `canvases`, `worksheets`, and `auth.users` where applicable.
- Prefer JSONB for snapshots, blueprints, compiled report payloads, export configuration, and audit metadata.
- Do not bypass RLS with the service role except in trusted server-side paths where existing project patterns already require it.

## Next.js API Rules

- Follow the installed Next.js App Router conventions.
- Before writing new route-handler patterns, read the relevant documentation in `node_modules/next/dist/docs/`.
- Use `NextRequest` and `NextResponse` consistently with existing API routes.
- Keep long-running operations route-triggered and status-backed by database records unless a queue/worker system is explicitly added.

## AI Safety and Audit Rules

AI must not:

- invent numbers
- run raw SQL
- modify source datasets
- publish/export restricted reports without permission
- override RBAC
- delete existing dashboards/canvases/widgets
- claim certainty when data is incomplete

AI must:

- use system-calculated data
- mention active filters where relevant
- flag missing or incomplete data
- separate observation from recommendation
- store source references
- log every generation action

## Implementation Workflow

Implement one chunk at a time.

After each chunk:

1. summarize what was implemented
2. list files changed
3. list migrations created, if any
4. list endpoints added, if any
5. run relevant tests or explain why they could not be run
6. stop and recommend the next chunk
