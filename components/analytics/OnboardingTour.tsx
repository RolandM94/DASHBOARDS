"use client";

import { useCallback, useEffect, useState } from "react";
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
      "This is your analytics command centre. Use the sidebar to navigate between Analytics, Workbooks, Canvases, and Reports.",
    placement: "right",
  },
  {
    target: '[data-tour-id="new-workbook-cta"]',
    title: "Start with a Workbook",
    content:
      "Create your first chart here. Upload a CSV or Excel file, then use the drag-and-drop chart builder to visualise your data.",
    placement: "bottom",
  },
  {
    target: '[data-tour-id="upload-dropzone"]',
    title: "Upload Your Data",
    content:
      "Drop a CSV or Excel file here, or pick an existing dataset from the list. The platform auto-detects field types and sample values.",
    placement: "bottom",
  },
  {
    target: '[data-tour-id="chart-preview"]',
    title: "Build Your Chart",
    content:
      "Add dimensions and metrics from the left panel, choose a chart type on the right, then watch the live preview update here. Add filters and sorting to refine your view.",
    placement: "left",
  },
  {
    target: '[data-tour-id="add-block-btn"]',
    title: "Assemble a Dashboard",
    content:
      "Combine your charts into dashboards on the Canvas. Add blocks from your workbooks, insert text annotations, apply global filters, and arrange everything on the grid.",
    placement: "bottom",
  },
  {
    target: '[data-tour-id="publish-btn"]',
    title: "Publish Your Dashboard",
    content:
      "Share your work. Publish privately, to your organisation, or publicly — each dashboard gets a shareable link.",
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

const NAV_TARGETS: Record<string, string> = {
  2: "/analytics",
  3: "/analytics/workbook/new",
  4: "/analytics/workbook",
  5: "/analytics/canvas/new",
  6: "/analytics/canvas",
  7: "/analytics/reports",
};

export default function OnboardingTour() {
  const { isActive, markComplete, dismissTour } = useTourStore();
  const [stepIndex, setStepIndex] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isActive || !isNavigating) return;
    const timer = setTimeout(() => {
      setIsNavigating(false);
      setStepIndex((prev) => prev + 1);
    }, 1200);
    return () => clearTimeout(timer);
  }, [pathname, isActive, isNavigating]);

  const handleEvent = useCallback(
    (data: TourEvent, _controls: Controls) => {
      const { type, action, index, status } = data;

      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        markComplete();
        return;
      }

      if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
        if (action === "close") {
          dismissTour();
          return;
        }

        const currentIndex = index ?? 0;
        const nextIndex = currentIndex + (action === "prev" ? -1 : 1);
        const targetRoute = NAV_TARGETS[String(currentIndex + 1)];

        if (action === "next" && targetRoute) {
          const currentBase = pathname.split("/").slice(0, 3).join("/");
          const targetBase = targetRoute.split("/").slice(0, 3).join("/");

          if (currentBase !== targetBase && targetBase !== "/analytics") {
            setIsNavigating(true);
            router.push(targetRoute);
            return;
          }
        }

        setStepIndex(nextIndex);
      }
    },
    [pathname, router, markComplete, dismissTour]
  );

  if (!isActive) return null;

  return (
    <Joyride
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
