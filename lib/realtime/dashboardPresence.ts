"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface ViewerPresence {
  userId: string | null;
  isAnonymous: boolean;
  tabId: string;
}

export function useDashboardViewers(dashboardId: string) {
  const [counts, setCounts] = useState({
    totalViewers: 0,
    authenticatedViewers: 0,
    anonymousViewers: 0,
  });

  useEffect(() => {
    const supabase = createClient();
    const tabId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(`dashboard:${dashboardId}`, {
      config: { presence: { key: tabId } },
    });
    let mounted = true;

    function sync() {
      const viewers = Object.values(channel.presenceState<ViewerPresence>()).flat();
      if (!mounted) return;
      setCounts({
        totalViewers: viewers.length,
        authenticatedViewers: viewers.filter((viewer) => !viewer.isAnonymous).length,
        anonymousViewers: viewers.filter((viewer) => viewer.isAnonymous).length,
      });
    }

    channel.on("presence", { event: "sync" }, sync).subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      const { data: { user } } = await supabase.auth.getUser();
      await channel.track({
        userId: user?.id ?? null,
        isAnonymous: !user,
        tabId,
      });
    });

    return () => {
      mounted = false;
      void supabase.removeChannel(channel);
    };
  }, [dashboardId]);

  return counts;
}
