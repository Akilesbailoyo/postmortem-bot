import { mockContext, realContextFromChannelInput } from "./context";
import { generateFallbackDraft, generatePostmortemDraft } from "./generate";
import type { PostmortemContext } from "./types";

export type RuntimeMode = "mock" | "real";

export interface DraftResult {
  context: PostmortemContext;
  draft: string;
  usedFallback: boolean;
  gaps: string[];
}

export function resolveRuntimeMode(value: string | undefined): RuntimeMode {
  const normalized = (value ?? "mock").toLowerCase();
  return normalized === "real" ? "real" : "mock";
}

function detectGaps(ctx: PostmortemContext): string[] {
  const gaps: string[] = [];
  if (ctx.githubPrs.length === 0) {
    gaps.push("No GitHub PR links found or GitHub token missing.");
  }
  if (ctx.opsgenieAlerts.length === 0) {
    gaps.push("No OpsGenie alerts in window or API key missing.");
  }
  return gaps;
}

async function buildContext(
  mode: RuntimeMode,
  channelInput?: string
): Promise<PostmortemContext> {
  if (mode === "mock") return mockContext();
  if (!channelInput?.trim()) {
    throw new Error("Channel input is required in real mode.");
  }
  return realContextFromChannelInput(channelInput);
}

export async function runPostmortemFlow(params: {
  mode: RuntimeMode;
  channelInput?: string;
}): Promise<DraftResult> {
  const context = await buildContext(params.mode, params.channelInput);
  if (context.slackMessages.length === 0) {
    throw new Error("Slack thread is empty — confirm the channel name or ID.");
  }

  const gaps = detectGaps(context);
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
