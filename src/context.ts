// src/context.ts
// ─────────────────────────────────────────────────────────────────────────────
// Builds a PostmortemContext from either mock data or live APIs.
//
// This is the "data assembly" step in the bot's flow:
//
//   mock mode → return the hardcoded incident from src/mock/data.ts
//               (no API calls, no credentials needed)
//
//   real mode → call Slack, GitHub, and OpsGenie APIs in parallel
//               and assemble everything into the same PostmortemContext shape
//
// The rest of the codebase only sees PostmortemContext — it doesn't care
// whether the data came from mock or real sources.
// ─────────────────────────────────────────────────────────────────────────────

import type { PostmortemContext, SlackMessage } from "./types";
import { fetchAllLinkedPrs } from "./fetchers/github";
import { fetchAlertsInWindow } from "./fetchers/opsgenie";
import { fetchChannelHistory, resolveChannelIdByName } from "./fetchers/slack";
import {
  MOCK_CHANNEL_ID,
  mockGithubPrs,
  mockOpsgenieAlerts,
  mockSlackMessages,
} from "./mock/data";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a Slack unix timestamp string to an ISO 8601 string. */
export function slackTsToIso(ts: string): string {
  return new Date(parseFloat(ts) * 1000).toISOString();
}

/**
 * Derive the incident time window from the Slack thread.
 * Uses the timestamp of the first message as start and last message as end.
 * Returns null if the thread is empty.
 */
export function incidentWindowFromMessages(
  messages: SlackMessage[]
): { startIso: string; endIso: string } | null {
  if (messages.length === 0) return null;
  const sorted = [...messages].sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
  return {
    startIso: slackTsToIso(sorted[0].ts),
    endIso: slackTsToIso(sorted[sorted.length - 1].ts),
  };
}

// ── Mock context ──────────────────────────────────────────────────────────────

/**
 * Returns the hardcoded mock incident context.
 * No API calls. Safe to run anywhere with no credentials.
 */
export function mockContext(): PostmortemContext {
  return {
    channelId: MOCK_CHANNEL_ID,
    channelName: "incident-polygon-0703",
    slackMessages: mockSlackMessages,
    githubPrs: mockGithubPrs,
    opsgenieAlerts: mockOpsgenieAlerts,
    incidentWindow: incidentWindowFromMessages(mockSlackMessages),
  };
}

// ── Real context ──────────────────────────────────────────────────────────────

/**
 * Fetches live incident data from Slack, GitHub, and OpsGenie.
 *
 * Steps:
 *   1. Resolve the channel name/ID to a Slack channel ID
 *   2. Fetch all messages in that channel (paginated)
 *   3. Derive the incident time window from message timestamps
 *   4. In parallel: scan messages for GitHub PR links + query OpsGenie alerts
 *   5. Return everything as a PostmortemContext
 *
 * GitHub and OpsGenie are optional — if their tokens are missing, we proceed
 * without them and note the gaps in the draft.
 */
export async function realContextFromChannelInput(
  channelInput: string
): Promise<PostmortemContext> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not set in .env");

  // Step 1: resolve channel name (e.g. "#incident-foo") to a Slack channel ID
  const trimmed = channelInput.trim();
  const isAlreadyId = /^[CG][A-Z0-9]+$/i.test(trimmed);
  const channelId = isAlreadyId
    ? trimmed
    : await resolveChannelIdByName(token, trimmed);

  if (!channelId) {
    throw new Error(
      `Could not find Slack channel "${trimmed}". ` +
      `Make sure the bot is a member of the channel and the name is correct.`
    );
  }

  // Step 2: fetch the full Slack thread
  const slackMessages = await fetchChannelHistory(token, channelId);

  // Step 3: derive the incident window from message timestamps
  const incidentWindow = incidentWindowFromMessages(slackMessages);
  const combinedText = slackMessages.map((m) => m.text).join("\n");

  // Step 4: fetch GitHub and OpsGenie in parallel (both are optional)
  const githubToken = process.env.GITHUB_TOKEN;
  const opsKey = process.env.OPSGENIE_API_KEY;

  const [githubPrs, opsgenieAlerts] = await Promise.all([
    githubToken
      ? fetchAllLinkedPrs(githubToken, combinedText)
      : Promise.resolve([]),
    incidentWindow && opsKey
      ? fetchAlertsInWindow(opsKey, incidentWindow.startIso, incidentWindow.endIso)
      : Promise.resolve([]),
  ]);

  return {
    channelId,
    channelName: trimmed.replace(/^#/, ""),
    slackMessages,
    githubPrs,
    opsgenieAlerts,
    incidentWindow,
  };
}