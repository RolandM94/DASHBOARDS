import { createClient, createServiceClient } from "@/lib/supabase/server";
import { aggregateDataset } from "@/lib/data/aggregateDataset";
import { interpretQuery } from "@/lib/ai/queryInterpreter";
import { NextResponse } from "next/server";
import type { Metric, Dimension, Filter } from "@/types";

/**
 * POST /api/ai/query
 *
 * Takes a natural language question about a dataset and returns a chart.
 *
 * Body: { question: string; datasetId: string; dashboardId?: string }
 *
 * Response: { chartData: ResolvedChartData, query: ParsedQuery }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const { question, datasetId } = await request.json() as { question: string; datasetId?: string };
  if (!question?.trim()) return NextResponse.json({ error: "question is required" }, { status: 400 });
  if (!datasetId) return NextResponse.json({ error: "datasetId is required" }, { status: 400 });

  // Load dataset schema
  const { data: ds } = await supabase
    .from("datasets")
    .select("id, fields")
    .eq("id", datasetId)
    .single();

  if (!ds) return NextResponse.json({ error: "Dataset not found" }, { status: 404 });

  const fields = (ds.fields as Array<{ name: string; type: string }>) ?? [];

  // Interpret question
  const parsed = await interpretQuery(question, fields, apiKey);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error, query: parsed }, { status: 400 });
  }

  // Run aggregate
  const serviceClient = await createServiceClient();
  try {
    const chartData = await aggregateDataset(serviceClient, {
      datasetId,
      metrics: parsed.metrics as Metric[],
      dimensions: parsed.dimensions as Dimension[],
      worksheetFilters: parsed.filters as Filter[],
      sort: parsed.sort as "natural" | "value_asc" | "value_desc" | "top_5" | "top_10" | "top_20" | "alpha_asc" | "alpha_desc",
    });

    return NextResponse.json({ chartData, query: parsed });
  } catch (err) {
    return NextResponse.json({
      error: `Aggregation failed: ${err instanceof Error ? err.message : "Unknown"}`,
      query: parsed,
    }, { status: 500 });
  }
}
