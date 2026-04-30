"use client";

import { useState, useEffect } from "react";
import { Dataset, Worksheet } from "@/types";
import { StepUpload } from "./steps/StepUpload";
import { StepBuild } from "./steps/StepBuild";
import { useWorksheetStore } from "@/store/worksheetStore";
import { Loader2 } from "lucide-react";

interface Props {
  existingWorksheet?: Worksheet;
}

export function WorksheetBuilder({ existingWorksheet }: Props) {
  const { addDataset, addWorksheet, updateWorksheet, getDatasetById, hydrated } = useWorksheetStore();

  // "upload" until we know the dataset is present; "build" once confirmed.
  const [step, setStep] = useState<"upload" | "build">("upload");
  const [dataset, setDataset] = useState<Dataset | null>(null);

  // ready = we've resolved the correct initial state after hydration.
  // Prevents WorksheetBuilder from rendering the upload screen while
  // DataLoader is still fetching — useState initial value runs before
  // the store is populated.
  const [ready, setReady] = useState(false);

  // Tracks the DB-side worksheet ID once created, so auto-save can
  // switch from POST → PATCH after the first successful save.
  const [createdId, setCreatedId] = useState<string | null>(existingWorksheet?.id ?? null);

  useEffect(() => {
    // Wait for DataLoader to finish, then set the correct starting state.
    if (!hydrated || ready) return;

    if (existingWorksheet) {
      const ds = getDatasetById(existingWorksheet.datasetId);
      if (ds && (ds.rowCount ?? 0) > 0) {
        setDataset(ds);
        setStep("build");
      }
      // If dataset not found or has no rows, step stays "upload"
    }

    setReady(true);
  }, [hydrated, ready, existingWorksheet, getDatasetById]);

  function handleParsed(ds: Dataset) {
    // addDataset is a no-op if the dataset already exists in the store
    addDataset(ds);
    setDataset(ds);
    setStep("build");
  }

  async function handleSave(ws: Worksheet): Promise<Worksheet | null> {
    if (createdId) {
      const res = await fetch(`/api/worksheets/${createdId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetId: ws.datasetId,
          name: ws.name,
          description: ws.description,
          config: ws.config,
          status: ws.status,
        }),
      });
      if (res.ok) {
        const updated: Worksheet = await res.json();
        updateWorksheet(updated.id, updated);
        return updated;
      }
      return null;
    } else {
      const res = await fetch("/api/worksheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datasetId: ws.datasetId,
          name: ws.name,
          description: ws.description,
          config: ws.config,
          status: ws.status,
        }),
      });
      if (res.ok) {
        const created: Worksheet = await res.json();
        addWorksheet(created);
        setCreatedId(created.id);
        return created;
      }
      return null;
    }
  }

  // Show a spinner while waiting for DataLoader to hydrate the store.
  // Only applies when editing an existing worksheet — new worksheets go
  // straight to upload with no wait.
  if (!ready && existingWorksheet) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (step === "upload" || !dataset) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <StepUpload onParsed={handleParsed} />
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 min-w-0 overflow-hidden">
      <StepBuild
        dataset={dataset}
        initialWorksheet={existingWorksheet}
        onSave={handleSave}
        onBack={() => setStep("upload")}
      />
    </div>
  );
}
