import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const TEMPLATE_GENERATION_SYSTEM_PROMPT = `You are an AI report template designer. Your task is to generate a structured report template layout from reference context.

The template describes sections (each with a title, section_type, and layout rows containing content slots).

Available section_types: executive_summary, introduction, methodology, chart_analysis, table_analysis, kpi_summary, risk_analysis, recommendation, appendix, custom

Available slot types: ai_narrative (AI-written text), chart (embedded chart widget), table (data table), image (infographic/image), divider (visual separator), text_block (fixed/pre-written text)

Rules:
- Create 4-8 sections that flow logically
- The first section should be an executive_summary
- Each section should have at least one ai_narrative slot
- Include a mix of chart and table slots where data analysis is relevant
- If the reference mentions specific metrics, KPIs, or data points, create appropriate chart/table slots
- Include a recommendation section if the context supports it
- Give every section a clear, descriptive title
- Every slot should have a concise prompt describing what it should contain
- Chart slots should use widget_selector: { match_type: "any", value: "" }
- Respond with ONLY a JSON object, no markdown or explanation

Output format:
{
  "sections": [
    {
      "section_key": "unique_slug_key",
      "title": "Section Title",
      "section_type": "executive_summary",
      "layout": {
        "rows": [
          {
            "columns": [
              { "type": "ai_narrative", "width": 12, "prompt": "Write the executive summary covering..." }
            ]
          },
          {
            "columns": [
              { "type": "kpi_summary", "width": 12, "prompt": "Display key metrics including..." }
            ]
          }
        ]
      }
    }
  ]
}`;

interface GenerateRequest {
  referencePrompt?: string;
  referenceTexts?: string[];
  settings?: {
    sampleForm?: string;
    contentDensity?: string;
    orientation?: string;
    includeTables?: boolean;
    includeInfographics?: boolean;
    includeFootnotes?: boolean;
    includePageNumbers?: boolean;
    analysisFocus?: string;
  };
}

// POST /api/reports/templates/generate-from-reference — AI generates template layout from reference docs
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured on the server." }, { status: 503 });
  }

  try {
    const body = await request.json() as GenerateRequest;
    const referenceTexts = Array.isArray(body.referenceTexts) ? body.referenceTexts.filter(Boolean) : [];
    const referencePrompt = body.referencePrompt?.trim();
    const settings = body.settings ?? {};

    if (!referencePrompt && referenceTexts.length === 0) {
      return NextResponse.json({ error: "Provide a reference prompt or reference document text" }, { status: 400 });
    }

    const contextParts: string[] = [];
    if (referencePrompt) {
      contextParts.push(`USER INSTRUCTIONS: ${referencePrompt}`);
    }
    if (referenceTexts.length > 0) {
      contextParts.push("REFERENCE DOCUMENTS:");
      referenceTexts.forEach((text, index) => {
        const truncated = text.slice(0, 4000);
        contextParts.push(`--- Document ${index + 1} ---\n${truncated}`);
      });
    }

    const settingsContext = Object.entries(settings)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`)
      .join("\n");

    const userPrompt = [
      "Generate a report template layout based on the following context:",
      "",
      contextParts.join("\n\n"),
      "",
      settingsContext ? `SETTINGS:\n${settingsContext}` : "",
      "",
      "Generate the template layout now.",
    ].filter(Boolean).join("\n");

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: process.env.ANTHROPIC_REPORT_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 2600,
      system: TEMPLATE_GENERATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw = message.content
      .filter((content) => content.type === "text")
      .map((content) => (content as { type: "text"; text: string }).text)
      .join("");

    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("AI returned a non-object response");
    }

    const output = parsed as Record<string, unknown>;
    const sections = Array.isArray(output.sections) ? output.sections : [];

    if (sections.length === 0) {
      throw new Error("AI did not return any sections");
    }

    // Validate and normalise section keys
    const normalized = sections.map((section: unknown, index: number) => {
      const s = section as Record<string, unknown>;
      const title = typeof s.title === "string" && s.title.trim() ? s.title.trim() : `Section ${index + 1}`;
      const sectionKey = typeof s.section_key === "string" && s.section_key.trim()
        ? s.section_key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
        : title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

      const validTypes = ["executive_summary", "introduction", "methodology", "chart_analysis", "table_analysis", "kpi_summary", "risk_analysis", "recommendation", "appendix", "custom"];
      const sectionType = typeof s.section_type === "string" && validTypes.includes(s.section_type)
        ? s.section_type
        : "custom";

      const layout = s.layout && typeof s.layout === "object" && !Array.isArray(s.layout)
        ? s.layout as Record<string, unknown>
        : { rows: [{ columns: [{ type: "ai_narrative", width: 12, prompt: `Write the ${title} section.` }] }] };

      return { section_key: sectionKey, title, section_type: sectionType, layout };
    });

    return NextResponse.json({
      status: true,
      sections: normalized,
      generatedByAi: true,
      model: process.env.ANTHROPIC_REPORT_MODEL || "claude-haiku-4-5-20251001",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Template generation failed";
    const status = error instanceof SyntaxError ? 422 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
