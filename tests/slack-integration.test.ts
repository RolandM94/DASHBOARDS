import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSlackPayload,
  maskSlackWebhookUrl,
  validateSlackWebhookUrl,
} from "../lib/reports/slack.ts";

test("validateSlackWebhookUrl accepts Slack incoming webhook URLs", () => {
  const result = validateSlackWebhookUrl("https://hooks.slack.com/services/T000/B000/SECRET");
  assert.equal(result.error, undefined);
  assert.equal(result.url, "https://hooks.slack.com/services/T000/B000/SECRET");
});

test("validateSlackWebhookUrl rejects non-Slack and non-HTTPS URLs", () => {
  assert.match(validateSlackWebhookUrl("http://hooks.slack.com/services/T/B/S").error ?? "", /HTTPS/);
  assert.match(validateSlackWebhookUrl("https://example.com/services/T/B/S").error ?? "", /hooks.slack.com/);
  assert.match(validateSlackWebhookUrl("https://hooks.slack.com/not-services/T/B/S").error ?? "", /incoming webhook/);
});

test("maskSlackWebhookUrl hides the raw secret", () => {
  const masked = maskSlackWebhookUrl("https://hooks.slack.com/services/T000/B000/SECRET123456");
  assert.equal(masked, "https://hooks.slack.com/services/...123456");
  assert.equal(masked.includes("SECRET"), false);
});

test("buildSlackPayload is dataset agnostic and includes actual metrics when supplied", () => {
  const payload = buildSlackPayload({
    dashboardTitle: "Performance dashboard",
    dashboardUrl: "https://supercool-stuff.vercel.app/dashboard/1",
    context: "Manual dashboard share",
    metrics: [
      { label: "Total", value: "1,200" },
      { label: "Completion", value: "82%" },
    ],
  });

  assert.equal(payload.text, "Performance dashboard - Manual dashboard share");
  const serialized = JSON.stringify(payload);
  assert.match(serialized, /Total/);
  assert.match(serialized, /1,200/);
  assert.doesNotMatch(serialized, /Revenue/);
  assert.doesNotMatch(serialized, /Churn/);
});
