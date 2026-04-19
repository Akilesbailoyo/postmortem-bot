// src/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared data shapes used by every file in this project.
//
// Think of these as the "forms" the bot fills in as it gathers information:
//   SlackMessage      → one message from the incident Slack channel
//   GitHubPrContext   → one pull request linked in the thread
//   OpsgenieAlert     → one alert that fired during the incident window
//   PostmortemContext → all of the above assembled together, ready for the LLM
// ─────────────────────────────────────────────────────────────────────────────

/** One message from the Slack incident channel. */
export interface SlackMessage {
  ts: string;        // unix timestamp as string, e.g. "1710000000.000100"
  user?: string;     // Slack user ID, e.g. "U111" — not a display name
  text: string;      // the message content
  thread_ts?: string;// set only if this is a reply inside a thread
}

/** One GitHub pull request found linked in the Slack thread. */
export interface GitHubPrContext {
  url: string;                  // full PR URL, e.g. https://github.com/org/repo/pull/42
  owner: string;                // GitHub org or username
  repo: string;                 // repository name
  number: number;               // PR number
  title: string;                // PR title as it appears on GitHub
  mergedBy?: string;            // GitHub username of who merged it
  mergedAt?: string;            // ISO timestamp of when it merged
  body?: string;                // PR description (used to extract issue references)
  filesChanged: string[];       // list of file paths changed in this PR
  linkedIssueNumbers: number[]; // issue numbers from PR body, e.g. [387] from "Fixes #387"
}

/** One OpsGenie alert that fired during the incident window. */
export interface OpsgenieAlert {
  id: string;
  message: string;          // alert title / description
  priority?: string;        // "P1", "P2", etc.
  status?: string;          // "open", "acked", or "closed"
  createdAt?: string;       // ISO timestamp when the alert fired
  updatedAt?: string;       // ISO timestamp of last update (often when resolved)
  tags?: string[];          // e.g. ["service:payment-router", "env:prod"]
  tinyDescription?: string; // short summary from OpsGenie
}

/**
 * Everything the bot collects before calling the LLM.
 * This is the single object passed into generatePostmortemDraft().
 */
export interface PostmortemContext {
  channelId: string;
  channelName?: string;                        // human name, e.g. "incident-polygon-0703"
  slackMessages: SlackMessage[];               // full thread, sorted oldest → newest
  githubPrs: GitHubPrContext[];               // PRs found linked in the thread (often 0 or 1)
  opsgenieAlerts: OpsgenieAlert[];            // alerts in the incident time window
  incidentWindow: { startIso: string; endIso: string } | null; // from first/last message
}