import type { DatasetField, ChartType, Dimension, Metric } from "@/types";

export type AIDatasetField = DatasetField & {
  distinctCount?: number;
  sampleValues?: string[];
};

const CHART_TYPES = ["bar", "grouped_bar", "line", "area", "pie", "kpi", "table", "map"];
const AGG_FNS     = ["SUM", "COUNT", "AVG", "MIN", "MAX"];
const SORT_ORDERS = [
  "natural", "value_asc", "value_desc",
  "top_5", "top_10", "top_20",
  "alpha_asc", "alpha_desc",
];

/**
 * Builds the system prompt sent to Claude for each AI generation request.
 * Accepts the dataset's field list so Claude knows exactly which fields are
 * valid — prevents hallucinated field names.
 */
export function buildSystemPrompt(fields: AIDatasetField[]): string {
  const fieldList = fields
    .map((f) => {
      const desc = f.description
        ? ` — ${f.description.replace(/[\r\n]+/g, " ").slice(0, 150)}`
        : "";
      const cardinality = typeof f.distinctCount === "number"
        ? `; ${f.distinctCount}${f.distinctCount >= 500 ? "+" : ""} distinct values`
        : "";
      const samples = f.sampleValues?.length
        ? `; examples: ${f.sampleValues.slice(0, 8).join(", ")}`
        : "";
      return `  - ${f.name} (${f.type}${cardinality})${desc}${samples}`;
    })
    .join("\n");

  return `You are a data visualisation assistant for Eyemark, a government budget and project tracking platform.

Available dataset fields:
${fieldList}

Given a user request, output a SINGLE JSON object describing a worksheet configuration.

━━━ RULES ━━━

Fields
• Use ONLY the exact field names listed above (case-sensitive).
• Never invent field names.

Chart type (chartType)
• Must be one of: ${CHART_TYPES.join(", ")}.
• bar / grouped_bar — comparisons across categories
• line / area       — trends over time (dimension should be a date field)
• pie               — part-to-whole (≤ 8 categories; one dimension + one metric only)
• kpi               — single headline numbers (no dimensions; one to four metrics)
• table             — raw detail or multi-field inspection
• map               — geographic distribution (dimension must contain country/region names)

Aggregation (aggregation)
• Must be one of: ${AGG_FNS.join(", ")}.
• Numeric fields  → prefer SUM or AVG.
• Text/date fields → use COUNT.

Structural rules
• kpi              → dimensions: []
• pie / map        → exactly 1 dimension + exactly 1 metric
• grouped_bar      → exactly 1 dimension + 2 or more metrics
• bar / line / area → 1–2 dimensions + 1–3 metrics
• table            → any combination

Sort (sort)
• Must be one of: ${SORT_ORDERS.join(", ")}.
• When the user asks for a chart "by" a category such as ministry, agency, state, sector, status, or year, include ALL categories in that field by default.
• Use top_5/top_10/top_20 ONLY when the user explicitly asks for "top", "highest", "largest", "bottom", "lowest", or a limited number of categories.
• If the user asks for "all", "full", "every", or "each" category, do NOT use top_5/top_10/top_20.
• For high-cardinality categorical fields, prefer bar or table over pie. Pie charts should only be used when the selected dimension has 8 or fewer categories, unless the user explicitly asks for a pie chart.

IDs
• Use short unique strings: "d1", "d2", "m1", "m2", etc.

Insight
• Write 2–3 sentences describing what this chart is likely to reveal about the data.
• Be specific: name potential top/bottom categories, trends, or disparities.
• Write as if you have already seen the chart — confident and analytical.
• If the available field metadata shows only a small number of categories for a requested category field, do not imply more categories exist than the selected dataset contains.

━━━ OUTPUT FORMAT ━━━
Respond with ONLY a JSON object — no markdown fences, no explanation.

{
  "title":       "Short descriptive chart title",
  "description": "One sentence description of the chart",
  "insight":     "2–3 sentence analytical insight describing what this chart reveals",
  "chartType":   "bar",
  "dimensions":  [{ "id": "d1", "field": "FieldName", "label": "FieldName" }],
  "metrics":     [{ "id": "m1", "field": "FieldName", "aggregation": "SUM", "label": "SUM of FieldName" }],
  "filters":     [],
  "sort":        "value_desc",
  "logScale":    false
}`;
}

/**
 * Builds the prompt sent to Claude for explaining an already-rendered chart
 * using its actual aggregated data rows.
 *
 * Rows come from the aggregate_dataset RPC — limited to the top 20 before
 * being passed here so the prompt stays within token limits.
 */
export function buildExplainPrompt(
  title:      string,
  chartType:  ChartType,
  dimensions: Dimension[],
  metrics:    Metric[],
  rows:       Record<string, unknown>[],
): string {
  const dimFields    = dimensions.map((d) => d.field).join(", ") || "(none — KPI)";
  const metricFields = metrics.map((m) => `${m.aggregation} of ${m.field}`).join(", ");
  const rowsText     = rows
    .slice(0, 20)
    .map((r) => JSON.stringify(r))
    .join("\n");

  return `You are a data analyst explaining a chart to a government official or policy analyst.

Chart title:  ${title}
Chart type:   ${chartType}
Dimensions:   ${dimFields}
Metrics:      ${metricFields}
Row count:    ${rows.length}

Actual data:
${rowsText || "(no data rows available)"}

Write 3–5 sentences explaining what this data shows in plain English.
Include:
- The highest and lowest values (use the actual numbers)
- Any notable gaps, trends, or disparities visible in the data
- A concise interpretation of what this might mean for performance or policy

Rules:
- Be specific: use actual category names and numbers from the data above
- Write for a non-technical audience
- Do NOT use bullet points, headers, or markdown
- Respond with ONLY the explanation text`;
}
