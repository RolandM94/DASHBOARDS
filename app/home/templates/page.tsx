"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, LayoutDashboard, Loader2, Sparkles } from "lucide-react";
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
      {/* Thumbnail placeholder */}
      <div className="h-32 bg-gradient-to-br from-brand/5 to-brand/10 flex items-center justify-center">
        <LayoutDashboard className="h-10 w-10 text-brand/20" />
      </div>
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
