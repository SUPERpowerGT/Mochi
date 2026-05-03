# Mochi Test Suite

Unit tests for the Mochi VS Code extension runtime. Uses Node's built-in
`node:test` runner — no extra dependencies required.

## What is tested

180 tests across 18 files, covering the pure-logic layer of the runtime:

| File | Target module | Tests |
| --- | --- | --- |
| `memory_utils.test.js` | `src/runtime/memory/memory_utils.js` | 26 |
| `retry_utils.test.js` | `src/runtime/support/retry_utils.js` | 8 |
| `approval_policy.test.js` | `src/runtime/support/approval_policy.js` | 10 |
| `turn_classifier.test.js` | `src/runtime/memory/turn_classifier.js` | 9 |
| `delegation_policy.test.js` | `src/runtime/support/delegation_policy.js` | 9 |
| `history_sanitizer.test.js` | `src/runtime/support/history_sanitizer.js` | 11 |
| `context_budget.test.js` | `src/runtime/support/context_budget.js` | 9 |
| `clarification_gate.test.js` | `src/runtime/support/clarification_gate.js` | 7 |
| `verification_policy.test.js` | `src/runtime/support/verification_policy.js` | 7 |
| `trace_summary.test.js` | `src/runtime/support/trace_summary.js` | 7 |
| `stream_event_mapper.test.js` | `src/runtime/support/stream_event_mapper.js` | 9 |
| `compact_snapshot.test.js` | `src/runtime/support/compact_snapshot.js` | 5 |
| `task_router.test.js` | `src/runtime/memory/task_router.js` | 7 |
| `memory_selector.test.js` | `src/runtime/support/memory_selector.js` | 6 |
| `tool_result.test.js` | `src/runtime/tools/tool_result.js` | 7 |
| `tool_approval.test.js` | `src/runtime/tools/tool_approval.js` | 7 |
| `tool_lifecycle.test.js` | `src/runtime/support/tool_lifecycle.js` | 7 |
| `run_trace_recorder.test.js` | `src/runtime/support/run_trace_recorder.js` | 12 |
| `openai_env.test.js` | `src/runtime/support/openai_env.js` | 3 |
| `json_file_store.test.js` | `src/runtime/memory/json_file_store.js` | 5 |
| `session_compactor.test.js` | `src/runtime/memory/session_compactor.js` | 5 |
| `skill_selector.test.js` | `src/runtime/support/skill_selector.js` | 4 |

## Why these modules

Mochi is a VS Code extension, so the runtime has two kinds of code:

1. **Pure logic** — pure functions, no VS Code API, no network. Easy to unit
   test.
2. **VS Code glue** — webview, commands, UI. Better covered by manual /
   integration tests.

This suite covers the pure-logic layer. It is the part most likely to regress
when you change a prompt, a policy, or a threshold.

## Running tests

All commands are run from the repo root.

### Run every test
```bash
npm test
```

Expected output: `tests 180 / pass 180 / fail 0` in under 1 second.

### Run one file
```bash
npm run test:file test/unit/approval_policy.test.js
```

Useful when you are iterating on a single module.

### Watch mode
```bash
npm run test:watch
```

Re-runs tests whenever a test file changes. Works well side-by-side with VS
Code when you are writing new tests.

### Coverage report
```bash
npm run test:coverage
```

Prints a per-file coverage table with lines, branches, and functions hit.
Requires Node 20+.

### Run a single test by name
```bash
node --test --test-name-pattern="approval" --test-reporter=spec "test/unit/*.test.js"
```

Runs only tests whose name matches the pattern. Good for debugging.

## How to add a new test

1. Pick the module under `src/runtime/` you want to cover.
2. Create (or open) the matching file under `test/unit/<module>.test.js`.
3. Import the tools:
   ```js
   const test = require("node:test");
   const assert = require("node:assert/strict");
   const { functionUnderTest } = require("../../src/runtime/.../module");
   ```
4. Write a focused test that describes **one behavior** per `test(...)`
   block. Keep them fast (no real network, no real OpenAI calls).
5. Run `npm test` and confirm everything is green.

### Guidelines

- One assertion focus per test. Prefer small, deterministic inputs.
- Use `assert/strict` so `0` and `false` do not accidentally pass.
- When a module touches the filesystem, use `fs.mkdtempSync(os.tmpdir())`
  to get a clean temp dir and clean it up in `finally`.
- When a module reads `process.env` or `~/.something`, save and restore
  the original values (see `openai_env.test.js` for the pattern).
- If a module depends on the clock, refactor the code to accept an
  injected `now()` or accept that assertions should be "within range"
  rather than exact.

## What is NOT tested here

These areas are intentionally out of scope for unit tests. They belong in
manual QA or a separate integration suite:

- VS Code command activation and webview lifecycle
  (`src/extension/*`)
- Actual OpenAI network calls and streaming
  (`openai_agents_runtime.js` network layer)
- End-to-end agent behavior (use a dedicated eval harness instead)

## Troubleshooting

**`Cannot find module 'test/unit'`**
Node 20's `--test` does not accept directory paths in all shells. The
package.json scripts use the quoted glob `"test/unit/*.test.js"` which works
on macOS, Linux, and Windows PowerShell.

**A test fails intermittently with a timing assertion**
Increase the sleep tolerance or use a larger delay. The `retry_utils` tests
already use 10ms sleeps for speed, which is fine on CI but may flake on a
heavily loaded machine.

**`process.env` pollution**
Tests must restore any env var they change in a `finally` block. If you see
one test failing only after another test runs, this is usually the cause.
