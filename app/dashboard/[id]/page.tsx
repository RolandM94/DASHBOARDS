"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useDashboardStore } from "@/store/dashboardStore";
import { useWorksheetStore } from "@/store/worksheetStore";
import { DashboardView } from "@/components/analytics/dashboard/DashboardView";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { BarChart2, Loader2, AlertTriangle } from "lucide-react";
import type { PublishedDashboard, Worksheet, Dataset, ResolvedChartData } from "@/types";

export default function DashboardPage() {
  const { id } = useParams<{ id: string }>();

  const storeDb = useDashboardStore((s) => s.getDashboardById(id));
  const { addDataset, addWorksheet } = useWorksheetStore();
  const setDashboards = useDashboardStore((s) => s.setDashboards);
  const allDashboards = useDashboardStore((s) => s.dashboards);

  const [dashboard, setDashboard] = useState<PublishedDashboard | null>(storeDb ?? null);
  const [loading, setLoading] = useState(!storeDb);
  const [notFound, setNotFound] = useState(false);
  const [missingCount, setMissingCount] = useState(0);
  const [widgetData, setWidgetData] = useState<Record<string, ResolvedChartData | null> | undefined>(undefined);

  useEffect(() => {
    if (storeDb) {
      setDashboard(storeDb);
      setLoading(false);
      return;
    }

    // Not in store — fetch from API (works for public dashboards too)
    async function fetchDashboard() {
      const res = await fetch(`/api/dashboards/${id}/live`);
      if (!res.ok) { setNotFound(true); setLoading(false); return; }

      const { dashboard: db, worksheets, datasets, widgetData: wd } = await res.json() as {
        dashboard: PublishedDashboard;
        worksheets: Worksheet[];
        datasets: Dataset[];
        widgetData: Record<string, ResolvedChartData | null>;
      };

      // Hydrate stores so charts can render
      for (const ds of datasets) addDataset(ds);

      // Collect all worksheet IDs referenced by widget blocks
      const widgetWsIds = new Set(
        (db.blocks ?? [])
          .filter((b) => b.type === "widget")
          .map((b) => (b as { worksheetId?: string }).worksheetId)
          .filter(Boolean)
      );
      const fetchedWsIds = new Set(worksheets.map((ws) => ws.id));

      // Create stub entries for missing worksheets so widgets don't break
      let missing = 0;
      for (const wsId of widgetWsIds) {
        if (wsId && !fetchedWsIds.has(wsId)) {
          missing += 1;
          addWorksheet({
            id: wsId,
            datasetId: "",
            name: "Unavailable",
            description: "Data source no longer available",
            config: { metrics: [], dimensions: [], filters: [], chartType: "bar" },
            status: "archived",
            createdAt: "",
            updatedAt: "",
          });
        }
      }
      setMissingCount(missing);

      for (const ws of worksheets) addWorksheet(ws);

      setDashboards([...allDashboards.filter((d) => d.id !== db.id), db]);
      setDashboard(db);
      setWidgetData(wd);
      setLoading(false);
    }

    fetchDashboard();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-50">
        <div className="h-10 w-10 bg-brand/10 rounded-xl flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-brand" />
        </div>
        <p className="text-sm text-muted-foreground">Loading dashboard…</p>
      </div>
    );
  }

  if (notFound || !dashboard) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50 px-6 text-center">
        <div className="h-14 w-14 bg-muted rounded-2xl flex items-center justify-center">
          <BarChart2 className="h-7 w-7 text-muted-foreground/50" />
        </div>
        <div>
          <p className="font-semibold text-base">Dashboard not found</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            This dashboard may not exist or hasn&apos;t been published yet.
          </p>
        </div>
        <Link href="/home">
          <Button variant="outline" size="sm">Go to Home</Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      {missingCount > 0 && (
        <div className="sticky top-0 z-10 bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>
            {missingCount} widget{missingCount > 1 ? "s are" : " is"} unavailable — the{missingCount > 1 ? "ir" : ""} source worksheet{missingCount > 1 ? "s have" : " has"} been deleted.
          </span>
        </div>
      )}
      <DashboardView dashboard={dashboard} initialWidgetData={widgetData} />
    </>
  );
}
