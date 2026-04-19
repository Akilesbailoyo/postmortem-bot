# postmortem-bot

A Slack bot that auto-drafts incident post-mortems in under 5 minutes.

It gathers incident context from Slack, GitHub, and OpsGenie, then generates a structured draft with either:
- Anthropic (`ANTHROPIC_API_KEY` set), or
- a built-in fallback draft generator (no Anthropic key required).

## How it works (plain language)

1. Engineer runs `/postmortem #incident-channel`.
2. Bot collects:
   - Slack messages in the incident channel,
   - GitHub PRs linked in those messages,
   - OpsGenie alerts during the incident time window.
3. Bot drafts a post-mortem with exactly 7 sections:
   - Summary
   - Timeline
   - Root Cause
   - Contributing Factors
   - Impact
   - Action Items
   - What Went Well
4. Draft is posted for engineer review. The bot never auto-publishes final conclusions.

## Runtime modes (single shared workflow)

Both CLI demo and production Slack command use the same pipeline in `src/workflow.ts`.

- `MODE=mock`
  - Fully offline
  - Uses `src/mock/data.ts`
  - Ignores Slack/GitHub/OpsGenie credentials
  - Uses fallback draft if `ANTHROPIC_API_KEY` is missing
- `MODE=real`
  - Uses live APIs
  - Requires Slack credentials
  - Uses real channel input and enriches with GitHub/OpsGenie when configured

## Project structure

```text
postmortem-bot/
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
├── postmortem-bot.md
└── src/
    ├── workflow.ts         # shared runtime flow (mock + real)
    ├── context.ts          # builds context from mock or live sources
    ├── generate.ts         # Anthropic generation + fallback draft
    ├── demo.ts             # CLI demo runner
    ├── index.ts            # Slack slash-command server
    ├── types.ts            # shared data types
    ├── fetchers/
    │   ├── slack.ts
    │   ├── github.ts
    │   └── opsgenie.ts
    ├── mock/
    │   └── data.ts
    └── __tests__/
        └── workflow.test.ts
```

## Setup

### Prerequisites

- Node.js 18+
- npm 9+

Check:

```bash
node --version
npm --version
```

### Install

```bash
npm install
cp .env.example .env
```

## Running the demo

### Option A: Offline mock demo (recommended first run)

```bash
npm run demo:mock
```

What you get:
- a complete post-mortem draft (7 sections),
- source-gap notes if data is missing,
- and the raw context payload shown after the draft.

### Option B: Real API demo (no Slack app server needed)

```bash
npm run demo:real
```

You will be prompted for a Slack channel ID or `#channel-name`.

## Running production Slack bot

```bash
MODE=real npm start
```

Then expose your local server and configure Slack:

```bash
ngrok http 3000
```

Set Slack slash command Request URL to:

`https://<your-ngrok-or-host-url>/slack/events`

Required Slack scopes:
- `channels:history`
- `chat:write`
- `commands`
- `channels:read` (recommended for name-to-id resolution)

## Environment variables

### For `MODE=mock`
- none required
- optional: `ANTHROPIC_API_KEY` for live LLM output

### For `MODE=real`
- required:
  - `SLACK_BOT_TOKEN`
  - `SLACK_SIGNING_SECRET` (Slack server mode)
- optional but recommended:
  - `GITHUB_TOKEN`
  - `OPSGENIE_API_KEY`
  - `ANTHROPIC_API_KEY` (otherwise fallback draft is used)

## Tests

```bash
npm test
```

Current tests cover:
- runtime mode selection,
- mock mode behavior without credentials,
- real mode guardrails for required input/credentials.

## Run online with no registration (mock only)


1. Open the site.: https://codesandbox.io/p/sandbox/github/Akilesbailoyo/postmortem-bot/tree/main
2. Run.

This is best for quick mock demonstrations. Full production mode needs a host with HTTPS webhook support and environment variables.

## Common errors

| Error | Cause | Fix |
|---|---|---|
| `SLACK_BOT_TOKEN is not set` | Missing key in `.env` | Add `SLACK_BOT_TOKEN` |
| `Missing SLACK_SIGNING_SECRET or SLACK_BOT_TOKEN` | Production server started without required Slack creds | Set both vars for `MODE=real npm start` |
| `Slack API error: channel_not_found` | Wrong channel or bot cannot access it | Confirm channel and invite bot |
| `Slack API error: not_in_channel` | Bot is not in incident channel | Run `/invite @postmortem-bot` in channel |
| `GITHUB_TOKEN is not set` | Missing key | Add token or proceed without GitHub enrichment |
| `OPSGENIE_API_KEY is not set` | Missing key | Add key or proceed without alert enrichment |
| Anthropic auth error | Invalid/expired API key | Check Anthropic API key |
| Draft quality is generic in fallback mode | No Anthropic key set | Add `ANTHROPIC_API_KEY` for model-generated draft |
