import test from "node:test";
import assert from "node:assert/strict";
import {
  buildScheduleInput,
  calculateNextSendAt,
  normalizeRecipients,
  validateRecipients,
} from "../lib/reports/schedules.ts";

test("normalizeRecipients trims, lowercases, dedupes comma and newline lists", () => {
  assert.deepEqual(
    normalizeRecipients("A@Example.com, b@example.com\na@example.com"),
    ["a@example.com", "b@example.com"]
  );
});

test("validateRecipients reports invalid email values", () => {
  assert.equal(validateRecipients(["valid@example.com"]), undefined);
  assert.equal(validateRecipients(["not-email"]), "Invalid recipient email: not-email");
});

test("buildScheduleInput validates schedule shape and computes next send time", () => {
  const built = buildScheduleInput({
    frequency: "weekly",
    timeOfDay: "09:30",
    timezone: "UTC",
    dayOfWeek: 2,
    format: "xlsx",
    recipients: "person@example.com",
  }, new Date("2026-05-11T10:00:00.000Z"));

  assert.equal(built.error, undefined);
  assert.equal(built.data?.frequency, "weekly");
  assert.equal(built.data?.format, "xlsx");
  assert.deepEqual(built.data?.recipients, ["person@example.com"]);
  assert.equal(built.data?.next_send_at, "2026-05-12T09:30:00.000Z");
});

test("calculateNextSendAt advances daily schedules that already passed today", () => {
  const next = calculateNextSendAt({
    frequency: "daily",
    timeOfDay: "09:00",
    timezone: "UTC",
    from: new Date("2026-05-11T10:00:00.000Z"),
  });

  assert.equal(next.toISOString(), "2026-05-12T09:00:00.000Z");
});

test("calculateNextSendAt caps monthly schedules to explicit month day", () => {
  const next = calculateNextSendAt({
    frequency: "monthly",
    timeOfDay: "08:00",
    timezone: "UTC",
    dayOfMonth: 12,
    from: new Date("2026-05-11T10:00:00.000Z"),
  });

  assert.equal(next.toISOString(), "2026-05-12T08:00:00.000Z");
});
