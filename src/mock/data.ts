// src/mock/data.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hardcoded incident data used when MODE=mock.
//
// This represents a realistic incident:
//   - A payment router started throwing 5xx errors after a deploy
//   - Engineers identified the culprit PR in the Slack thread
//   - They rolled back and the service recovered
//
// The data shapes here are identical to what the real Slack, GitHub, and
// OpsGenie API fetchers return — so switching from mock to real mode
// requires no changes anywhere else in the codebase.
// ─────────────────────────────────────────────────────────────────────────────

import type { GitHubPrContext, OpsgenieAlert, SlackMessage } from "../types";

export const MOCK_CHANNEL_ID = "C0MOCKINCIDENT";

// ── Slack thread ─────────────────────────────────────────────────────────────
// Five messages covering the incident lifecycle:
// detection → investigation → rollback → recovery → resolution
export const mockSlackMessages: SlackMessage[] = [
  {
    ts: "1710000000.000100",
    user: "U111",
    text: ":rotating_light: *SEV2* — elevated error rate on polygon API after deploy",
  },
  {
    ts: "1710000060.000200",
    user: "U222",
    text: "Seeing 5xx from `payment-router` — started ~12:03 UTC",
  },
  {
    ts: "1710000120.000300",
    user: "U333",
    text: "Rollback initiated for release `v2.14.3`",
  },
  {
    ts: "1710000240.000400",
    user: "U222",
    text: "Error rate trending down after rollback",
  },
  {
    ts: "1710000360.000500",
    user: "U111",
    text: "Likely culprit PR: https://github.com/acme/platform/pull/1842 — changes batch flush timing",
  },
  {
    ts: "1710000480.000600",
    user: "U444",
    text: "All SLOs green again. Incident resolved from customer perspective.",
  },
];

// ── GitHub pull request ───────────────────────────────────────────────────────
// The PR that was deployed just before the incident started.
// The bot finds this by scanning the Slack thread for github.com/pull/ links.
export const mockGithubPrs: GitHubPrContext[] = [
  {
    url: "https://github.com/acme/platform/pull/1842",
    owner: "acme",
    repo: "platform",
    number: 1842,
    title: "Tune payment-router batch flush interval",
    mergedBy: "release-bot",
    mergedAt: "2024-03-09T11:58:00Z", // 5 minutes before the incident started
    body: "Reduces latency under load.\n\nFixes #387",
    filesChanged: [
      "services/payment-router/src/batch.ts",
      "services/payment-router/src/config.ts",
    ],
    linkedIssueNumbers: [387], // parsed from "Fixes #387" in the PR body
  },
];

// ── OpsGenie alert ────────────────────────────────────────────────────────────
// The alert that fired when the payment-router started throwing errors.
// The bot finds this by querying OpsGenie for alerts in the incident time window.
export const mockOpsgenieAlerts: OpsgenieAlert[] = [
  {
    id: "mock-alert-1",
    message: "[SEV2] payment-router 5xx spike",
    priority: "P2",
    status: "closed",
    createdAt: "2024-03-09T12:03:15Z",
    updatedAt: "2024-03-09T12:18:40Z",
    tags: ["service:payment-router", "env:prod"],
    tinyDescription: "5xx rate > 2% for 5m",
  },
];