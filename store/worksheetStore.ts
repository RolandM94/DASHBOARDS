import { create } from "zustand";
import { Dataset, Worksheet } from "@/types";

interface WorksheetState {
  worksheets: Worksheet[];
  datasets: Dataset[];
  hydrated: boolean;

  // Bulk hydration (called by DataLoader on app mount)
  setWorksheets: (worksheets: Worksheet[]) => void;
  setDatasets: (datasets: Dataset[]) => void;
  setHydrated: () => void;

  addDataset: (dataset: Dataset) => void;
  removeDataset: (id: string) => void;
  addWorksheet: (worksheet: Worksheet) => void;
  updateWorksheet: (id: string, patch: Partial<Worksheet>) => void;
  deleteWorksheet: (id: string) => void;
  getWorksheetById: (id: string) => Worksheet | undefined;
  getDatasetById: (id: string) => Dataset | undefined;
}

export const useWorksheetStore = create<WorksheetState>()((set, get) => ({
  worksheets: [],
  datasets: [],
  hydrated: false,

  setWorksheets: (worksheets) => set({ worksheets }),
  setDatasets: (datasets) => set({ datasets }),
  setHydrated: () => set({ hydrated: true }),

  addDataset: (dataset) =>
    set((s) => ({
      datasets: [...s.datasets.filter((d) => d.id !== dataset.id), dataset],
    })),

  removeDataset: (id) =>
    set((s) => ({ datasets: s.datasets.filter((d) => d.id !== id) })),

  addWorksheet: (worksheet) =>
    set((s) => ({ worksheets: [worksheet, ...s.worksheets] })),

  updateWorksheet: (id, patch) =>
    set((s) => ({
      worksheets: s.worksheets.map((w) =>
        w.id === id ? { ...w, ...patch, updatedAt: new Date().toISOString() } : w
      ),
    })),

  deleteWorksheet: (id) =>
    set((s) => ({ worksheets: s.worksheets.filter((w) => w.id !== id) })),

  getWorksheetById: (id) => get().worksheets.find((w) => w.id === id),
  getDatasetById: (id) => get().datasets.find((d) => d.id === id),
}));
