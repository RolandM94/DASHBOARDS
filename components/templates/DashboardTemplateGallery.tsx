"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, LayoutDashboard, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

type GalleryMode = "app" | "public";

export function DashboardTemplateGallery({ mode = "app" }: { mode?: GalleryMode }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [using, setUsing] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/templates")
      .then((response) => response.ok ? response.json() : [])
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  const handleUseTemplate = useCallback(async (template: Template) => {
    setUsing(template.id);
    try {
      const response = await fetch(`/api/templates/${template.id}/use`, { method: "POST" });
      if (response.status === 401) {
        const next = `/templates?use=${encodeURIComponent(template.id)}`;
        router.push(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      if (!response.ok) throw new Error("Failed");
      const { canvasId } = await response.json() as { canvasId?: string };
      if (!canvasId) throw new Error("Missing canvas");
      router.push(`/home/canvas/${canvasId}`);
    } catch {
      setUsing(null);
    }
  }, [router]);

  useEffect(() => {
    if (mode !== "public" || loading || using) return;
    const pendingTemplateId = new URLSearchParams(window.location.search).get("use");
    const template = templates.find((item) => item.id === pendingTemplateId);
    if (template) void handleUseTemplate(template);
  }, [handleUseTemplate, loading, mode, templates, using]);

  const categories = Array.from(new Set(templates.map((template) => template.category)));
  const featured = templates.filter((template) => template.featured);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn("flex-1", mode === "app" ? "overflow-y-auto" : "min-h-screen bg-bg-offwhite")}>
      <div className={cn("mx-auto max-w-7xl space-y-8", mode === "app" ? "p-6" : "px-4 py-10 sm:px-6 lg:px-8")}>
        <TemplateGalleryHeader mode={mode} />

        {templates.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed bg-white/70 p-12 text-center dark:bg-card/70">
            <LayoutDashboard className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No templates available yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">Templates will appear here once published.</p>
          </div>
        ) : (
          <>
            {featured.length > 0 && (
              <section>
                <h2 className="mb-4 text-base font-semibold">Featured</h2>
                <TemplateGrid templates={featured} using={using} onUse={handleUseTemplate} />
              </section>
            )}

            {categories.map((category) => {
              const categoryTemplates = templates.filter((template) => template.category === category);
              if (categoryTemplates.length === 0) return null;
              return (
                <section key={category}>
                  <h2 className="mb-4 flex items-center gap-2 text-base font-semibold capitalize">
                    <span>{CATEGORY_ICONS[category] ?? "📋"}</span>
                    {category}
                  </h2>
                  <TemplateGrid templates={categoryTemplates} using={using} onUse={handleUseTemplate} />
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function TemplateGalleryHeader({ mode }: { mode: GalleryMode }) {
  if (mode === "public") {
    return (
      <div className="rounded-lg border bg-white p-5 shadow-sm dark:bg-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-md bg-brand-tint-100 px-2 py-1 text-xs font-medium text-brand-deep">
              <Sparkles className="h-3.5 w-3.5" />
              Start faster
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard Templates</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Pick a pre-built dashboard, customize it for your data, and turn it into a canvas, published view, or AI report.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/login" className={buttonVariants({ variant: "outline" })}>Sign in</Link>
            <Link href="/signup" className={buttonVariants()}>Create account</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Link href="/home" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
            ← Back to Home
          </Link>
        </div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Sparkles className="h-5 w-5 text-brand" />
          Dashboard Templates
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Start with a pre-built template and customize it for your data.</p>
      </div>
    </div>
  );
}

function TemplateGrid({
  templates,
  using,
  onUse,
}: {
  templates: Template[];
  using: string | null;
  onUse: (template: Template) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {templates.map((template) => (
        <TemplateCard key={template.id} template={template} onUse={onUse} using={using} />
      ))}
    </div>
  );
}

function TemplateCard({
  template,
  onUse,
  using,
}: {
  template: Template;
  onUse: (template: Template) => void;
  using: string | null;
}) {
  const isUsing = using === template.id;

  return (
    <div className="group overflow-hidden rounded-xl border bg-white transition-all hover:-translate-y-0.5 hover:shadow-md dark:bg-card">
      <TemplatePreview template={template} />
      <div className="space-y-3 p-4">
        <div>
          <p className="line-clamp-2 text-sm font-semibold leading-tight">{template.title}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="h-4 px-1.5 py-0 text-[10px] capitalize">
            {template.category}
          </Badge>
          {template.featured && (
            <Badge className="h-4 border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] text-amber-700">
              Featured
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Download className="h-3 w-3" />
            {template.downloads}
          </span>
          <Button
            size="sm"
            variant="default"
            className="h-7 gap-1.5 text-xs"
            onClick={() => onUse(template)}
            disabled={isUsing}
          >
            {isUsing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {isUsing ? "Creating..." : "Use Template"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TemplatePreview({ template }: { template: Template }) {
  if (template.thumbnail_url) {
    return (
      <div className="relative h-36 overflow-hidden border-b bg-brand-tint-100">
        <Image
          src={template.thumbnail_url}
          alt={`${template.title} preview`}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          unoptimized
        />
      </div>
    );
  }

  const preview = previewModelForTemplate(template);
  const { blocks, layout, sheets } = preview;

  return (
    <div className="h-36 overflow-hidden border-b bg-gradient-to-br from-bg-offwhite to-brand-tint-100 p-2">
      <div className="h-full rounded-lg border bg-white p-2 shadow-sm dark:bg-card">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded bg-brand" />
            <span className="h-1.5 w-20 max-w-full rounded bg-slate-200 dark:bg-muted" />
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
                className="min-h-0 overflow-hidden rounded-md border border-slate-100 bg-slate-50 p-1 dark:border-border dark:bg-muted/50"
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
      <div className="mb-1 flex min-w-0 items-center gap-1">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
        <span className="truncate text-[7px] font-semibold leading-none text-slate-500 dark:text-muted-foreground">{title}</span>
      </div>
      <div className="min-h-0 flex-1">
        {normalized.includes("kpi") ? (
          <div className="grid h-full grid-cols-2 gap-1">
            <div className="rounded bg-white p-1 dark:bg-background">
              <span className="block h-1 w-8 rounded bg-slate-200 dark:bg-muted" />
              <span className="mt-1 block h-3 w-7 rounded bg-brand/80" />
            </div>
            <div className="rounded bg-white p-1 dark:bg-background">
              <span className="block h-1 w-7 rounded bg-slate-200 dark:bg-muted" />
              <span className="mt-1 block h-3 w-8 rounded bg-gold/80" />
            </div>
          </div>
        ) : normalized.includes("pie") ? (
          <div className="flex h-full items-center justify-center">
            <div
              className="h-10 w-10 rounded-full border border-white shadow-sm dark:border-background"
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
