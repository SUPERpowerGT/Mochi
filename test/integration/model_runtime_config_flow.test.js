const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

function clearModules() {
  for (const modulePath of [
    "../../src/extension/model_config",
    "../../src/runtime/support/openai_env",
    "../../src/runtime/support/provider_context",
  ]) {
    delete require.cache[require.resolve(modulePath)];
  }
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

test("integration: local env config flows into runtime provider context", async () => {
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-integration-config-"));
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

  clearModules();
  const { applyMochiModelConfig, loadMochiModelConfig } = require("../../src/extension/model_config");
  const { getProviderContext } = require("../../src/runtime/support/provider_context");

  const loadedConfig = await loadMochiModelConfig(createFakeVscode(), {
    secrets: { get: async () => "" },
  });
  applyMochiModelConfig(loadedConfig);
  const providerContext = getProviderContext();

  assert.equal(loadedConfig.apiKey, "provider-gemini-key");
  assert.equal(providerContext.provider, "gemini");
  assert.equal(providerContext.model, "gemini-2.5-flash");
  assert.equal(providerContext.baseURL, "https://generativelanguage.googleapis.com/v1beta/openai");
  assert.equal(providerContext.apiFormat, "chat_completions");
  assert.equal(providerContext.activeKeyKind, "unknown");

  process.env.HOME = previousHome;
  process.env.USERPROFILE = previousUserProfile;
});

test("integration: VS Code settings override env before runtime provider context is built", async () => {
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-integration-config-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  clearProviderEnv();
  fs.writeFileSync(
    path.join(home, ".openai-env"),
    [
      'export MOCHI_MODEL_PROVIDER="openai"',
      'export OPENAI_API_KEY="env-openai-key"',
      'export OPENAI_BASE_URL="https://api.openai.com/v1"',
      'export OPENAI_MODEL="gpt-4.1-mini"',
      'export OPENAI_API_FORMAT="chat_completions"',
      "",
    ].join("\n")
  );

  clearModules();
  const { applyMochiModelConfig, loadMochiModelConfig } = require("../../src/extension/model_config");
  const { getProviderContext } = require("../../src/runtime/support/provider_context");

  const loadedConfig = await loadMochiModelConfig(
    createFakeVscode({
      modelProvider: "openai-compatible",
      openaiBaseUrl: "https://models.example.test/v1",
      model: "repo-local-model",
      apiFormat: "responses",
    }),
    {
      secrets: { get: async () => "secret-runtime-key" },
    }
  );
  applyMochiModelConfig(loadedConfig);
  const providerContext = getProviderContext();

  assert.equal(process.env.OPENAI_API_KEY, "secret-runtime-key");
  assert.equal(providerContext.provider, "openai-compatible");
  assert.equal(providerContext.model, "repo-local-model");
  assert.equal(providerContext.baseURL, "https://models.example.test/v1");
  assert.equal(providerContext.apiFormat, "responses");

  process.env.HOME = previousHome;
  process.env.USERPROFILE = previousUserProfile;
});
