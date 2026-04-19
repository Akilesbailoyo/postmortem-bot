// src/fetchers/github.ts
// ─────────────────────────────────────────────────────────────────────────────
// Finds GitHub pull request links in the Slack thread and fetches their details.
//
// What it does:
//   extractPrUrlsFromText() → scans text for github.com/.../pull/N URLs
//   fetchPullRequestContext() → fetches one PR's metadata + changed files
//   fetchAllLinkedPrs()       → combines both steps for all PRs in the thread
//
// Steps in detail:
//   1. Scan every Slack message for github.com/org/repo/pull/N links (regex)
//   2. For each unique PR found, call the GitHub REST API to get:
//      - PR title, author, merge time
//      - List of files changed in the PR
//      - Issue numbers referenced in the PR body (e.g. "Fixes #387")
//
// Why this matters: most incidents correlate with a recent deployment.
// The PR tells us what changed and when.
//
// Requires: GITHUB_TOKEN in .env
// Required token scopes: repo (read-only is sufficient)
// ─────────────────────────────────────────────────────────────────────────────

import type { GitHubPrContext } from "../types";

// Matches URLs like: https://github.com/org/repo/pull/42
const PR_URL_PATTERN =
  /https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/[^\s]*)?/gi;

// ── URL extraction ────────────────────────────────────────────────────────────

/**
 * Scans a block of text for GitHub PR URLs and returns unique results.
 * Used to scan the combined text of all Slack messages in the incident thread.
 */
export function extractPrUrlsFromText(text: string): Array<{
  owner: string;
  repo: string;
  number: number;
  url: string;
}> {
  const seen = new Set<string>();
  const results: Array<{ owner: string; repo: string; number: number; url: string }> = [];
  const re = new RegExp(PR_URL_PATTERN.source, PR_URL_PATTERN.flags);
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const owner = match[1];
    const repo  = match[2];
    const number = parseInt(match[3], 10);
    const key = `${owner}/${repo}#${number}`;

    if (seen.has(key)) continue; // skip duplicates
    seen.add(key);
    results.push({ owner, repo, number, url: `https://github.com/${owner}/${repo}/pull/${number}` });
  }
  return results;
}

// ── Issue reference parser ────────────────────────────────────────────────────

/**
 * Extracts issue numbers from a PR body.
 * Looks for patterns like "Fixes #123", "Closes #456", "Resolves #789".
 */
function parseLinkedIssues(body: string | null | undefined): number[] {
  if (!body) return [];
  const nums = new Set<number>();
  for (const match of body.matchAll(/(?:fix(?:es)?|close(?:s)?|resolve(?:s)?)\s+#(\d+)/gi)) {
    nums.add(parseInt(match[1], 10));
  }
  return [...nums];
}

// ── GitHub API fetch ──────────────────────────────────────────────────────────

/**
 * Fetches metadata for a single GitHub PR using the GitHub REST API.
 * Makes two requests:
 *   1. GET /repos/{owner}/{repo}/pulls/{number}          → PR details
 *   2. GET /repos/{owner}/{repo}/pulls/{number}/files    → changed files
 */
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

  // Request 1: PR metadata
  const prRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${number}`,
    { headers }
  );
  if (!prRes.ok) {
    throw new Error(`GitHub API error for ${owner}/${repo}#${number}: ${prRes.status} ${prRes.statusText}`);
  }
  const pr = (await prRes.json()) as {
    title: string;
    body: string | null;
    merged_at: string | null;
    merged_by?: { login?: string };
  };

  // Request 2: files changed in this PR
  const filesRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`,
    { headers }
  );
  const filesJson = filesRes.ok
    ? ((await filesRes.json()) as { filename: string }[])
    : [];

  return {
    url,
    owner,
    repo,
    number,
    title: pr.title,
    mergedBy: pr.merged_by?.login,
    mergedAt: pr.merged_at ?? undefined,
    body: pr.body ?? undefined,
    filesChanged: filesJson.map((f) => f.filename),
    linkedIssueNumbers: parseLinkedIssues(pr.body),
  };
}

// ── Fetch all linked PRs ──────────────────────────────────────────────────────

/**
 * Scans the combined Slack message text for PR links, then fetches each one.
 * Returns an empty array if no GitHub links are found or if GITHUB_TOKEN is missing.
 */
export async function fetchAllLinkedPrs(
  token: string,
  combinedMessageText: string
): Promise<GitHubPrContext[]> {
  const refs = extractPrUrlsFromText(combinedMessageText);
  const results: GitHubPrContext[] = [];

  for (const ref of refs) {
    results.push(
      await fetchPullRequestContext(token, ref.owner, ref.repo, ref.number, ref.url)
    );
  }
  return results;
}