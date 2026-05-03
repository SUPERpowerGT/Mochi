const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

function clearConfigModules() {
  for (const modulePath of [
    "../src/extension/model_config",
    "../src/runtime/support/openai_env",
    "../src/runtime/support/provider_context",
  ]) {
    delete require.cache[require.resolve(modulePath)];
  }
}

function createFakeVscode(settings = {}) {
  return {
    workspace: {
      getConfiguration() {
        return {
          inspect(key) {
            return Object.prototype.hasOwnProperty.call(settings, key)
              ? { globalValue: settings[key] }
              : {};
          },
          get(key, fallback) {
            return Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback;
          },
        };
      },
    },
  };
}

function clearProviderEnv() {
  for (const key of [
    "MOCHI_MODEL_PROVIDER",
    "OPENAI_API_KEY",
    "MOCHI_OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_MODEL",
    "OPENAI_API_FORMAT",
  ]) {
    delete process.env[key];
  }
}

test("loadMochiModelConfig falls back to ~/.openai-env when Secret Storage has no key", async () => {
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-config-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  clearProviderEnv();
  fs.writeFileSync(
    path.join(home, ".openai-env"),
    [
      'export MOCHI_MODEL_PROVIDER="gemini"',
      'export OPENAI_API_KEY="active-gemini-key"',
      'export GEMINI_API_KEY="provider-gemini-key"',
      'export OPENAI_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai"',
      'export OPENAI_MODEL="gemini-2.5-flash"',
      'export OPENAI_API_FORMAT="chat_completions"',
      "",
    ].join("\n")
  );

  clearConfigModules();
  const { hasModelApiKey, loadMochiModelConfig } = require("../src/extension/model_config");
  const config = await loadMochiModelConfig(createFakeVscode(), {
    secrets: { get: async () => "" },
  });

  assert.equal(config.modelProvider, "gemini");
  assert.equal(config.openaiBaseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
  assert.equal(config.model, "gemini-2.5-flash");
  assert.equal(config.apiFormat, "chat_completions");
  assert.equal(config.apiKey, "provider-gemini-key");
  assert.equal(hasModelApiKey(config), true);

  process.env.HOME = previousHome;
  process.env.USERPROFILE = previousUserProfile;
});

test("loadMochiModelConfig keeps Secret Storage above environment fallback", async () => {
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-config-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  clearProviderEnv();
  fs.writeFileSync(
    path.join(home, ".openai-env"),
    [
      'export MOCHI_MODEL_PROVIDER="openai"',
      'export OPENAI_API_KEY="env-key"',
      'export MOCHI_OPENAI_API_KEY="provider-openai-key"',
      "",
    ].join("\n")
  );

  clearConfigModules();
  const { loadMochiModelConfig } = require("../src/extension/model_config");
  const config = await loadMochiModelConfig(createFakeVscode(), {
    secrets: { get: async () => "secret-key" },
  });

  assert.equal(config.modelProvider, "openai");
  assert.equal(config.apiKey, "secret-key");

  process.env.HOME = previousHome;
  process.env.USERPROFILE = previousUserProfile;
});

test("loadMochiModelConfig lets VS Code settings override non-sensitive environment values", async () => {
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-config-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  clearProviderEnv();
  fs.writeFileSync(
    path.join(home, ".openai-env"),
    [
      'export MOCHI_MODEL_PROVIDER="openai"',
      'export OPENAI_API_KEY="env-key"',
      'export OPENAI_BASE_URL="https://api.openai.com/v1"',
      'export OPENAI_MODEL="gpt-4.1-mini"',
      'export OPENAI_API_FORMAT="chat_completions"',
      "",
    ].join("\n")
  );

  clearConfigModules();
  const { loadMochiModelConfig } = require("../src/extension/model_config");
  const config = await loadMochiModelConfig(
    createFakeVscode({
      modelProvider: "openai-compatible",
      openaiBaseUrl: "https://example.test/v1",
      model: "custom-model",
      apiFormat: "responses",
    }),
    {
      secrets: { get: async () => "" },
    }
  );

  assert.equal(config.modelProvider, "openai-compatible");
  assert.equal(config.openaiBaseUrl, "https://example.test/v1");
  assert.equal(config.model, "custom-model");
  assert.equal(config.apiFormat, "responses");
  assert.equal(config.apiKey, "env-key");

  process.env.HOME = previousHome;
  process.env.USERPROFILE = previousUserProfile;
});

test("applyMochiModelConfig writes provider environment consumed by runtime", () => {
  clearProviderEnv();
  clearConfigModules();
  const { applyMochiModelConfig } = require("../src/extension/model_config");

  applyMochiModelConfig({
    modelProvider: "gemini",
    openaiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
    apiFormat: "chat_completions",
    apiKey: "gemini-key",
  });

  assert.equal(process.env.MOCHI_MODEL_PROVIDER, "gemini");
  assert.equal(process.env.OPENAI_BASE_URL, "https://generativelanguage.googleapis.com/v1beta/openai");
  assert.equal(process.env.OPENAI_MODEL, "gemini-2.5-flash");
  assert.equal(process.env.OPENAI_API_FORMAT, "chat_completions");
  assert.equal(process.env.OPENAI_API_KEY, "gemini-key");
  assert.equal(process.env.GEMINI_API_KEY, "gemini-key");
});
