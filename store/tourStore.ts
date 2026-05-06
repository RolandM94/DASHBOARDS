import { create } from "zustand";

interface TourState {
  hasSeenTour: boolean;
  isActive: boolean;
  startTour: () => void;
  markComplete: () => void;
  dismissTour: () => void;
  setActive: (active: boolean) => void;
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
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, "true");
  } catch {}
}

// Cross-page-load tour state persistence
const SESSION_KEY = "supercoolstuff_tour_active";

export function getSessionTourActive(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(SESSION_KEY) === "true";
}

function setSessionTourActive(active: boolean): void {
  try {
    if (typeof window === "undefined") return;
    if (active) sessionStorage.setItem(SESSION_KEY, "true");
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

export const useTourStore = create<TourState>((set) => ({
  hasSeenTour: loadSeen(),
  isActive: getSessionTourActive() || false,

  startTour: () => {
    setSessionTourActive(true);
    set({ isActive: true });
  },

  markComplete: () => {
    saveSeen();
    setSessionTourActive(false);
    try { if (typeof window !== "undefined") sessionStorage.removeItem("supercoolstuff_tour_step"); } catch {}
    set({ hasSeenTour: true, isActive: false });
  },

  dismissTour: () => {
    setSessionTourActive(false);
    try { if (typeof window !== "undefined") sessionStorage.removeItem("supercoolstuff_tour_step"); } catch {}
    set({ isActive: false });
  },

  setActive: (active: boolean) => {
    setSessionTourActive(active);
    set({ isActive: active });
  },
}));
