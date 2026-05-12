import test from "node:test";
import assert from "node:assert/strict";
import { collaboratorColor } from "../lib/realtime/collaboration.ts";
import { dbToCanvas } from "../lib/canvas/access.ts";

test("collaboratorColor returns stable palette colors per user", () => {
  const first = collaboratorColor("user-123");
  const second = collaboratorColor("user-123");
  const different = collaboratorColor("user-456");

  assert.equal(first, second);
  assert.match(first, /^#[0-9a-f]{6}$/i);
  assert.match(different, /^#[0-9a-f]{6}$/i);
});

test("dbToCanvas maps Supabase canvas rows to app shape", () => {
  const mapped = dbToCanvas({
    id: "canvas-1",
    user_id: "owner-1",
    name: "Planning canvas",
    blocks: [{ id: "block-1", type: "text", content: "Hello", order: 0 }],
    layout: [{ i: "block-1", x: 0, y: 0, w: 12, h: 4 }],
    published: true,
    published_title: "Published planning",
    published_permission: "public",
    published_at: "2026-05-12T10:00:00.000Z",
    created_at: "2026-05-12T09:00:00.000Z",
    updated_at: "2026-05-12T10:00:00.000Z",
  }, { currentUserId: "owner-1" });

  assert.equal(mapped.id, "canvas-1");
  assert.equal(mapped.accessRole, "owner");
  assert.equal(mapped.published, true);
  assert.equal(mapped.publishedTitle, "Published planning");
  assert.deepEqual(mapped.layout, [{ i: "block-1", x: 0, y: 0, w: 12, h: 4 }]);
});

test("dbToCanvas maps shared canvas permissions", () => {
  const mapped = dbToCanvas({
    id: "canvas-2",
    user_id: "owner-1",
    name: "Shared canvas",
    created_at: "2026-05-12T09:00:00.000Z",
    updated_at: "2026-05-12T10:00:00.000Z",
  }, {
    currentUserId: "viewer-1",
    sharedPermissions: { "canvas-2": "viewer" },
  });

  assert.equal(mapped.accessRole, "viewer");
  assert.deepEqual(mapped.blocks, []);
});
