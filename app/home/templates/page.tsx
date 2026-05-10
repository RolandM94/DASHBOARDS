"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, LayoutDashboard, Loader2, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Template {
  id: string;
  title: string;
  description: string;
  category: string;
  author: string;
  downloads: number;
  featured: boolean;
  thumbnail_url: string | null;
  created_at: string;
  data?: TemplateData | null;
}

interface TemplateData {
  sheets?: TemplateSheet[];
  blocks?: TemplateBlock[];
  layout?: TemplateLayoutItem[];
}

interface TemplateSheet {
  name?: string;
  chartType?: string;
}

interface TemplateBlock {
  id?: string;
  type?: string;
  title?: string;
  sheetId?: string;
  sheetName?: string;
}

interface TemplateLayoutItem {
  i?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

interface TemplatePreviewModel {
  sheets: TemplateSheet[];
  blocks: TemplateBlock[];
  layout: TemplateLayoutItem[];
}

const CATEGORY_ICONS: Record<string, string> = {
  business: "📊",
  saas: "📈",
  marketing: "📣",
  finance: "💰",
  government: "🏛️",
  education: "🎓",
  general: "📋",
};

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [using, setUsing] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  async function useTemplate(template: Template) {
    setUsing(template.id);
    try {
      const res = await fetch(`/api/templates/${template.id}/use`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const { canvasId } = await res.json();
      router.push(`/home/canvas/${canvasId}`);
    } catch {
      setUsing(null);
    }
  }

  const categories = Array.from(new Set(templates.map((t) => t.category)));
  const featured = templates.filter((t) => t.featured);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/home" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                ← Back to Home
              </Link>
            </div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand" />
              Dashboard Templates
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Start with a pre-built template and customize it for your data.
            </p>
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="border-2 border-dashed rounded-xl p-12 text-center bg-white/40">
            <LayoutDashboard className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No templates available yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Templates will appear here once published.</p>
          </div>
        ) : (
          <>
            {/* Featured */}
            {featured.length > 0 && (
              <section>
                <h2 className="font-semibold text-base mb-4">Featured</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {featured.map((t) => (
                    <TemplateCard key={t.id} template={t} onUse={useTemplate} using={using} />
                  ))}
                </div>
              </section>
            )}

            {/* By category */}
            {categories.map((cat) => {
              const catTemplates = templates.filter((t) => t.category === cat);
              if (catTemplates.length === 0) return null;
              return (
                <section key={cat}>
                  <h2 className="font-semibold text-base mb-4 capitalize flex items-center gap-2">
                    <span>{CATEGORY_ICONS[cat] ?? "📋"}</span>
                    {cat}
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {catTemplates.map((t) => (
                      <TemplateCard key={t.id} template={t} onUse={useTemplate} using={using} />
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function TemplateCard({
  template, onUse, using,
}: {
  template: Template;
  onUse: (t: Template) => void;
  using: string | null;
}) {
  const isUsing = using === template.id;

  return (
    <div
      className="rounded-xl border bg-white overflow-hidden group transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{ boxShadow: "0px 0px 1px 0px rgba(0,0,0,.15), 0px 1px 4px 0px rgba(0,0,0,.04)" }}
    >
      <TemplatePreview template={template} />
      <div className="p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold leading-tight line-clamp-2">{template.title}</p>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{template.description}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 capitalize">
            {template.category}
          </Badge>
          {template.featured && (
            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-amber-50 text-amber-700 border-amber-200">
              Featured
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Download className="h-3 w-3" />
            {template.downloads}
          </span>
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs gap-1.5"
            onClick={() => onUse(template)}
            disabled={isUsing}
          >
            {isUsing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {isUsing ? "Creating…" : "Use Template"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TemplatePreview({ template }: { template: Template }) {
  if (template.thumbnail_url) {
    return (
      <div className="relative h-36 bg-brand-tint-100 overflow-hidden border-b">
        <Image
          src={template.thumbnail_url}
          alt={`${template.title} preview`}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          unoptimized
        />
      </div>
    );
  }

  const preview = previewModelForTemplate(template);
  const { blocks, layout, sheets } = preview;

  return (
    <div className="h-36 border-b bg-gradient-to-br from-bg-offwhite to-brand-tint-100 p-2 overflow-hidden">
      <div className="h-full rounded-lg border bg-white p-2 shadow-sm">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="h-2.5 w-2.5 rounded bg-brand shrink-0" />
            <span className="h-1.5 w-20 max-w-full rounded bg-slate-200" />
          </div>
          <span className="h-1.5 w-8 rounded bg-brand-tint-300" />
        </div>
        <div className="grid h-[104px] grid-cols-12 auto-rows-[8px] gap-1">
          {layout.slice(0, 4).map((item) => {
            const block = blocks.find((candidate) => candidate.id === item.i);
            if (!block) return null;
            const sheet = sheetForBlock(block, sheets);
            const chartType = sheet?.chartType ?? "bar";
            return (
              <div
                key={item.i}
                className="min-h-0 overflow-hidden rounded-md border border-slate-100 bg-slate-50 p-1"
                style={{
                  gridColumn: `${Math.min((item.x ?? 0) + 1, 12)} / span ${Math.max(1, Math.min(item.w ?? 4, 12))}`,
                  gridRow: `${Math.max(1, Math.floor((item.y ?? 0) / 2) + 1)} / span ${Math.max(3, Math.min(Math.ceil((item.h ?? 8) / 2), 8))}`,
                }}
              >
                <MiniWidget chartType={chartType} title={block.title ?? sheet?.name ?? "Widget"} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function previewModelForTemplate(template: Template): TemplatePreviewModel {
  const blocks = Array.isArray(template.data?.blocks) ? template.data.blocks : [];
  const layout = Array.isArray(template.data?.layout) ? template.data.layout : [];
  const sheets = Array.isArray(template.data?.sheets) ? template.data.sheets : [];
  const hasRenderableLayout = blocks.length > 0 && layout.some((item) => blocks.some((block) => block.id === item.i));

  if (hasRenderableLayout) {
    return { sheets, blocks, layout };
  }

  return fallbackPreviewModel(template);
}

function fallbackPreviewModel(template: Template): TemplatePreviewModel {
  const signature = `${template.title} ${template.category}`.toLowerCase();

  if (signature.includes("saas")) {
    return createPreviewModel([
      ["Revenue Trend", "line"],
      ["Customer KPIs", "kpi"],
      ["Churn Movement", "area"],
      ["CAC / LTV", "bar"],
    ]);
  }

  if (signature.includes("marketing")) {
    return createPreviewModel([
      ["ROI by Campaign", "bar"],
      ["Channel Mix", "pie"],
      ["Conversion Trend", "line"],
      ["Spend Efficiency", "kpi"],
    ]);
  }

  if (signature.includes("project") || signature.includes("business")) {
    return createPreviewModel([
      ["Budget vs Actual", "bar"],
      ["Project Status", "pie"],
      ["Delivery KPIs", "kpi"],
      ["Milestone Trend", "area"],
    ]);
  }

  return createPreviewModel([
    ["Performance", "bar"],
    ["Trend", "line"],
    ["Summary KPIs", "kpi"],
    ["Breakdown", "pie"],
  ]);
}

function createPreviewModel(items: Array<[string, string]>): TemplatePreviewModel {
  const layout: TemplateLayoutItem[] = [
    { i: "preview-1", x: 0, y: 0, w: 7, h: 10 },
    { i: "preview-2", x: 7, y: 0, w: 5, h: 10 },
    { i: "preview-3", x: 0, y: 10, w: 6, h: 8 },
    { i: "preview-4", x: 6, y: 10, w: 6, h: 8 },
  ];

  const sheets = items.map(([name, chartType]) => ({ name, chartType }));
  const blocks = items.map(([title], index) => ({
    id: `preview-${index + 1}`,
    type: "widget",
    title,
    sheetName: title,
  }));

  return { sheets, blocks, layout };
}

function sheetForBlock(block: TemplateBlock, sheets: TemplateSheet[]): TemplateSheet | undefined {
  const target = block.sheetName ?? block.sheetId;
  if (!target) return sheets[0];
  return sheets.find((sheet) => sheet.name === target) ?? sheets[0];
}

function MiniWidget({ chartType, title }: { chartType: string; title: string }) {
  const normalized = chartType.toLowerCase();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-1 flex items-center gap-1 min-w-0">
        <span className="h-1.5 w-1.5 rounded-full bg-brand shrink-0" />
        <span className="truncate text-[7px] font-semibold leading-none text-slate-500">{title}</span>
      </div>
      <div className="min-h-0 flex-1">
        {normalized.includes("kpi") ? (
          <div className="grid h-full grid-cols-2 gap-1">
            <div className="rounded bg-white p-1">
              <span className="block h-1 w-8 rounded bg-slate-200" />
              <span className="mt-1 block h-3 w-7 rounded bg-brand/80" />
            </div>
            <div className="rounded bg-white p-1">
              <span className="block h-1 w-7 rounded bg-slate-200" />
              <span className="mt-1 block h-3 w-8 rounded bg-gold/80" />
            </div>
          </div>
        ) : normalized.includes("pie") ? (
          <div className="flex h-full items-center justify-center">
            <div
              className="h-10 w-10 rounded-full border border-white shadow-sm"
              style={{ background: "conic-gradient(#4BAA73 0 46%, #FFCC00 46% 74%, #86C6A1 74% 100%)" }}
            />
          </div>
        ) : normalized.includes("line") || normalized.includes("area") ? (
          <svg viewBox="0 0 100 42" className="h-full w-full" aria-hidden="true">
            {normalized.includes("area") && <polygon points="4,36 20,26 38,30 56,14 78,20 96,8 96,36" fill="#D7F4E3" />}
            <polyline points="4,36 20,26 38,30 56,14 78,20 96,8" fill="none" stroke="#4BAA73" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <div className="flex h-full items-end gap-1 px-1 pb-1">
            {[58, 82, 44, 70, 34].map((height, index) => (
              <span
                key={`${height}-${index}`}
                className={index % 2 === 0 ? "flex-1 rounded-t bg-brand" : "flex-1 rounded-t bg-gold"}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
