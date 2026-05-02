"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  LayoutDashboard,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
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
  { value: "ai_narrative", label: "AI Narrative" },
  { value: "chart", label: "Chart Slot" },
  { value: "text_block", label: "Text Block" },
];

const MATCH_TYPES = [
  { value: "by_id", label: "By widget ID" },
  { value: "by_type", label: "By chart type" },
  { value: "by_worksheet", label: "By worksheet" },
  { value: "any", label: "Any widget" },
];

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

export function ReportTemplateEditor({ open, onOpenChange, template, onSaved }: TemplateEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState<TemplateLayoutSection[]>([]);
  const [docs, setDocs] = useState<ReferenceDocument[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (template) {
      setName(template.name);
      setDescription(template.description ?? "");
      setSections(template.layoutJson?.sections?.length ? template.layoutJson.sections : [emptySection()]);
      loadDocuments(template.id);
    } else {
      setName("");
      setDescription("");
      setSections([emptySection()]);
      setDocs([]);
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
        const newCol: TemplateLayoutSection["layout"]["rows"][number]["columns"][number] = { type: "ai_narrative", width: 6 };
        return { ...r, columns: [...r.columns, newCol] };
      });
      updated[sectionIndex] = {
        ...section,
        layout: { ...section.layout, rows: newRows },
      } as TemplateLayoutSection;
      return updated;
    });
  }, []);

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
      const layoutJson = { sections };
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

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Could not save template");
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
    setUploading(true);
    try {
      // For now, store the file metadata. Full upload to Supabase storage would be a separate step.
      // Create a reference document with the file info
      if (!template?.id) {
        toast.error("Save the template first before uploading documents");
        return;
      }

      const body = {
        templateId: template.id,
        filename: file.name,
        fileUrl: URL.createObjectURL(file),
        fileType: file.name.endsWith(".txt") ? "txt" : file.name.endsWith(".md") ? "md" : file.name.endsWith(".docx") ? "docx" : "pdf",
        pageCount: 1,
      };

      const doc = await readJson<ReferenceDocument>(
        await fetch(`/api/reports/templates/${template.id}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      );
      setDocs((prev) => [...prev, doc]);
      toast.success("Document added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload document");
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
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
        </DialogHeader>
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

          {/* Sections */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Sections ({sections.length})</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSections((prev) => [...prev, emptySection()])}
                className="gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Add section
              </Button>
            </div>
            <div className="space-y-3">
              {sections.map((section, si) => (
                <div key={si} className="rounded-lg border bg-white p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="grid gap-2 flex-1 sm:grid-cols-3">
                      <Input
                        placeholder="Section title"
                        value={section.title}
                        onChange={(e) => updateSection(si, { title: e.target.value, section_key: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                        className="sm:col-span-2"
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

                  {/* Layout rows */}
                  <div className="space-y-2 pl-2 border-l-2 border-muted">
                    {section.layout.rows.map((row, ri) => (
                      <div key={ri} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">Row {ri + 1}</Badge>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => addSlot(si, ri)}
                            className="h-6 w-6"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(row.columns.length, 1)}, minmax(0, 1fr))` }}>
                          {row.columns.map((col, ci) => (
                            <div key={ci} className="rounded border bg-slate-50 p-3 relative">
                              <div className="absolute top-2 right-2">
                                <Button size="icon-sm" variant="ghost" onClick={() => removeSlot(si, ri, ci)} className="h-5 w-5">
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>

                              <div className="space-y-2 pr-6">
                                <Select value={col.type} onValueChange={(v) => updateSlot(si, ri, ci, { type: v as "ai_narrative" | "chart" | "text_block" })}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {SLOT_TYPES.map((t) => (
                                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                {col.type === "chart" && (
                                  <>
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
                                      placeholder="Value (e.g. bar, widget-1, worksheet-1)"
                                      value={col.widget_selector?.value ?? ""}
                                      onChange={(e) => updateSlot(si, ri, ci, {
                                        widget_selector: { ...col.widget_selector!, value: e.target.value, match_type: col.widget_selector?.match_type ?? "any" },
                                      })}
                                      className="h-8 text-xs"
                                    />
                                  </>
                                )}

                                {col.type === "text_block" && (
                                  <Textarea
                                    placeholder="Default text content"
                                    value={col.default_content ?? ""}
                                    onChange={(e) => updateSlot(si, ri, ci, { default_content: e.target.value })}
                                    rows={2}
                                    className="text-xs"
                                  />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reference Documents */}
          {template?.id && (
            <>
              <Separator />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold">Reference Documents ({docs.length})</h3>
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
                  {docs.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No documents uploaded. Upload PDF, DOCX, TXT, or MD files to provide context for the AI about how reports should be structured and written.
                    </p>
                  )}
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
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {template ? "Save" : "Create"}
          </Button>
        </DialogFooter>
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
