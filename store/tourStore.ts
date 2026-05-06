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

function saveSeen(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {}
}

export const useTourStore = create<TourState>((set) => ({
  hasSeenTour: loadSeen(),
  isActive: false,

  startTour: () => set({ isActive: true }),

  markComplete: () => {
    saveSeen(true);
    set({ hasSeenTour: true, isActive: false });
  },

  dismissTour: () => {
    saveSeen(true);
    set({ isActive: false });
  },
}));
