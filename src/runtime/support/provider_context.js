function getProviderContext(env = process.env) {
  const baseURL = env.OPENAI_BASE_URL || "";
  const provider = env.MOCHI_MODEL_PROVIDER || inferProviderFromBaseUrl(baseURL);
  const model = env.OPENAI_MODEL || "";
  const apiFormat = env.OPENAI_API_FORMAT || "chat_completions";
  const activeKey = env.OPENAI_API_KEY || "";

  return {
    provider,
    model,
    baseURL,
    apiFormat,
    activeKeyKind: classifyKey(activeKey),
    tracingDisabledRecommended: provider !== "openai",
    rateLimitSensitive: isRateLimitSensitive(provider, model),
    lowerCostModelSuggestion: getLowerCostModelSuggestion(provider, model),
  };
}

function inferProviderFromBaseUrl(baseUrl) {
  if (!baseUrl) {
    return "openai";
  }
  if (baseUrl.includes("generativelanguage.googleapis.com")) {
    return "gemini";
  }
  if (baseUrl.includes("api.openai.com")) {
    return "openai";
  }
  return "openai-compatible";
}

function classifyKey(key) {
  if (!key) {
    return "missing";
  }
  if (key.startsWith("sk-")) {
    return "openai";
  }
  if (key.startsWith("AIza")) {
    return "gemini";
  }
  return "unknown";
}

function isRateLimitSensitive(provider, model) {
  const value = `${provider || ""} ${model || ""}`.toLowerCase();
  return (
    value.includes("pro") ||
    value.includes("gpt-4.1 ") ||
    value.includes("gpt-4.1\"") ||
    value.endsWith("gpt-4.1")
  );
}

function getLowerCostModelSuggestion(provider, model) {
  const normalizedProvider = String(provider || "").toLowerCase();
  const normalizedModel = String(model || "").toLowerCase();

  if (normalizedProvider === "gemini" && normalizedModel !== "gemini-2.5-flash") {
    return "gemini-2.5-flash";
  }

  if (normalizedProvider === "openai" && normalizedModel !== "gpt-4.1-mini") {
    return "gpt-4.1-mini";
  }

  return "";
}

function buildProviderErrorDiagnostic(error, providerContext = {}) {
  const message = error && error.message ? error.message : String(error || "");
  const status = extractStatusCode(error, message);
  const kind = classifyProviderErrorKind(status, message);
  const suggestion = buildProviderSuggestion(kind, message, providerContext);

  return {
    kind,
    status,
    provider: providerContext.provider || "",
    model: providerContext.model || "",
    baseURL: providerContext.baseURL || "",
    apiFormat: providerContext.apiFormat || "",
    activeKeyKind: providerContext.activeKeyKind || "",
    lowerCostModelSuggestion: providerContext.lowerCostModelSuggestion || "",
    suggestion,
  };
}

function formatProviderErrorMessage(error, providerContext = {}) {
  const original = error && error.message ? error.message : String(error || "");
  const diagnostic = buildProviderErrorDiagnostic(error, providerContext);
  const details = [
    original,
    "",
    `Provider: ${diagnostic.provider || "unknown"}`,
    `Model: ${diagnostic.model || "unknown"}`,
  ];

  if (diagnostic.suggestion) {
    details.push(`Suggestion: ${diagnostic.suggestion}`);
  }

  return details.join("\n");
}

function extractStatusCode(error, message) {
  if (error && Number.isFinite(Number(error.status))) {
    return Number(error.status);
  }
  if (error && Number.isFinite(Number(error.statusCode))) {
    return Number(error.statusCode);
  }

  const match = String(message || "").match(/\b([45][0-9]{2})\b/);
  return match ? Number(match[1]) : 0;
}

function classifyProviderErrorKind(status, message) {
  const text = String(message || "").toLowerCase();

  if (status === 429 || text.includes("rate limit") || text.includes("quota")) {
    return "rate_limit";
  }

  if (status === 401 || text.includes("incorrect api key") || text.includes("api key")) {
    return "auth";
  }

  if (status === 404 || text.includes("model") || text.includes("not found")) {
    return "model_or_endpoint";
  }

  return "unknown";
}

function buildProviderSuggestion(kind, message, providerContext) {
  const text = String(message || "").toLowerCase();
  const provider = providerContext.provider || "";
  const activeKeyKind = providerContext.activeKeyKind || "";
  const lowerCostModel = providerContext.lowerCostModelSuggestion || "";

  if (kind === "rate_limit") {
    if (lowerCostModel) {
      return `Rate limit or quota pressure detected. Try switching this provider to ${lowerCostModel}, then rerun the task.`;
    }
    return "Rate limit or quota pressure detected. Wait briefly, reduce concurrent/subagent work, or switch to a lower-cost model.";
  }

  if (kind === "auth") {
    if (text.includes("platform.openai.com") && provider === "gemini") {
      return "The request appears to have reached OpenAI with a Gemini key. Restart the Extension Development Host or rerun setup_model.sh to refresh the active base URL.";
    }
    if (provider === "openai" && activeKeyKind === "gemini") {
      return "The active key looks like a Gemini key while the provider is OpenAI. Rerun setup_model.sh and choose OpenAI with an sk- key.";
    }
    if (provider === "gemini" && activeKeyKind === "openai") {
      return "The active key looks like an OpenAI key while the provider is Gemini. Rerun setup_model.sh and choose Gemini with a Google AI Studio key.";
    }
    return "Authentication failed. Rerun setup_model.sh for the selected provider and verify the saved API key.";
  }

  if (kind === "model_or_endpoint") {
    return "Model or endpoint mismatch detected. Rerun setup_model.sh and choose a known model for the selected provider.";
  }

  return "";
}

module.exports = {
  getProviderContext,
  buildProviderErrorDiagnostic,
  formatProviderErrorMessage,
  inferProviderFromBaseUrl,
};
