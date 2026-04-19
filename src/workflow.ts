// src/workflow.ts
// ─────────────────────────────────────────────────────────────────────────────
// The single shared pipeline that both the CLI demo and the Slack bot use.
//
// This is the heart of the bot. Every run — whether triggered by a terminal
// command or a Slack slash command — goes through runPostmortemFlow().
//
// Flow:
//   1. Build context from mock data or live APIs  (see context.ts)
//   2. Check for missing data sources and record gaps
//   3. Generate the draft via Claude or the fallback generator (see generate.ts)
//   4. Return the draft + metadata to the caller
//
// The caller (demo.ts or index.ts) decides how to display the result.
// ─────────────────────────────────────────────────────────────────────────────

import { mockContext, realContextFromChannelInput } from "./context";
import { generateFallbackDraft, generatePostmortemDraft } from "./generate";
import type { PostmortemContext } from "./types";

export type RuntimeMode = "mock" | "real";

export interface DraftResult {
  context: PostmortemContext; // the raw collected data
  draft: string;             // the generated post-mortem (markdown)
  usedFallback: boolean;     // true if ANTHROPIC_API_KEY was not set
  gaps: string[];            // data sources that were missing or unavailable
}

// ── Mode resolution ───────────────────────────────────────────────────────────

/**
 * Reads the MODE environment variable and returns "mock" or "real".
 * Defaults to "mock" if the value is missing or unrecognised.
 * This means the demo always works safely without any environment setup.
 */
export function resolveRuntimeMode(value: string | undefined): RuntimeMode {
  return (value ?? "mock").toLowerCase() === "real" ? "real" : "mock";
}

// ── Gap detection ─────────────────────────────────────────────────────────────

/**
 * Checks what data is missing from the context.
 * Missing data does not stop the bot — we proceed and note the gaps in the draft.
 */
function detectGaps(ctx: PostmortemContext): string[] {
  const gaps: string[] = [];
  if (ctx.githubPrs.length === 0) {
    gaps.push("No GitHub PR links found in thread, or GITHUB_TOKEN is missing.");
  }
  if (ctx.opsgenieAlerts.length === 0) {
    gaps.push("No OpsGenie alerts in the incident window, or OPSGENIE_API_KEY is missing.");
  }
  return gaps;
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

/**
 * Runs the full post-mortem generation pipeline.
 *
 * @param mode         "mock" (offline, no credentials) or "real" (live APIs)
 * @param channelInput Required in real mode: a Slack channel ID or #channel-name
 */
export async function runPostmortemFlow(params: {
  mode: RuntimeMode;
  channelInput?: string;
}): Promise<DraftResult> {

  // Step 1: build context
  let context: PostmortemContext;
  if (params.mode === "mock") {
    context = mockContext();
  } else {
    if (!params.channelInput?.trim()) {
      throw new Error("Channel input is required in real mode.");
    }
    context = await realContextFromChannelInput(params.channelInput);
  }

  // Step 2: stop early if the Slack thread is empty (nothing to work with)
  if (context.slackMessages.length === 0) {
    throw new Error(
      "The Slack thread is empty — please confirm the channel name or ID."
    );
  }

  // Step 3: check for missing data sources
  const gaps = detectGaps(context);

  // Step 4: generate the draft
  // If ANTHROPIC_API_KEY is set → call Claude for a high-quality draft
  // If not               → use the built-in fallback generator (still useful)
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      context,
      draft: generateFallbackDraft(context),
      usedFallback: true,
      gaps,
    };
  }

  return {
    context,
    draft: await generatePostmortemDraft(context),
    usedFallback: false,
    gaps,
  };
}