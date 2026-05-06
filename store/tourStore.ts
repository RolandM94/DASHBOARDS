import { create } from "zustand";

interface TourState {
  hasSeenTour: boolean;
  isActive: boolean;
  startTour: () => void;
  markComplete: () => void;
  dismissTour: () => void;
}

const STORAGE_KEY = "supercoolstuff_tour_seen";

function loadSeen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {}
}

export const useTourStore = create<TourState>((set) => ({
  hasSeenTour: loadSeen(),
  isActive: false,

  startTour: () => set({ isActive: true }),

  markComplete: () => {
    saveSeen();
    set({ hasSeenTour: true, isActive: false });
  },

  dismissTour: () => {
    // Don't mark as seen — user can reopen the tour from the sidebar
    set({ isActive: false });
  },
}));
