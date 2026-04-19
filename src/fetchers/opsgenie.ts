import type { OpsgenieAlert } from "../types";

function getBaseUrl(): string {
  return (process.env.OPSGENIE_BASE_URL ?? "https://api.opsgenie.com").replace(/\/$/, "");
}

/**
 * List alerts whose created time falls in [startIso, endIso] (UTC).
 * Uses OpsGenie list alerts API; query syntax is approximate and may need tuning per account.
 */
export async function fetchAlertsInWindow(
  apiKey: string,
  startIso: string,
  endIso: string
): Promise<OpsgenieAlert[]> {
  const base = getBaseUrl();
  const query = `createdAt >= ${startIso} AND createdAt <= ${endIso}`;
  const url = new URL(`${base}/v2/alerts`);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", "100");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `GenieKey ${apiKey}` },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpsGenie alerts list failed: ${res.status} ${t}`);
  }
  const body = (await res.json()) as {
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

  return (body.data ?? []).map((a) => ({
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
