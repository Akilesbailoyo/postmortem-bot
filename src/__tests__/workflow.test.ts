import test from "node:test";
import assert from "node:assert/strict";
import { resolveRuntimeMode, runPostmortemFlow } from "../workflow";

test("resolveRuntimeMode defaults to mock for undefined/invalid", () => {
  assert.equal(resolveRuntimeMode(undefined), "mock");
  assert.equal(resolveRuntimeMode("invalid"), "mock");
  assert.equal(resolveRuntimeMode("real"), "real");
});

test("mock mode generates a fallback draft without credentials", async () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;

  const result = await runPostmortemFlow({ mode: "mock" });
  assert.equal(result.usedFallback, true);
  assert.match(result.draft, /## Summary/);
  assert.ok(result.context.slackMessages.length > 0);

  if (prev) {
    process.env.ANTHROPIC_API_KEY = prev;
  }
});

test("real mode requires a channel input", async () => {
  await assert.rejects(
    async () => runPostmortemFlow({ mode: "real" }),
    /Channel input is required in real mode/
  );
});

test("real mode requires slack bot token", async () => {
  const prev = process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_BOT_TOKEN;

  await assert.rejects(
    async () => runPostmortemFlow({ mode: "real", channelInput: "#incident-test" }),
    /SLACK_BOT_TOKEN is not set/
  );

  if (prev) {
    process.env.SLACK_BOT_TOKEN = prev;
  }
});
