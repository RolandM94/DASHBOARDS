import { createClient, createServiceClient } from "@/lib/supabase/server";
import { loadDashboardScope, scopeContainsDataset } from "@/lib/auth/dashboardScope";
import { applyFilters } from "@/lib/data/filters";
import type { ActiveGlobalFilters, Filter } from "@/types";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

interface DrillRequestBody {
  dashboardId?: string;
  dimensionValues?: Record<string, unknown>;
  worksheetFilters?: Filter[];
  globalFilters?: ActiveGlobalFilters | Record<string, string | string[]>;
  smartFilters?: string[];
  limit?: number;
  offset?: number;
}

const MAX_SCAN_ROWS = 50_000;
const MAX_LIMIT = 200;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as DrillRequestBody;
  const supabase = await createClient();
  const serviceClient = await createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (body.dashboardId) {
    const { scope, error, status } = await loadDashboardScope(supabase, serviceClient, body.dashboardId);
    if (!scope) return NextResponse.json({ error }, { status });
    if (!scopeContainsDataset(scope, id)) {
      return NextResponse.json({ error: "Dataset not referenced by dashboard" }, { status: 403 });
    }
  } else {
    if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    const { data: dataset } = await supabase.from("datasets").select("id").eq("id", id).single();
    if (!dataset) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }

  const limit = clampInteger(body.limit, 50, 1, MAX_LIMIT);
  const offset = clampInteger(body.offset, 0, 0, MAX_SCAN_ROWS);
  const filters = buildDrillFilters(body);

  const { data, error } = await serviceClient
    .from("dataset_rows")
    .select("data")
    .eq("dataset_id", id)
    .order("row_index", { ascending: true })
    .limit(MAX_SCAN_ROWS);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map((row) => row.data as Record<string, unknown>);
  const filteredRows = applySmartFilters(applyFilters(rows, filters), body.smartFilters ?? []);
  const pagedRows = filteredRows.slice(offset, offset + limit);
  const columns = Array.from(new Set(filteredRows.slice(0, 100).flatMap((row) => Object.keys(row))));

  return NextResponse.json({
    rows: pagedRows,
    columns,
    total: filteredRows.length,
    limit,
    offset,
  });
}

function buildDrillFilters(body: DrillRequestBody): Filter[] {
  const filters: Filter[] = [];

  for (const filter of body.worksheetFilters ?? []) {
    if (filter.field === "_smart") continue;
    filters.push(filter);
  }

  for (const [field, value] of Object.entries(body.dimensionValues ?? {})) {
    if (value == null || value === "") continue;
    filters.push({ id: `drill-${field}`, field, operator: "equals", value: String(value), label: field });
  }

  for (const [field, value] of Object.entries(body.globalFilters ?? {})) {
    if (Array.isArray(value)) {
      if (value.length > 0) filters.push({ id: `global-${field}`, field, operator: "in", value, label: field });
    } else if (value !== "") {
      filters.push({ id: `global-${field}`, field, operator: "equals", value: String(value), label: field });
    }
  }

  return filters;
}

function applySmartFilters(rows: Record<string, unknown>[], smartFilters: string[]): Record<string, unknown>[] {
  if (smartFilters.length === 0) return rows;
  return rows.filter((row) => smartFilters.every((id) => rowMatchesSmartFilter(row, id)));
}

function rowMatchesSmartFilter(row: Record<string, unknown>, id: string): boolean {
  const parsed = /^smart:([^:]+):(.+)$/.exec(id);
  if (!parsed) return true;

  let field = "";
  try {
    field = decodeURIComponent(parsed[2]);
  } catch {
    return true;
  }

  const value = row[field];
  const stringValue = String(value ?? "").trim();
  const numericValue = Number(stringValue.replace(/,/g, ""));
  const dateValue = Date.parse(stringValue);
  const now = new Date();

  switch (parsed[1]) {
    case "missing":
      return stringValue === "";
    case "present":
      return stringValue !== "";
    case "zero":
      return Number.isFinite(numericValue) && numericValue === 0;
    case "positive":
      return Number.isFinite(numericValue) && numericValue > 0;
    case "negative":
      return Number.isFinite(numericValue) && numericValue < 0;
    case "past":
      return Number.isFinite(dateValue) && dateValue < startOfToday(now).getTime();
    case "future":
      return Number.isFinite(dateValue) && dateValue > startOfToday(now).getTime();
    case "this_year": {
      if (!Number.isFinite(dateValue)) return false;
      const date = new Date(dateValue);
      return date.getFullYear() === now.getFullYear();
    }
    case "true":
      return ["true", "t", "yes", "y", "1"].includes(stringValue.toLowerCase());
    case "false":
      return ["false", "f", "no", "n", "0"].includes(stringValue.toLowerCase());
    default:
      return true;
  }
}

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.floor(parsed), max));
}
