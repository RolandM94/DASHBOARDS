import { create } from "zustand";
import { PublishedDashboard } from "@/types";

interface DashboardState {
  dashboards: PublishedDashboard[];

  setDashboards: (dashboards: PublishedDashboard[]) => void;
  publishDashboard: (d: PublishedDashboard) => void;
  unpublishDashboard: (id: string) => void;
  getDashboardById: (id: string) => PublishedDashboard | undefined;
}

export const useDashboardStore = create<DashboardState>()((set, get) => ({
  dashboards: [],

  setDashboards: (dashboards) => set({ dashboards }),

  publishDashboard: (d) =>
    set((s) => ({
      dashboards: [...s.dashboards.filter((x) => x.id !== d.id), d],
    })),

  unpublishDashboard: (id) =>
    set((s) => ({ dashboards: s.dashboards.filter((d) => d.id !== id) })),

  getDashboardById: (id) => get().dashboards.find((d) => d.id === id),
}));
