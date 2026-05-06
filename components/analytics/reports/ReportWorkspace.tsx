"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  BarChart2,
  Bold,
  Check,
  Download,
  FileText,
  Italic,
  LayoutDashboard,
  List,
  ListOrdered,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Underline,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { renderPreviewHtml } from "@/lib/reports/previewRenderer";
import { useCanvasStore } from "@/store/canvasStore";
import { ReportTemplateEditor, ReportTemplateList } from "./ReportTemplateEditor";
import type {
  ReportBlueprint,
  ReportExport,
  ReportExportFormat,
  ReportGenerationLog,
  ReportJob,
  ReportProject,
  ReportSection,
  ReportSourceType,
  ReportTemplate,
  ReportType,
} from "@/types";

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  executive_summary: "Executive summary",
  management_report: "Management report",
  technical_report: "Technical report",
  custom_report: "Custom report",
};

const REPORT_PROGRESS_LABELS: Record<ReportProject["status"], string> = {
  draft: "Draft",
  blueprint_generated: "Outline ready",
  blueprint_approved: "Outline ready",
  generating: "Generating",
  generated: "Draft ready",
  exported: "Exported",
  review: "Ready",
  approved: "Ready",
  archived: "Archived",
  failed: "Needs attention",
};

type SourceOption = {
  id: string;
  type: ReportSourceType;
  title: string;
  meta: string;
};

type BusyAction =
  | "create"
  | "capture"
  | "blueprint"
  | "sections"
  | "compile"
  | "jobPoll"
  | "previewSave"
  | `section:${string}`
  | `export:${ReportExportFormat}`;

const JOB_TYPE_TO_ACTION: Record<string, BusyAction> = {
  capture_source_snapshot: "capture",
  generate_blueprint: "blueprint",
  generate_all_sections: "sections",
  compile_report: "compile",
  export_report: "export:docx",
};

type CompilePayload = {
  title?: string;
  sections?: Array<{ id?: string; title?: string; content?: string; status?: string }>;
  warnings?: string[];
};

type AuditResponse = {
  audit_trail?: {
    generation_logs?: Array<{
      id: string;
      report_project_id?: string | null;
      user_id: string;
      action_type: string;
      input_payload?: Record<string, unknown>;
      output_summary?: Record<string, unknown>;
      ai_model?: string | null;
      status: ReportGenerationLog["status"];
      error_message?: string | null;
      created_at: string;
    }>;
  };
};

