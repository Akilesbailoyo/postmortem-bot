/** Single Slack message as returned from conversations.history (subset). */
export interface SlackMessage {
  ts: string;
  user?: string;
  text: string;
  thread_ts?: string;
}

/** Linked PR metadata for the post-mortem context. */
export interface GitHubPrContext {
  url: string;
  owner: string;
  repo: string;
  number: number;
  title: string;
  mergedBy?: string;
  mergedAt?: string;
  body?: string;
  filesChanged: string[];
  linkedIssueNumbers: number[];
}

/** OpsGenie alert row for the incident window. */
export interface OpsgenieAlert {
  id: string;
  message: string;
  priority?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  tags?: string[];
  tinyDescription?: string;
}

/** Everything passed to the LLM. */
export interface PostmortemContext {
  channelId: string;
  channelName?: string;
  slackMessages: SlackMessage[];
  githubPrs: GitHubPrContext[];
  opsgenieAlerts: OpsgenieAlert[];
  incidentWindow: { startIso: string; endIso: string } | null;
}
