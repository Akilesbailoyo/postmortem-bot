// src/__tests__/workflow.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Tests for the core workflow pipeline.
//
// These tests verify the bot's behaviour without requiring any API keys
// or network access. They cover:
//   - Mode resolution (mock vs real)
//   - Mock mode: runs end-to-end and produces a valid 7-section draft
//   - Mock mode: detects data gaps correctly
//   - Mock mode: falls back gracefully when ANTHROPIC_API_KEY is missing
//   - Real mode: guards against missing required inputs
//
// Run with: npm test
// ─────────────────────────────────────────────────────────────────────────────

import test from "node:test";
import assert from "node:assert/strict";
import { resolveRuntimeMode, runPostmortemFlow } from "../workflow";
import { incidentWindowFromMessages, slackTsToIso } from "../context";
import { extractPrUrlsFromText } from "../fetchers/github";
import { generateFallbackDraft } from "../generate";
import { mockContext } from "../context";

// ── Mode resolution ───────────────────────────────────────────────────────────

test("resolveRuntimeMode: defaults to mock for undefined", () => {
  assert.equal(resolveRuntimeMode(undefined), "mock");
});

test("resolveRuntimeMode: defaults to mock for unrecognised values", () => {
  assert.equal(resolveRuntimeMode("production"), "mock");
  assert.equal(resolveRuntimeMode(""), "mock");
});

test("resolveRuntimeMode: returns real only for the exact string 'real'", () => {
  assert.equal(resolveRuntimeMode("real"), "real");
  assert.equal(resolveRuntimeMode("REAL"), "real"); // case insensitive
});

// ── Mock mode end-to-end ──────────────────────────────────────────────────────

test("mock mode: produces a draft with all 7 required sections", async () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY; // force fallback draft

  const result = await runPostmortemFlow({ mode: "mock" });

  // All 7 sections must be present
  const sections = [
    "## Summary",
    "## Timeline",
    "## Root Cause",
    "## Contributing Factors",
    "## Impact",
    "## Action Items",
    "## What Went Well",
  ];
  for (const section of sections) {
    assert.ok(
      result.draft.includes(section),
      `Draft is missing section: ${section}`
    );
  }

  if (prev) process.env.ANTHROPIC_API_KEY = prev;
});

test("mock mode: fallback draft is used when ANTHROPIC_API_KEY is not set", async () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  const result = await runPostmortemFlow({ mode: "mock" });
  assert.equal(result.usedFallback, true);

  if (prev) process.env.ANTHROPIC_API_KEY = prev;
});

test("mock mode: context contains the expected mock incident data", async () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  const result = await runPostmortemFlow({ mode: "mock" });

  assert.ok(result.context.slackMessages.length > 0, "Should have Slack messages");
  assert.ok(result.context.githubPrs.length > 0, "Should have at least one GitHub PR");
  assert.ok(result.context.opsgenieAlerts.length > 0, "Should have at least one OpsGenie alert");
  assert.equal(result.context.channelName, "incident-polygon-0703");

  if (prev) process.env.ANTHROPIC_API_KEY = prev;
});

test("mock mode: no data gaps in mock context (all three sources present)", async () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  const result = await runPostmortemFlow({ mode: "mock" });
  // Mock data has GitHub PRs and OpsGenie alerts, so there should be no gaps
  assert.equal(result.gaps.length, 0, "Mock mode should have no data gaps");

  if (prev) process.env.ANTHROPIC_API_KEY = prev;
});

// ── Real mode guards ──────────────────────────────────────────────────────────

test("real mode: throws if no channel input is provided", async () => {
  await assert.rejects(
    async () => runPostmortemFlow({ mode: "real" }),
    /Channel input is required in real mode/
  );
});

test("real mode: throws if SLACK_BOT_TOKEN is missing", async () => {
  const prev = process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_BOT_TOKEN;

  await assert.rejects(
    async () => runPostmortemFlow({ mode: "real", channelInput: "#incident-test" }),
    /SLACK_BOT_TOKEN is not set/
  );

  if (prev) process.env.SLACK_BOT_TOKEN = prev;
});

// ── Context utilities ─────────────────────────────────────────────────────────

test("slackTsToIso: converts a Slack timestamp to an ISO string", () => {
  const iso = slackTsToIso("1710000000.000100");
  assert.ok(iso.startsWith("2024-03-09"), `Expected a March 2024 date, got: ${iso}`);
});

test("incidentWindowFromMessages: derives start and end from message timestamps", () => {
  const messages = [
    { ts: "1710000120.000000", text: "second message" },
    { ts: "1710000000.000000", text: "first message" },  // intentionally out of order
    { ts: "1710000480.000000", text: "third message" },
  ];
  const window = incidentWindowFromMessages(messages);
  assert.ok(window !== null);
  assert.ok(window.startIso < window.endIso, "Start should be before end");
  assert.ok(window.startIso.includes("2024-03-09"), "Should be a 2024 date");
});

test("incidentWindowFromMessages: returns null for empty messages", () => {
  assert.equal(incidentWindowFromMessages([]), null);
});

// ── GitHub URL extraction ─────────────────────────────────────────────────────

test("extractPrUrlsFromText: finds GitHub PR links in Slack message text", () => {
  const text = `
    Looks like the issue is in https://github.com/acme/platform/pull/1842 — 
    merged just before the incident started.
    Also see https://github.com/acme/platform/pull/1842 (duplicate, should be ignored).
  `;
  const results = extractPrUrlsFromText(text);
  assert.equal(results.length, 1, "Should deduplicate identical PR links");
  assert.equal(results[0].number, 1842);
  assert.equal(results[0].owner, "acme");
  assert.equal(results[0].repo, "platform");
});

test("extractPrUrlsFromText: returns empty array when no PR links present", () => {
  const results = extractPrUrlsFromText("No links in this message at all.");
  assert.equal(results.length, 0);
});

// ── Fallback draft content ────────────────────────────────────────────────────

test("generateFallbackDraft: includes the channel name in the summary", () => {
  const ctx = mockContext();
  const draft = generateFallbackDraft(ctx);
  assert.ok(
    draft.includes("incident-polygon-0703"),
    "Summary should mention the incident channel name"
  );
});

test("generateFallbackDraft: includes GitHub PR URL when PR data is present", () => {
  const ctx = mockContext();
  const draft = generateFallbackDraft(ctx);
  assert.ok(
    draft.includes("github.com/acme/platform/pull/1842"),
    "Root cause should reference the linked PR"
  );
});