"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Joyride, type Step, EVENTS, STATUS, type Controls } from "react-joyride";
import { useTourStore } from "@/store/tourStore";

interface TourEvent {
  type: string;
  action?: string;
  index?: number;
  status?: string;
}

const STEPS: Step[] = [
  {
    target: '[data-tour-id="sidebar-nav"]',
    title: "Welcome to Supercoolstuff",
    content:
      "This is your analytics command centre. The sidebar lets you navigate between Home, Workbooks, Canvases, and Reports.",
    placement: "right",
  },
  {
    target: '[data-tour-id="ai-command-bar"]',
    title: "AI-Powered Charts",
    content:
      "Ask the AI to create charts for you. Just describe what you want — 'Show monthly revenue by region' — and it builds the chart automatically.",
    placement: "bottom",
  },
  {
    target: '[data-tour-id="new-workbook-cta"]',
    title: "Create a Workbook",
    content:
      "Click 'New Workbook' to upload your data. You'll build charts here before assembling them into dashboards.",
    placement: "bottom",
  },
  {
    target: '[data-tour-id="upload-dropzone"]',
    title: "Upload Your Data",
    content:
      "Drop a CSV or Excel file here, or choose an existing dataset. The platform auto-detects column types and sample values.",
    placement: "bottom",
  },
  {
    target: '[data-tour-id="new-canvas-cta"]',
    title: "Next: Create a Canvas",
    content:
      "Once you have workbooks, combine them into dashboards. Click 'New Canvas' to get started.",
    placement: "bottom",
  },
  {
    target: '[data-tour-id="canvas-name-dialog"]',
    title: "Name Your Canvas",
    content:
      "Give your dashboard a name — like 'Q1 Performance Review'. Canvases hold all your widgets, text, and filters in one place.",
    placement: "bottom",
  },
  {
    target: '[data-tour-id="add-block-btn"]',
    title: "Add Widgets",
    content:
      "Click 'Add Block' to bring charts from your workbooks onto this canvas. You can also add text annotations and dataset previews.",
    placement: "bottom",
  },
  {
    target: '[data-tour-id="publish-btn"]',
    title: "Publish to Share",
    content:
      "Share your dashboard with your organisation or publicly. Once published, it gets a shareable link anyone can view.",
    placement: "bottom",
  },
  {
    target: '[data-tour-id="home-reports-cta"]',
    title: "Head to Reports",
    content:
      "Now that you've built a dashboard, let's explore AI-powered reports. Click 'Reports' to continue.",
    placement: "bottom",
  },
  {
    target: '[data-tour-id="new-report-btn"]',
    title: "AI Report Generation",
    content:
      "Select any dashboard or canvas, and AI will generate a complete report — with a blueprint, narrative sections, charts, and exports to Word, PDF, or Excel.",
    placement: "bottom",
  },
];

// Maps step index to the page where that step's target lives
const STEP_PAGE: Record<number, string> = {
  0: "/analytics",
  1: "/analytics",
  2: "/analytics",
  3: "/analytics/workbook/new",
  4: "/analytics",
  5: "/analytics/canvas/new",
  6: "/analytics/canvas/new",
  7: "/analytics/canvas/new",
  8: "/analytics",
  9: "/analytics/reports",
};

const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 1500;
const NAV_DELAY_MS = 1200;

const STEP_INDEX_KEY = "supercoolstuff_tour_step";

