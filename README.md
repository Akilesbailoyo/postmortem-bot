# postmortem-bot

A Slack bot that auto-drafts incident post-mortems in under 5 minutes.

It reads the incident Slack thread, finds linked GitHub PRs, queries OpsGenie for alerts, and calls Claude to produce a structured 7-section draft. The engineer reviews and publishes. The bot never publishes automatically.

---

## Live demo (no account, no install)

Open this link in your browser → press **Run** → see a rendered post-mortem in the preview panel:

**[codesandbox.io/p/sandbox/github/Akilesbailoyo/postmortem-bot/tree/main](https://codesandbox.io/p/sandbox/github/Akilesbailoyo/postmortem-bot/tree/main)**

No API keys needed. Runs in mock mode using the hardcoded incident in `src/mock/data.ts`.

---

## How it works

```
ENGINEER types: /postmortem #incident-polygon-0703
      │
      ▼
BOT extracts the channel name from the command
      │
      ▼
BOT fetches three things IN PARALLEL:
      │
      ├── [1] SLACK — reads every message in the incident channel
      │         Why: the thread is the raw incident narrative
      │         How: Slack conversations.history API (paginated — gets everything)
      │
      ├── [2] GITHUB — scans messages for github.com/pull/ links,
      │         then fetches: PR title, who merged it, when, files changed
      │         Why: most incidents correlate with a recent deployment
      │         How: GitHub REST API /repos/{owner}/{repo}/pulls/{number}
      │
      └── [3] OPSGENIE — queries for alerts in the incident time window
                (derived from the first and last Slack message timestamps)
                Why: the alert is the system's own record of what broke and when
                How: OpsGenie /v2/alerts API with a time-range query
      │
      ▼
BOT checks for gaps:
  → Slack thread empty?  → asks engineer to confirm the channel name
  → GitHub missing?      → proceeds and notes the gap in the draft
  → OpsGenie missing?    → proceeds and notes the gap in the draft
      │
      ▼
BOT calls Claude with all collected data and a structured prompt:
  - use only the provided data, do not invent facts
  - do not name individuals as causes — focus on systems and processes
  - output exactly 7 sections
      │
      ▼
CLAUDE returns a structured draft (or fallback generator if no API key)
      │
      ▼
BOT posts the draft to the incident channel for engineer review.
The bot never publishes automatically. Human judgment is always the final step.
```

---

## Project structure

```
postmortem-bot/
├── .env.example                 ← copy to .env and fill in your keys
├── package.json
├── tsconfig.json
└── src/
    ├── types.ts                 ← shared data shapes (the "forms" the bot fills in)
    ├── workflow.ts              ← single shared pipeline (demo + Slack bot both use this)
    ├── context.ts               ← builds context from mock data or live APIs
    ├── generate.ts              ← Claude API call + fallback draft generator
    ├── server.ts                ← web server for CodeSandbox (npm start)
    ├── demo.ts                  ← terminal CLI demo
    ├── index.ts                 ← production Slack bot (⚠ in progress — needs Slack app)
    ├── fetchers/
    │   ├── slack.ts             ← reads the Slack incident thread (real API)
    │   ├── github.ts            ← fetches linked GitHub PRs (real API)
    │   └── opsgenie.ts          ← queries OpsGenie alerts in the incident window (real API)
    ├── mock/
    │   └── data.ts              ← hardcoded realistic incident (used when MODE=mock)
    └── __tests__/
        └── workflow.test.ts     ← tests covering the core pipeline
```

---

## Setup (from scratch on a new Mac)

Open Terminal (`Cmd+Space` → type `Terminal` → Enter):

```bash
# 1. Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# After it finishes, run the two PATH commands it prints. They look like:
#   (echo; echo 'eval "$(/opt/homebrew/bin/brew shellenv)"') >> ~/.zprofile
#   eval "$(/opt/homebrew/bin/brew shellenv)"

# 2. Install Node.js (includes npm)
brew install node

# 3. Verify
node --version    # v18 or higher
npm --version     # 9 or higher

# 4. Install TypeScript runner
npm install -g ts-node typescript
```

Then:

```bash
git clone https://github.com/Akilesbailoyo/postmortem-bot.git
cd postmortem-bot
npm install
cp .env.example .env
```

---

## Running

### Web demo (default — what CodeSandbox runs)

```bash
npm start
```

Starts a local web server on port 3000. Open [http://localhost:3000](http://localhost:3000) to see the rendered post-mortem. Uses mock data — no keys needed.

### Terminal demo

```bash
npm run demo:mock    # offline, no credentials
npm run demo:real    # live Slack/GitHub/OpsGenie APIs (keys required in .env)
```

### Tests

```bash
npm test
```

### Production Slack bot

⚠ Requires a registered Slack app and HTTPS webhook. See `src/index.ts` for full setup instructions.

```bash
MODE=real npm run start:prod
```

---

## Environment variables

Copy `.env.example` to `.env` and fill in the values you need.

| Variable | Required for | Where to get it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Better draft quality | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `SLACK_BOT_TOKEN` | Real mode | [api.slack.com/apps](https://api.slack.com/apps) → your app → OAuth tokens |
| `SLACK_SIGNING_SECRET` | Production Slack bot | Same app → Basic Information |
| `GITHUB_TOKEN` | GitHub PR enrichment | GitHub → Settings → Developer settings → Personal access tokens |
| `OPSGENIE_API_KEY` | OpsGenie alert enrichment | OpsGenie → Settings → API Key Management |

Without any keys: runs in mock mode with the fallback draft generator. Useful for demos and development.

---

## Common errors

| Error | Cause | Fix |
|---|---|---|
| `SLACK_BOT_TOKEN is not set` | Missing key in `.env` | Add the token or use `npm run demo:mock` |
| `Slack API error: channel_not_found` | Bot not in the channel | Run `/invite @postmortem-bot` in the incident channel |
| `Slack API error: not_in_channel` | Same as above | Same fix |
| `GITHUB_TOKEN is not set` | Missing key | Add token or proceed — GitHub enrichment is optional |
| `OPSGENIE_API_KEY is not set` | Missing key | Add key or proceed — OpsGenie is optional |
| Anthropic auth error | Wrong or expired key | Check [console.anthropic.com](https://console.anthropic.com) |
| Draft cuts off mid-sentence | Token limit reached | Increase `max_tokens` in `src/generate.ts` from 2000 to 3000 |
| Draft quality is generic | No `ANTHROPIC_API_KEY` set | Add the key for Claude-powered output |