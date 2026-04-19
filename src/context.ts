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

export function slackTsToIso(ts: string): string {
  const sec = parseFloat(ts);
  return new Date(sec * 1000).toISOString();
}

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

export function mockContext(): PostmortemContext {
  const incidentWindow = incidentWindowFromMessages(mockSlackMessages);
  return {
    channelId: MOCK_CHANNEL_ID,
    channelName: "incident-polygon-0703",
    slackMessages: mockSlackMessages,
    githubPrs: mockGithubPrs,
    opsgenieAlerts: mockOpsgenieAlerts,
    incidentWindow,
  };
}

export async function realContextFromChannelInput(
  channelInput: string
): Promise<PostmortemContext> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not set");

  const trimmed = channelInput.trim();
  const channelId =
    /^C[A-Z0-9]+$/i.test(trimmed) || /^G[A-Z0-9]+$/i.test(trimmed)
      ? trimmed
      : await resolveChannelIdByName(token, trimmed);
  if (!channelId) {
    throw new Error(
      `Could not resolve Slack channel "${trimmed}". Use #channel-name or a channel ID, and ensure the bot is a member.`
    );
  }

  const slackMessages = await fetchChannelHistory(token, channelId);
  const combinedText = slackMessages.map((m) => m.text).join("\n");
  const incidentWindow = incidentWindowFromMessages(slackMessages);

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