function getStoredStepIndex(): number {
  try {
    const v = sessionStorage.getItem(STEP_INDEX_KEY);
    return v ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}

function storeStepIndex(idx: number): void {
  try { sessionStorage.setItem(STEP_INDEX_KEY, String(idx)); } catch {}
}

function clearStoredStep(): void {
  try { sessionStorage.removeItem(STEP_INDEX_KEY); } catch {}
}

export default function OnboardingTour() {
  const { isActive, markComplete, dismissTour, setActive } = useTourStore();
  const [stepIndex, setStepIndex] = useState(() => isActive ? getStoredStepIndex() : 0);
  const [tourKey, setTourKey] = useState(0);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStepRef = useRef<number | null>(null);
  const pathnameRef = useRef(typeof window !== "undefined" ? window.location.pathname : "/analytics");

  // Keep pathnameRef updated
  useEffect(() => {
    pathnameRef.current = window.location.pathname;
  });

  // Reset on tour start
  useEffect(() => {
    if (isActive) {
      setStepIndex(getStoredStepIndex());
      setTourKey((k) => k + 1);
      retryCountRef.current = 0;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    }
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
  }, [isActive]);

  // Persist step index whenever it changes
  useEffect(() => {
    storeStepIndex(stepIndex);
  }, [stepIndex]);

  // Reset retries when step changes
  useEffect(() => {
    retryCountRef.current = 0;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, [stepIndex]);

  function currentPageBase(): string {
    return pathnameRef.current.split("/").slice(0, 3).join("/");
  }

  function navigateToPage(page: string): boolean {
    const cur = currentPageBase();
    const tgt = page.split("/").slice(0, 3).join("/");
    if (cur === tgt) return false;

    // Kill any pending timers before navigating
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    if (navTimerRef.current) clearTimeout(navTimerRef.current);

    // Use location.href for a clean page load (ensures targets exist)
    window.location.href = page;
    return true;
  }

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      setTourKey((k) => k + 1);
    }, RETRY_DELAY_MS);
  }, []);

  const handleEvent = useCallback(
    (data: TourEvent, _controls: Controls) => {
      const { type, action, index, status } = data;

      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        markComplete();
        return;
      }

      if (action === "close") {
        dismissTour();
        return;
      }

      if (type === EVENTS.TARGET_NOT_FOUND) {
        retryCountRef.current += 1;

        if (retryCountRef.current <= MAX_RETRIES) {
          scheduleRetry();
          return;
        }

        // Retries exhausted — skip this step
        retryCountRef.current = 0;
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        const currentIndex = index ?? stepIndex;
        setStepIndex(currentIndex + 1);
        return;
      }

      if (type === EVENTS.STEP_AFTER) {
        retryCountRef.current = 0;
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }

        const currentIndex = index ?? stepIndex;
        const nextIndex = action === "prev" ? Math.max(0, currentIndex - 1) : currentIndex + 1;

        if (action === "prev") {
          setStepIndex(nextIndex);
          return;
        }

        // Auto-navigate to the page for the next step if needed
        const nextPage = STEP_PAGE[nextIndex];
        if (nextPage && nextPage !== currentPageBase()) {
          setStepIndex(nextIndex); // Advance before navigation so step persists
          if (navTimerRef.current) clearTimeout(navTimerRef.current);
          navTimerRef.current = setTimeout(() => {
            navigateToPage(nextPage);
          }, NAV_DELAY_MS);
          return;
        }

        setStepIndex(nextIndex);
      }
    },
    [stepIndex, markComplete, dismissTour, scheduleRetry]
  );

  return (
    <Joyride
      key={tourKey}
      steps={STEPS}
      stepIndex={stepIndex}
      run={isActive}
      continuous
      onEvent={handleEvent}
      locale={{
        back: "Back",
        close: "Close",
        last: "Finish",
        next: "Next",
        skip: "Skip tour",
      }}
      options={{
        showProgress: true,
        skipBeacon: true,
        buttons: ["back", "close", "primary", "skip"],
        overlayClickAction: "close",
      }}
      styles={{
        tooltip: {
          borderRadius: 12,
          boxShadow: "0 6px 28px rgba(0,0,0,0.22)",
          padding: "22px 26px",
        },
        tooltipTitle: {
          fontSize: 16,
          fontWeight: 700,
          marginBottom: 8,
        },
        tooltipContent: {
          fontSize: 13,
          lineHeight: 1.65,
          color: "#475569",
        },
        buttonPrimary: {
          backgroundColor: "#2563eb",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          padding: "9px 18px",
          color: "#ffffff",
        },
        buttonBack: {
          color: "#64748b",
          fontSize: 13,
          marginRight: 10,
        },
        buttonSkip: {
          color: "#94a3b8",
          fontSize: 12,
        },
      }}
    />
  );
}
