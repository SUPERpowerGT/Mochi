function summarizeRunTrace(trace) {
  if (!trace || typeof trace !== "object") {
    return null;
  }

  const lifecycleEvents = Array.isArray(trace.lifecycleEvents) ? trace.lifecycleEvents : [];
  const preToolEvents = lifecycleEvents.filter((event) => event.phase === "preToolUse");
  const postToolEvents = lifecycleEvents.filter((event) => event.phase === "postToolUse");
  const toolCalls = Array.isArray(trace.toolCalls) ? trace.toolCalls : [];
  const approvals = Array.isArray(trace.approvals) ? trace.approvals : [];
  const subagentRuns = Array.isArray(trace.subagentRuns) ? trace.subagentRuns : [];
  const policySource = preToolEvents.length ? preToolEvents : toolCalls.map(inferPrePolicyEvent);
  const postPolicySource = postToolEvents.length ? postToolEvents : toolCalls.map(inferPostPolicyEvent);

  return {
    status: trace.status || "unknown",
    startedAt: trace.startedAt || null,
    finishedAt: trace.finishedAt || null,
    outcome: summarizeOutcome(trace),
    provider: trace.provider || null,
    providerError: trace.providerError || null,
    tools: {
      total: policySource.length,
      highRisk: countPolicyEvents(policySource, (event) => event.risk === "high"),
      mutating: countPolicyEvents(
        policySource,
        (event) => event.policy && event.policy.mutatesWorkspace
      ),
      failed: countPolicyEvents(postPolicySource, (event) => event.ok === false),
      approvalRequired: countPolicyEvents(
        policySource,
        (event) => event.policy && event.policy.requiresApproval
      ),
      approvalDenied: countPolicyEvents(
        postPolicySource,
        (event) => event.policy && event.policy.approvalDenied
      ),
    },
    verification: trace.verification || null,
    approvals: {
      requested: approvals.length,
      approved: approvals.filter((approval) => approval.status === "approved").length,
      denied: approvals.filter((approval) => approval.status === "denied").length,
      pending: approvals.filter((approval) => approval.status === "requested").length,
      latest: approvals.length ? approvals[approvals.length - 1] : null,
    },
    subagents: summarizeSubagentRuns(subagentRuns),
    policyTimeline: buildPolicyTimeline(lifecycleEvents.length ? lifecycleEvents : buildFallbackLifecycle(toolCalls)),
    changedPaths:
      trace.verification && Array.isArray(trace.verification.changedPaths)
        ? trace.verification.changedPaths
        : [],
  };
}

function summarizeSubagentRuns(subagentRuns) {
  return subagentRuns.map((run) => {
    const evidence = run && run.evidence ? run.evidence : {};
    const trace = run && run.trace ? run.trace : {};
    const toolCalls = Array.isArray(trace.toolCalls) ? trace.toolCalls : [];
    return {
      agentKey: run.agentKey || "",
      agentName: run.agentName || "",
      status: trace.status || "unknown",
      provider: trace.provider || null,
      providerError: trace.providerError || null,
      workspaceRoot: evidence.workspaceRoot || trace.workspaceRoot || "",
      toolUseCount:
        typeof evidence.toolUseCount === "number" ? evidence.toolUseCount : toolCalls.length,
      usedWorkspaceTools: Boolean(evidence.usedWorkspaceTools),
      selectedMemory:
        run.selectedMemory ||
        trace.selectedMemory ||
        null,
      selectedSkills:
        run.selectedSkills ||
        trace.selectedSkills ||
        null,
      inspectedFiles: Array.isArray(evidence.inspectedFiles)
        ? evidence.inspectedFiles
        : [],
      listedPaths: Array.isArray(evidence.listedPaths) ? evidence.listedPaths : [],
      outputPreview: run.outputPreview || trace.replyPreview || "",
    };
  });
}

