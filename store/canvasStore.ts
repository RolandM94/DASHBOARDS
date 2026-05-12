import { create } from "zustand";
import { Canvas, CanvasBlock, GridLayoutItem } from "@/types";

function defaultLayoutItem(block: CanvasBlock, existing: GridLayoutItem[]): GridLayoutItem {
  const maxY = existing.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  if (block.type === "widget")  return { i: block.id, x: 0, y: maxY, w: 6,  h: 14, minW: 3, minH: 8 };
  if (block.type === "text")    return { i: block.id, x: 0, y: maxY, w: 12, h: 4,  minW: 3, minH: 2 };
  if (block.type === "preview") return { i: block.id, x: 0, y: maxY, w: 12, h: 10, minW: 4, minH: 4 };
  return                               { i: block.id, x: 0, y: maxY, w: 6,  h: 3,  minW: 2, minH: 2 };
}

interface CanvasState {
  canvases: Canvas[];
  hydrated: boolean;

  // Bulk hydration (called by DataLoader on app mount)
  setCanvases: (canvases: Canvas[]) => void;
  setHydrated: () => void;

  addCanvas: (canvas: Canvas) => void;
  updateCanvas: (id: string, patch: Partial<Canvas>) => void;
  deleteCanvas: (id: string) => void;
  addBlock: (canvasId: string, block: CanvasBlock) => void;
  updateBlock: (canvasId: string, blockId: string, patch: Partial<CanvasBlock>) => void;
  removeBlock: (canvasId: string, blockId: string) => void;
  updateLayout: (canvasId: string, layout: GridLayoutItem[]) => void;
  applyRemoteChange: (canvas: Pick<Canvas, "id" | "name" | "blocks" | "layout" | "updatedAt">) => void;
  consumeRemoteUpdate: () => boolean;
  getCanvasById: (id: string) => Canvas | undefined;
}

let remoteUpdatePending = false;

export const useCanvasStore = create<CanvasState>()((set, get) => ({
  canvases: [],
  hydrated: false,

  setCanvases: (canvases) => set({ canvases }),
  setHydrated: () => set({ hydrated: true }),

  addCanvas: (canvas) =>
    set((s) => ({ canvases: [canvas, ...s.canvases] })),

  updateCanvas: (id, patch) =>
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === id ? { ...c, ...patch, updatedAt: new Date().toISOString() } : c
      ),
    })),

  deleteCanvas: (id) =>
    set((s) => ({ canvases: s.canvases.filter((c) => c.id !== id) })),

  addBlock: (canvasId, block) =>
    set((s) => ({
      canvases: s.canvases.map((c) => {
        if (c.id !== canvasId) return c;
        const newItem = defaultLayoutItem(block, c.layout ?? []);
        return {
          ...c,
          blocks: [...c.blocks, block],
          layout: [...(c.layout ?? []), newItem],
          updatedAt: new Date().toISOString(),
        };
      }),
    })),

  updateBlock: (canvasId, blockId, patch) =>
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === canvasId
          ? {
              ...c,
              blocks: c.blocks.map((b) =>
                b.id === blockId ? ({ ...b, ...patch } as CanvasBlock) : b
              ),
              updatedAt: new Date().toISOString(),
            }
          : c
      ),
    })),

  removeBlock: (canvasId, blockId) =>
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === canvasId
          ? {
              ...c,
              blocks: c.blocks.filter((b) => b.id !== blockId),
              layout: (c.layout ?? []).filter((l) => l.i !== blockId),
              updatedAt: new Date().toISOString(),
            }
          : c
      ),
    })),

  updateLayout: (canvasId, layout) =>
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === canvasId
          ? { ...c, layout, updatedAt: new Date().toISOString() }
          : c
      ),
    })),

  applyRemoteChange: (remote) => {
    remoteUpdatePending = true;
    set((s) => ({
      canvases: s.canvases.map((c) =>
        c.id === remote.id
          ? {
              ...c,
              name: remote.name,
              blocks: remote.blocks,
              layout: remote.layout,
              updatedAt: remote.updatedAt,
            }
          : c
      ),
    }));
  },

  consumeRemoteUpdate: () => {
    const value = remoteUpdatePending;
    remoteUpdatePending = false;
    return value;
  },

  getCanvasById: (id) => get().canvases.find((c) => c.id === id),
}));
