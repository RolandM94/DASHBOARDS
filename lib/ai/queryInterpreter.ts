type DatasetFieldInfo = {
  name: string;
  type: string;
  description?: string;
  distinctCount?: number;
  sampleValues?: string[];
};

export interface ParsedQuery {
  title: string;
  chartType: string;
  dimensions: Array<{ id: string; field: string; label: string }>;
  metrics: Array<{ id: string; field: string; aggregation: string; label: string }>;
  filters: Array<{ id: string; field: string; operator: string; value: unknown; label: string }>;
  sort: string;
  logScale: boolean;
  insight: string;
  error?: string;
}

/**
 * Sends the user's question + dataset schema to Claude and returns a parsed query.
 */
export async function interpretQuery(
  question: string,
  fields: DatasetFieldInfo[],
  apiKey: string,
): Promise<ParsedQuery> {
  const { Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const fieldList = fields
    .map((f) => {
      const parts = [`  - ${f.name} (${f.type})`];
      if (f.description) parts.push(` — ${f.description}`);
      if (typeof f.distinctCount === "number") parts.push(`; ~${f.distinctCount} values`);
      if (f.sampleValues?.length) parts.push(`; e.g. ${f.sampleValues.slice(0, 5).join(", ")}`);
      return parts.join("");
    })
    .join("\n");

  const prompt = `You are a data query assistant. Convert the user's question into a chart query.

Available fields:
${fieldList}

Rules:
- Use ONLY the exact field names listed above.
- Return ONLY a JSON object, no markdown or explanation.
- chartType must be one of: bar, line, pie, area, kpi, table
- aggregation must be one of: SUM, COUNT, AVG, MIN, MAX
- sort must be one of: natural, value_asc, value_desc, top_5, top_10, top_20, alpha_asc, alpha_desc
- kpi charts should have empty dimensions: []
- pie charts should have exactly 1 dimension + 1 metric
- Use filters ONLY when the question explicitly mentions filtering conditions
- Write 2-3 sentences of insight describing what the chart reveals

Question: ${question}

JSON output format:
{
  "title": "Chart title",
  "chartType": "bar",
  "dimensions": [{"id": "d1", "field": "FieldName", "label": "FieldName"}],
  "metrics": [{"id": "m1", "field": "FieldName", "aggregation": "SUM", "label": "SUM of FieldName"}],
  "filters": [],
  "sort": "value_desc",
  "logScale": false,
  "insight": "2-3 sentence analysis of what this chart is likely to reveal."
}`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { type: "text"; text: string }).text)
      .join("");

    const cleaned = text.replace(/```(?:json)?\n?|\n?```/g, "").trim();
    const parsed = JSON.parse(cleaned) as ParsedQuery;

    // Validate: all referenced fields must exist
    const fieldNames = new Set(fields.map((f) => f.name));
    const badDims = (parsed.dimensions ?? []).filter((d) => !fieldNames.has(d.field));
    const badMets = (parsed.metrics ?? []).filter((m) => !fieldNames.has(m.field));

    if (badDims.length > 0 || badMets.length > 0) {
      parsed.error = `Unknown fields: ${[...badDims, ...badMets].map((x) => x.field).join(", ")}`;
    }

    if (!parsed.title) parsed.title = "Query Result";
    if (!parsed.chartType) parsed.chartType = "bar";
    parsed.dimensions = (parsed.dimensions ?? []).slice(0, 3);
    parsed.metrics = (parsed.metrics ?? []).slice(0, 5);
    parsed.filters = parsed.filters ?? [];
    parsed.sort = parsed.sort ?? "natural";

    return parsed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      title: "Error",
      chartType: "table",
      dimensions: [],
      metrics: [],
      filters: [],
      sort: "natural",
      logScale: false,
      insight: "",
      error: `Failed to interpret query: ${message}`,
    };
  }
}
