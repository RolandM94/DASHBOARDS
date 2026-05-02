"use client";

import { useEffect } from "react";
import { useWorksheetStore } from "@/store/worksheetStore";
import { useCanvasStore } from "@/store/canvasStore";
import type { Dataset, Worksheet, Canvas } from "@/types";

/**
 * DataLoader — fetches all user data from the API on mount and hydrates the
 * Zustand stores. Renders nothing; place it high in the tree (analytics layout).
 *
 * Call order: datasets → worksheets → canvases (order doesn't strictly matter
 * since they're independent, but running them in parallel is fine too).
 */
export function DataLoader() {
  const { setDatasets, setWorksheets, setHydrated: wsHydrated } = useWorksheetStore();
  const { setCanvases, setHydrated: canvasHydrated } = useCanvasStore();

  useEffect(() => {
    async function load() {
      try {
        const [datasetsRes, worksheetsRes, canvasesRes] = await Promise.all([
          fetch("/api/datasets"),
          fetch("/api/workbooks"),
          fetch("/api/canvases"),
        ]);

        if (datasetsRes.ok) {
          const raw = await datasetsRes.json() as Array<{
            id: string; file_name: string; uploaded_at: string;
            fields: Dataset["fields"]; row_count: number;
            visibility?: Dataset["visibility"]; is_seed?: boolean;
            accessType?: Dataset["accessType"];
          }>;
          const datasets: Dataset[] = raw.map((d) => ({
            id:         d.id,
            fileName:   d.file_name,
            uploadedAt: d.uploaded_at,
            fields:     d.fields,
            rowCount:   d.row_count,
            visibility: d.visibility,
            isSeed:     d.is_seed ?? false,
            accessType: d.accessType,
          }));
          setDatasets(datasets);
        }

        if (worksheetsRes.ok) {
          const worksheets: Worksheet[] = await worksheetsRes.json();
          setWorksheets(worksheets);
        }

        if (canvasesRes.ok) {
          const canvases: Canvas[] = await canvasesRes.json();
          setCanvases(canvases);
        }
      } catch (err) {
        console.error("DataLoader: failed to fetch initial data", err);
        import("@/lib/toast").then(({ toast }) =>
          toast.error("Failed to load data. Please refresh the page.")
        );
      } finally {
        wsHydrated();
        canvasHydrated();
      }
    }

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
