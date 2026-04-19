// src/generate.ts
// ─────────────────────────────────────────────────────────────────────────────
// Two ways to generate a post-mortem draft from a PostmortemContext:
//
//   generatePostmortemDraft()  → calls Claude via the Anthropic API
//                                requires ANTHROPIC_API_KEY in .env
//                                produces the best output
//
//   generateFallbackDraft()    → uses simple template logic, no API call
//                                works without any API key
//                                useful for demos and testing
//
// Both functions take a PostmortemContext and return a markdown string
// with exactly 7 sections.
// ─────────────────────────────────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import type { PostmortemContext } from "./types";

// ── Prompt configuration ──────────────────────────────────────────────────────

// The system prompt tells Claude exactly what role to play and what rules to follow.
// "Blameless" is a deliberate design choice: post-mortems that name individuals
// create defensiveness instead of systemic improvements.
const SYSTEM_PROMPT = `You draft incident post-mortems for engineers.

Rules:
- Use ONLY the JSON data provided. Do not invent facts, people, times, or systems not in the data.
- Do not name individuals as causes — focus on systems and processes.
- If something cannot be determined from the data, write "Insufficient data — engineer to complete" in that section.
- Output exactly these 7 sections as Markdown H2 headings, in this order:
  ## Summary
  ## Timeline
  ## Root Cause
  ## Contributing Factors
  ## Impact
  ## Action Items
  ## What Went Well
- Keep a professional, factual tone suitable for internal engineering review.`;

/** Serialize the context into a clean JSON string for the prompt. */
function formatContextForPrompt(ctx: PostmortemContext): string {
  return JSON.stringify(
    {
      channelName: ctx.channelName,
      incidentWindow: ctx.incidentWindow,
      // Include only the fields the LLM needs — not internal IDs
      slackMessages: ctx.slackMessages.map((m) => ({
        timestamp: m.ts,
        user: m.user,
        text: m.text,
      })),
      githubPullRequests: ctx.githubPrs,
      opsgenieAlerts: ctx.opsgenieAlerts,
    },
    null,
    2
  );
}

// ── Claude-powered draft ──────────────────────────────────────────────────────

/**
 * Calls Claude to generate a structured post-mortem draft.
 * Requires ANTHROPIC_API_KEY to be set in .env.
 *
 * The model can be overridden via the ANTHROPIC_MODEL environment variable,
 * which is useful for testing with newer model versions.
 */
export async function generatePostmortemDraft(ctx: PostmortemContext): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in .env");

  const model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20240620";
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is the incident context as JSON:\n\n${formatContextForPrompt(ctx)}\n\nWrite the post-mortem draft following the rules.`,
      },
    ],
  });

  // Claude always returns at least one text block — find it
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Unexpected response from Anthropic API — no text content returned");
  }
  return textBlock.text;
}

// ── Fallback draft (no API key needed) ───────────────────────────────────────

/** Convert a Slack unix timestamp string to ISO format, or return "Unknown time". */
function tsToIso(ts?: string): string {
  if (!ts) return "Unknown time";
  const n = Number.parseFloat(ts);
  return Number.isNaN(n) ? ts : new Date(n * 1000).toISOString();
}

/**
 * Generates a basic post-mortem draft from the context without calling any AI API.
 * The quality is lower than the Claude-powered version, but it produces a complete
 * 7-section structure that engineers can review and fill in.
 *
 * This runs when ANTHROPIC_API_KEY is not set — useful for demos and offline use.
 */
export function generateFallbackDraft(ctx: PostmortemContext): string {
  const first = ctx.slackMessages[0];
  const last  = ctx.slackMessages[ctx.slackMessages.length - 1];

  // Build a timeline from the first 8 Slack messages
  const timeline = ctx.slackMessages
    .slice(0, 8)
    .map((m) => `- ${tsToIso(m.ts)} — ${m.text}`)
    .join("\n");

  const pr    = ctx.githubPrs[0];
  const alert = ctx.opsgenieAlerts[0];

  return [
    "## Summary",
    `Incident in ${ctx.channelName ? `#${ctx.channelName}` : ctx.channelId} ` +
    `between ${tsToIso(first?.ts)} and ${tsToIso(last?.ts)}. ` +
    `Service degradation was observed and recovered after mitigation steps documented in the Slack thread.`,
    "",
    "## Timeline",
    timeline || "- Insufficient data — engineer to complete",
    "",
    "## Root Cause",
    pr
      ? `Most likely linked to the deployment in ${pr.url} (${pr.title}). ` +
        `Exact root cause requires engineer confirmation from logs and metrics.`
      : "Insufficient data — engineer to complete",
    "",
    "## Contributing Factors",
    "- Incident context assembled from Slack messages, which may omit internal metric details.",
    pr
      ? `- Code change touched: ${pr.filesChanged.slice(0, 5).join(", ") || "see PR for details"}.`
      : "- No linked GitHub PR found in the Slack thread.",
    alert
      ? `- Alert evidence: ${alert.message} (${alert.priority ?? "unknown priority"}).`
      : "- No OpsGenie alert matched the incident time window.",
    "",
    "## Impact",
    alert
      ? `Customer-facing impact likely occurred while alert was active ` +
        `(${alert.createdAt ?? "unknown start"} → ${alert.updatedAt ?? "unknown end"}).`
      : "Insufficient data — engineer to complete with affected service and user impact.",
    "",
    "## Action Items",
    "- Add automated validation for release changes affecting the incident service path.",
    "- Improve the rollback playbook with explicit trigger thresholds and ownership.",
    "- Add post-deploy canary checks for early detection of elevated error rates.",
    "",
    "## What Went Well",
    "- Engineers identified mitigation quickly via the incident channel.",
    "- Rollback execution appears to have reduced errors rapidly.",
    "- Incident communication was centralised in a single Slack channel.",
  ].join("\n");
}

// ── Context description (for transparency when no API key is set) ─────────────

/**
 * Returns a human-readable description of what data was collected.
 * Shown in the terminal and web demo when running without an Anthropic key,
 * so users can see exactly what would be sent to the LLM.
 */
export function describeContextWithoutLlm(ctx: PostmortemContext): string {
  return [
    "─── Context that would be sent to Claude (no ANTHROPIC_API_KEY set) ───",
    "",
    formatContextForPrompt(ctx),
    "",
    "Set ANTHROPIC_API_KEY in your .env file to generate a Claude-powered draft instead.",
  ].join("\n");
}