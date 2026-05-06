"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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
      "Use the sidebar to navigate between Analytics, Workbooks, Canvases, and Reports. Let's start by creating your first chart.",
    placement: "right",
  },
  {
    target: '[data-tour-id="new-workbook-cta"]',
    title: "Start with a Workbook",
    content:
      "Click 'New Workbook' to begin. You'll upload a CSV or Excel file, then build charts with the drag-and-drop builder.",
    placement: "bottom",
  },
  {
    target: '[data-tour-id="upload-dropzone"]',
    title: "Upload Your Data",
    content:
      "Drop a CSV or Excel file here, or pick an existing dataset. The platform auto-detects field types and data types.",
    placement: "bottom",
  },
  {
    target: '[data-tour-id="canvas-name-dialog"]',
    title: "Create Your First Canvas",
    content:
      "Give your canvas a name and click 'Create Canvas'. Canvases are where you assemble charts, text, and filters into dashboards.",
    placement: "bottom",
  },
  {
    target: '[data-tour-id="add-block-btn"]',
    title: "Add Blocks to Your Dashboard",
    content:
      "Click 'Add Block' to bring charts from your workbooks onto this canvas. You can also add text blocks and filters.",
    placement: "bottom",
  },
  {
    target: '[data-tour-id="publish-btn"]',
    title: "Publish Your Dashboard",
    content:
      "Share your dashboard privately, with your organisation, or publicly. Each dashboard gets a shareable public link.",
    placement: "bottom",
  },
  {
    target: '[data-tour-id="new-report-btn"]',
    title: "Generate AI Reports",
    content:
      "Turn any dashboard into a professional report. AI generates the blueprint, writes the narrative, and exports to Word, PDF, or Excel.",
    placement: "bottom",
  },
];

// Maps which step requires navigation to which page (before showing the step)
const STEP_PAGE: Record<number, string> = {
  0: "/analytics",
  1: "/analytics",
  2: "/analytics/workbook/new",
  3: "/analytics/canvas/new",
  4: "/analytics/canvas/new",
  5: "/analytics/canvas/new",
  6: "/analytics/reports",
};

export default function OnboardingTour() {
  const { isActive, markComplete, dismissTour } = useTourStore();
  const [stepIndex, setStepIndex] = useState(0);
  const [tourKey, setTourKey] = useState(0);
  const isNavigatingRef = useRef(false);
  const pendingStepRef = useRef<number | null>(null);
  const targetRetriesRef = useRef(0);
  const pathname = usePathname();
  const router = useRouter();

  // Reset everything when tour starts
  useEffect(() => {
    if (isActive) {
      setStepIndex(0);
      setTourKey((k) => k + 1);
      isNavigatingRef.current = false;
      pendingStepRef.current = null;
      targetRetriesRef.current = 0;
    }
  }, [isActive]);

  // After navigation completes, advance to the pending step
  useEffect(() => {
    if (!isActive || pendingStepRef.current === null) return;
    const step = pendingStepRef.current;
    const expectedPage = STEP_PAGE[step];
    if (!expectedPage) return;

    const currentBase = pathname.split("/").slice(0, 3).join("/");
    const expectedBase = expectedPage.split("/").slice(0, 3).join("/");

    if (currentBase === expectedBase) {
      const timer = setTimeout(() => {
        pendingStepRef.current = null;
        isNavigatingRef.current = false;
        setStepIndex(step);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [pathname, isActive]);

  const navigateForStep = useCallback(
    (targetStep: number) => {
      const page = STEP_PAGE[targetStep];
      if (!page) return false;

      const currentBase = pathname.split("/").slice(0, 3).join("/");
      const targetBase = page.split("/").slice(0, 3).join("/");

      if (currentBase !== targetBase) {
        isNavigatingRef.current = true;
        pendingStepRef.current = targetStep;
        router.push(page);
        return true;
      }
      return false;
    },
    [pathname, router]
  );

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
        if (isNavigatingRef.current) return;

        targetRetriesRef.current += 1;
        if (targetRetriesRef.current <= 8) {
          setTimeout(() => {
            setStepIndex((prev) => prev);
            setTourKey((k) => k + 1);
          }, 800);
          return;
        }
        targetRetriesRef.current = 0;
      }

      if (type === EVENTS.STEP_AFTER || (type === EVENTS.TARGET_NOT_FOUND && targetRetriesRef.current > 8)) {
        targetRetriesRef.current = 0;
        const currentIndex = index ?? stepIndex;
        const nextIndex = action === "prev" ? Math.max(0, currentIndex - 1) : currentIndex + 1;

        if (action === "prev") {
          setStepIndex(nextIndex);
          return;
        }

        if (navigateForStep(nextIndex)) return;
        setStepIndex(nextIndex);
      }
    },
    [stepIndex, pathname, router, markComplete, dismissTour, navigateForStep]
  );

  return (
    <Joyride
      key={tourKey}
      steps={STEPS}
      stepIndex={stepIndex}
      run={isActive && !isNavigatingRef.current}
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
          boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
          padding: "20px 24px",
        },
        tooltipTitle: {
          fontSize: 16,
          fontWeight: 700,
          marginBottom: 8,
        },
        tooltipContent: {
          fontSize: 13,
          lineHeight: 1.6,
          color: "#475569",
        },
        buttonPrimary: {
          backgroundColor: "#2563eb",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          padding: "8px 16px",
          color: "#ffffff",
        },
        buttonBack: {
          color: "#64748b",
          fontSize: 13,
          marginRight: 8,
        },
        buttonSkip: {
          color: "#94a3b8",
          fontSize: 12,
        },
      }}
    />
  );
}
