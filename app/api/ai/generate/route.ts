import { createClient, createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { DatasetField } from "@/types";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt, type AIDatasetField } from "@/lib/ai/prompts";
import { sanitiseConfig } from "@/lib/ai/validate";

async function enrichFieldsForAI(
  datasetId: string,
  fields: DatasetField[],
): Promise<AIDatasetField[]> {
  const serviceClient = await createServiceClient();

  const enriched = await Promise.all(fields.map(async (field) => {
    if (field.type !== "string" && field.type !== "date" && field.type !== "datetime") {
      return field;
    }

    const { data } = await serviceClient.rpc("get_distinct_values", {
      p_dataset_ids: [datasetId],
      p_field: field.name,
      p_limit: 501,
    });

    const values = Array.isArray(data)
      ? data.map((value) => String(value)).filter(Boolean)
      : [];

    return {
      ...field,
      distinctCount: values.length,
      sampleValues: values.slice(0, 12),
    };
  }));

  return enriched;
}

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  // ── API key ───────────────────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  const body = await request.json() as {
    prompt:         string;
    datasetId:      string;
    fields:         DatasetField[];
    canvasId?:      string;
    /** Prior conversation turns for iterative refinement. */
    priorMessages?: Array<{ role: "user" | "assistant"; content: string }>;
  };

  const { prompt, datasetId, fields, canvasId, priorMessages } = body;

  if (!prompt?.trim() || !datasetId || !fields?.length) {
    return NextResponse.json(
      { error: "prompt, datasetId, and fields are required" },
      { status: 400 },
    );
  }

  // ── Permission check — verify the user can read this dataset (RLS) ────────
  const { data: ds } = await supabase
    .from("datasets")
    .select("id")
    .eq("id", datasetId)
    .single();

  if (!ds) {
    return NextResponse.json(
      { error: "Dataset not found or access denied" },
      { status: 404 },
    );
  }

  // ── Audit log — write attempt before calling Claude ───────────────────────
  const { data: logRow } = await supabase
    .from("ai_logs")
    .insert({
      user_id:    user.id,
      dataset_id: datasetId,
      canvas_id:  canvasId ?? null,
      prompt,
    })
    .select("id")
    .single();

  const logId = logRow?.id as string | undefined;

  // ── Claude call ───────────────────────────────────────────────────────────
  try {
    const client = new Anthropic({ apiKey });

    // Build message array — prepend prior turns for conversational refinement
    const conversationMessages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...(priorMessages ?? []),
      { role: "user", content: prompt.trim() },
    ];

    const aiFields = await enrichFieldsForAI(datasetId, fields);

    const message = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 900,
      system:     buildSystemPrompt(aiFields),
      messages:   conversationMessages,
    });

    const raw = message.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("");

    // ── Parse ───────────────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: Record<string, any>;
    try {
      const clean = raw
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/i, "")
        .trim();
      parsed = JSON.parse(clean);
    } catch {
      if (logId) {
        await supabase
          .from("ai_logs")
          .update({ error: "Invalid JSON response from Claude" })
          .eq("id", logId);
      }
      return NextResponse.json(
        { error: "AI returned invalid JSON", raw },
        { status: 502 },
      );
    }

    // ── Sanitise + validate ─────────────────────────────────────────────────
    const config = sanitiseConfig(parsed, aiFields, { prompt });

    // ── Update audit log with successful result ─────────────────────────────
    if (logId) {
      await supabase
        .from("ai_logs")
        .update({ config })
        .eq("id", logId);
    }

    return NextResponse.json({
      title:       String(parsed.title       ?? "AI Chart"),
      description: String(parsed.description ?? ""),
      insight:     String(parsed.insight     ?? ""),
      config,
      logId,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (logId) {
      await supabase
        .from("ai_logs")
        .update({ error: msg })
        .eq("id", logId);
    }
    return NextResponse.json(
      { error: `AI request failed: ${msg}` },
      { status: 502 },
    );
  }
}
