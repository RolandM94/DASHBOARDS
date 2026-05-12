"use client";

import type { createClient } from "@/lib/supabase/client";

type BrowserSupabaseClient = ReturnType<typeof createClient>;
type RealtimeChannel = ReturnType<BrowserSupabaseClient["channel"]>;

export interface CanvasRealtimeChannel {
  channel: RealtimeChannel;
  broadcast: (type: string, payload: unknown) => void;
}

export function createCanvasRealtimeChannel(
  supabase: BrowserSupabaseClient,
  canvasId: string,
  userId: string
): CanvasRealtimeChannel {
  const channel = supabase.channel(`canvas:${canvasId}`, {
    config: {
      presence: { key: userId },
      broadcast: { self: false },
    },
  });

  return {
    channel,
    broadcast(type, payload) {
      void channel.send({
        type: "broadcast",
        event: type,
        payload,
      });
    },
  };
}
