const { analyzeRunVerification } = require("./verification_policy");
const { recordRunStop } = require("./tool_lifecycle");

const { buildProviderErrorDiagnostic } = require("./provider_context");

function createRunTrace(prompt, providerContext = null) {
  return {
    prompt,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    agentUpdates: [],
    toolCalls: [],
    subagentRuns: [],
    approvals: [],
    error: null,
    replyPreview: "",
    verification: null,
    lifecycleEvents: [],
    lifecycle: null,
    provider: providerContext,
    providerError: null,
    interactionGuard: {
      clearedClarificationBeforeTool: false,
    },
  };
}

function recordSubagentRun(trace, subagentRun) {
  if (!trace || !subagentRun) {
    return;
  }

  if (!Array.isArray(trace.subagentRuns)) {
    trace.subagentRuns = [];
  }

  trace.subagentRuns.push(JSON.parse(JSON.stringify(subagentRun)));
}

function finalizeRunTrace(trace, { status, reply, error }) {
  if (!trace) {
    return null;
  }

  trace.status = status;
  trace.finishedAt = new Date().toISOString();
  trace.replyPreview =
    typeof reply === "string" && reply ? reply.slice(0, 400) : trace.replyPreview || "";
  trace.error = error ? error.message || String(error) : null;
  trace.providerError = error ? buildProviderErrorDiagnostic(error, trace.provider || {}) : null;
  trace.verification = analyzeRunVerification(trace);
  recordRunStop(trace);
  return JSON.parse(JSON.stringify(trace));
}

function recordAgentUpdate(trace, agentName) {
  if (!trace) {
    return;
  }

  trace.agentUpdates.push({
    agent: agentName,
    at: new Date().toISOString(),
  });
}

function recordToolCalled(trace, { toolName, callId, args }) {
  if (!trace) {
    return;
  }

  trace.toolCalls.push({
    name: toolName,
    callId,
    status: "started",
    at: new Date().toISOString(),
    args,
    output: null,
  });
}

function recordToolOutput(trace, { toolName, callId, output: rawOutput }) {
  const output = normalizeTraceOutput(rawOutput);
  if (!trace) {
    return output;
  }

  const openCall = findOpenToolCall(trace.toolCalls, toolName, callId);
  if (openCall) {
    openCall.status = output.ok === false ? "failed" : "completed";
    openCall.completedAt = new Date().toISOString();
    openCall.path = output.path || openCall.path || "";
    openCall.output = output;
    return output;
  }

  trace.toolCalls.push({
    name: toolName,
    callId,
    status: output.ok === false ? "failed" : "completed",
    at: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    args: null,
    path: output.path || "",
    output,
  });
  return output;
}

function recordApprovalRequested(trace, approval) {
  if (!trace) {
    return "";
  }

  const item =
    approval && typeof approval === "object"
      ? approval
      : {
          tool: approval || "tool",
        };
  const id = item.id || `approval:${Date.now()}:${trace.approvals.length}`;
  trace.approvals.push({
    id,
    tool: item.tool || item.action || "tool",
    action: item.action || "",
    kind: item.kind || "",
    reason: item.reason || "",
    relativePath: item.relativePath || "",
    at: new Date().toISOString(),
    status: "requested",
  });
  return id;
}

function recordApprovalResolved(trace, approvalId, approved, error = null) {
  if (!trace || !approvalId) {
    return;
  }

  const approval = trace.approvals.find((item) => item.id === approvalId);
  if (!approval) {
    trace.approvals.push({
      id: approvalId,
      tool: "tool",
      at: new Date().toISOString(),
      status: approved ? "approved" : "denied",
      resolvedAt: new Date().toISOString(),
      error: error ? error.message || String(error) : null,
    });
    return;
  }

  approval.status = approved ? "approved" : "denied";
  approval.resolvedAt = new Date().toISOString();
  approval.error = error ? error.message || String(error) : null;
}

function recordClarificationClear(trace, { toolName, text }) {
  if (!trace || !trace.interactionGuard) {
    return;
  }

  trace.interactionGuard.clearedClarificationBeforeTool = true;
  trace.interactionGuard.toolName = toolName || "";
  trace.interactionGuard.clearedPreview = String(text || "").slice(0, 240);
  trace.interactionGuard.clearedAt = new Date().toISOString();
}

function normalizeTraceOutput(output) {
  if (output && typeof output === "object") {
    return {
      ok: typeof output.ok === "boolean" ? output.ok : true,
      message: output.message || output.summary || "",
      summary: output.summary || output.message || "",
      action: output.action || "",
      path: output.path || "",
      data: sanitizeTraceData(output.data),
    };
  }

  if (typeof output === "string") {
    return {
      ok: !/not found|refusing|denied|approval required|failed/i.test(output),
      message: output,
      summary: output,
      action: "",
      path: "",
    };
  }

  return {
    ok: true,
    message: describeToolOutput(output),
    summary: describeToolOutput(output),
    action: "",
    path: "",
  };
}

function sanitizeTraceData(data) {
  if (!data || typeof data !== "object") {
    return null;
  }

  if (
    Object.prototype.hasOwnProperty.call(data, "command") ||
    Object.prototype.hasOwnProperty.call(data, "stdoutPreview") ||
    Object.prototype.hasOwnProperty.call(data, "stderrPreview")
  ) {
    return {
      command: data.command || "",
      args: Array.isArray(data.args) ? data.args : [],
      exitCode:
        Object.prototype.hasOwnProperty.call(data, "exitCode")
          ? data.exitCode
          : undefined,
      stdoutPreview: data.stdoutPreview || "",
      stderrPreview: data.stderrPreview || "",
      timedOut: Boolean(data.timedOut),
      notRun: Boolean(data.notRun),
    };
  }

  try {
    return JSON.parse(JSON.stringify(data));
  } catch (error) {
    return {
      value: String(data),
    };
  }
}

function describeToolOutput(output) {
  if (output && typeof output === "object") {
    if (typeof output.summary === "string" && output.summary) {
      return output.summary;
    }

    if (typeof output.message === "string" && output.message) {
      return output.message;
    }
  }

  if (typeof output === "string") {
    return output.length > 140 ? `${output.slice(0, 137)}...` : output;
  }

  if (output == null) {
    return "";
  }

  try {
    const serialized = JSON.stringify(output);
    return serialized.length > 140 ? `${serialized.slice(0, 137)}...` : serialized;
  } catch (error) {
    return String(output);
  }
}

function getStreamToolCallId(item, rawItem) {
  return (
    rawItem.callId ||
    rawItem.call_id ||
    rawItem.id ||
    item.callId ||
    item.call_id ||
    item.id ||
    ""
  );
}

function findOpenToolCall(toolCalls, toolName, callId) {
  const calls = Array.isArray(toolCalls) ? toolCalls : [];

  if (callId) {
    const byId = calls.find(
      (toolCall) => toolCall.callId === callId && toolCall.status === "started"
    );
    if (byId) {
      return byId;
    }
  }

  return calls.find((toolCall) => toolCall.name === toolName && toolCall.status === "started");
}

module.exports = {
  createRunTrace,
  describeToolOutput,
  finalizeRunTrace,
  getStreamToolCallId,
  recordAgentUpdate,
  recordApprovalRequested,
  recordApprovalResolved,
  recordClarificationClear,
  recordSubagentRun,
  recordToolCalled,
  recordToolOutput,
};
