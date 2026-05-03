const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sleep,
  parseRetryAfterMs,
  isRateLimitError,
  withLightRetry,
} = require("../../src/runtime/support/retry_utils");

test("sleep resolves after at least the given delay", async () => {
  const start = Date.now();
  await sleep(20);
  assert.ok(Date.now() - start >= 18);
});

test("parseRetryAfterMs extracts seconds from error message", () => {
  const err = new Error("Rate limit hit. Please try again in 2.5s.");
  assert.equal(parseRetryAfterMs(err), 2500);
});

test("parseRetryAfterMs returns 0 when no match", () => {
  assert.equal(parseRetryAfterMs(new Error("generic failure")), 0);
  assert.equal(parseRetryAfterMs(null), 0);
  assert.equal(parseRetryAfterMs(""), 0);
});

test("parseRetryAfterMs handles integer seconds", () => {
  const err = new Error("Please try again in 3s");
  assert.equal(parseRetryAfterMs(err), 3000);
});

test("isRateLimitError detects 429 and textual hints", () => {
  assert.equal(isRateLimitError(new Error("HTTP 429 Too Many")), true);
  assert.equal(isRateLimitError(new Error("rate limit exceeded")), true);
  assert.equal(isRateLimitError(new Error("oops something else")), false);
  assert.equal(isRateLimitError(null), false);
});

test("withLightRetry returns immediately on success", async () => {
  let calls = 0;
  const result = await withLightRetry(async () => {
    calls += 1;
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(calls, 1);
});

test("withLightRetry does not retry non-rate-limit errors", async () => {
  let calls = 0;
  await assert.rejects(
    withLightRetry(async () => {
      calls += 1;
      throw new Error("plain failure");
    }),
    /plain failure/
  );
  assert.equal(calls, 1);
});

test("withLightRetry retries rate-limit errors up to maxAttempts", async () => {
  let calls = 0;
  const result = await withLightRetry(
    async () => {
      calls += 1;
      if (calls < 2) {
        throw new Error("HTTP 429 Please try again in 0.01s");
      }
      return "second-try";
    },
    { maxAttempts: 2 }
  );
  assert.equal(result, "second-try");
  assert.equal(calls, 2);
});
