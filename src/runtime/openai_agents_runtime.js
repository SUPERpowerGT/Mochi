const { AsyncLocalStorage } = require("async_hooks");
const { createAgents } = require("./agents/create_agents");
const { MemoryManager } = require("./memory/memory_manager");
const { loadOpenAIEnvFile } = require("./support/openai_env");
const { withLightRetry } = require("./support/retry_utils");
const { looksLikeClarification } = require("./support/clarification_gate");
const {
  buildRunInput,
  DEFAULT_CONTEXT_BUDGET,
  slimHistoryForStorage,
} = require("./support/run_input_builder");
const {
  createRunTrace,
  finalizeRunTrace,
  recordSubagentRun,
  recordApprovalRequested,
  recordApprovalResolved,
  recordClarificationClear,
} = require("./support/run_trace_recorder");
const {
  buildDelegationGuidance,
  classifyDelegation,
} = require("./support/delegation_policy");
const { selectSubagentMemory } = require("./support/memory_selector");
const {
  selectSkillsForRoot,
  selectSkillsForSubagent,
} = require("./support/skill_selector");
const {
  formatProviderErrorMessage,
  getProviderContext,
} = require("./support/provider_context");
const {
  extractTextDelta,
  mapStreamEventToActivity,
} = require("./support/stream_event_mapper");
const { createRuntimeTools } = require("./tools");

class OpenAIAgentsRuntime {
  constructor(options = {}) {
    this.getWorkspaceRoot = options.getWorkspaceRoot || (() => "");
    this.getEditorContext = options.getEditorContext || (() => "");
    this.requestApproval = options.requestApproval || null;
    this.onActivity = options.onActivity || null;
    this.onTextDelta = options.onTextDelta || null;
    this.onReplyControl = options.onReplyControl || null;
    this.contextBudget = {
      ...DEFAULT_CONTEXT_BUDGET,
      ...(options.contextBudget || {}),
    };
    this.sdk = null;
    this.zod = null;
    this.modelProvider = null;
    this.runnerConfig = null;
    this.providerContext = null;
    this.providerSignature = "";
    this.agents = null;
    this.runStateStorage = new AsyncLocalStorage();
    this.activeToolRunId = "";
    this.currentRunState = {
      id: "",
      prompt: "",
      baseSessionId: "",
      trace: null,
      streamedText: "",
      clearedClarificationDraft: false,
    };
    this.memoryManager =
      options.memoryManager ||
      new MemoryManager({
        storageRoot: options.memoryStorageRoot,
        getWorkspaceRoot: this.getWorkspaceRoot,
        baseSessionId: options.baseSessionId,
      });
  }

