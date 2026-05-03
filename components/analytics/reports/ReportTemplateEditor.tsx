"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Brain,
  FileText,
  FileUp,
  Image as ImageIcon,
  LayoutDashboard,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Table2,
  Trash2,
  Type,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { ReferenceDocument, ReportTemplate, TemplateLayoutSection } from "@/types";

interface TemplateEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: ReportTemplate | null;
  onSaved: () => void;
}

const SECTION_TYPES = [
  { value: "executive_summary", label: "Executive Summary" },
  { value: "introduction", label: "Introduction" },
  { value: "methodology", label: "Methodology" },
  { value: "chart_analysis", label: "Chart Analysis" },
  { value: "table_analysis", label: "Table Analysis" },
  { value: "kpi_summary", label: "KPI Summary" },
  { value: "risk_analysis", label: "Risk Analysis" },
  { value: "recommendation", label: "Recommendation" },
  { value: "appendix", label: "Appendix" },
  { value: "custom", label: "Custom" },
];

const SLOT_TYPES = [
  { value: "ai_narrative", label: "Text", icon: Type },
  { value: "chart", label: "Chart", icon: BarChart3 },
  { value: "table", label: "Table", icon: Table2 },
  { value: "image", label: "Image", icon: ImageIcon },
  { value: "divider", label: "Divider", icon: Minus },
  { value: "text_block", label: "Fixed Text", icon: FileText },
];

const MATCH_TYPES = [
  { value: "by_id", label: "By widget ID" },
  { value: "by_type", label: "By chart type" },
  { value: "by_worksheet", label: "By worksheet" },
  { value: "any", label: "Any widget" },
];

type SlotType = TemplateLayoutSection["layout"]["rows"][number]["columns"][number]["type"];
type PendingReferenceDocument = {
  id: string;
  filename: string;
  fileType: ReferenceDocument["fileType"];
  extractedText?: string;
  fileUrl: string;
};
type TemplateSettings = Required<NonNullable<ReportTemplate["layoutJson"]["settings"]>>;

const DEFAULT_SETTINGS: TemplateSettings = {
  sampleForm: "single_column" as const,
  contentDensity: "standard" as const,
  orientation: "portrait" as const,
  includeTables: true,
  includeInfographics: true,
  includeFootnotes: false,
  includePageNumbers: true,
  analysisFocus: "Financial",
};

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof body?.error === "string" ? body.error : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

function emptySection(): TemplateLayoutSection {
  return {
    section_key: "",
    title: "",
    section_type: "custom",
    layout: { rows: [{ columns: [{ type: "ai_narrative", width: 12 }] }] },
  };
}

function sectionKey(title: string, fallback: string) {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || fallback;
}

function slotLabel(type: SlotType) {
  return SLOT_TYPES.find((slot) => slot.value === type)?.label ?? "Block";
}

function makeSlot(type: SlotType): TemplateLayoutSection["layout"]["rows"][number]["columns"][number] {
  if (type === "divider") return { type, width: 12 };
  if (type === "chart") return { type, width: 12, widget_selector: { match_type: "any", value: "" }, prompt: "Describe the chart this slot should contain." };
  if (type === "table") return { type, width: 12, prompt: "Describe the data table this slot should contain." };
  if (type === "image") return { type, width: 12, prompt: "Describe the image or infographic this slot should contain." };
  if (type === "text_block") return { type, width: 12, default_content: "Fixed text for this part of the report." };
  return { type, width: 12, prompt: "Describe the narrative this text block should cover." };
}

