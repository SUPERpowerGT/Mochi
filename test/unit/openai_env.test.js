const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("loadOpenAIEnvFile loads exported keys into process.env", () => {
  // Point HOME to a temp dir so the module picks up our fake ~/.openai-env
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-env-"));
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  process.env.HOME = tmp;
  process.env.USERPROFILE = tmp;

  try {
    fs.writeFileSync(
      path.join(tmp, ".openai-env"),
      [
        "# a comment",
        'export OPENAI_API_KEY="sk-fake-123"',
        "export OPENAI_MODEL='gpt-fake'",
        "export OPENAI_BASE_URL=https://api.example.com/v1",
      ].join("\n"),
      "utf8"
    );

    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_BASE_URL;

    // Require fresh to pick up new HOME
    delete require.cache[require.resolve("../../src/runtime/support/openai_env")];
    const { loadOpenAIEnvFile } = require("../../src/runtime/support/openai_env");
    loadOpenAIEnvFile();

    assert.equal(process.env.OPENAI_API_KEY, "sk-fake-123");
    assert.equal(process.env.OPENAI_MODEL, "gpt-fake");
    assert.equal(process.env.OPENAI_BASE_URL, "https://api.example.com/v1");
  } finally {
    if (originalHome !== undefined) process.env.HOME = originalHome;
    else delete process.env.HOME;
    if (originalUserProfile !== undefined) process.env.USERPROFILE = originalUserProfile;
    else delete process.env.USERPROFILE;
    fs.rmSync(tmp, { recursive: true, force: true });
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.OPENAI_BASE_URL;
    delete require.cache[require.resolve("../../src/runtime/support/openai_env")];
  }
});

test("loadOpenAIEnvFile is a no-op when file is missing", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-env-missing-"));
  const originalHome = process.env.HOME;
  process.env.HOME = tmp;

  try {
    delete require.cache[require.resolve("../../src/runtime/support/openai_env")];
    const { loadOpenAIEnvFile } = require("../../src/runtime/support/openai_env");
    assert.doesNotThrow(() => loadOpenAIEnvFile());
  } finally {
    if (originalHome !== undefined) process.env.HOME = originalHome;
    else delete process.env.HOME;
    fs.rmSync(tmp, { recursive: true, force: true });
    delete require.cache[require.resolve("../../src/runtime/support/openai_env")];
  }
});

test("loadOpenAIEnvFile does not overwrite already-set env vars", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-env-existing-"));
  const originalHome = process.env.HOME;
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.HOME = tmp;
  process.env.OPENAI_API_KEY = "sk-original";

  try {
    fs.writeFileSync(
      path.join(tmp, ".openai-env"),
      'export OPENAI_API_KEY="sk-from-file"',
      "utf8"
    );
    delete require.cache[require.resolve("../../src/runtime/support/openai_env")];
    const { loadOpenAIEnvFile } = require("../../src/runtime/support/openai_env");
    loadOpenAIEnvFile();
    assert.equal(process.env.OPENAI_API_KEY, "sk-original");
  } finally {
    if (originalHome !== undefined) process.env.HOME = originalHome;
    else delete process.env.HOME;
    if (originalKey !== undefined) process.env.OPENAI_API_KEY = originalKey;
    else delete process.env.OPENAI_API_KEY;
    fs.rmSync(tmp, { recursive: true, force: true });
    delete require.cache[require.resolve("../../src/runtime/support/openai_env")];
  }
});
