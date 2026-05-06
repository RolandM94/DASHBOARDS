"use client";

import { useState } from "react";
import { useWorksheetStore } from "@/store/worksheetStore";
import { useCanvasStore } from "@/store/canvasStore";
import { WorksheetCard } from "./WorksheetCard";
import { CanvasCard } from "./CanvasCard";
import { DatasetShareModal } from "./DatasetShareModal";
import { AICommandBar } from "./AICommandBar";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";
import {
  BarChart2, LayoutDashboard, Plus, Database, Share2,
  Globe, Users, Lock, Leaf, Trash2, FileText,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Dataset, DatasetVisibility } from "@/types";

// ── Skeleton card shown while the store is hydrating ──────────────
function CardSkeleton() {
  return (
    <div className="rounded-xl border bg-white overflow-hidden animate-pulse"
      style={{ boxShadow: "0px 0px 1px 0px rgba(0,0,0,.15), 0px 1px 4px 0px rgba(0,0,0,.04)" }}
    >
      <div className="h-1 w-full bg-slate-200" />
      <div className="p-4 space-y-3">
        <div className="h-8 w-8 rounded-lg bg-slate-200" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-3/4 rounded bg-slate-200" />
          <div className="h-3 w-1/2 rounded bg-slate-100" />
        </div>
        <div className="h-4 w-16 rounded-full bg-slate-100" />
        <div className="h-2.5 w-20 rounded bg-slate-100" />
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────
function EmptyState({
  icon: Icon, message, href, label, variant = "default",
}: {
  icon: React.ElementType;
  message: string;
  href: string;
  label: string;
  variant?: "default" | "outline";
}) {
  return (
    <div className="border-2 border-dashed rounded-xl p-10 text-center bg-white/40">
      <Icon className="h-9 w-9 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-sm text-muted-foreground mb-4">{message}</p>
      <Link href={href}>
        <Button size="sm" variant={variant} className="gap-2">
          <Plus className="h-4 w-4" />
          {label}
        </Button>
      </Link>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────
function SectionHeader({
  icon: Icon, iconColor, title, count, href, addLabel,
}: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  count: number;
  href: string;
  addLabel: string;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4.5 w-4.5" style={{ color: iconColor }} />
        <h2 className="font-semibold text-base">{title}</h2>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full ml-0.5">
          {count}
        </span>
      </div>
      <Link href={href}>
        <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground h-7">
          <Plus className="h-3.5 w-3.5" />
          {addLabel}
        </Button>
      </Link>
    </div>
  );
}

// ── Visibility badge ──────────────────────────────────────────────

function VisibilityBadge({ visibility }: { visibility?: DatasetVisibility }) {
  if (!visibility || visibility === "private") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        <Lock className="h-2.5 w-2.5" /> Private
      </span>
    );
  }
  if (visibility === "org") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-brand-deep">
        <Users className="h-2.5 w-2.5" /> Org
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-status-info">
      <Globe className="h-2.5 w-2.5" /> Public
    </span>
  );
}

// ── Dataset card ──────────────────────────────────────────────────

function DatasetCard({
  dataset,
  onShare,
  onDelete,
  onOpen,
}: {
  dataset: Dataset;
  onShare: (dataset: Dataset) => void;
  onDelete?: (id: string) => void;
  onOpen?: (dataset: Dataset) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const isOwn  = !dataset.accessType || dataset.accessType === "own";
  const isSeed = dataset.isSeed || dataset.accessType === "seed";

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDeleting(true);
    try {
      await fetch(`/api/datasets/${dataset.id}`, { method: "DELETE" });
      onDelete?.(dataset.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={() => onOpen?.(dataset)}
      onKeyDown={(e) => {
        if (!onOpen) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(dataset);
        }
      }}
      className="rounded-xl border bg-white overflow-hidden group transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      style={{ boxShadow: "0px 0px 1px 0px rgba(0,0,0,.15), 0px 1px 4px 0px rgba(0,0,0,.04)" }}
    >
      {/* Top accent stripe */}
      <div className="h-1 w-full bg-gradient-to-r from-sky-300 to-blue-400" />

      <div className="p-4 space-y-3">
        {/* Icon + delete */}
        <div className="flex items-start justify-between">
          <div className="h-8 w-8 rounded-lg bg-sky-50 flex items-center justify-center">
            {isSeed
              ? <Leaf className="h-4 w-4 text-brand" />
              : <Database className="h-4 w-4 text-sky-500" />
            }
          </div>
          {isOwn && !isSeed && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="h-6 w-6 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all disabled:opacity-40"
              title="Delete dataset"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Name */}
        <div>
          <p className="text-sm font-semibold leading-tight line-clamp-2">{dataset.fileName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {dataset.rowCount?.toLocaleString() ?? "?"} rows
          </p>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {isSeed && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-1">
              <Leaf className="h-2.5 w-2.5" /> Sample
            </Badge>
          )}
          {dataset.accessType === "org" && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 text-brand-deep gap-1">
              <Users className="h-2.5 w-2.5" /> Org
            </Badge>
          )}
          {dataset.accessType === "share" && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-1">
              <Share2 className="h-2.5 w-2.5" /> Shared
            </Badge>
          )}
          {isOwn && !isSeed && <VisibilityBadge visibility={dataset.visibility} />}
        </div>

        {/* Share button (own datasets only) */}
        {isOwn && !isSeed && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px] text-muted-foreground gap-1 -ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onShare(dataset);
            }}
          >
            <Share2 className="h-3 w-3" />
            Share
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Show-more toggle ──────────────────────────────────────────────