export function ReportTemplateEditor({ open, onOpenChange, template, onSaved }: TemplateEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState<TemplateLayoutSection[]>([]);
  const [docs, setDocs] = useState<ReferenceDocument[]>([]);
  const [pendingDocs, setPendingDocs] = useState<PendingReferenceDocument[]>([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [referencePrompt, setReferencePrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [wizardStep, setWizardStep] = useState<"choose" | "editor">("choose");

  useEffect(() => {
    if (!open) return;
    if (template) {
      setWizardStep("editor");
      setName(template.name);
      setDescription(template.description ?? "");
      setSections(template.layoutJson?.sections?.length ? template.layoutJson.sections : [emptySection()]);
      setSettings({ ...DEFAULT_SETTINGS, ...(template.layoutJson?.settings ?? {}) });
      setReferencePrompt(template.layoutJson?.referencePrompt ?? "");
      setPendingDocs([]);
      loadDocuments(template.id);
    } else {
      setWizardStep("choose");
      setName("");
      setDescription("");
      setSections([emptySection()]);
      setDocs([]);
      setPendingDocs([]);
      setSettings(DEFAULT_SETTINGS);
      setReferencePrompt("");
    }
  }, [open, template]);

  async function loadDocuments(templateId: string) {
    try {
      const data = await readJson<ReferenceDocument[]>(await fetch(`/api/reports/templates/${templateId}/documents`));
      setDocs(data);
    } catch {
      setDocs([]);
    }
  }

  const updateSection = useCallback((index: number, patch: Partial<TemplateLayoutSection>) => {
    setSections((prev) => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  }, []);

  const removeSection = useCallback((index: number) => {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateSlot = useCallback((
    sectionIndex: number,
    rowIndex: number,
    colIndex: number,
    patch: Partial<TemplateLayoutSection["layout"]["rows"][number]["columns"][number]>
  ) => {
    setSections((prev) => {
      const updated = [...prev];
      const section = { ...updated[sectionIndex] };
      const newRows = section.layout.rows.map((r, ri) => {
        if (ri !== rowIndex) return r;
        return { ...r, columns: r.columns.map((c, ci) => ci === colIndex ? { ...c, ...patch } : c) };
      });
      updated[sectionIndex] = {
        ...section,
        layout: { ...section.layout, rows: newRows },
      } as TemplateLayoutSection;
      return updated;
    });
  }, []);

  const removeSlot = useCallback((sectionIndex: number, rowIndex: number, colIndex: number) => {
    setSections((prev) => {
      const updated = [...prev];
      const section = { ...updated[sectionIndex] };
      const newRows = section.layout.rows.map((r, ri) => {
        if (ri !== rowIndex) return r;
        const cols = r.columns.filter((_, ci) => ci !== colIndex) as TemplateLayoutSection["layout"]["rows"][number]["columns"];
        const fallbackCol: TemplateLayoutSection["layout"]["rows"][number]["columns"][number] = { type: "ai_narrative", width: 12 };
        return { ...r, columns: cols.length === 0 ? [fallbackCol] : cols };
      });
      updated[sectionIndex] = {
        ...section,
        layout: { ...section.layout, rows: newRows },
      } as TemplateLayoutSection;
      return updated;
    });
  }, []);

  const addSlot = useCallback((sectionIndex: number, rowIndex: number) => {
    setSections((prev) => {
      const updated = [...prev];
      const section = { ...updated[sectionIndex] };
      const newRows = section.layout.rows.map((r, ri) => {
        if (ri !== rowIndex) return r;
        const newCol = { ...makeSlot("ai_narrative"), width: 6 };
        return { ...r, columns: [...r.columns, newCol] };
      });
      updated[sectionIndex] = {
        ...section,
        layout: { ...section.layout, rows: newRows },
      } as TemplateLayoutSection;
      return updated;
    });
  }, []);

  const addRow = useCallback((sectionIndex: number, slotType: SlotType = "ai_narrative") => {
    setSections((prev) => prev.map((section, index) => {
      if (index !== sectionIndex) return section;
      return {
        ...section,
        layout: {
          ...section.layout,
          rows: [...section.layout.rows, { columns: [makeSlot(slotType)] }],
        },
      };
    }));
  }, []);

  function addBlockToLastSection(slotType: SlotType) {
    if (sections.length === 0) {
      setSections([{ ...emptySection(), layout: { rows: [{ columns: [makeSlot(slotType)] }] } }]);
      return;
    }
    addRow(sections.length - 1, slotType);
  }

  function startFromScratch() {
    setWizardStep("editor");
  }

  async function generateLayoutFromReference() {
    const allTexts: string[] = [];
    for (const doc of pendingDocs) {
      if (doc.extractedText) allTexts.push(doc.extractedText);
    }
    for (const doc of docs) {
      if (doc.extractedText) allTexts.push(doc.extractedText);
    }
    if (!referencePrompt.trim() && allTexts.length === 0) {
      toast.error("Add a reference prompt or upload reference documents first");
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch("/api/reports/templates/generate-from-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referencePrompt: referencePrompt.trim() || undefined,
          referenceTexts: allTexts,
          settings,
        }),
      });

      const data = await readJson<{ sections: TemplateLayoutSection[]; generatedByAi: boolean; model: string }>(res);

      if (data.sections && data.sections.length > 0) {
        setSections(data.sections);
        setWizardStep("editor");
        toast.success(`AI generated ${data.sections.length} sections from reference`);
      } else {
        toast.error("AI returned no sections. Try adding more reference context.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Template name is required");
      return;
    }
    if (sections.length === 0) {
      toast.error("Template must have at least one section");
      return;
    }

    setSaving(true);
    try {
      const layoutJson = { sections, settings, referencePrompt };
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        layoutJson,
        referenceDocumentIds: docs.map((d) => d.id),
      };

      const res = await fetch(
        template ? `/api/reports/templates/${template.id}` : "/api/reports/templates",
        {
          method: template ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      const savedTemplate = await readJson<ReportTemplate>(res);

      if (pendingDocs.length > 0) {
        const results = await Promise.allSettled(pendingDocs.map(async (doc) =>
          readJson<ReferenceDocument>(await fetch(`/api/reports/templates/${savedTemplate.id}/documents`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: doc.filename,
              fileUrl: doc.fileUrl,
              fileType: doc.fileType,
              extractedText: doc.extractedText,
              pageCount: 1,
              metadata: { source: "template_designer_upload" },
            }),
          }))
        ));
        const linked = results.filter((r) => r.status === "fulfilled").length;
        if (linked > 0) {
          toast.success(`Linked ${linked} reference document${linked !== 1 ? "s" : ""}`);
          // Refresh documents list
          loadDocuments(savedTemplate.id);
        }
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          toast.error(`${failed} document${failed !== 1 ? "s" : ""} failed to link`);
        }
        setPendingDocs([]);
      }

      toast.success(template ? "Template updated" : "Template created");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save template");
    } finally {
      setSaving(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error("File exceeds 25 MB limit");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (template?.id) formData.append("templateId", template.id);

      const res = await fetch("/api/reports/templates/upload", {
        method: "POST",
        body: formData,
      });

      const data = await readJson<{
        fileUrl: string;
        storagePath: string;
        fileType: string;
        filename: string;
        extractedText: string | null;
        document: ReferenceDocument | null;
      }>(res);

      if (data.document) {
        // Template already exists — document record was created server-side
        setDocs((prev) => [...prev, data.document!]);
        toast.success("Reference document uploaded");
      } else {
        // No template yet — stage as pending
        const id = `${Date.now()}-${file.name}`;
        const fileType = data.fileType as ReferenceDocument["fileType"];
        setPendingDocs((prev) => [...prev, {
          id,
          filename: data.filename,
          fileType,
          extractedText: data.extractedText ?? undefined,
          fileUrl: data.fileUrl,
        }]);
        toast.success("Reference document staged — will be linked when template is saved");
      }

      // Reset file input
      e.target.value = "";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not upload document";
      if (message.includes("bucket") || message.includes("Storage bucket")) {
        toast.error("Storage bucket not configured. Create 'report-reference-docs' bucket in Supabase Dashboard → Storage.");
      } else {
        toast.error(message);
      }
    } finally {
      setUploading(false);
    }
  }

  async function deleteDocument(docId: string) {
    try {
      await readJson(await fetch(`/api/reports/templates/${template!.id}/documents/${docId}`, { method: "DELETE" }));
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      toast.success("Document removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete document");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[90vw] xl:max-w-[1400px]">
        <DialogHeader>
          <DialogTitle>{template ? "Edit template" : wizardStep === "choose" ? "New template" : "New template"}</DialogTitle>
        </DialogHeader>

        {wizardStep === "choose" && !template ? (
          /* ── AI Prompt Screen ──────────────────────────────────────────── */
          <div className="mx-auto max-w-2xl space-y-6 py-2">
            {/* Header */}
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10">
                <Wand2 className="h-6 w-6 text-brand" />
              </div>
              <h2 className="text-lg font-bold">Create Report Template</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Describe your report and let AI build the template, or skip to start from scratch.
              </p>
            </div>

            {/* Name (compact) */}
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Template Name</Label>
              <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Report Template" />
            </div>

            {/* Prompt — the main focus */}
            <div className="space-y-1.5">
              <Label>What kind of report do you need?</Label>
              <Textarea
                value={referencePrompt}
                onChange={(e) => setReferencePrompt(e.target.value)}
                placeholder={`Describe the report structure, sections, and focus areas you want the AI to generate. Be as specific as you like.

Example:
"A quarterly financial performance report covering:
- Executive summary with key highlights
- Revenue breakdown by business unit with bar charts
- Expense analysis comparing budget vs actual with tables
- Regional performance comparison with map charts
- Risk assessment section
- Strategic recommendations for cost optimization

Tone should be professional and data-driven. Include KPI cards for top-level metrics."`}
                rows={8}
                className="text-sm leading-relaxed"
              />
            </div>

            {/* Reference Documents */}
            <div className="space-y-1.5">
              <Label>Reference Documents (optional)</Label>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-5 text-center transition-colors hover:border-brand/50 hover:bg-brand/5">
                {uploading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Uploading...</span>
                  </>
                ) : (
                  <>
                    <FileUp className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      Upload PDF, DOCX, TXT, or MD files for AI context
                    </span>
                    <span className="text-[10px] text-muted-foreground/60">max 25 MB per file</span>
                  </>
                )}
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
              {pendingDocs.length > 0 && (
                <div className="mt-2 space-y-1">
                  {pendingDocs.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-md border bg-amber-50 px-3 py-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-[11px] truncate">{doc.filename}</span>
                        {doc.extractedText && <Badge variant="secondary" className="text-[9px]">text extracted</Badge>}
                      </div>
                      <Button size="icon-sm" variant="ghost" className="h-5 w-5" onClick={() => setPendingDocs((prev) => prev.filter((item) => item.id !== doc.id))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Settings */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Density:</Label>
                <Select value={settings.contentDensity} onValueChange={(v) => setSettings((prev) => ({ ...prev, contentDensity: v as typeof settings.contentDensity }))}>
                  <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concise">Concise</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="detailed">Detailed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Focus:</Label>
                <Input value={settings.analysisFocus} onChange={(e) => setSettings((prev) => ({ ...prev, analysisFocus: e.target.value }))} placeholder="Financial" className="h-7 w-[130px] text-xs" />
              </div>
              <Separator orientation="vertical" className="h-5" />
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={settings.includeTables} onChange={(e) => setSettings((prev) => ({ ...prev, includeTables: e.target.checked }))} className="h-3 w-3" />
                Tables
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={settings.includeInfographics} onChange={(e) => setSettings((prev) => ({ ...prev, includeInfographics: e.target.checked }))} className="h-3 w-3" />
                Charts
              </label>
            </div>

            {/* Generate Button */}
            <Button
              onClick={generateLayoutFromReference}
              disabled={generating}
              size="lg"
              className="w-full gap-2 bg-brand text-white hover:bg-brand/90 h-12 text-base"
            >
              {generating ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Generating template...</>
              ) : (
                <><Sparkles className="h-5 w-5" /> Generate Template with AI</>
              )}
            </Button>

            {/* Skip option */}
            <div className="text-center">
              <button
                type="button"
                onClick={startFromScratch}
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline transition-colors"
              >
                Skip, I&apos;ll build from scratch
              </button>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            </DialogFooter>
          </div>
        ) : (
          /* ── Editor (existing or after wizard) ──────────────────────── */
          <>
        <div className="space-y-5">
          {/* Name & Description */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tpl-name">Name</Label>
              <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Report Template" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tpl-desc">Description</Label>
              <Textarea id="tpl-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Standard management report with KPI summary and recommendations" rows={2} />
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 lg:grid-cols-[150px_minmax(0,1fr)_220px]">
            <aside className="space-y-2">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Content Blocks</h3>
              {SLOT_TYPES.map((slot) => {
                const Icon = slot.icon;
                return (
                  <button
                    key={slot.value}
                    type="button"
                    onClick={() => addBlockToLastSection(slot.value as SlotType)}
                    className="flex w-full items-center gap-2 rounded-md border bg-white px-3 py-2 text-left text-xs font-medium hover:border-brand hover:bg-brand-tint-100/30"
                  >
                    <Icon className="h-4 w-4 text-brand" />
                    {slot.label}
                  </button>
                );
              })}
              <Separator />
              <Button
                size="sm"
                variant="outline"
                onClick={generateLayoutFromReference}
                disabled={generating}
                className="w-full gap-2"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                {generating ? "Generating..." : "AI Generate"}
              </Button>
            </aside>

            <div className="min-w-0 rounded-lg bg-slate-100/70 p-4">
              <div className={cn(
                "mx-auto min-h-[640px] bg-white p-8 shadow-sm ring-1 ring-slate-200",
                settings.orientation === "landscape" ? "max-w-4xl" : "max-w-2xl"
              )}>
                <div className="mb-5 flex items-center justify-between border-b pb-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Report Template</p>
                    <h3 className="text-lg font-semibold">{name || "Untitled template"}</h3>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{sections.length} sections</Badge>
                </div>

                <div className="space-y-4">
                  {sections.map((section, si) => (
                    <div key={si} className="rounded-lg border bg-white p-3">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="grid flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_170px]">
                          <Input
                            placeholder="Section title"
                            value={section.title}
                            onChange={(e) => updateSection(si, { title: e.target.value, section_key: sectionKey(e.target.value, `section-${si + 1}`) })}
                          />
                          <Select value={section.section_type} onValueChange={(v) => { if (v) updateSection(si, { section_type: v }); }}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SECTION_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button size="icon-sm" variant="ghost" onClick={() => removeSection(si)} className="shrink-0">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="space-y-2">
                        {section.layout.rows.map((row, ri) => (
                          <div key={ri} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-medium uppercase text-muted-foreground">Row {ri + 1}</span>
                              <Button size="sm" variant="ghost" onClick={() => addSlot(si, ri)} className="h-7 gap-1 text-xs">
                                <Plus className="h-3 w-3" />
                                Column
                              </Button>
                            </div>
                            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(row.columns.length, 1)}, minmax(0, 1fr))` }}>
                              {row.columns.map((col, ci) => (
                                <div key={ci} className={cn(
                                  "relative min-h-24 rounded-md border border-dashed bg-slate-50 p-3",
                                  col.type === "divider" && "min-h-10"
                                )}>
                                  <Button size="icon-sm" variant="ghost" onClick={() => removeSlot(si, ri, ci)} className="absolute right-1 top-1 h-6 w-6">
                                    <X className="h-3 w-3" />
                                  </Button>
                                  <div className="space-y-2 pr-5">
                                    <Select value={col.type} onValueChange={(v) => updateSlot(si, ri, ci, makeSlot(v as SlotType))}>
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {SLOT_TYPES.map((t) => (
                                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {col.type === "divider" ? (
                                      <div className="py-3"><Separator /></div>
                                    ) : (
                                      <Textarea
                                        placeholder={col.type === "text_block" ? "Fixed text content" : `Describe the ${slotLabel(col.type).toLowerCase()} for this area`}
                                        value={col.type === "text_block" ? col.default_content ?? "" : col.prompt ?? ""}
                                        onChange={(e) => updateSlot(si, ri, ci, col.type === "text_block" ? { default_content: e.target.value } : { prompt: e.target.value })}
                                        rows={2}
                                        className="text-xs"
                                      />
                                    )}

                                    {col.type === "chart" && (
                                      <div className="grid gap-2 sm:grid-cols-2">
                                        <Select
                                          value={col.widget_selector?.match_type ?? "any"}
                                          onValueChange={(v) => updateSlot(si, ri, ci, {
                                            widget_selector: {
                                              match_type: v as "by_id" | "by_type" | "by_worksheet" | "any",
                                              value: col.widget_selector?.value ?? "",
                                            },
                                          })}
                                        >
                                          <SelectTrigger className="h-8 text-xs">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {MATCH_TYPES.map((t) => (
                                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        <Input
                                          placeholder="bar, widget ID, worksheet ID"
                                          value={col.widget_selector?.value ?? ""}
                                          onChange={(e) => updateSlot(si, ri, ci, {
                                            widget_selector: { ...col.widget_selector!, value: e.target.value, match_type: col.widget_selector?.match_type ?? "any" },
                                          })}
                                          className="h-8 text-xs"
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        <Button size="sm" variant="outline" onClick={() => addRow(si)} className="w-full gap-1">
                          <Plus className="h-3.5 w-3.5" />
                          Add row
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSections((prev) => [...prev, emptySection()])}
                  className="mt-4 w-full gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add section
                </Button>
              </div>
            </div>

            <aside className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Layout Settings</h3>
                <Select value={settings.sampleForm} onValueChange={(value) => setSettings((prev) => ({ ...prev, sampleForm: value as typeof settings.sampleForm }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single_column">Single column</SelectItem>
                    <SelectItem value="two_columns">Two columns</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={settings.contentDensity} onValueChange={(value) => setSettings((prev) => ({ ...prev, contentDensity: value as typeof settings.contentDensity }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="concise">Concise</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="detailed">Detailed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={settings.orientation} onValueChange={(value) => setSettings((prev) => ({ ...prev, orientation: value as typeof settings.orientation }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">Portrait</SelectItem>
                    <SelectItem value="landscape">Landscape</SelectItem>
                  </SelectContent>
                </Select>
                {[
                  ["includeTables", "Tables"],
                  ["includeInfographics", "Charts"],
                  ["includeFootnotes", "Footnotes"],
                  ["includePageNumbers", "Page numbers"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between rounded-md border bg-white px-3 py-2 text-xs">
                    {label}
                    <input
                      type="checkbox"
                      checked={Boolean(settings[key as keyof typeof settings])}
                      onChange={(event) => setSettings((prev) => ({ ...prev, [key]: event.target.checked }))}
                    />
                  </label>
                ))}
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">Reference Prompt</h3>
                <Textarea
                  value={referencePrompt}
                  onChange={(event) => setReferencePrompt(event.target.value)}
                  placeholder="Describe what the uploaded reference should influence: section order, tone, chart placement, table density..."
                  rows={5}
                  className="text-xs"
                />
              </div>
            </aside>
          </div>

          {/* Reference Documents */}
          {
            <>
              <Separator />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Reference Documents ({docs.length + pendingDocs.length})</h3>
                  <label className="cursor-pointer">
                    <div className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground">
                      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Upload
                    </div>
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt,.md"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={uploading}
                    />
                  </label>
                </div>
                <div className="space-y-2">
                  {docs.length === 0 && pendingDocs.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No documents uploaded. Upload PDF, DOCX, TXT, or MD files to provide context for the AI about how reports should be structured and written.
                    </p>
                  )}
                  {pendingDocs.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-lg border bg-amber-50 p-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate">{doc.filename}</span>
                        <Badge variant="secondary" className="text-[10px]">{doc.fileType}</Badge>
                        <span className="text-[10px] text-muted-foreground">staged</span>
                      </div>
                      <Button size="icon-sm" variant="ghost" onClick={() => setPendingDocs((prev) => prev.filter((item) => item.id !== doc.id))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  {docs.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-lg border bg-white p-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate">{doc.filename}</span>
                        <Badge variant="secondary" className="text-[10px]">{doc.fileType}</Badge>
                      </div>
                      <Button size="icon-sm" variant="ghost" onClick={() => deleteDocument(doc.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          }
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {template ? "Save" : "Create"}
          </Button>
        </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ReportTemplateList({
  templates,
  onSelect,
  onDelete,
  deletingId,
}: {
  templates: ReportTemplate[];
  onSelect: (template: ReportTemplate) => void;
  onDelete: (template: ReportTemplate) => void;
  deletingId?: string;
}) {
  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-white/50 p-6 text-center">
        <LayoutDashboard className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No templates yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Create a template to standardize your report layout and structure.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {templates.map((tpl) => (
        <div
          key={tpl.id}
          className={cn(
            "rounded-lg border bg-white p-3 transition-colors hover:bg-slate-50"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onSelect(tpl)} className="text-sm font-semibold hover:underline text-left">
                  {tpl.name}
                </button>
                <Badge variant="secondary" className="text-[10px]">
                  {(tpl.layoutJson?.sections ?? []).length} section{(tpl.layoutJson?.sections ?? []).length !== 1 ? "s" : ""}
                </Badge>
              </div>
              {tpl.description && (
                <p className="mt-1 text-xs text-muted-foreground truncate">{tpl.description}</p>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="icon-sm" variant="ghost" onClick={() => onSelect(tpl)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => onDelete(tpl)}
                disabled={deletingId === tpl.id}
              >
                {deletingId === tpl.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
