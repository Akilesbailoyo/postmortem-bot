import type { GitHubPrContext } from "../types";

const PR_URL =
  /https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/[^\s]*)?/gi;

export function extractPrUrlsFromText(text: string): {
  owner: string;
  repo: string;
  number: number;
  url: string;
}[] {
  const seen = new Set<string>();
  const out: { owner: string; repo: string; number: number; url: string }[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(PR_URL.source, PR_URL.flags);
  while ((m = re.exec(text)) !== null) {
    const owner = m[1];
    const repo = m[2];
    const number = parseInt(m[3], 10);
    const key = `${owner}/${repo}#${number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      owner,
      repo,
      number,
      url: `https://github.com/${owner}/${repo}/pull/${number}`,
    });
  }
  return out;
}

function parseLinkedIssues(body: string | null | undefined): number[] {
  if (!body) return [];
  const nums = new Set<number>();
  const fixes = body.matchAll(/(?:fix(?:es)?|close(?:s)?|resolve(?:s)?)\s+#(\d+)/gi);
  for (const x of fixes) nums.add(parseInt(x[1], 10));
  return [...nums];
}

export async function fetchPullRequestContext(
  token: string,
  owner: string,
  repo: string,
  number: number,
  url: string
): Promise<GitHubPrContext> {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const prRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`,
    { headers }
  );
  if (!prRes.ok) {
    throw new Error(`GitHub PR ${owner}/${repo}#${number}: ${prRes.status} ${prRes.statusText}`);
  }
  const pr = (await prRes.json()) as {
    title: string;
    body: string | null;
    merged_at: string | null;
    merged_by?: { login?: string };
  };

  const filesRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`,
    { headers }
  );
  const filesJson = filesRes.ok ? ((await filesRes.json()) as { filename: string }[]) : [];
  const filesChanged = filesJson.map((f) => f.filename);

  return {
    url,
    owner,
    repo,
    number,
    title: pr.title,
    mergedBy: pr.merged_by?.login,
    mergedAt: pr.merged_at ?? undefined,
    body: pr.body ?? undefined,
    filesChanged,
    linkedIssueNumbers: parseLinkedIssues(pr.body),
  };
}

export async function fetchAllLinkedPrs(
  token: string,
  combinedMessageText: string
): Promise<GitHubPrContext[]> {
  const refs = extractPrUrlsFromText(combinedMessageText);
  const results: GitHubPrContext[] = [];
  for (const r of refs) {
    results.push(await fetchPullRequestContext(token, r.owner, r.repo, r.number, r.url));
  }
  return results;
}