  async sendMessage(prompt, options = {}) {
    const sdk = await this.getSdk();
    const rootAgent = await this.getRootAgent();
    const runState = {
      id: `run:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      prompt,
      baseSessionId: options.baseSessionId || this.getBaseSessionId(),
      trace: createRunTrace(prompt, this.providerContext),
      streamedText: "",
      clearedClarificationDraft: false,
    };

    return this.runStateStorage.run(runState, async () => {
      this.currentRunState = runState;
      return this.runMessageWithState({ sdk, rootAgent, prompt, options, runState });
    });
  }

  async runMessageWithState({ sdk, rootAgent, prompt, options, runState }) {
    this.emitActivity({
      kind: "status",
      text: "Preparing run context...",
    });
    const memoryState = await this.memoryManager.prepareRun(prompt, {
      baseSessionId: runState.baseSessionId,
    });
    runState.memoryState = {
      memorySlices: memoryState.memorySlices || {},
      projectInstructionsText: memoryState.projectInstructionsText || "",
    };
    runState.rootSkills = selectSkillsForRoot({
      prompt,
      workspaceRoot: this.getWorkspaceRoot(),
    });
    try {
      const input = buildRunInput({
        sdk,
        prompt,
        options,
        history: memoryState.history,
        memoryText: memoryState.memoryText,
        projectInstructionsText: memoryState.projectInstructionsText,
        runtimeGuidanceText: this.prepareRuntimeGuidance(prompt, runState),
        getWorkspaceRoot: this.getWorkspaceRoot,
        getEditorContext: this.getEditorContext,
        contextBudget: this.contextBudget,
      });
      this.emitActivity({
        kind: "status",
        text: "Starting agent run...",
      });
      const result = await withLightRetry(() => this.runAgent(sdk, rootAgent, input));
      await this.consumeStreamedRun(result);

      const text = this.extractFinalOutput(result);
      const trace = finalizeRunTrace(this.getCurrentTrace(), {
        status: "completed",
        reply: text,
        error: null,
      });
      const finalizeResult = await this.memoryManager.finalizeRun({
        sessionId: memoryState.sessionId,
        taskId: memoryState.taskId,
        taskPlan: memoryState.taskPlan,
        prompt,
        reply: text,
        history: slimHistoryForStorage(result.history),
        trace,
      });
      await this.runMemoryMaintenanceIfNeeded(finalizeResult);
      this.emitActivity({
        kind: "status",
        text: "Run complete.",
      });

      if (!text) {
        return "The agent completed the run but did not return text output.";
      }

      return text;
    } catch (error) {
      const trace = finalizeRunTrace(this.getCurrentTrace(), {
        status: "failed",
        reply: "",
        error,
      });
      if (memoryState && memoryState.sessionId) {
        await this.memoryManager.recordRunTrace(memoryState.sessionId, trace);
      }
      throw this.createProviderAwareError(error);
    } finally {
      this.releaseToolRun(runState);
      if (this.currentRunState === runState) {
        this.currentRunState = {
          id: "",
          prompt: "",
          baseSessionId: "",
          trace: null,
          streamedText: "",
          clearedClarificationDraft: false,
        };
      }
    }
  }

  async getMemorySnapshot() {
    loadOpenAIEnvFile();
    if (!this.providerContext) {
      this.providerContext = getProviderContext();
    }
    const snapshot = await this.memoryManager.getSnapshot();
    return {
      ...snapshot,
      provider: this.providerContext || getProviderContext(),
    };
  }

  setBaseSessionId(baseSessionId) {
    this.memoryManager.setBaseSessionId(baseSessionId);
  }

  getBaseSessionId() {
    return this.memoryManager.getBaseSessionId();
  }

  async getCurrentSessionMessagesForUi(baseSessionId = null) {
    return this.memoryManager.getCurrentSessionMessagesForUi(baseSessionId);
  }

  async listCurrentWorkspaceSessionsForUi() {
    return this.memoryManager.listCurrentWorkspaceSessionsForUi();
  }

  async deleteSessionForUi(baseSessionId) {
    return this.memoryManager.deleteSessionForUi(baseSessionId);
  }

  async ensureCurrentSession() {
    return this.memoryManager.ensureCurrentSession();
  }

  async getRootAgent() {
    if (this.agents) {
      return this.agents.rootAgent;
    }

    const sdk = await this.getSdk();
    const tools = this.getRuntimeTools();
    this.agents = createAgents({
      sdk,
      zod: this.zod,
      tools,
      runSubAgent: (request) => this.runSubAgent(request),
      getRunState: () => this.getCurrentRunState(),
      requestToolAccess: (toolName) => this.requestToolAccess(toolName),
    });
    return this.agents.rootAgent;
  }

  async runSubAgent({ agentKey, agentName, agent, task, context = "" }) {
    const sdk = await this.getSdk();
    const runState = this.getCurrentRunState();
    const parentPrompt = limitSubagentText(runState && runState.prompt ? runState.prompt : "", 1200);
    const boundedContext = limitSubagentText(context, 1600);
    const workspaceRoot = this.getWorkspaceRoot();
    const selectedMemory = selectSubagentMemory({
      agentKey,
      memoryState: runState ? runState.memoryState : null,
      projectInstructionsText:
        runState && runState.memoryState ? runState.memoryState.projectInstructionsText : "",
    });
    const selectedSkills = selectSkillsForSubagent({
      prompt: `${parentPrompt}\n${task}\n${boundedContext}`,
      agentKey,
      workspaceRoot,
    });
    const input = [
      workspaceRoot ? `Active workspace folder:\n${workspaceRoot}` : "",
      selectedMemory.text ? selectedMemory.text : "",
      selectedSkills.text ? selectedSkills.text : "",
      parentPrompt ? `Parent user request:\n${parentPrompt}` : "",
      boundedContext ? `Additional context from the root agent:\n${boundedContext}` : "",
      `Delegated task for ${agentName || agentKey}:\n${limitSubagentText(task, 1600)}`,
      [
        "Return a concise, grounded result for the root agent.",
        "Use workspace tools before making repository-specific claims.",
        "Include an Evidence section naming the workspace paths you inspected.",
        "If you could not inspect files, say that directly.",
        "Do not address the user directly unless the delegated task explicitly asks for final wording.",
      ].join(" "),
    ]
      .filter(Boolean)
      .join("\n\n");
    const subTrace = createRunTrace(task, this.providerContext);
    subTrace.kind = "subagent";
    subTrace.agentKey = agentKey || "";
    subTrace.agentName = agentName || agentKey || "Subagent";
    subTrace.workspaceRoot = workspaceRoot || "";
    subTrace.selectedMemory = selectedMemory.metadata;
    subTrace.selectedSkills = selectedSkills.metadata;

    this.emitActivity({
      kind: "status",
      text: `Running ${agentName || agentKey}...`,
    });
    const result = await withLightRetry(() => this.runAgent(sdk, agent, input));
    await this.consumeStreamedRun(result, {
      trace: subTrace,
      emitTextDelta: false,
      activityPrefix: agentName || agentKey || "Subagent",
      clearClarificationDraftBeforeTool: false,
    });
    const text = this.extractFinalOutput(result);
    const finishedSubTrace = finalizeRunTrace(subTrace, {
      status: "completed",
      reply: text,
      error: null,
    });
    const evidence = buildSubagentEvidence(finishedSubTrace, workspaceRoot);
    recordSubagentRun(this.getCurrentTrace(), {
      agentKey,
      agentName: agentName || agentKey || "Subagent",
      task,
      outputPreview: text ? text.slice(0, 800) : "",
      evidence,
      selectedMemory: selectedMemory.metadata,
      selectedSkills: selectedSkills.metadata,
      trace: finishedSubTrace,
    });

    return {
      output: text || `${agentName || agentKey} completed without text output.`,
      evidence,
    };
  }

  prepareRuntimeGuidance(prompt, runState) {
    const policy = classifyDelegation(prompt);
    if (runState && runState.trace) {
      runState.trace.delegation = {
        ...policy,
        at: new Date().toISOString(),
      };
      runState.trace.selectedSkills = runState.rootSkills ? runState.rootSkills.metadata : null;
    }
    return [
      this.buildProviderRoutingGuidance(),
      buildDelegationGuidance(policy),
      runState && runState.rootSkills ? runState.rootSkills.text : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  async getSdk() {
    if (this.sdk && this.zod) {
      loadOpenAIEnvFile();
      this.configureModelProvider();
      return this.sdk;
    }

    loadOpenAIEnvFile();

    try {
      this.sdk = await import("@openai/agents");
      this.zod = await import("zod");
    } catch (error) {
      const detail = error && error.message ? error.message : String(error);
      throw new Error(
        "OpenAI Agents SDK is not available yet. Run `npm install` in this project first. " +
          `Original error: ${detail}`
      );
    }

    this.configureModelProvider();

    return this.sdk;
  }

  configureModelProvider() {
    if (!this.sdk || typeof this.sdk.OpenAIProvider !== "function") {
      this.runnerConfig = null;
      return;
    }

    this.providerContext = getProviderContext();
    const nextSignature = [
      this.providerContext.provider,
      this.providerContext.model,
      this.providerContext.baseURL,
      this.providerContext.apiFormat,
      this.providerContext.activeKeyKind,
    ].join("|");
    if (this.providerSignature && this.providerSignature !== nextSignature) {
      this.agents = null;
    }
    this.providerSignature = nextSignature;
    const apiKey = process.env.OPENAI_API_KEY || "";
    const baseURL = this.providerContext.baseURL || "";
    const apiFormat = this.providerContext.apiFormat || "chat_completions";
    const providerName = this.providerContext.provider || inferProviderFromBaseUrl(baseURL);
    const useResponses = apiFormat !== "chat_completions";

    if (typeof this.sdk.setOpenAIAPI === "function") {
      this.sdk.setOpenAIAPI(useResponses ? "responses" : "chat_completions");
    }

    this.modelProvider = new this.sdk.OpenAIProvider({
      apiKey,
      baseURL,
      useResponses,
    });

    if (typeof this.sdk.setDefaultModelProvider === "function") {
      this.sdk.setDefaultModelProvider(this.modelProvider);
    }

    this.runnerConfig = {
      modelProvider: this.modelProvider,
      tracingDisabled: providerName !== "openai",
      traceIncludeSensitiveData: false,
    };
  }

  async runAgent(sdk, agent, input) {
    if (this.runnerConfig && typeof sdk.Runner === "function") {
      const runner = new sdk.Runner(this.runnerConfig);
      return runner.run(agent, input, { stream: true });
    }
    return sdk.run(agent, input, { stream: true });
  }

  async runMemoryMaintenanceIfNeeded(finalizeResult) {
    const candidate =
      finalizeResult && finalizeResult.maintenanceCandidate
        ? finalizeResult.maintenanceCandidate
        : null;

    if (!candidate || !candidate.sessionId || !candidate.sessionSummary) {
      return;
    }

    try {
      const agentBundle = this.agents || (await this.getRootAgent(), this.agents);
      const maintenanceAgent = agentBundle && agentBundle.memoryMaintainerAgent
        ? agentBundle.memoryMaintainerAgent
        : null;
      if (!maintenanceAgent || !this.sdk) {
        return;
      }

      const input = [
        this.sdk.system("Memory maintenance request. Rewrite the compacted session summary as strict JSON."),
        this.sdk.user(buildMemoryMaintenancePrompt(candidate)),
      ];

      let result = null;
      if (this.runnerConfig && typeof this.sdk.Runner === "function") {
        const runner = new this.sdk.Runner(this.runnerConfig);
        result = await runner.run(maintenanceAgent, input, { stream: false });
      } else {
        result = await this.sdk.run(maintenanceAgent, input, { stream: false });
      }

      const output = this.extractFinalOutput(result);
      const parsed = parseMemoryMaintenanceOutput(output);
      if (!parsed || !parsed.rewriteSummary) {
        return;
      }

      await this.memoryManager.applyMemoryMaintenance(candidate.sessionId, parsed);
    } catch (error) {
      // Memory maintenance is best-effort and should never block the main user flow.
    }
  }

  buildProviderRoutingGuidance() {
    const context = this.providerContext || getProviderContext();
    const lines = [
      "Runtime provider guidance:",
      `- Active provider/model: ${context.provider || "unknown"} / ${context.model || "unknown"}.`,
      "- Provider and model are recorded in the run trace for Tracy-style inspection.",
    ];

    if (context.rateLimitSensitive && context.lowerCostModelSuggestion) {
      lines.push(
        `- This model may be rate-limit or cost sensitive. Prefer direct work for small tasks and suggest ${context.lowerCostModelSuggestion} if the run hits 429/quota errors.`
      );
    }

    return lines.join("\n");
  }

  createProviderAwareError(error) {
    const wrapped = new Error(formatProviderErrorMessage(error, this.providerContext || {}));
    wrapped.cause = error;
    return wrapped;
  }

  getRuntimeTools() {
    if (!this.sdk || !this.zod) {
      throw new Error("OpenAI Agents SDK is not loaded yet.");
    }

    return createRuntimeTools({
      sdk: this.sdk,
      zod: this.zod,
      getWorkspaceRoot: this.getWorkspaceRoot,
      getEditorContext: this.getEditorContext,
      getRunState: () => this.getCurrentRunState(),
      requestToolAccess: (toolName) => this.requestToolAccess(toolName),
      requestApproval: this.requestApproval
        ? (request) => this.requestToolApproval(request)
        : null,
    });
  }

  async requestToolApproval(request) {
    const trace = this.getCurrentTrace();
    const approvalId = recordApprovalRequested(trace, {
      ...request,
      tool: request && request.action ? request.action : "tool",
    });

    try {
      const runState = this.getCurrentRunState();
      const approved = await this.requestApproval({
        ...(request || {}),
        baseSessionId: runState ? runState.baseSessionId : "",
      });
      recordApprovalResolved(trace, approvalId, Boolean(approved));
      return Boolean(approved);
    } catch (error) {
      recordApprovalResolved(trace, approvalId, false, error);
      throw error;
    }
  }

  extractFinalOutput(result) {
    if (!result) {
      return "";
    }

    if (typeof result.finalOutput === "string") {
      return result.finalOutput.trim();
    }

    if (result.finalOutput != null) {
      return String(result.finalOutput).trim();
    }

    if (typeof result.final_output === "string") {
      return result.final_output.trim();
    }

    return "";
  }

  emitActivity(activity) {
    if (!this.onActivity || !activity || !activity.text) {
      return;
    }

    try {
      const runState = this.getCurrentRunState();
      this.onActivity({
        ...activity,
        baseSessionId: runState ? runState.baseSessionId : "",
        at: new Date().toISOString(),
      });
    } catch (error) {
      // Activity feed issues should never break the main agent run.
    }
  }

  emitTextDelta(delta) {
    if (!this.onTextDelta || !delta) {
      return;
    }

    try {
      const runState = this.getCurrentRunState();
      if (runState) {
        runState.streamedText = `${runState.streamedText || ""}${delta}`;
      }
      this.onTextDelta({
        delta,
        baseSessionId: runState ? runState.baseSessionId : "",
        at: new Date().toISOString(),
      });
    } catch (error) {
      // Text streaming issues should never break the main agent run.
    }
  }

  emitReplyControl(control) {
    if (!this.onReplyControl || !control || !control.type) {
      return;
    }

    try {
      const runState = this.getCurrentRunState();
      this.onReplyControl({
        ...control,
        baseSessionId: runState ? runState.baseSessionId : "",
        at: new Date().toISOString(),
      });
    } catch (error) {
      // Reply control issues should never break the main agent run.
    }
  }

  getCurrentTrace() {
    const runState = this.getCurrentRunState();
    return runState && runState.trace
      ? runState.trace
      : null;
  }

  getCurrentRunState() {
    return this.runStateStorage.getStore() || this.currentRunState || null;
  }

  requestToolAccess(toolName) {
    const runState = this.getCurrentRunState();
    const runId = runState && runState.id ? runState.id : "";
    if (!runId) {
      return { allowed: true };
    }
    if (!this.activeToolRunId) {
      this.activeToolRunId = runId;
      return { allowed: true };
    }
    if (this.activeToolRunId === runId) {
      return { allowed: true };
    }

    return {
      allowed: false,
      message:
        `Tool ${toolName || "tool"} is blocked because another session is currently using tools. ` +
        "Please wait for that tool-using run to finish, then try again.",
    };
  }

  releaseToolRun(runState) {
    if (runState && runState.id && this.activeToolRunId === runState.id) {
      this.activeToolRunId = "";
    }
  }

  async consumeStreamedRun(result, options = {}) {
    if (!result || typeof result[Symbol.asyncIterator] !== "function") {
      return;
    }

    const emitTextDelta = options.emitTextDelta !== false;
    const getTrace = options.trace
      ? () => options.trace
      : () => this.getCurrentTrace();
    const activityPrefix = options.activityPrefix || "";
    const shouldClearClarification = options.clearClarificationDraftBeforeTool !== false;

    for await (const event of result) {
      const textDelta = extractTextDelta(event);
      if (emitTextDelta && textDelta) {
        this.emitTextDelta(textDelta);
      }

      const activity = mapStreamEventToActivity(event, {
        getTrace,
        clearClarificationDraftBeforeTool: (toolName) =>
          shouldClearClarification
            ? this.clearClarificationDraftBeforeTool(toolName)
            : null,
      });
      if (activity) {
        this.emitActivity({
          ...activity,
          text: activityPrefix ? `${activityPrefix}: ${activity.text}` : activity.text,
        });
      }
    }

    await result.completed;
    if (result.error) {
      throw result.error;
    }
  }

  clearClarificationDraftBeforeTool(toolName) {
    const state = this.getCurrentRunState() || {};
    const text = state.streamedText || "";
    if (state.clearedClarificationDraft || !looksLikeClarification(text)) {
      return;
    }

    state.clearedClarificationDraft = true;
    state.streamedText = "";

    recordClarificationClear(this.getCurrentTrace(), { toolName, text });

    this.emitReplyControl({
      type: "clear_stream",
      reason: "clarification-before-tool",
    });
  }

}

function buildSubagentEvidence(trace, workspaceRoot = "") {
  const toolCalls = Array.isArray(trace && trace.toolCalls) ? trace.toolCalls : [];
  const inspectedFiles = [];
  const listedPaths = [];
  let readWorkspaceRoot = false;

  for (const call of toolCalls) {
    const toolName = call && call.name ? call.name : "";
    const args = parseTraceArgs(call && call.args);
    const outputData = call && call.output && call.output.data ? call.output.data : null;

    if (toolName === "get_workspace_root") {
      readWorkspaceRoot = true;
    }

    if (toolName === "read_file") {
      const relativePath =
        args.relativePath ||
        args.path ||
        call.path ||
        (outputData && (outputData.relativePath || outputData.path)) ||
        "";
      if (relativePath && !inspectedFiles.includes(relativePath)) {
        inspectedFiles.push(relativePath);
      }
    }

    if (toolName === "list_files") {
      const relativePath =
        args.relativePath ||
        args.path ||
        call.path ||
        (outputData && (outputData.relativePath || outputData.path)) ||
        ".";
      if (!listedPaths.includes(relativePath)) {
        listedPaths.push(relativePath);
      }
    }
  }

  return {
    workspaceRoot: workspaceRoot || (trace && trace.workspaceRoot) || "",
    readWorkspaceRoot,
    inspectedFiles,
    listedPaths,
    toolUseCount: toolCalls.length,
    usedWorkspaceTools: toolCalls.some((call) =>
      ["get_workspace_root", "list_files", "read_file"].includes(call && call.name)
    ),
  };
}

function parseTraceArgs(args) {
  if (!args) {
    return {};
  }

  if (typeof args === "object") {
    return args;
  }

  if (typeof args !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(args);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function limitSubagentText(value, maxChars) {
  const text = String(value || "");
  if (!maxChars || text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxChars - 15))}\n...[truncated]`;
}

function buildMemoryMaintenancePrompt(candidate) {
  const sections = [
    "Current compacted session summary:",
    candidate.sessionSummary || "",
  ];

  if (candidate.compactedAt) {
    sections.push("", `Compacted at: ${candidate.compactedAt}`);
  }

  if (candidate.sessionCompaction) {
    sections.push("", "Compaction metadata:", JSON.stringify(candidate.sessionCompaction, null, 2));
  }

  if (candidate.task) {
    sections.push("", "Representative task:", JSON.stringify(candidate.task, null, 2));
  }

  if (candidate.lastRunTraceSummary) {
    sections.push("", "Last run trace summary:", JSON.stringify(candidate.lastRunTraceSummary, null, 2));
  }

  sections.push(
    "",
    "Rewrite the session summary so it preserves durable facts, confirmed decisions, active goals, and unresolved blockers.",
    "Delete duplicated, stale, contradicted, speculative, or clearly incorrect claims.",
    "Return JSON only."
  );

  return sections.join("\n");
}

function parseMemoryMaintenanceOutput(text) {
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      rewriteSummary: typeof parsed.rewriteSummary === "string" ? parsed.rewriteSummary.trim() : "",
      removedClaims: Array.isArray(parsed.removedClaims) ? parsed.removedClaims.filter(Boolean) : [],
      keptFocus: Array.isArray(parsed.keptFocus) ? parsed.keptFocus.filter(Boolean) : [],
      notes: typeof parsed.notes === "string" ? parsed.notes.trim() : "",
    };
  } catch (error) {
    return null;
  }
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

module.exports = {
  OpenAIAgentsRuntime,
};