function formatDate(value?: string) {
  if (!value) return "Not yet";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function cssString(value: string) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

async function readJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = typeof body?.error === "string" ? body.error : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

function getSourceLabel(project: ReportProject, sourceOptions: SourceOption[]) {
  const sourceId = project.sourceType === "dashboard" ? project.sourceDashboardId : project.sourceCanvasId;
  return sourceOptions.find((option) => option.type === project.sourceType && option.id === sourceId)?.title ?? sourceId ?? "Source";
}

function getProgressLabel(status: ReportProject["status"]) {
  return REPORT_PROGRESS_LABELS[status] ?? "Draft";
}

function getProgressTextClass(status: ReportProject["status"]) {
  if (status === "failed") return "text-red-600";
  if (status === "exported") return "text-green-700";
  return "text-muted-foreground";
}

function ReportProjectCreateModal({
  open,
  onOpenChange,
  sources,
  templates,
  initialSource,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: SourceOption[];
  templates: ReportTemplate[];
  initialSource?: { type: ReportSourceType; id: string };
  onCreated: (project: ReportProject) => void;
}) {
  const initial = sources.find((source) => source.type === initialSource?.type && source.id === initialSource.id) ?? sources[0];
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceKey, setSourceKey] = useState(initial ? `${initial.type}:${initial.id}` : "");
  const [reportType, setReportType] = useState<ReportType>("management_report");
  const [templateId, setTemplateId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = sources.find((source) => source.type === initialSource?.type && source.id === initialSource.id) ?? sources[0];
    setSourceKey(next ? `${next.type}:${next.id}` : "");
    if (next && !name) setName(`${next.title} report`);
  }, [initialSource, name, open, sources]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const [sourceType, sourceId] = sourceKey.split(":") as [ReportSourceType, string];
    if (!name.trim() || !sourceType || !sourceId) return;
    setSaving(true);
    try {
      const project = await readJson<ReportProject>(await fetch("/api/reports/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          sourceType,
          sourceDashboardId: sourceType === "dashboard" ? sourceId : undefined,
          sourceCanvasId: sourceType === "canvas" ? sourceId : undefined,
          reportType,
          templateId: templateId || undefined,
        }),
      }));
      toast.success("Report project created");
      onCreated(project);
      onOpenChange(false);
      setName("");
      setDescription("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create report");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New report</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="report-name">Name</Label>
              <Input id="report-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={sourceKey || undefined} onValueChange={(value) => value && setSourceKey(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a source" />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((source) => (
                    <SelectItem key={`${source.type}:${source.id}`} value={`${source.type}:${source.id}`}>
                      {source.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={reportType} onValueChange={(value) => value && setReportType(value as ReportType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="report-description">Description</Label>
              <Textarea id="report-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            {templates.length > 0 && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Template (optional)</Label>
                <Select value={templateId || undefined} onValueChange={(value) => value && setTemplateId(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="No template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No template</SelectItem>
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim() || !sourceKey}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectList({
  projects,
  selectedId,
  sourceOptions,
  onSelect,
}: {
  projects: ReportProject[];
  selectedId?: string;
  sourceOptions: SourceOption[];
  onSelect: (project: ReportProject) => void;
}) {
  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-white/50 p-6 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No report projects yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {projects.map((project) => (
        <button
          key={project.id}
          type="button"
          onClick={() => onSelect(project)}
          className={cn(
            "w-full rounded-lg border bg-white p-3 text-left transition-colors hover:bg-slate-50",
            selectedId === project.id && "border-brand bg-brand-tint-100/40"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{project.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {getSourceLabel(project, sourceOptions)} · {getProgressLabel(project.status)}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">Updated {formatDate(project.updatedAt)}</p>
        </button>
      ))}
    </div>
  );
}

function WorkflowStep({
  title,
  detail,
  done,
  active,
  children,
}: {
  title: string;
  detail: string;
  done?: boolean;
  active?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border bg-white p-4", active && "border-brand")}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {done ? <Check className="h-4 w-4 text-green-600" /> : <ArrowRight className="h-4 w-4 text-muted-foreground" />}
            <h3 className="text-sm font-semibold">{title}</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </div>
  );
}

function BlueprintPanel({
  blueprint,
  onSave,
  saving,
}: {
  blueprint?: ReportBlueprint;
  onSave: (patch: Partial<ReportBlueprint>) => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [audience, setAudience] = useState("");

  useEffect(() => {
    setTitle(blueprint?.title ?? "");
    setObjective(blueprint?.objective ?? "");
    setAudience(blueprint?.audience ?? "");
  }, [blueprint]);

  if (!blueprint) {
    return <p className="text-sm text-muted-foreground">No blueprint generated.</p>;
  }

  const outline = Array.isArray(blueprint.blueprintJson?.sections)
    ? blueprint.blueprintJson.sections as Array<Record<string, unknown>>
    : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="blueprint-title">Title</Label>
          <Input id="blueprint-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="blueprint-objective">Objective</Label>
          <Textarea id="blueprint-objective" value={objective} onChange={(e) => setObjective(e.target.value)} rows={3} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="blueprint-audience">Audience</Label>
          <Textarea id="blueprint-audience" value={audience} onChange={(e) => setAudience(e.target.value)} rows={3} />
        </div>
      </div>
      <div className="space-y-2">
        {outline.map((section, index) => (
          <div key={`${section.section_key ?? index}`} className="rounded-lg border bg-white p-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">{index + 1}</Badge>
              <p className="text-sm font-medium">{String(section.title ?? "Untitled section")}</p>
            </div>
            {typeof section.purpose === "string" && (
              <p className="mt-1 text-xs text-muted-foreground">{section.purpose}</p>
            )}
          </div>
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onSave({ title, objective, audience })}
        disabled={saving || !title.trim()}
        className="gap-2"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
        Save blueprint
      </Button>
    </div>
  );
}

function SectionsPanel({
  sections,
  busyAction,
  onSaveSection,
  onRegenerateSection,
}: {
  sections: ReportSection[];
  busyAction?: BusyAction;
  onSaveSection: (section: ReportSection, content: string) => void;
  onRegenerateSection: (section: ReportSection) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setDrafts(Object.fromEntries(sections.map((section) => [
      section.id,
      section.editedContent ?? section.generatedContent ?? "",
    ])));
  }, [sections]);

  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground">No sections generated.</p>;
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => {
        const busy = busyAction === `section:${section.id}`;
        const content = drafts[section.id] ?? "";
        return (
          <div key={section.id} className="rounded-lg border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">{section.orderIndex + 1}</Badge>
                  <h3 className="text-sm font-semibold">{section.title}</h3>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {section.status}{section.editedContent ? " - edited" : " - AI draft"}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => onRegenerateSection(section)} disabled={busy} className="gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Regenerate
              </Button>
            </div>
            <Textarea
              className="mt-3 min-h-40"
              value={content}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [section.id]: e.target.value }))}
            />
            <div className="mt-3 flex justify-end">
              <Button size="sm" onClick={() => onSaveSection(section, content)} disabled={busy} className="gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                Save section
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GeneratedReportViewer({
  previewHtml,
  loading,
  sections,
  saving,
  onSaveEdits,
}: {
  previewHtml?: string;
  loading: boolean;
  sections: ReportSection[];
  saving?: boolean;
  onSaveEdits: (edits: Array<{ section: ReportSection; content: string }>) => Promise<void>;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [fontSize, setFontSize] = useState("11");

  const makeEditable = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.querySelectorAll<HTMLElement>(".section-body").forEach((body) => {
      body.contentEditable = "true";
      body.spellcheck = true;
      body.style.outline = "none";
      body.style.minHeight = "24px";
    });
    const style = doc.createElement("style");
    style.textContent = `
      .section-body[contenteditable="true"]:focus {
        box-shadow: inset 3px 0 0 #4f46e5;
        background: #fbfdff;
      }
      .section-body[contenteditable="true"] {
        padding: 4px 6px;
        margin: 0 -6px;
        border-radius: 4px;
      }
    `;
    doc.head.appendChild(style);
  }, []);

  useEffect(() => {
    if (!previewHtml) return;
    const frame = iframeRef.current;
    if (frame?.contentDocument?.readyState === "complete") makeEditable();
  }, [makeEditable, previewHtml]);

  function runEditorCommand(command: string, value?: string) {
    const doc = iframeRef.current?.contentDocument;
    const win = iframeRef.current?.contentWindow;
    if (!doc || !win) return;
    win.focus();
    doc.execCommand(command, false, value);
  }

  function applyFontSize(size: string) {
    setFontSize(size);
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    runEditorCommand("fontSize", "7");
    doc.querySelectorAll<HTMLFontElement>('font[size="7"]').forEach((font) => {
      const span = doc.createElement("span");
      span.style.fontSize = `${size}pt`;
      span.innerHTML = font.innerHTML;
      font.replaceWith(span);
    });
  }

  function serializeSectionBody(body: HTMLElement): string {
    const clone = body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll<HTMLElement>(".report-fig").forEach((figure) => {
      const number = figure.getAttribute("data-figure-number");
      const token = document.createElement("p");
      token.textContent = number ? `{{FIGURE:${number}}}` : "";
      figure.replaceWith(token);
    });
    clone.querySelectorAll<HTMLElement>("[contenteditable], [data-section-id]").forEach((element) => {
      element.removeAttribute("contenteditable");
      element.removeAttribute("data-section-id");
    });
    return clone.innerHTML.trim();
  }

  async function savePreviewEdits() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const edits = sections.flatMap((section) => {
      const body = doc.querySelector<HTMLElement>(`.section-body[data-section-id="${cssString(section.id)}"]`);
      if (!body) return [];
      const content = serializeSectionBody(body);
      const current = (section.editedContent ?? section.generatedContent ?? "").trim();
      return content && content !== current ? [{ section, content }] : [];
    });
    if (edits.length === 0) {
      toast.success("No preview edits to save");
      return;
    }
    await onSaveEdits(edits);
  }

  if (loading && !previewHtml) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!previewHtml) {
    return <p className="text-sm text-muted-foreground">Generate sections to see a live preview of the report.</p>;
  }

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 border-b bg-slate-50 px-3 py-2">
        {loading && (
          <div className="mr-2 inline-flex items-center gap-2 rounded-md bg-white px-2 py-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Refreshing preview
          </div>
        )}
        <Button type="button" size="icon-sm" variant="ghost" onClick={() => runEditorCommand("bold")} aria-label="Bold">
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" onClick={() => runEditorCommand("italic")} aria-label="Italic">
          <Italic className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" onClick={() => runEditorCommand("underline")} aria-label="Underline">
          <Underline className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <Button type="button" size="icon-sm" variant="ghost" onClick={() => runEditorCommand("insertUnorderedList")} aria-label="Bulleted list">
          <List className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon-sm" variant="ghost" onClick={() => runEditorCommand("insertOrderedList")} aria-label="Numbered list">
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="mx-1 h-6" />
        <select
          className="h-8 rounded-md border bg-white px-2 text-xs"
          value={fontSize}
          onChange={(event) => applyFontSize(event.target.value)}
          aria-label="Font size"
        >
          {["9", "10", "11", "12", "14", "16", "18"].map((size) => (
            <option key={size} value={size}>{size} pt</option>
          ))}
        </select>
        <div className="ml-auto">
          <Button type="button" size="sm" onClick={savePreviewEdits} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save edits
          </Button>
        </div>
      </div>
      <div className="flex gap-0" style={{ height: "calc(100vh - 294px)", minHeight: "680px" }}>
        <aside className="w-56 border-r bg-slate-50 p-3 overflow-y-auto flex-shrink-0">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Navigate</h4>
          <nav className="space-y-0.5">
            {(sections ?? []).map((section, index) => (
              <button
                key={section.id}
                type="button"
                className="w-full text-left text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 px-2 py-1 rounded truncate block"
                onClick={() => {
                  const doc = iframeRef.current?.contentDocument;
                  if (!doc) return;
                  const el = doc.getElementById(`section-${index}`);
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {section.title || `Section ${index + 1}`}
              </button>
            ))}
          </nav>
        </aside>
        <iframe
          ref={iframeRef}
          className="h-full flex-1 w-full border-0"
          title="Report preview"
          srcDoc={previewHtml}
          onLoad={makeEditable}
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}

function ExportPanel({
  exports,
  busyAction,
  onExport,
}: {
  exports: ReportExport[];
  busyAction?: BusyAction;
  onExport: (format: ReportExportFormat) => void;
}) {
  const formats: ReportExportFormat[] = ["docx", "pdf", "excel", "html"];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {formats.map((format) => (
          <Button key={format} variant="outline" size="sm" onClick={() => onExport(format)} disabled={busyAction === `export:${format}`} className="gap-2 uppercase">
            {busyAction === `export:${format}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {format}
          </Button>
        ))}
      </div>
      <div className="space-y-2">
        {exports.map((record) => (
          <div key={record.id} className="flex items-center justify-between rounded-lg border bg-white p-3">
            <div>
              <p className="text-sm font-medium uppercase">{record.format}</p>
              <p className="text-xs text-muted-foreground">{record.status} - {formatDate(record.exportedAt ?? record.createdAt)}</p>
            </div>
            {record.fileUrl && (
              <Link href={record.fileUrl}>
                <Button size="sm" variant="ghost" className="gap-2">
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReportWorkspace() {
  const searchParams = useSearchParams();
  const canvases = useCanvasStore((state) => state.canvases);
  const canvasHydrated = useCanvasStore((state) => state.hydrated);
  const [projects, setProjects] = useState<ReportProject[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [blueprints, setBlueprints] = useState<ReportBlueprint[]>([]);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [exports, setExports] = useState<ReportExport[]>([]);
  const [logs, setLogs] = useState<ReportGenerationLog[]>([]);
  const [jobs, setJobs] = useState<ReportJob[]>([]);
  const [compiledPayload, setCompiledPayload] = useState<CompilePayload>();
  const [previewHtml, setPreviewHtml] = useState<string>();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<BusyAction>();
  const [createOpen, setCreateOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [audience, setAudience] = useState("Leadership and operational stakeholders");
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ReportTemplate | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string>();

  const initialSource = useMemo<{ type: ReportSourceType; id: string } | undefined>(() => {
    const sourceType = searchParams.get("sourceType");
    const sourceId = searchParams.get("sourceId");
    if ((sourceType === "dashboard" || sourceType === "canvas") && sourceId) {
      return { type: sourceType, id: sourceId };
    }
    return undefined;
  }, [searchParams]);

  const sourceOptions = useMemo<SourceOption[]>(() => {
    const canvasOptions = canvases.map((canvas) => ({
      id: canvas.id,
      type: "canvas" as const,
      title: canvas.name,
      meta: `${canvas.blocks.length} block${canvas.blocks.length === 1 ? "" : "s"}`,
    }));
    const dashboardOptions = canvases
      .filter((canvas) => canvas.published)
      .map((canvas) => ({
        id: canvas.id,
        type: "dashboard" as const,
        title: canvas.publishedTitle ?? canvas.name,
        meta: "Published dashboard",
      }));
    return [...dashboardOptions, ...canvasOptions];
  }, [canvases]);

  const selectedProject = projects.find((project) => project.id === selectedId);
  const latestBlueprint = blueprints[0];
  const fallbackPreviewHtml = useMemo(() => {
    if (previewHtml || !selectedProject) return undefined;
    const previewSections = sections
      .map((section) => ({
        id: section.id,
        title: section.title,
        content_markdown: section.editedContent ?? section.generatedContent ?? "",
      }))
      .filter((section) => section.content_markdown.trim().length > 0);
    if (previewSections.length === 0) return undefined;
    return renderPreviewHtml({
      title: latestBlueprint?.title ?? selectedProject.name,
      sections: previewSections,
    });
  }, [latestBlueprint?.title, previewHtml, sections, selectedProject]);

  const loadProjectDetails = useCallback(async (projectId: string) => {
    const [blueprintData, sectionData, exportData, auditData] = await Promise.all([
      readJson<ReportBlueprint[]>(await fetch(`/api/reports/projects/${projectId}/blueprints`)),
      readJson<ReportSection[]>(await fetch(`/api/reports/projects/${projectId}/sections`)),
      readJson<ReportExport[]>(await fetch(`/api/reports/projects/${projectId}/exports`)),
      readJson<AuditResponse>(await fetch(`/api/reports/projects/${projectId}/audit-trail`)),
    ]);
    setBlueprints(blueprintData);
    setSections(sectionData);
    setExports(exportData);
    setLogs((auditData.audit_trail?.generation_logs ?? []).map((log) => ({
      id: log.id,
      reportProjectId: log.report_project_id ?? undefined,
      userId: log.user_id,
      actionType: log.action_type,
      inputPayload: log.input_payload ?? {},
      outputSummary: log.output_summary ?? {},
      aiModel: log.ai_model ?? undefined,
      status: log.status,
      errorMessage: log.error_message ?? undefined,
      createdAt: log.created_at,
    })));
  }, []);

  const fetchJobs = useCallback(async (projectId: string) => {
    try {
      const data = await readJson<ReportJob[]>(await fetch(`/api/reports/projects/${projectId}/jobs`));
      setJobs(data);
      const hasActive = data.some((job) => job.status === "queued" || job.status === "running");
      if (!hasActive && busyAction === "jobPoll") {
        setBusyAction(undefined);
        await loadProjectDetails(projectId);
      }
      return data;
    } catch {
      return [] as ReportJob[];
    }
  }, [loadProjectDetails, busyAction]);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await readJson<ReportProject[]>(await fetch("/api/reports/projects"));
      setProjects(data);
      fetchTemplates().catch(() => {});
      const preferred = data.find((project) => {
        if (!initialSource) return false;
        return project.sourceType === initialSource.type
          && (project.sourceDashboardId === initialSource.id || project.sourceCanvasId === initialSource.id);
      }) ?? data[0];
      setSelectedId(preferred?.id);
      if (preferred) await loadProjectDetails(preferred.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load reports");
    } finally {
      setLoading(false);
    }
  }, [initialSource, loadProjectDetails]);

  async function fetchTemplates() {
    try {
      const data = await readJson<ReportTemplate[]>(await fetch("/api/reports/templates"));
      setTemplates(data);
    } catch {
      // Templates are optional
    }
  }

  async function deleteTemplate(tpl: ReportTemplate) {
    setDeletingTemplateId(tpl.id);
    try {
      await readJson(await fetch(`/api/reports/templates/${tpl.id}`, { method: "DELETE" }));
      setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
      toast.success("Template deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete template");
    } finally {
      setDeletingTemplateId(undefined);
    }
  }

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (initialSource && canvasHydrated && projects.length === 0) {
      setCreateOpen(true);
    }
  }, [canvasHydrated, initialSource, projects.length]);

  // Auto-refresh preview when sections or blueprint change
  useEffect(() => {
    if (!selectedId || !latestBlueprint) return;
    if (sections.length === 0 || sections.every((s) => !s.generatedContent && !s.editedContent)) return;
    autoFetchPreview(selectedId, latestBlueprint.id);
  }, [sections, latestBlueprint, selectedId]);

  useEffect(() => {
    if (busyAction !== "jobPoll" || !selectedId) return;
    const interval = setInterval(() => {
      fetchJobs(selectedId!);
    }, 2000);
    return () => clearInterval(interval);
  }, [busyAction, selectedId, fetchJobs]);

  async function refreshSelected(projectId = selectedId) {
    if (!projectId) return;
    const [project] = await Promise.all([
      readJson<ReportProject>(await fetch(`/api/reports/projects/${projectId}`)),
      loadProjectDetails(projectId),
    ]);
    setProjects((prev) => prev.map((item) => item.id === project.id ? project : item));
    fetchJobs(projectId).catch(() => {});
  }

  async function startJobPoll(projectId?: string) {
    if (!projectId) return;
    await fetchJobs(projectId);
    setBusyAction("jobPoll");
  }

  async function runProjectAction<T>(action: BusyAction, fn: () => Promise<T>, success: string) {
    setBusyAction(action);
    try {
      await fn();
      toast.success(success);
      await refreshSelected();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Report action failed");
    } finally {
      setBusyAction(undefined);
    }
  }

  async function postProjectAction(path: string, body?: Record<string, unknown>) {
    if (!selectedId) return;
    await readJson(await fetch(`/api/reports/projects/${selectedId}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }));
  }

  async function saveBlueprint(patch: Partial<ReportBlueprint>) {
    if (!latestBlueprint) return;
    await runProjectAction("blueprint", async () => {
      await readJson(await fetch(`/api/reports/blueprints/${latestBlueprint.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }));
    }, "Blueprint saved");
  }

  async function saveSection(section: ReportSection, content: string) {
    await runProjectAction(`section:${section.id}`, async () => {
      await readJson(await fetch(`/api/reports/sections/${section.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editedContent: content, status: "edited" }),
      }));
    }, "Section saved");
  }

  async function savePreviewEdits(edits: Array<{ section: ReportSection; content: string }>) {
    await runProjectAction("previewSave", async () => {
      await Promise.all(edits.map(async ({ section, content }) =>
        readJson(await fetch(`/api/reports/sections/${section.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ editedContent: content, status: "edited" }),
        }))
      ));
    }, edits.length === 1 ? "Preview edit saved" : "Preview edits saved");
  }

  async function regenerateSection(section: ReportSection) {
    await runProjectAction(`section:${section.id}`, async () => {
      await readJson(await fetch(`/api/reports/sections/${section.id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions }),
      }));
    }, "Section regenerated");
  }

  async function autoFetchPreview(projectId: string, blueprintId: string) {
    setPreviewLoading(true);
    try {
      const data = await readJson<{ html?: string; payload?: CompilePayload }>(
        await fetch(`/api/reports/projects/${projectId}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blueprintId }),
        })
      );
      if (data.html) setPreviewHtml(data.html);
      if (data.payload) setCompiledPayload(data.payload);
    } catch {
      // Preview is optional; silence errors during background fetch
    } finally {
      setPreviewLoading(false);
    }
  }

  async function compileReport() {
    if (!selectedId) return;
    setBusyAction("compile");
    try {
      const allowPreview = latestBlueprint?.status !== "approved" && latestBlueprint?.status !== "locked";
      const data = await readJson<{ payload?: CompilePayload }>(await fetch(`/api/reports/projects/${selectedId}/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blueprintId: latestBlueprint?.id,
          allowPreview,
        }),
      }));
      setCompiledPayload(data.payload);
      toast.success("Report compiled");
      await refreshSelected();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not compile report");
    } finally {
      setBusyAction(undefined);
    }
  }

  async function exportReport(format: ReportExportFormat) {
    await runProjectAction(`export:${format}`, async () => {
      if (!selectedId) return;
      const data = await readJson<{ artifact?: { downloadUrl?: string } }>(await fetch(`/api/reports/projects/${selectedId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      }));
      if (data.artifact?.downloadUrl) window.open(data.artifact.downloadUrl, "_blank", "noopener,noreferrer");
    }, `${format.toUpperCase()} export ready`);
  }

  const hasSnapshot = logs.some((log) => log.actionType === "capture_source_snapshot" && log.status === "success");
  const hasGeneratedSections = sections.some((section) => section.generatedContent || section.editedContent);
  const activeJob = jobs.find((job) => job.status === "queued" || job.status === "running");
  const isPolling = busyAction === "jobPoll";

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-brand" />
              <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Generate, edit, preview, and export reports from analytics sources.</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="gap-2" data-tour-id="new-report-btn">
            <Sparkles className="h-4 w-4" />
            New report
          </Button>
        </div>

        <ReportProjectCreateModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          sources={sourceOptions}
          templates={templates}
          initialSource={initialSource}
          onCreated={(project) => {
            setProjects((prev) => [project, ...prev]);
            setSelectedId(project.id);
            loadProjectDetails(project.id).catch(() => {});
          }}
        />

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Projects</h2>
              <Button size="icon-sm" variant="ghost" onClick={loadProjects} aria-label="Refresh reports">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
            <ProjectList
              projects={projects}
              selectedId={selectedId}
              sourceOptions={sourceOptions}
              onSelect={(project) => {
                setSelectedId(project.id);
                setCompiledPayload(undefined);
                loadProjectDetails(project.id).catch((err) => toast.error(err instanceof Error ? err.message : "Could not load project"));
              }}
            />
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Templates</h2>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => { setEditingTemplate(null); setTemplateEditorOpen(true); }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <ReportTemplateList
                templates={templates}
                onSelect={(tpl) => { setEditingTemplate(tpl); setTemplateEditorOpen(true); }}
                onDelete={deleteTemplate}
                deletingId={deletingTemplateId}
              />
            </div>
          </aside>

          <section className="min-w-0 space-y-5">
            {!selectedProject ? (
              <div className="rounded-lg border border-dashed bg-white/50 p-10 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Select or create a report project.</p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border bg-white p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-bold">{selectedProject.name}</h2>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {selectedProject.sourceType === "dashboard" ? <BarChart2 className="h-3.5 w-3.5" /> : <LayoutDashboard className="h-3.5 w-3.5" />}
                          {getSourceLabel(selectedProject, sourceOptions)}
                        </span>
                        <span>{REPORT_TYPE_LABELS[selectedProject.reportType]}</span>
                        <span className={cn("font-medium", getProgressTextClass(selectedProject.status))}>
                          {getProgressLabel(selectedProject.status)}
                        </span>
                        <span>Updated {formatDate(selectedProject.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {activeJob && (
                  <div className="rounded-lg border bg-white p-4">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-brand" />
                      <p className="text-sm font-semibold">{activeJob.currentStep || activeJob.jobType.replaceAll("_", " ")}</p>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-brand transition-all duration-500"
                          style={{ width: `${activeJob.progressPercent}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{activeJob.progressPercent}%</span>
                    </div>
                    {activeJob.completedSteps > 0 && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {activeJob.completedSteps} of {activeJob.totalSteps} steps
                      </p>
                    )}
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <WorkflowStep title="Capture source" detail={hasSnapshot ? "Source snapshot saved" : "Save source state"} done={hasSnapshot} active={!hasSnapshot}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runProjectAction("capture", () => postProjectAction("capture-source"), "Source captured")}
                      disabled={busyAction === "capture" || busyAction === "jobPoll"}
                      className="gap-2"
                    >
                      {busyAction === "capture" || busyAction === "jobPoll" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Capture
                    </Button>
                  </WorkflowStep>
                  <WorkflowStep title="Blueprint" detail={latestBlueprint ? `Version ${latestBlueprint.version} ready` : "Generate outline"} done={!!latestBlueprint} active={hasSnapshot && !latestBlueprint}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runProjectAction("blueprint", () => postProjectAction("generate-blueprint", { instructions, audience, reportType: selectedProject.reportType }), "Blueprint generated")}
                      disabled={busyAction === "blueprint" || busyAction === "jobPoll"}
                      className="gap-2"
                    >
                      {busyAction === "blueprint" || busyAction === "jobPoll" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Generate
                    </Button>
                  </WorkflowStep>
                  <WorkflowStep title="Sections" detail={hasGeneratedSections ? `${sections.length} sections ready` : "Generate section content"} done={hasGeneratedSections} active={!!latestBlueprint && !hasGeneratedSections}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runProjectAction("sections", () => postProjectAction("generate-sections", { instructions, allowPreview: true }), "Sections generated")}
                      disabled={busyAction === "sections" || busyAction === "jobPoll"}
                      className="gap-2"
                    >
                      {busyAction === "sections" || busyAction === "jobPoll" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Generate
                    </Button>
                  </WorkflowStep>
                  <WorkflowStep title="Compile" detail={compiledPayload ? "Preview ready" : "Build document payload"} done={!!compiledPayload} active={hasGeneratedSections && !compiledPayload}>
                    <Button size="sm" variant="outline" onClick={compileReport} disabled={busyAction === "compile" || busyAction === "jobPoll"} className="gap-2">
                      {busyAction === "compile" || busyAction === "jobPoll" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                      Compile
                    </Button>
                  </WorkflowStep>
                </div>

                <div className="rounded-lg border bg-white p-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="space-y-1.5">
                      <Label htmlFor="report-instructions">Instructions</Label>
                      <Textarea id="report-instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="report-audience">Audience</Label>
                      <Textarea id="report-audience" value={audience} onChange={(e) => setAudience(e.target.value)} rows={3} />
                    </div>
                  </div>
                </div>

                <Tabs defaultValue="blueprint" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="blueprint">Blueprint</TabsTrigger>
                    <TabsTrigger value="sections">Sections</TabsTrigger>
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                    <TabsTrigger value="export">Export</TabsTrigger>
                  </TabsList>

                  <TabsContent value="blueprint" className="space-y-4">
                    <h2 className="text-sm font-semibold">Blueprint</h2>
                    <BlueprintPanel blueprint={latestBlueprint} onSave={saveBlueprint} saving={busyAction === "blueprint"} />
                  </TabsContent>

                  <TabsContent value="sections">
                    <SectionsPanel
                      sections={sections}
                      busyAction={busyAction}
                      onSaveSection={saveSection}
                      onRegenerateSection={regenerateSection}
                    />
                  </TabsContent>

                  <TabsContent value="preview">
                    <GeneratedReportViewer
                      previewHtml={previewHtml ?? fallbackPreviewHtml}
                      loading={previewLoading}
                      sections={sections}
                      saving={busyAction === "previewSave"}
                      onSaveEdits={savePreviewEdits}
                    />
                  </TabsContent>

                  <TabsContent value="export">
                    <ExportPanel exports={exports} busyAction={busyAction} onExport={exportReport} />
                  </TabsContent>

                </Tabs>

                <Separator />
              </>
            )}
          </section>
        </div>

        <ReportTemplateEditor
          open={templateEditorOpen}
          onOpenChange={setTemplateEditorOpen}
          template={editingTemplate}
          onSaved={() => fetchTemplates()}
        />
      </div>
    </div>
  );
}
