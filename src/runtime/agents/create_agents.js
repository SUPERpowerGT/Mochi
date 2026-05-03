const { ROOT_AGENT_INSTRUCTIONS } = require("../prompts/root_instructions");
const { REPO_GUIDE_INSTRUCTIONS } = require("../prompts/repo_guide_instructions");
const { CODING_AGENT_INSTRUCTIONS } = require("../prompts/coding_instructions");
const { PLAN_REVIEWER_INSTRUCTIONS } = require("../prompts/plan_reviewer_instructions");
const { REVIEW_AGENT_INSTRUCTIONS } = require("../prompts/review_instructions");
const { MEMORY_MAINTAINER_INSTRUCTIONS } = require("../prompts/memory_maintainer_instructions");
const { wrapToolsWithLifecycle } = require("../support/tool_lifecycle");
const { createSubagentTools } = require("../tools/subagent_tools");

const DEFAULT_MODEL = "gpt-4.1-mini";

function createAgents({
  sdk,
  zod,
  tools,
  model = process.env.OPENAI_MODEL || DEFAULT_MODEL,
  runSubAgent = null,
  getRunState = null,
  requestToolAccess = null,
}) {
  const { Agent } = sdk;
  const runtimeIdentity = buildRuntimeIdentity(model);
  const readOnlyTools = filterTools(tools, READ_ONLY_TOOL_NAMES);
  const reviewTools = filterTools(tools, REVIEW_TOOL_NAMES);

  const repoGuideAgent = new Agent({
    name: "Repo Guide",
    instructions: joinInstructions(REPO_GUIDE_INSTRUCTIONS, runtimeIdentity),
    model,
    tools: readOnlyTools,
  });

  const codingAgent = new Agent({
    name: "Coding Agent",
    instructions: joinInstructions(CODING_AGENT_INSTRUCTIONS, runtimeIdentity),
    model,
    tools,
  });

  const planReviewerAgent = new Agent({
    name: "Plan Reviewer",
    instructions: joinInstructions(PLAN_REVIEWER_INSTRUCTIONS, runtimeIdentity),
    model,
    tools: readOnlyTools,
  });

  const reviewAgent = new Agent({
    name: "Review Agent",
    instructions: joinInstructions(REVIEW_AGENT_INSTRUCTIONS, runtimeIdentity),
    model,
    tools: reviewTools,
  });

  const memoryMaintainerAgent = new Agent({
    name: "Memory Maintainer",
    instructions: joinInstructions(MEMORY_MAINTAINER_INSTRUCTIONS, runtimeIdentity),
    model,
    tools: [],
  });

  const subAgents = {
    repo_guide: repoGuideAgent,
    coding: codingAgent,
    plan_reviewer: planReviewerAgent,
    review: reviewAgent,
    memory_maintainer: memoryMaintainerAgent,
  };
  const subagentTools = zod
    ? wrapToolsWithLifecycle(
        createSubagentTools({
          sdk,
          zod,
          getSubAgents: () => subAgents,
          runSubAgent,
        }),
        {
          getRunState,
          requestToolAccess,
        }
      )
    : [];
  const rootTools = zod
    ? [
        ...tools,
        ...subagentTools,
      ]
    : tools;

  const rootConfig = {
    name: "Mochi",
    instructions: joinInstructions(ROOT_AGENT_INSTRUCTIONS, runtimeIdentity),
    model,
    tools: rootTools,
  };

  const rootAgent =
    typeof Agent.create === "function" ? Agent.create(rootConfig) : new Agent(rootConfig);

  return {
    rootAgent,
    repoGuideAgent,
    codingAgent,
    planReviewerAgent,
    reviewAgent,
    memoryMaintainerAgent,
    subAgents,
  };
}

const READ_ONLY_TOOL_NAMES = new Set([
  "get_workspace_root",
  "list_files",
  "read_file",
  "search_in_files",
  "get_editor_context",
  "git_status",
  "git_diff",
  "git_log",
  "git_blame",
]);

const REVIEW_TOOL_NAMES = new Set([
  ...READ_ONLY_TOOL_NAMES,
  "run_command",
]);

function filterTools(tools, allowedNames) {
  const items = Array.isArray(tools) ? tools : [];
  return items.filter((tool) => tool && allowedNames.has(tool.name));
}

function buildRuntimeIdentity(model) {
  const provider = process.env.MOCHI_MODEL_PROVIDER || inferProviderFromBaseUrl(process.env.OPENAI_BASE_URL);
  const providerLabel = provider || "openai-compatible";
  return [
    `Runtime provider: ${providerLabel}.`,
    `Runtime model: ${model}.`,
    "If the user asks what model or provider is being used, answer from this runtime configuration.",
    "Do not claim to be GPT-4, OpenAI, or Gemini unless that matches the runtime provider and model above.",
  ].join(" ");
}

function inferProviderFromBaseUrl(baseUrl) {
  if (!baseUrl) {
    return "";
  }
  if (baseUrl.includes("generativelanguage.googleapis.com")) {
    return "gemini";
  }
  if (baseUrl.includes("api.openai.com")) {
    return "openai";
  }
  return "openai-compatible";
}

function joinInstructions(...parts) {
  return parts.filter(Boolean).join(" ");
}

module.exports = {
  createAgents,
  DEFAULT_MODEL,
};