const PREVIEW = 4; // cards shown before "Show more"

function ShowMore({
  total,
  expanded,
  onToggle,
}: {
  total: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (total <= PREVIEW) return null;
  const hidden = total - PREVIEW;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-3 text-xs font-medium text-brand hover:text-brand-dark transition-colors flex items-center gap-1"
    >
      {expanded ? `↑ Show less` : `↓ Show ${hidden} more`}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────
export function AnalyticsHome() {
  const router         = useRouter();
  const worksheets     = useWorksheetStore((s) => s.worksheets);
  const wsHydrated     = useWorksheetStore((s) => s.hydrated);
  const canvases       = useCanvasStore((s) => s.canvases);
  const cvHydrated     = useCanvasStore((s) => s.hydrated);
  const datasets       = useWorksheetStore((s) => s.datasets);
  const removeDataset  = useWorksheetStore((s) => s.removeDataset);

  const [shareTarget,   setShareTarget]   = useState<Dataset | null>(null);
  const [hasOrg,        setHasOrg]        = useState(false);

  // Per-section expand state
  const [wsExpanded,    setWsExpanded]    = useState(false);
  const [cvExpanded,    setCvExpanded]    = useState(false);
  const [dsExpanded,    setDsExpanded]    = useState(false);
  const [seedExpanded,  setSeedExpanded]  = useState(false);
  const [sharedExpanded, setSharedExpanded] = useState(false);

  async function openShare(dataset: Dataset) {
    setShareTarget(dataset);
    try {
      const res  = await fetch("/api/orgs");
      const data = await res.json();
      setHasOrg(!!data?.org);
    } catch { /* ignore */ }
  }

  const ownDatasets  = datasets.filter((d) => !d.accessType || d.accessType === "own");
  const seedDatasets = datasets.filter((d) => d.isSeed || d.accessType === "seed");
  const sharedWithMe = datasets.filter((d) => d.accessType === "org" || d.accessType === "share");

  return (
    // Scroll wrapper — fills the <main> flex column and scrolls independently
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-7xl mx-auto space-y-10">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Build workbooks, create canvases, and publish dashboards.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/analytics/workbook/new" data-tour-id="new-workbook-cta">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Workbook
              </Button>
            </Link>
            <Link href="/analytics/canvas/new">
              <Button variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                New Canvas
              </Button>
            </Link>
            <Link href="/analytics/reports">
              <Button variant="outline" className="gap-2">
                <FileText className="h-4 w-4" />
                Reports
              </Button>
            </Link>
          </div>
        </div>

        {/* AI Command Bar */}
        <AICommandBar />

        {/* Workbooks */}
        <section>
          <SectionHeader
            icon={BarChart2}
            iconColor="#10b981"
            title="Workbooks"
            count={wsHydrated ? worksheets.length : 0}
            href="/analytics/workbook/new"
            addLabel="New"
          />
          {!wsHydrated ? (
            <SkeletonGrid />
          ) : worksheets.length === 0 ? (
            <EmptyState
              icon={BarChart2}
              message="No workbooks yet — upload a dataset and build your first chart."
              href="/analytics/workbook/new"
              label="Create workbook"
            />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {(wsExpanded ? worksheets : worksheets.slice(0, PREVIEW)).map((ws) => (
                  <WorksheetCard key={ws.id} worksheet={ws} />
                ))}
              </div>
              <ShowMore total={worksheets.length} expanded={wsExpanded} onToggle={() => setWsExpanded((v) => !v)} />
            </>
          )}
        </section>

        {/* Canvases */}
        <section>
          <SectionHeader
            icon={LayoutDashboard}
            iconColor="#7C3AED"
            title="Canvases"
            count={cvHydrated ? canvases.length : 0}
            href="/analytics/canvas/new"
            addLabel="New"
          />
          {!cvHydrated ? (
            <SkeletonGrid />
          ) : canvases.length === 0 ? (
            <EmptyState
              icon={LayoutDashboard}
              message="No canvases yet — combine workbook sheets into a shareable dashboard."
              href="/analytics/canvas/new"
              label="Create canvas"
              variant="outline"
            />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {(cvExpanded ? canvases : canvases.slice(0, PREVIEW)).map((c) => (
                  <CanvasCard key={c.id} canvas={c} />
                ))}
              </div>
              <ShowMore total={canvases.length} expanded={cvExpanded} onToggle={() => setCvExpanded((v) => !v)} />
            </>
          )}
        </section>

        {/* My Datasets */}
        {wsHydrated && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Database className="h-4.5 w-4.5 text-sky-500" />
                <h2 className="font-semibold text-base">My Datasets</h2>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full ml-0.5">
                  {ownDatasets.length}
                </span>
              </div>
              <Link href="/analytics/workbook/new">
                <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground h-7">
                  <Plus className="h-3.5 w-3.5" />
                  Add Dataset
                </Button>
              </Link>
            </div>
            {ownDatasets.length === 0 ? (
              <EmptyState
                icon={Database}
                message="No datasets yet — upload a file to start building workbooks."
                href="/analytics/workbook/new"
                label="Upload dataset"
              />
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {(dsExpanded ? ownDatasets : ownDatasets.slice(0, PREVIEW)).map((d) => (
                    <DatasetCard
                      key={d.id}
                      dataset={d}
                      onShare={openShare}
                      onDelete={removeDataset}
                      onOpen={(dataset) => router.push(`/analytics/datasets/${dataset.id}`)}
                    />
                  ))}
                </div>
                <ShowMore total={ownDatasets.length} expanded={dsExpanded} onToggle={() => setDsExpanded((v) => !v)} />
              </>
            )}
          </section>
        )}

        {/* Sample Data Library */}
        {wsHydrated && seedDatasets.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Leaf className="h-4.5 w-4.5 text-brand" />
              <h2 className="font-semibold text-base">Sample Data Library</h2>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full ml-0.5">
                {seedDatasets.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-3 -mt-2">
              Pre-loaded datasets you can use to explore Supercoolstuff Dashboards.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {(seedExpanded ? seedDatasets : seedDatasets.slice(0, PREVIEW)).map((d) => (
                <DatasetCard key={d.id} dataset={d} onShare={() => {}} />
              ))}
            </div>
            <ShowMore total={seedDatasets.length} expanded={seedExpanded} onToggle={() => setSeedExpanded((v) => !v)} />
          </section>
        )}

        {/* Shared With Me */}
        {wsHydrated && sharedWithMe.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Share2 className="h-4.5 w-4.5 text-muted-foreground" />
              <h2 className="font-semibold text-base">Shared With Me</h2>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full ml-0.5">
                {sharedWithMe.length}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {(sharedExpanded ? sharedWithMe : sharedWithMe.slice(0, PREVIEW)).map((d) => (
                <DatasetCard key={d.id} dataset={d} onShare={() => {}} />
              ))}
            </div>
            <ShowMore total={sharedWithMe.length} expanded={sharedExpanded} onToggle={() => setSharedExpanded((v) => !v)} />
          </section>
        )}

        {/* Share modal */}
        {shareTarget && (
          <DatasetShareModal
            open
            onClose={() => setShareTarget(null)}
            datasetId={shareTarget.id}
            datasetName={shareTarget.fileName}
            initialVisibility={shareTarget.visibility ?? "private"}
            hasOrg={hasOrg}
          />
        )}

      </div>
    </div>
  );
}
