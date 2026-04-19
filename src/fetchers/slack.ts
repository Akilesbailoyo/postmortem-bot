// src/fetchers/slack.ts
// ─────────────────────────────────────────────────────────────────────────────
// Fetches messages from a Slack channel using the Slack Web API.
//
// What it does:
//   fetchChannelHistory()    → reads every message in a channel (handles pagination)
//   resolveChannelIdByName() → converts "#incident-foo" to a Slack channel ID
//
// Slack's conversations.history API returns up to 200 messages per call.
// If a channel has more than 200 messages, we follow the pagination cursor
// until we have everything.
//
// Requires: SLACK_BOT_TOKEN in .env
// Required OAuth scopes: channels:history, channels:read
// ─────────────────────────────────────────────────────────────────────────────

import type { SlackMessage } from "../types";

const SLACK_API = "https://slack.com/api";

// ── Generic Slack API caller ──────────────────────────────────────────────────

async function slackPost<T>(
  token: string,
  method: string,
  body: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as T & { ok?: boolean; error?: string };

  // Slack always returns HTTP 200, but signals errors in the response body
  if (!(data as { ok?: boolean }).ok) {
    throw new Error(`Slack API error (${method}): ${(data as { error?: string }).error ?? res.statusText}`);
  }
  return data;
}

// ── Fetch channel history ─────────────────────────────────────────────────────

/**
 * Fetches all messages from a Slack channel, handling pagination automatically.
 * Returns messages sorted oldest → newest (Slack returns newest-first by default).
 *
 * @param token     Bot token (SLACK_BOT_TOKEN)
 * @param channelId Slack channel ID, e.g. "C07AB12XYZ"
 */
export async function fetchChannelHistory(
  token: string,
  channelId: string
): Promise<SlackMessage[]> {
  const messages: SlackMessage[] = [];
  let cursor: string | undefined;

  // Keep fetching pages until there are no more
  do {
    const data = await slackPost<{
      messages?: SlackMessage[];
      response_metadata?: { next_cursor?: string };
    }>(token, "conversations.history", {
      channel: channelId,
      limit: 200, // maximum allowed per request
      cursor,
    });

    messages.push(...(data.messages ?? []));
    cursor = data.response_metadata?.next_cursor || undefined;
  } while (cursor);

  // Sort oldest → newest so the timeline reads chronologically
  return messages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
}

// ── Resolve channel name to ID ────────────────────────────────────────────────

/**
 * Converts a channel name (e.g. "#incident-polygon-0703") to a Slack channel ID.
 * Searches through all public and private channels the bot can see.
 * Returns null if the channel is not found.
 *
 * @param token Slack bot token
 * @param name  Channel name with or without the # prefix
 */
export async function resolveChannelIdByName(
  token: string,
  name: string
): Promise<string | null> {
  const target = name.replace(/^#/, "").toLowerCase();
  let cursor: string | undefined;

  do {
    const data = await slackPost<{
      channels?: { id: string; name: string }[];
      response_metadata?: { next_cursor?: string };
    }>(token, "conversations.list", {
      types: "public_channel,private_channel",
      limit: 200,
      cursor,
    });

    for (const ch of data.channels ?? []) {
      if (ch.name.toLowerCase() === target) return ch.id;
    }

    cursor = data.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return null; // channel not found
}