"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCanvasStore } from "@/store/canvasStore";
import { collaboratorColor, type Collaborator } from "@/lib/realtime/collaboration";
import { createCanvasRealtimeChannel } from "@/lib/realtime/canvasChannel";
import type { CanvasBlock, GridLayoutItem } from "@/types";

interface PresencePayload {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

interface EphemeralPayload {
  userId: string;
  cursor?: { x: number; y: number } | null;
  editingBlockId?: string | null;
}

export function useCanvasRealtime({
  canvasId,
  userId,
  displayName,
  avatarUrl = null,
}: {
  canvasId: string | null;
  userId: string | null;
  displayName: string;
  avatarUrl?: string | null;
}) {
  const applyRemoteChange = useCanvasStore((state) => state.applyRemoteChange);
  const deleteCanvas = useCanvasStore((state) => state.deleteCanvas);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const presenceRef = useRef<PresencePayload | null>(null);
  const ephemeralRef = useRef<Record<string, Pick<Collaborator, "cursor" | "editingBlockId">>>({});

  const canConnect = Boolean(canvasId && userId);

  useEffect(() => {
    if (!canConnect || !canvasId || !userId) return;
    const supabase = createClient();
    const { channel } = createCanvasRealtimeChannel(supabase, canvasId, userId);
    channelRef.current = channel;

    function syncPresence() {
      const state = channel.presenceState<PresencePayload>();
      const next = Object.values(state)
        .flat()
        .filter((item) => item.userId !== userId)
        .map((item) => ({
          userId: item.userId,
          displayName: item.displayName,
          avatarUrl: item.avatarUrl,
          color: collaboratorColor(item.userId),
          cursor: ephemeralRef.current[item.userId]?.cursor ?? null,
          editingBlockId: ephemeralRef.current[item.userId]?.editingBlockId ?? null,
        }));
      setCollaborators(next);
    }

    function applyEphemeral(payload: EphemeralPayload) {
      if (!payload.userId || payload.userId === userId) return;
      ephemeralRef.current[payload.userId] = {
        cursor: payload.cursor !== undefined
          ? payload.cursor
          : (ephemeralRef.current[payload.userId]?.cursor ?? null),
        editingBlockId: payload.editingBlockId !== undefined
          ? payload.editingBlockId
          : (ephemeralRef.current[payload.userId]?.editingBlockId ?? null),
      };
      syncPresence();
    }

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .on("broadcast", { event: "cursor" }, ({ payload }) => {
        applyEphemeral(payload as EphemeralPayload);
      })
      .on("broadcast", { event: "editing_block" }, ({ payload }) => {
        applyEphemeral(payload as EphemeralPayload);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "canvases",
        filter: `id=eq.${canvasId}`,
      }, (payload) => {
        const row = payload.new as {
          id: string;
          name: string;
          blocks: CanvasBlock[];
          layout?: GridLayoutItem[] | null;
          updated_at?: string;
        };
        applyRemoteChange({
          id: row.id,
          name: row.name,
          blocks: row.blocks ?? [],
          layout: row.layout ?? undefined,
          updatedAt: row.updated_at ?? new Date().toISOString(),
        });
      })
      .on("postgres_changes", {
        event: "DELETE",
        schema: "public",
        table: "canvases",
        filter: `id=eq.${canvasId}`,
      }, () => {
        deleteCanvas(canvasId);
      })
      .subscribe(async (status) => {
        const connected = status === "SUBSCRIBED";
        setIsConnected(connected);
        if (connected) {
          presenceRef.current = {
            userId,
            displayName,
            avatarUrl,
          };
          await channel.track(presenceRef.current);
        }
      });

    return () => {
      channelRef.current = null;
      setIsConnected(false);
      setCollaborators([]);
      void supabase.removeChannel(channel);
    };
  }, [applyRemoteChange, avatarUrl, canConnect, canvasId, deleteCanvas, displayName, userId]);

  const broadcast = useCallback((event: string, payload: unknown) => {
    const channel = channelRef.current;
    if (!channel) return;
    void channel.send({ type: "broadcast", event, payload });
  }, []);

  const broadcastCursor = useCallback((x: number, y: number) => {
    if (!userId) return;
    broadcast("cursor", { userId, cursor: { x, y } });
  }, [broadcast, userId]);

  const broadcastEditingBlock = useCallback((blockId: string | null) => {
    if (!userId) return;
    broadcast("editing_block", { userId, editingBlockId: blockId });
  }, [broadcast, userId]);

  return useMemo(() => ({
    collaborators,
    isConnected,
    broadcastCursor,
    broadcastEditingBlock,
  }), [broadcastCursor, broadcastEditingBlock, collaborators, isConnected]);
}

export type { Collaborator };
