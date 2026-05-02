const { inferProviderFromBaseUrl } = require("../runtime/support/provider_context");
const { loadOpenAIEnvFile } = require("../runtime/support/openai_env");

const SECRET_API_KEY = "mochi.model.apiKey";

const CONFIG_SECTION = "mochi";
const DEFAULTS = {
  modelProvider: "openai",
  openaiBaseUrl: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  apiFormat: "chat_completions",
};

async function loadMochiModelConfig(vscode, context) {
  loadOpenAIEnvFile({ override: false });

  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const apiKey = await context.secrets.get(SECRET_API_KEY);
  const baseUrl = getConfiguredValue(config, "openaiBaseUrl", process.env.OPENAI_BASE_URL, DEFAULTS.openaiBaseUrl);
  const provider = getConfiguredValue(
    config,
    "modelProvider",
    process.env.MOCHI_MODEL_PROVIDER || inferProviderFromBaseUrl(baseUrl),
    DEFAULTS.modelProvider
  );

  return {
    modelProvider: provider,
    openaiBaseUrl: baseUrl,
    model: getConfiguredValue(config, "model", process.env.OPENAI_MODEL, DEFAULTS.model),
    apiFormat: getConfiguredValue(config, "apiFormat", process.env.OPENAI_API_FORMAT, DEFAULTS.apiFormat),
    apiKey: apiKey || getEnvironmentApiKey(provider),
  };
}

function getConfiguredValue(config, key, fallback, defaultValue) {
  const inspected = config.inspect(key);
  const configured =
    inspected &&
    (inspected.workspaceFolderValue ??
      inspected.workspaceValue ??
      inspected.globalValue ??
      inspected.globalLanguageValue ??
      inspected.workspaceLanguageValue ??
      inspected.workspaceFolderLanguageValue);

  return configured !== undefined && configured !== null && configured !== ""
    ? configured
    : fallback || defaultValue;
}

function getEnvironmentApiKey(provider) {
  if (provider === "gemini" && process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  if (provider === "openai" && process.env.MOCHI_OPENAI_API_KEY) {
    return process.env.MOCHI_OPENAI_API_KEY;
  }
  if (process.env.OPENAI_API_KEY) {
    return process.env.OPENAI_API_KEY;
  }
  return "";
}

function applyMochiModelConfig(config) {
  if (!config) {
    return;
  }

  const provider = String(config.modelProvider || DEFAULTS.modelProvider).trim();
  const baseUrl = String(config.openaiBaseUrl || DEFAULTS.openaiBaseUrl).trim();
  const model = String(config.model || DEFAULTS.model).trim();
  const apiFormat = String(config.apiFormat || DEFAULTS.apiFormat).trim();
  const apiKey = String(config.apiKey || "").trim();

  process.env.MOCHI_MODEL_PROVIDER = provider;
  process.env.OPENAI_BASE_URL = baseUrl;
  process.env.OPENAI_MODEL = model;
  process.env.OPENAI_API_FORMAT = apiFormat;

  if (apiKey) {
    process.env.OPENAI_API_KEY = apiKey;
    if (provider === "openai") {
      process.env.MOCHI_OPENAI_API_KEY = apiKey;
    }
    if (provider === "gemini") {
      process.env.GEMINI_API_KEY = apiKey;
    }
  }
}

function hasModelApiKey(config) {
  return Boolean(config && String(config.apiKey || "").trim());
}

async function configureMochiModelCredentials(vscode, context, currentConfig = null) {
  const existing = currentConfig || (await loadMochiModelConfig(vscode, context));
  const providerPick = await vscode.window.showQuickPick(
    [
      {
        label: "OpenAI",
        value: "openai",
        description: "Use api.openai.com with an sk- API key",
      },
      {
        label: "Gemini",
        value: "gemini",
        description: "Use Google AI Studio through an OpenAI-compatible endpoint",
      },
      {
        label: "OpenAI-compatible",
        value: "openai-compatible",
        description: "Use a custom OpenAI-compatible base URL",
      },
    ],
    {
      title: "Mochi Model Provider",
      placeHolder: "Choose the model provider Mochi should use",
    }
  );
  if (!providerPick) {
    return null;
  }

  const defaults = getProviderDefaults(providerPick.value, existing);
  const apiKey = await vscode.window.showInputBox({
    title: "Mochi API Key",
    prompt: "Paste the API key Mochi should use locally. It will be stored in VS Code Secret Storage.",
    password: true,
    ignoreFocusOut: true,
    placeHolder: defaults.keyPlaceholder,
    value: "",
  });
  if (!apiKey) {
    return null;
  }

  const baseUrl = await vscode.window.showInputBox({
    title: "Mochi Base URL",
    prompt: "OpenAI-compatible API base URL.",
    ignoreFocusOut: true,
    value: defaults.baseUrl,
  });
  if (!baseUrl) {
    return null;
  }

  const model = await vscode.window.showInputBox({
    title: "Mochi Model",
    prompt: "Default model Mochi should use.",
    ignoreFocusOut: true,
    value: defaults.model,
  });
  if (!model) {
    return null;
  }

  const apiFormatPick = await vscode.window.showQuickPick(
    [
      {
        label: "Chat Completions",
        value: "chat_completions",
        description: "Recommended for OpenAI-compatible endpoints",
      },
      {
        label: "Responses",
        value: "responses",
        description: "Use the OpenAI Responses API",
      },
    ],
    {
      title: "Mochi API Format",
      placeHolder: "Choose the API format",
    }
  );
  if (!apiFormatPick) {
    return null;
  }

  const config = {
    modelProvider: providerPick.value,
    openaiBaseUrl: baseUrl.trim(),
    model: model.trim(),
    apiFormat: apiFormatPick.value,
    apiKey: apiKey.trim(),
  };

  const workspaceConfig = vscode.workspace.getConfiguration(CONFIG_SECTION);
  await workspaceConfig.update("modelProvider", config.modelProvider, true);
  await workspaceConfig.update("openaiBaseUrl", config.openaiBaseUrl, true);
  await workspaceConfig.update("model", config.model, true);
  await workspaceConfig.update("apiFormat", config.apiFormat, true);
  await context.secrets.store(SECRET_API_KEY, config.apiKey);

  applyMochiModelConfig(config);
  return config;
}

function getProviderDefaults(provider, existing = {}) {
  if (provider === "gemini") {
    return {
      baseUrl:
        existing.modelProvider === "gemini" && existing.openaiBaseUrl
          ? existing.openaiBaseUrl
          : "https://generativelanguage.googleapis.com/v1beta/openai",
      model:
        existing.modelProvider === "gemini" && existing.model
          ? existing.model
          : "gemini-2.5-flash",
      keyPlaceholder: "AIza...",
    };
  }

  if (provider === "openai-compatible") {
    return {
      baseUrl:
        existing.modelProvider === "openai-compatible" && existing.openaiBaseUrl
          ? existing.openaiBaseUrl
          : existing.openaiBaseUrl || DEFAULTS.openaiBaseUrl,
      model:
        existing.modelProvider === "openai-compatible" && existing.model
          ? existing.model
          : existing.model || DEFAULTS.model,
      keyPlaceholder: "API key",
    };
  }

  return {
    baseUrl: DEFAULTS.openaiBaseUrl,
    model: existing.modelProvider === "openai" && existing.model ? existing.model : DEFAULTS.model,
    keyPlaceholder: "sk-...",
  };
}

module.exports = {
  applyMochiModelConfig,
  configureMochiModelCredentials,
  hasModelApiKey,
  loadMochiModelConfig,
};
