"use client";

import { useState, useEffect, useCallback } from "react";

export function useSavedDashboard(dashboardId: string) {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/dashboards/${dashboardId}/save`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setSaved(data.saved ?? false);
          setLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dashboardId]);

  const toggle = useCallback(async () => {
    const prev = saved;
    setSaved((s) => !s);
    try {
      const res = await fetch(`/api/dashboards/${dashboardId}/save`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setSaved(data.saved);
    } catch {
      setSaved(prev);
    }
  }, [dashboardId, saved]);

  return { saved, loading, toggle };
}
