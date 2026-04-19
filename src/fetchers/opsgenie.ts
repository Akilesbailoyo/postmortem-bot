// src/fetchers/opsgenie.ts
// ─────────────────────────────────────────────────────────────────────────────
// Fetches OpsGenie alerts that fired during the incident time window.
//
// What it does:
//   fetchAlertsInWindow() → queries the OpsGenie Alerts API for alerts
//                           created between startIso and endIso
//
// How the time window works:
//   The incident window comes from context.ts — it is derived from the
//   timestamps of the first and last Slack messages in the incident thread.
//   Example: first message at 12:03 UTC, last message at 12:18 UTC
//            → we query OpsGenie for alerts created in that window
//
// OpsGenie query syntax:
//   createdAt >= 2024-03-09T12:03:00Z AND createdAt <= 2024-03-09T12:18:00Z
//
// Requires: OPSGENIE_API_KEY in .env
// Required OpsGenie permission: Read access on Alerts
// ─────────────────────────────────────────────────────────────────────────────

import type { OpsgenieAlert } from "../types";

// Allow the base URL to be overridden for EU region or on-prem installations
function getBaseUrl(): string {
  return (process.env.OPSGENIE_BASE_URL ?? "https://api.opsgenie.com").replace(/\/$/, "");
}

/**
 * Queries OpsGenie for alerts created within the given time window.
 *
 * @param apiKey    OpsGenie API key (GenieKey auth)
 * @param startIso  ISO timestamp for the start of the window (from first Slack message)
 * @param endIso    ISO timestamp for the end of the window (from last Slack message)
 */
export async function fetchAlertsInWindow(
  apiKey: string,
  startIso: string,
  endIso: string
): Promise<OpsgenieAlert[]> {
  const base = getBaseUrl();

  // Build the OpsGenie query — ISO timestamps in the createdAt range
  const query = `createdAt >= ${startIso} AND createdAt <= ${endIso}`;
  const url = new URL(`${base}/v2/alerts`);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", "100");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `GenieKey ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpsGenie API error: ${res.status} ${body}`);
  }

  const json = (await res.json()) as {
    data?: {
      id: string;
      message: string;
      priority?: string;
      status?: string;
      createdAt?: string;
      updatedAt?: string;
      tags?: string[];
      tinyDescription?: string;
    }[];
  };

  // Map the OpsGenie response to our OpsgenieAlert shape
  return (json.data ?? []).map((a) => ({
    id: a.id,
    message: a.message,
    priority: a.priority,
    status: a.status,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    tags: a.tags,
    tinyDescription: a.tinyDescription,
  }));
}