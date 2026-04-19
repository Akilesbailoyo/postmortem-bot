import type { SlackMessage } from "../types";

const SLACK_API = "https://slack.com/api";

async function slackApi<T>(
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
  if (!(data as { ok?: boolean }).ok) {
    throw new Error(
      `Slack API error: ${(data as { error?: string }).error ?? res.statusText}`
    );
  }
  return data;
}

export async function fetchChannelHistory(
  token: string,
  channelId: string
): Promise<SlackMessage[]> {
  const messages: SlackMessage[] = [];
  let cursor: string | undefined;

  do {
    const data = await slackApi<{
      messages?: SlackMessage[];
      response_metadata?: { next_cursor?: string };
    }>(token, "conversations.history", {
      channel: channelId,
      limit: 200,
      cursor,
    });
    const batch = data.messages ?? [];
    messages.push(...batch);
    cursor = data.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  } while (true);

  return messages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
}

/** Resolve #name or plain name to channel id (public channels the bot can see). */
export async function resolveChannelIdByName(
  token: string,
  name: string
): Promise<string | null> {
  const normalized = name.replace(/^#/, "").toLowerCase();
  let cursor: string | undefined;

  do {
    const data = await slackApi<{
      channels?: { id: string; name: string }[];
      response_metadata?: { next_cursor?: string };
    }>(token, "conversations.list", {
      types: "public_channel,private_channel",
      limit: 200,
      cursor,
    });
    for (const ch of data.channels ?? []) {
      if (ch.name.toLowerCase() === normalized) return ch.id;
    }
    cursor = data.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  } while (true);

  return null;
}
