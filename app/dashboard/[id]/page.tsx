"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useDashboardStore } from "@/store/dashboardStore";
import { useWorksheetStore } from "@/store/worksheetStore";
import { DashboardView } from "@/components/analytics/dashboard/DashboardView";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { BarChart2, Loader2 } from "lucide-react";
import type { PublishedDashboard, Worksheet, Dataset } from "@/types";

export default function DashboardPage() {
  const { id } = useParams<{ id: string }>();

  const storeDb = useDashboardStore((s) => s.getDashboardById(id));
  const { addDataset, addWorksheet } = useWorksheetStore();
  const setDashboards = useDashboardStore((s) => s.setDashboards);
  const allDashboards = useDashboardStore((s) => s.dashboards);

  const [dashboard, setDashboard] = useState<PublishedDashboard | null>(storeDb ?? null);
  const [loading, setLoading] = useState(!storeDb);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (storeDb) {
      setDashboard(storeDb);
      setLoading(false);
      return;
    }

    // Not in store — fetch from API (works for public dashboards too)
    async function fetchDashboard() {
      const res = await fetch(`/api/dashboards/${id}`);
      if (!res.ok) { setNotFound(true); setLoading(false); return; }

      const { dashboard: db, worksheets, datasets } = await res.json() as {
        dashboard: PublishedDashboard;
        worksheets: Worksheet[];
        datasets: Dataset[];
      };

      // Hydrate stores so charts can render
      for (const ds of datasets) addDataset(ds);
      for (const ws of worksheets) addWorksheet(ws);

      setDashboards([...allDashboards.filter((d) => d.id !== db.id), db]);
      setDashboard(db);
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

  return <DashboardView dashboard={dashboard} />;
}
