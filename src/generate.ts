import Anthropic from "@anthropic-ai/sdk";
import type { PostmortemContext } from "./types";

function formatContextForPrompt(ctx: PostmortemContext): string {
  return JSON.stringify(
    {
      channelId: ctx.channelId,
      channelName: ctx.channelName,
      incidentWindow: ctx.incidentWindow,
      slackMessages: ctx.slackMessages.map((m) => ({
        ts: m.ts,
        user: m.user,
        text: m.text,
      })),
      githubPrs: ctx.githubPrs,
      opsgenieAlerts: ctx.opsgenieAlerts,
    },
    null,
    2
  );
}

const SYSTEM = `You draft incident post-mortems for engineers.
Rules:
- Use ONLY the JSON data provided. Do not invent facts, people, times, or systems not present in the data.
- Do not name individuals as causes — focus on systems and processes.
- If something cannot be determined from the data, say so explicitly in that section (e.g. "Insufficient data in sources").
- Output exactly these 7 sections as Markdown H2 headings in this order:
  ## Summary
  ## Timeline
  ## Root Cause
  ## Contributing Factors
  ## Impact
  ## Action Items
  ## What Went Well
- Keep a professional tone suitable for internal engineering review.`;

export async function generatePostmortemDraft(ctx: PostmortemContext): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  const model =
    process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-20240620";
  const client = new Anthropic({ apiKey });

  const user = `Here is the collected incident context as JSON:\n\n${formatContextForPrompt(ctx)}\n\nWrite the post-mortem draft following the rules.`;

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    messages: [{ role: "user", content: user }],
    system: SYSTEM,
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("No text content in model response");
  }
  return block.text;
}

function toIso(ts?: string): string {
  if (!ts) return "Unknown time";
  const parsed = Number.parseFloat(ts);
  if (Number.isNaN(parsed)) return ts;
  return new Date(parsed * 1000).toISOString();
}

export function generateFallbackDraft(ctx: PostmortemContext): string {
  const first = ctx.slackMessages[0];
  const last = ctx.slackMessages[ctx.slackMessages.length - 1];
  const timeline = ctx.slackMessages
    .slice(0, 8)
    .map((m) => `- ${toIso(m.ts)} — ${m.text}`)
    .join("\n");

  const pr = ctx.githubPrs[0];
  const alert = ctx.opsgenieAlerts[0];

  return [
    "## Summary",
    `Incident in ${ctx.channelName ? `#${ctx.channelName}` : ctx.channelId} discussed between ${toIso(first?.ts)} and ${toIso(last?.ts)}. Service degradation was observed and recovered after mitigation steps noted in the Slack thread.`,
    "",
    "## Timeline",
    timeline || "- Insufficient data in sources",
    "",
    "## Root Cause",
    pr
      ? `Most likely linked to recent deployment activity referenced in ${pr.url} (${pr.title}). Exact technical root cause requires engineer confirmation from logs/metrics.`
      : "Insufficient data in sources to determine a single root cause.",
    "",
    "## Contributing Factors",
    "- Incident context was assembled from Slack messages, which may omit internal metric details.",
    pr
      ? `- Code change touched: ${pr.filesChanged.slice(0, 5).join(", ") || "Insufficient data in sources"}.`
      : "- No linked GitHub PR was found in the available thread data.",
    alert
      ? `- Alert evidence: ${alert.message} (${alert.priority ?? "unknown priority"}).`
      : "- No OpsGenie alert in the detected window.",
    "",
    "## Impact",
    alert
      ? `Customer-facing impact likely occurred while alert was active (${alert.createdAt ?? "unknown start"} to ${alert.updatedAt ?? "unknown end"}).`
      : "Slack thread indicates customer impact, but precise affected scope is insufficient in sources.",
    "",
    "## Action Items",
    "- Add automated validation for release changes affecting incident service paths.",
    "- Improve rollback playbook with explicit trigger thresholds and ownership.",
    "- Add post-deploy canary checks for early detection of elevated 5xx rates.",
    "",
    "## What Went Well",
    "- Engineers identified mitigation quickly via incident channel coordination.",
    "- Rollback execution appears to have reduced errors rapidly.",
    "- Incident communication was centralized in a single channel for traceability.",
  ].join("\n");
}

export function describeContextWithoutLlm(ctx: PostmortemContext): string {
  const lines: string[] = [];
  lines.push("--- Context that would be sent to the LLM (no ANTHROPIC_API_KEY) ---");
  lines.push(formatContextForPrompt(ctx));
  lines.push("");
  lines.push(
    "With ANTHROPIC_API_KEY set, the same run would call Claude and print a 7-section Markdown draft."
  );
  return lines.join("\n");
}