function inferPrePolicyEvent(toolCall) {
  const action = getToolAction(toolCall);
  const risk = classifyRisk(action);
  const mutatesWorkspace = isMutationAction(action);
  return {
    phase: "preToolUse",
    tool: toolCall && toolCall.name ? toolCall.name : action || "tool",
    risk,
    policy: {
      decision: "observe",
      mutatesWorkspace,
      requiresApproval: risk === "high" || action === "run_command",
      requiresVerification: mutatesWorkspace,
    },
  };
}

function inferPostPolicyEvent(toolCall) {
  const action = getToolAction(toolCall);
  const output = toolCall && toolCall.output ? toolCall.output : {};
  const ok = output && typeof output.ok === "boolean" ? output.ok : toolCall.status !== "failed";
  const mutatesWorkspace = isMutationAction(action);
  return {
    phase: "postToolUse",
    tool: toolCall && toolCall.name ? toolCall.name : action || "tool",
    risk: classifyRisk(action),
    ok,
    message: output.message || output.summary || "",
    policy: {
      decision: isApprovalDeniedOutput(output) ? "denied" : ok ? "completed" : "failed",
      mutatesWorkspace,
      approvalDenied: isApprovalDeniedOutput(output),
      requiresVerification: mutatesWorkspace && ok,
    },
  };
}

function buildFallbackLifecycle(toolCalls) {
  const events = [];
  for (const toolCall of toolCalls) {
    events.push(inferPrePolicyEvent(toolCall));
    events.push(inferPostPolicyEvent(toolCall));
  }
  return events;
}

function summarizeOutcome(trace) {
  if (trace.error) {
    return `Run failed: ${trace.error}`;
  }

  const verification = trace.verification || {};
  if (verification.needed && verification.status === "not_run") {
    return "Workspace changed, but verification did not run.";
  }

  if (verification.status === "failed") {
    return "Verification ran and failed.";
  }

  if (verification.status === "passed") {
    return "Verification ran and passed.";
  }

  if (trace.status === "completed") {
    return "Run completed.";
  }

  return "Run status is unknown.";
}

function buildPolicyTimeline(lifecycleEvents) {
  return lifecycleEvents
    .filter((event) => event && (event.phase === "preToolUse" || event.phase === "postToolUse"))
    .map((event) => ({
      phase: event.phase,
      tool: event.tool || "tool",
      risk: event.risk || "unknown",
      decision: event.policy && event.policy.decision ? event.policy.decision : "",
      mutatesWorkspace: Boolean(event.policy && event.policy.mutatesWorkspace),
      requiresApproval: Boolean(event.policy && event.policy.requiresApproval),
      approvalDenied: Boolean(event.policy && event.policy.approvalDenied),
      requiresVerification: Boolean(event.policy && event.policy.requiresVerification),
      ok: typeof event.ok === "boolean" ? event.ok : null,
      message: event.message || "",
    }));
}

function countPolicyEvents(events, predicate) {
  return events.reduce((count, event) => (predicate(event) ? count + 1 : count), 0);
}

function getToolAction(toolCall) {
  if (!toolCall) {
    return "";
  }

  if (toolCall.output && typeof toolCall.output.action === "string" && toolCall.output.action) {
    return toolCall.output.action;
  }

  return typeof toolCall.name === "string" ? toolCall.name : "";
}

function isMutationAction(action) {
  return ["write_file", "append_file", "delete_file", "delete_dir", "make_dir"].includes(action);
}

function classifyRisk(action) {
  if (action === "delete_file" || action === "delete_dir") {
    return "high";
  }

  if (action === "run_command") {
    return "medium";
  }

  if (isMutationAction(action)) {
    return "medium";
  }

  return "low";
}

function isApprovalDeniedOutput(output) {
  if (!output || typeof output !== "object") {
    return false;
  }

  if (output.data && output.data.notRun) {
    return true;
  }

  const message = `${output.message || ""} ${output.summary || ""}`.toLowerCase();
  return /user denied|approval required|not approved|permission denied/.test(message);
}

module.exports = {
  summarizeRunTrace,
};
