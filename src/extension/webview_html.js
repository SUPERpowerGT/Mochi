function getWebviewHtml({ logoUri = "" } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mochi</title>
    <style>
      :root {
        color-scheme: light dark;
        --mochi-accent: #1f4f8f;
        --mochi-accent-soft: rgba(31, 79, 143, 0.12);
        --mochi-surface: color-mix(in srgb, var(--vscode-editor-background) 92%, white 8%);
        --mochi-surface-raised: color-mix(in srgb, var(--vscode-editor-background) 84%, black 16%);
        --mochi-border: color-mix(in srgb, var(--vscode-panel-border, rgba(127,127,127,0.35)) 78%, transparent);
      }
      body {
        font-family: "SF Pro Text", "Segoe UI", "Inter", sans-serif;
        margin: 0;
        padding: 0;
        background: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
      }
      .app {
        display: grid;
        grid-template-rows: auto 1fr auto;
        height: 100vh;
        background:
          radial-gradient(circle at top right, var(--mochi-accent-soft), transparent 32%),
          var(--vscode-editor-background);
      }
      .header {
        padding: 0;
        border-bottom: 1px solid var(--mochi-border);
        background: color-mix(in srgb, var(--vscode-editor-background) 86%, black 14%);
        display: grid;
      }
      .session-tabs-shell {
        min-width: 0;
        display: flex;
        align-items: center;
        height: 36px;
      }
      .brand-mark {
        width: 36px;
        height: 36px;
        display: grid;
        place-items: center;
        color: color-mix(in srgb, var(--mochi-accent) 86%, var(--vscode-editor-foreground) 14%);
        border-right: 1px solid var(--mochi-border);
        flex: 0 0 auto;
      }
      .brand-mark-logo {
        width: 23px;
        height: 23px;
        display: block;
        background: currentColor;
        -webkit-mask: url("${logoUri}") center / contain no-repeat;
        mask: url("${logoUri}") center / contain no-repeat;
        opacity: 0.9;
      }
      .subtle {
        font-size: 12px;
        opacity: 0.72;
        line-height: 1.45;
      }
      .session-tabs {
        min-width: 0;
        flex: 1 1 auto;
        height: 36px;
        display: flex;
        align-items: stretch;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .session-tabs::-webkit-scrollbar {
        display: none;
      }
      .session-tab {
        position: relative;
        width: 164px;
        min-width: 132px;
        max-width: 184px;
        height: 36px;
        box-sizing: border-box;
        border-radius: 0;
        border-right: 1px solid var(--mochi-border);
        border-top: 2px solid transparent;
        background: color-mix(in srgb, var(--vscode-editor-background) 76%, black 24%);
        color: color-mix(in srgb, var(--vscode-editor-foreground) 74%, transparent);
        box-shadow: none;
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 0 7px 0 10px;
        text-align: left;
        font-size: 12px;
        font-weight: 500;
        line-height: 1;
        letter-spacing: 0;
        overflow: hidden;
        transform: none;
        flex: 0 0 164px;
      }
      .session-tab-switch {
        min-width: 0;
        flex: 1 1 auto;
        height: 100%;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: inherit;
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 0;
        text-align: left;
        font: inherit;
        line-height: 1;
        box-shadow: none;
      }
      .session-tab-switch::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--mochi-accent) 64%, transparent);
        flex: 0 0 auto;
        opacity: 0;
      }
      .session-tab-label {
        min-width: 0;
        flex: 1 1 auto;
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .session-tab-close {
        width: 20px;
        height: 20px;
        box-sizing: border-box;
        border-radius: 5px;
        border: 0;
        background: transparent;
        color: inherit;
        display: grid;
        place-items: center;
        padding: 0;
        box-shadow: none;
        opacity: 0;
        font-size: 14px;
        line-height: 1;
        flex: 0 0 auto;
      }
      .session-tab:hover .session-tab-close,
      .session-tab.is-active .session-tab-close {
        opacity: 0.72;
      }
      .session-tab-close:hover:not(:disabled) {
        opacity: 1;
        background: color-mix(in srgb, var(--vscode-editor-foreground) 12%, transparent);
      }
      .session-tab.is-active {
        border-top-color: var(--mochi-accent);
        background: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
      }
      .session-tab.is-active .session-tab-switch::before {
        opacity: 1;
      }
      .tab-add-button {
        width: 38px;
        height: 36px;
        box-sizing: border-box;
        border-radius: 0;
        border-left: 1px solid var(--mochi-border);
        background: color-mix(in srgb, var(--vscode-editor-background) 78%, black 22%);
        color: var(--vscode-editor-foreground);
        box-shadow: none;
        padding: 0;
        font-size: 18px;
        line-height: 1;
        flex: 0 0 auto;
      }
      .messages {
        padding: 18px 18px 22px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .utility-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 18px;
        border-bottom: 1px solid var(--mochi-border);
        background: color-mix(in srgb, var(--vscode-editor-background) 90%, black 10%);
      }
      .auth-summary {
        min-width: 0;
        display: grid;
        gap: 2px;
      }
      .auth-title {
        font-size: 12px;
        font-weight: 600;
      }
      .auth-meta {
        font-size: 11px;
        opacity: 0.72;
        line-height: 1.4;
        white-space: pre-wrap;
      }
      .auth-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .bubble {
        max-width: 92%;
        padding: 11px 13px;
        border-radius: 14px;
        white-space: pre-wrap;
        line-height: 1.52;
        word-break: break-word;
        border: 1px solid transparent;
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.06);
      }
      .user {
        align-self: flex-end;
        background:
          linear-gradient(
            135deg,
            color-mix(in srgb, var(--mochi-accent) 58%, var(--vscode-editor-background) 42%),
            color-mix(in srgb, var(--mochi-accent) 44%, black 56%)
          );
        color: var(--vscode-button-foreground);
        border-color: color-mix(in srgb, var(--mochi-accent) 30%, transparent);
        box-shadow: 0 6px 14px rgba(15, 31, 52, 0.16);
      }
      .assistant {
        align-self: flex-start;
        width: min(92%, 760px);
        max-width: none;
        box-sizing: border-box;
        padding: 2px 0;
        border-radius: 0;
        background: transparent;
        border-color: transparent;
        box-shadow: none;
      }
      .assistant.markdown {
        white-space: normal;
      }
      .assistant.markdown h1,
      .assistant.markdown h2,
      .assistant.markdown h3,
      .assistant.markdown h4,
      .assistant.markdown h5,
      .assistant.markdown h6 {
        margin: 14px 0 8px;
        line-height: 1.25;
        font-weight: 650;
        letter-spacing: 0;
      }
      .assistant.markdown h1 {
        font-size: 20px;
      }
      .assistant.markdown h2 {
        font-size: 17px;
      }
      .assistant.markdown h3 {
        font-size: 15px;
      }
      .assistant.markdown h4,
      .assistant.markdown h5,
      .assistant.markdown h6 {
        font-size: 13px;
      }
      .assistant.markdown p {
        margin: 0 0 10px;
      }
      .assistant.markdown ul,
      .assistant.markdown ol {
        margin: 0 0 10px 20px;
        padding: 0;
      }
      .assistant.markdown li {
        margin: 3px 0;
      }
      .assistant.markdown pre {
        margin: 10px 0;
        padding: 10px 12px;
        overflow-x: auto;
        border-radius: 7px;
        background: color-mix(in srgb, var(--vscode-editor-background) 78%, black 22%);
        border: 1px solid var(--mochi-border);
      }
      .assistant.markdown code {
        font-family: var(--vscode-editor-font-family, "SFMono-Regular", Consolas, monospace);
        font-size: 12px;
      }
      .assistant.markdown :not(pre) > code {
        padding: 1px 4px;
        border-radius: 4px;
        background: color-mix(in srgb, var(--vscode-editor-foreground) 10%, transparent);
      }
      .assistant.markdown blockquote {
        margin: 8px 0 10px;
        padding: 2px 0 2px 11px;
        border-left: 3px solid var(--mochi-accent);
        color: color-mix(in srgb, var(--vscode-editor-foreground) 78%, transparent);
      }
      .assistant.markdown hr {
        border: 0;
        border-top: 1px solid var(--mochi-border);
        margin: 14px 0;
      }
      .assistant.markdown a {
        color: var(--vscode-textLink-foreground, #4daafc);
        text-decoration: none;
      }
      .assistant.markdown a:hover {
        text-decoration: underline;
      }
      .assistant.is-thinking {
        padding: 0;
        border-radius: 0;
        background: transparent;
        border-color: transparent;
        box-shadow: none;
        opacity: 0.72;
        font-size: 12px;
        line-height: 1.4;
      }
      .error {
        align-self: flex-start;
        width: min(92%, 760px);
        max-width: none;
        box-sizing: border-box;
        background: color-mix(in srgb, var(--vscode-inputValidation-errorBackground, rgba(255, 0, 0, 0.12)) 72%, var(--mochi-surface) 28%);
        border-color: color-mix(in srgb, var(--vscode-errorForeground, #f14c4c) 24%, transparent);
      }
      .approval {
        align-self: flex-start;
        width: min(92%, 760px);
        max-width: none;
        box-sizing: border-box;
        padding: 10px 12px;
        border-radius: 14px;
        background: color-mix(in srgb, var(--mochi-accent-soft) 28%, var(--mochi-surface) 72%);
        border: 1px solid color-mix(in srgb, var(--mochi-accent) 18%, transparent);
        display: grid;
        gap: 8px;
        box-shadow: none;
        transition: opacity 140ms ease, transform 140ms ease;
      }
      .approval.is-hiding {
        opacity: 0;
        transform: translateY(-4px);
      }
      .thinking-shell {
        align-self: flex-start;
        width: min(92%, 760px);
        display: grid;
        gap: 7px;
      }
      .thinking-shell .bubble {
        max-width: none;
        width: 100%;
        box-sizing: border-box;
      }
      .thinking-activity-stack {
        display: grid;
        gap: 6px;
        padding-left: 0;
        margin-top: 2px;
        width: 100%;
        box-sizing: border-box;
      }
      .thinking-label {
        display: inline-flex;
        align-items: baseline;
        gap: 2px;
      }
      .thinking-dots {
        display: inline-flex;
        min-width: 18px;
      }
      .thinking-dots span {
        opacity: 0.18;
        animation: mochi-thinking-blink 1.2s infinite ease-in-out;
      }
      .thinking-dots span:nth-child(2) {
        animation-delay: 0.16s;
      }
      .thinking-dots span:nth-child(3) {
        animation-delay: 0.32s;
      }
      @keyframes mochi-thinking-blink {
        0%, 80%, 100% {
          opacity: 0.18;
        }
        40% {
          opacity: 0.88;
        }
      }
      .activity {
        display: flex;
        width: 100%;
        pointer-events: auto;
      }
      .activity-line {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--mochi-surface-raised) 64%, transparent);
        border: 1px solid rgba(127, 127, 127, 0.08);
        font-size: 12px;
        line-height: 1.35;
        opacity: 0.82;
        width: 100%;
        box-sizing: border-box;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
      }
      .activity-dot {
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: var(--mochi-accent);
        flex: 0 0 auto;
      }
      .activity-line span:last-child {
        min-width: 0;
        flex: 1 1 auto;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .approval-title {
        font-weight: 600;
        font-size: 13px;
      }
      .approval-meta {
        font-size: 12px;
        opacity: 0.72;
        line-height: 1.45;
      }
      .approval-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .ghost {
        background: color-mix(in srgb, var(--vscode-editor-background) 88%, transparent);
        color: var(--vscode-editor-foreground);
        border: 1px solid var(--mochi-border);
        box-shadow: none;
      }
      .approved {
        opacity: 0.86;
      }
      .denied {
        opacity: 0.86;
      }
      .composer {
        padding: 14px 18px 18px;
        border-top: 1px solid var(--mochi-border);
        display: grid;
        gap: 10px;
        background:
          linear-gradient(180deg, var(--mochi-accent-soft), rgba(127,127,127,0.02));
      }
      textarea {
        width: 100%;
        min-height: 126px;
        resize: vertical;
        border: 1px solid var(--vscode-input-border, rgba(127,127,127,0.5));
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border-radius: 16px;
        padding: 14px 16px;
        box-sizing: border-box;
        line-height: 1.5;
        box-shadow:
          inset 0 1px 0 rgba(255,255,255,0.03),
          0 8px 18px rgba(0,0,0,0.05);
      }
      textarea:focus {
        outline: none;
        border-color: var(--mochi-accent);
        box-shadow:
          0 0 0 1px var(--mochi-accent),
          0 10px 24px rgba(31, 79, 143, 0.12);
      }
      .actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }
      button {
        border: 0;
        border-radius: 999px;
        padding: 10px 17px;
        cursor: pointer;
        background:
          linear-gradient(135deg, var(--mochi-accent), color-mix(in srgb, var(--mochi-accent) 78%, black 22%));
        color: white;
        font-weight: 600;
        letter-spacing: 0.01em;
        transition: transform 120ms ease, opacity 120ms ease, filter 120ms ease, box-shadow 120ms ease;
        box-shadow: 0 8px 18px rgba(31, 79, 143, 0.22);
      }
      .icon-button {
        width: 32px;
        height: 32px;
        padding: 0;
        display: grid;
        place-items: center;
        font-size: 18px;
        line-height: 1;
        box-shadow: none;
      }
      .toolbar-button {
        padding: 7px 12px;
        border-radius: 999px;
        font-size: 11px;
        line-height: 1;
        box-shadow: none;
      }
      button:hover:not(:disabled) {
        filter: brightness(1.05);
        transform: translateY(-1px);
        box-shadow: 0 10px 22px rgba(31, 79, 143, 0.24);
      }
      .session-tab,
      .tab-add-button {
        border-radius: 0;
        box-shadow: none;
      }
      .session-tab-switch:hover:not(:disabled),
      .tab-add-button:hover:not(:disabled),
      .session-tab-close:hover:not(:disabled) {
        transform: none;
        box-shadow: none;
        filter: brightness(1.08);
      }
      button:disabled {
        opacity: 0.65;
        cursor: default;
      }
      .statusline {
        display: none;
        opacity: 0.68;
        font-size: 12px;
        padding-left: 2px;
      }
      .auth-overlay {
        position: fixed;
        inset: 0;
        background: color-mix(in srgb, var(--vscode-editor-background) 60%, black 40%);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 50;
        padding: 24px;
        box-sizing: border-box;
      }
      .auth-overlay.is-open {
        display: flex;
      }
      .auth-dialog {
        width: min(420px, 100%);
        max-height: calc(100vh - 48px);
        overflow-y: auto;
        background: var(--mochi-surface);
        border: 1px solid var(--mochi-border);
        border-radius: 14px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
        padding: 18px 18px 16px;
        display: grid;
        gap: 14px;
      }
      .auth-dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .auth-dialog-title {
        font-size: 14px;
        font-weight: 600;
      }
      .auth-dialog-close {
        background: transparent;
        color: var(--vscode-editor-foreground);
        border: 0;
        box-shadow: none;
        padding: 4px 8px;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
        opacity: 0.7;
      }
      .auth-dialog-close:hover {
        opacity: 1;
        background: color-mix(in srgb, var(--vscode-editor-foreground) 8%, transparent);
        transform: none;
      }
      .auth-dialog-tabs {
        display: flex;
        gap: 6px;
        border-bottom: 1px solid var(--mochi-border);
        padding-bottom: 0;
      }
      .auth-tab {
        background: transparent;
        color: var(--vscode-editor-foreground);
        border: 0;
        border-bottom: 2px solid transparent;
        border-radius: 0;
        box-shadow: none;
        padding: 6px 10px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        opacity: 0.7;
      }
      .auth-tab.is-active {
        opacity: 1;
        border-bottom-color: var(--mochi-accent);
        color: var(--mochi-accent);
      }
      .auth-tab:hover:not(:disabled) {
        opacity: 1;
        transform: none;
        box-shadow: none;
        background: transparent;
      }
      .auth-form {
        display: grid;
        gap: 10px;
      }
      .auth-field {
        display: grid;
        gap: 4px;
      }
      .auth-field label {
        font-size: 11px;
        opacity: 0.78;
        font-weight: 500;
      }
      .auth-input {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 10px;
        font-size: 13px;
        line-height: 1.4;
        border-radius: 8px;
        border: 1px solid var(--vscode-input-border, rgba(127,127,127,0.5));
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
      }
      .auth-input:focus {
        outline: none;
        border-color: var(--mochi-accent);
        box-shadow: 0 0 0 1px var(--mochi-accent);
      }
      .auth-error {
        display: none;
        padding: 8px 10px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--vscode-inputValidation-errorBackground, rgba(255, 0, 0, 0.18)) 70%, var(--mochi-surface) 30%);
        border: 1px solid color-mix(in srgb, var(--vscode-errorForeground, #f14c4c) 40%, transparent);
        color: var(--vscode-errorForeground, #f14c4c);
        font-size: 12px;
        line-height: 1.45;
      }
      .auth-error.is-shown {
        display: block;
      }
      .auth-actions-row {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
      }
      .auth-submit {
        padding: 8px 14px;
        font-size: 12px;
        border-radius: 999px;
      }
      .auth-hint {
        font-size: 11px;
        opacity: 0.65;
        line-height: 1.45;
      }
      .restore-list {
        display: grid;
        gap: 8px;
        max-height: 360px;
        overflow-y: auto;
      }
      .restore-empty {
        font-size: 12px;
        opacity: 0.7;
        text-align: center;
        padding: 24px 6px;
      }
      .restore-card {
        display: grid;
        gap: 4px;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--mochi-border);
        background: color-mix(in srgb, var(--vscode-editor-background) 88%, transparent);
        cursor: pointer;
        transition: border-color 120ms ease, background 120ms ease;
      }
      .restore-card:hover {
        border-color: var(--mochi-accent);
        background: color-mix(in srgb, var(--mochi-accent) 10%, var(--vscode-editor-background) 90%);
      }
      .restore-card-title {
        font-size: 13px;
        font-weight: 600;
      }
      .restore-card-meta {
        font-size: 11px;
        opacity: 0.7;
      }
      .restore-card-summary {
        font-size: 12px;
        opacity: 0.85;
        line-height: 1.45;
      }
    </style>
  </head>
  <body>
    <div class="app">
      <div class="header">
        <div class="session-tabs-shell">
          <div class="brand-mark" aria-label="Mochi">
            <span class="brand-mark-logo" aria-hidden="true"></span>
          </div>
          <div id="sessionTabs" class="session-tabs" aria-label="Mochi sessions"></div>
          <button class="tab-add-button" id="newSession" type="button" title="New session">+</button>
        </div>
      </div>
      <div class="utility-bar">
        <div class="auth-summary">
          <div id="authTitle" class="auth-title">Signed out</div>
          <div id="authMeta" class="auth-meta">Sign in to enable cloud checkpoint sync and cross-device restore.</div>
        </div>
        <div class="auth-actions">
          <button id="signInButton" class="ghost toolbar-button" type="button">Sign In</button>
          <button id="registerButton" class="ghost toolbar-button" type="button">Register</button>
          <button id="signOutButton" class="ghost toolbar-button" type="button" hidden>Sign Out</button>
          <button id="restoreButton" class="ghost toolbar-button" type="button" hidden>Restore</button>
          <button id="workspaceButton" class="ghost toolbar-button" type="button">Workspace</button>
        </div>
      </div>
      <div id="messages" class="messages">
        <div class="bubble assistant">Mochi is ready. Ask for code changes, explanations, or project help.</div>
      </div>
      <div class="composer">
        <div id="status" class="statusline">Ready.</div>
        <textarea id="prompt" placeholder="Ask Mochi about your code, files, or next change..."></textarea>
        <div class="actions">
          <div class="subtle">Press Enter to send. Use Shift+Enter for a new line.</div>
          <button id="send" type="button" onclick="sendPrompt()">Send</button>
        </div>
      </div>
    </div>
    <div id="authOverlay" class="auth-overlay" role="dialog" aria-modal="true" aria-labelledby="authDialogTitle">
      <div class="auth-dialog">
        <div class="auth-dialog-header">
          <div id="authDialogTitle" class="auth-dialog-title">Sign in to Mochi</div>
          <button id="authDialogClose" class="auth-dialog-close" type="button" aria-label="Close">x</button>
        </div>
        <div class="auth-dialog-tabs" role="tablist">
          <button id="authTabSignIn" class="auth-tab is-active" type="button" role="tab">Sign In</button>
          <button id="authTabRegister" class="auth-tab" type="button" role="tab">Register</button>
        </div>
        <form id="authForm" class="auth-form" autocomplete="off">
          <div id="authErrorBox" class="auth-error" role="alert"></div>
          <div id="authFieldDisplayName" class="auth-field" hidden>
            <label for="authDisplayName">Display name</label>
            <input id="authDisplayName" class="auth-input" type="text" autocomplete="off" />
          </div>
          <div class="auth-field">
            <label for="authEmail">Email</label>
            <input id="authEmail" class="auth-input" type="email" autocomplete="off" required />
          </div>
          <div class="auth-field">
            <label for="authPassword">Password</label>
            <input id="authPassword" class="auth-input" type="password" autocomplete="new-password" required />
          </div>
          <div class="auth-field">
            <label for="authDeviceName">Device name</label>
            <input id="authDeviceName" class="auth-input" type="text" autocomplete="off" />
          </div>
          <div class="auth-hint">Credentials are sent only to the configured Mochi identity service. The auth token is stored in VS Code SecretStorage.</div>
          <div class="auth-actions-row">
            <button id="authCancel" type="button" class="ghost toolbar-button">Cancel</button>
            <button id="authSubmit" type="submit" class="auth-submit">Sign In</button>
          </div>
        </form>
      </div>
    </div>
    <div id="restoreOverlay" class="auth-overlay" role="dialog" aria-modal="true" aria-labelledby="restoreDialogTitle">
      <div class="auth-dialog">
        <div class="auth-dialog-header">
          <div id="restoreDialogTitle" class="auth-dialog-title">Restore checkpoint</div>
          <button id="restoreDialogClose" class="auth-dialog-close" type="button" aria-label="Close">x</button>
        </div>
        <div class="auth-hint">Pick a checkpoint to hydrate into the current workspace. Checkpoints are scoped to your account.</div>
        <div id="restoreList" class="restore-list">
          <div class="restore-empty">Loading checkpoints...</div>
        </div>
      </div>
    </div>
    <script>
      (function () {
        const vscode = acquireVsCodeApi();
        const promptEl = document.getElementById("prompt");
        const messagesEl = document.getElementById("messages");
        const statusEl = document.getElementById("status");
        const sendButton = document.getElementById("send");
        const newSessionButton = document.getElementById("newSession");
        const sessionTabsEl = document.getElementById("sessionTabs");
        const authTitleEl = document.getElementById("authTitle");
        const authMetaEl = document.getElementById("authMeta");
        const signInButton = document.getElementById("signInButton");
        const registerButton = document.getElementById("registerButton");
        const signOutButton = document.getElementById("signOutButton");
        const restoreButton = document.getElementById("restoreButton");
        const workspaceButton = document.getElementById("workspaceButton");
        let pendingEl = null;
        let pendingShellEl = null;
        let activityStackEl = null;
        let streamingReplyEl = null;
        let streamingReplyText = "";
        let activeBaseSessionId = "mochi-chat";
        let loadedBaseSessionId = "";
        let latestSessionSyncVersion = 0;
        let sessions = [];
        let authState = {
          isSignedIn: false,
          email: "",
          displayName: "",
          userId: "",
          deviceName: "",
          workspaceRoot: "",
          workspaceSelected: false
        };
        const draftsBySession = Object.create(null);
        const approvalCards = new Map();

        function renderAuthState(nextState) {
          authState = Object.assign({}, authState, nextState || {});

          if (authState.isSignedIn) {
            const title = authState.displayName || authState.email || authState.userId || "Signed in";
            authTitleEl.textContent = "Signed in as " + title;
            authMetaEl.textContent = [
              authState.email || authState.userId || "",
              authState.deviceName ? ("Device: " + authState.deviceName) : "",
              authState.workspaceRoot ? ("Workspace: " + authState.workspaceRoot) : "Workspace: none selected"
            ].filter(Boolean).join("\\n");
          } else {
            authTitleEl.textContent = "Signed out";
            authMetaEl.textContent = authState.workspaceRoot
              ? "Sign in to enable cloud checkpoint sync and restore.\\nWorkspace: " + authState.workspaceRoot
              : "Sign in to enable cloud checkpoint sync and cross-device restore.";
          }

          signInButton.hidden = Boolean(authState.isSignedIn);
          registerButton.hidden = Boolean(authState.isSignedIn);
          signOutButton.hidden = !authState.isSignedIn;
          restoreButton.hidden = !authState.isSignedIn;
          restoreButton.disabled = !authState.isSignedIn;
          workspaceButton.textContent = authState.workspaceSelected ? "Switch Workspace" : "Select Workspace";
        }

        const authOverlayEl = document.getElementById("authOverlay");
        const authDialogTitleEl = document.getElementById("authDialogTitle");
        const authTabSignInEl = document.getElementById("authTabSignIn");
        const authTabRegisterEl = document.getElementById("authTabRegister");
        const authFormEl = document.getElementById("authForm");
        const authErrorBoxEl = document.getElementById("authErrorBox");
        const authFieldDisplayNameEl = document.getElementById("authFieldDisplayName");
        const authDisplayNameEl = document.getElementById("authDisplayName");
        const authEmailEl = document.getElementById("authEmail");
        const authPasswordEl = document.getElementById("authPassword");
        const authDeviceNameEl = document.getElementById("authDeviceName");
        const authSubmitEl = document.getElementById("authSubmit");
        const authCancelEl = document.getElementById("authCancel");
        const authDialogCloseEl = document.getElementById("authDialogClose");
        const restoreOverlayEl = document.getElementById("restoreOverlay");
        const restoreListEl = document.getElementById("restoreList");
        const restoreDialogCloseEl = document.getElementById("restoreDialogClose");

        let authMode = "signin";
        let authBusy = false;

        function setAuthMode(mode) {
          authMode = mode === "register" ? "register" : "signin";
          if (authMode === "register") {
            authDialogTitleEl.textContent = "Register a Mochi account";
            authTabRegisterEl.classList.add("is-active");
            authTabSignInEl.classList.remove("is-active");
            authFieldDisplayNameEl.hidden = false;
            authSubmitEl.textContent = "Create account";
          } else {
            authDialogTitleEl.textContent = "Sign in to Mochi";
            authTabSignInEl.classList.add("is-active");
            authTabRegisterEl.classList.remove("is-active");
            authFieldDisplayNameEl.hidden = true;
            authSubmitEl.textContent = "Sign In";
          }
          hideAuthError();
        }

        function showAuthError(message) {
          authErrorBoxEl.textContent = String(message || "");
          authErrorBoxEl.classList.add("is-shown");
        }

        function hideAuthError() {
          authErrorBoxEl.textContent = "";
          authErrorBoxEl.classList.remove("is-shown");
        }

        function setAuthBusy(busy) {
          authBusy = Boolean(busy);
          authSubmitEl.disabled = authBusy;
          authCancelEl.disabled = authBusy;
          if (authBusy) {
            authSubmitEl.dataset.label = authSubmitEl.textContent;
            authSubmitEl.textContent = "Working...";
          } else if (authSubmitEl.dataset.label) {
            authSubmitEl.textContent = authSubmitEl.dataset.label;
            delete authSubmitEl.dataset.label;
          }
        }

        function openAuthDialog(mode) {
          setAuthMode(mode);
          if (!authDeviceNameEl.value) {
            authDeviceNameEl.value = authState.deviceName || "This Machine";
          }
          authOverlayEl.classList.add("is-open");
          setTimeout(function () {
            (authMode === "register" ? authDisplayNameEl : authEmailEl).focus();
          }, 30);
        }

        function closeAuthDialog() {
          if (authBusy) {
            return;
          }
          authOverlayEl.classList.remove("is-open");
          authPasswordEl.value = "";
          hideAuthError();
        }

        authTabSignInEl.addEventListener("click", function () {
          setAuthMode("signin");
        });
        authTabRegisterEl.addEventListener("click", function () {
          setAuthMode("register");
        });
        authCancelEl.addEventListener("click", closeAuthDialog);
        authDialogCloseEl.addEventListener("click", closeAuthDialog);
        authOverlayEl.addEventListener("click", function (event) {
          if (event.target === authOverlayEl) {
            closeAuthDialog();
          }
        });
        authFormEl.addEventListener("submit", function (event) {
          event.preventDefault();
          if (authBusy) {
            return;
          }
          const payload = {
            mode: authMode,
            email: authEmailEl.value.trim(),
            password: authPasswordEl.value,
            deviceName: authDeviceNameEl.value.trim() || "This Machine"
          };
          if (authMode === "register") {
            payload.displayName = authDisplayNameEl.value.trim();
            if (!payload.displayName) {
              showAuthError("Display name is required.");
              authDisplayNameEl.focus();
              return;
            }
          }
          if (!payload.email) {
            showAuthError("Email is required.");
            authEmailEl.focus();
            return;
          }
          if (!payload.password) {
            showAuthError("Password is required.");
            authPasswordEl.focus();
            return;
          }
          hideAuthError();
          setAuthBusy(true);
          vscode.postMessage({ type: "authSubmit", value: payload });
        });

        function openRestoreDialog() {
          restoreOverlayEl.classList.add("is-open");
          restoreListEl.innerHTML = '<div class="restore-empty">Loading checkpoints...</div>';
          vscode.postMessage({ type: "loadCheckpoints" });
        }
        function closeRestoreDialog() {
          restoreOverlayEl.classList.remove("is-open");
        }
        restoreDialogCloseEl.addEventListener("click", closeRestoreDialog);
        restoreOverlayEl.addEventListener("click", function (event) {
          if (event.target === restoreOverlayEl) {
            closeRestoreDialog();
          }
        });

        function renderCheckpointList(items) {
          restoreListEl.innerHTML = "";
          if (!Array.isArray(items) || !items.length) {
            const empty = document.createElement("div");
            empty.className = "restore-empty";
            empty.textContent = "No cloud checkpoints found for this account.";
            restoreListEl.appendChild(empty);
            return;
          }
          for (const item of items) {
            const card = document.createElement("div");
            card.className = "restore-card";
            card.tabIndex = 0;

            const title = document.createElement("div");
            title.className = "restore-card-title";
            title.textContent = item.title || "Checkpoint";
            card.appendChild(title);

            const meta = document.createElement("div");
            meta.className = "restore-card-meta";
            const metaParts = [];
            if (item.workspaceLabel || item.workspaceKey) {
              metaParts.push(item.workspaceLabel || item.workspaceKey);
            }
            if (item.deviceName || item.deviceId) {
              metaParts.push(item.deviceName || item.deviceId);
            }
            if (item.createdAt) {
              const d = new Date(item.createdAt);
              if (!Number.isNaN(d.getTime())) {
                metaParts.push(d.toLocaleString());
              }
            }
            meta.textContent = metaParts.join(" \\u00b7 ");
            card.appendChild(meta);

            const summary = document.createElement("div");
            summary.className = "restore-card-summary";
            const text = String(item.summary || "").replace(/\\s+/g, " ").trim();
            summary.textContent = text ? (text.length > 200 ? text.slice(0, 197) + "..." : text) : "No summary";
            card.appendChild(summary);

            const trigger = function () {
              if (!item.checkpointId) return;
              restoreListEl.innerHTML = '<div class="restore-empty">Restoring...</div>';
              vscode.postMessage({ type: "restoreCheckpointById", value: { checkpointId: item.checkpointId } });
            };
            card.addEventListener("click", trigger);
            card.addEventListener("keydown", function (event) {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                trigger();
              }
            });

            restoreListEl.appendChild(card);
          }
        }

        document.addEventListener("keydown", function (event) {
          if (event.key === "Escape") {
            if (authOverlayEl.classList.contains("is-open")) {
              closeAuthDialog();
            }
            if (restoreOverlayEl.classList.contains("is-open")) {
              closeRestoreDialog();
            }
          }
        });

        function scrollToBottom() {
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }

        function isNearBottom() {
          const threshold = 48;
          return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < threshold;
        }

        function addMessage(role, text, options) {
          const settings = options || {};
          const shouldScroll = settings.scroll === true || (settings.scroll !== false && isNearBottom());
          const div = document.createElement("div");
          div.className = "bubble " + role;
          setBubbleContent(div, role, text);
          messagesEl.appendChild(div);
          if (shouldScroll) {
            scrollToBottom();
          }
          return div;
        }

        function renderWelcome() {
          messagesEl.innerHTML = "";
          addMessage("assistant", "Mochi is ready. Ask for code changes, explanations, or project help.", { scroll: true });
        }

        function renderSessionHistory(items, baseSessionId) {
          if (baseSessionId && baseSessionId !== activeBaseSessionId) {
            return;
          }

          loadedBaseSessionId = baseSessionId || activeBaseSessionId;
          const messages = Array.isArray(items) ? items : [];
          messagesEl.innerHTML = "";

          if (!messages.length) {
            renderWelcome();
            return;
          }

          for (const item of messages) {
            addMessage(item.role === "user" ? "user" : "assistant", item.text || "", { scroll: false });
          }
          scrollToBottom();
        }

        function saveCurrentDraft() {
          if (!activeBaseSessionId) {
            return;
          }
          draftsBySession[activeBaseSessionId] = promptEl.value;
        }

        function restoreDraftForSession(baseSessionId) {
          promptEl.value = draftsBySession[baseSessionId || ""] || "";
        }

        function renderSessionTabs(items) {
          sessions = Array.isArray(items) ? items : [];
          sessionTabsEl.innerHTML = "";

          if (!sessions.length) {
            const fallback = {
              baseSessionId: activeBaseSessionId || "mochi-chat",
              title: "New chat",
              active: true
            };
            sessions = [fallback];
          }

          for (const session of sessions) {
            const tab = document.createElement("div");
            tab.className = "session-tab" + (session.active ? " is-active" : "");
            tab.title = session.baseSessionId || session.title || "Session";
            tab.dataset.baseSessionId = session.baseSessionId || "";

            const switchButton = document.createElement("button");
            switchButton.type = "button";
            switchButton.className = "session-tab-switch";
            switchButton.title = session.baseSessionId || session.title || "Session";

            const label = document.createElement("span");
            label.className = "session-tab-label";
            label.textContent = session.title || session.baseSessionId || "New chat";
            switchButton.appendChild(label);
            tab.appendChild(switchButton);

            const closeButton = document.createElement("button");
            closeButton.type = "button";
            closeButton.className = "session-tab-close";
            closeButton.textContent = "×";
            closeButton.title = "Close tab";
            closeButton.setAttribute("aria-label", "Close tab");
            closeButton.addEventListener("click", function (event) {
              event.preventDefault();
              event.stopPropagation();
              const targetSessionId = tab.dataset.baseSessionId;
              if (!targetSessionId) {
                return;
              }

              saveCurrentDraft();
              delete draftsBySession[targetSessionId];
              clearActivity();
              statusEl.textContent = "Closing tab...";
              closeSessionTabLocally(targetSessionId);
              vscode.postMessage({
                type: "closeSession",
                baseSessionId: targetSessionId
              });
            });
            tab.appendChild(closeButton);

            switchButton.addEventListener("click", function () {
              const targetSessionId = tab.dataset.baseSessionId;
              if (!targetSessionId || targetSessionId === activeBaseSessionId) {
                return;
              }

              saveCurrentDraft();
              restoreDraftForSession(targetSessionId);
              clearActivity();
              loadedBaseSessionId = "";
              sendButton.disabled = true;
              statusEl.textContent = "Switching session...";
              vscode.postMessage({
                type: "switchSession",
                baseSessionId: targetSessionId
              });
            });

            sessionTabsEl.appendChild(tab);
            if (session.active) {
              requestAnimationFrame(function () {
                tab.scrollIntoView({ block: "nearest", inline: "nearest" });
              });
            }
          }
        }

        function closeSessionTabLocally(baseSessionId) {
          const targetSessionId = baseSessionId || "";
          if (!targetSessionId) {
            return;
          }

          const closingActiveSession = targetSessionId === activeBaseSessionId;
          const currentIndex = sessions.findIndex(function (session) {
            return session.baseSessionId === targetSessionId;
          });
          const nextSessions = sessions.filter(function (session) {
            return session.baseSessionId !== targetSessionId;
          });

          if (!nextSessions.length) {
            sessions = [];
            loadedBaseSessionId = "";
            activeBaseSessionId = "";
            promptEl.value = "";
            renderSessionTabs([]);
            renderSessionHistory([]);
            return;
          }

          if (closingActiveSession) {
            const nextIndex = Math.min(Math.max(currentIndex, 0), nextSessions.length - 1);
            activeBaseSessionId = nextSessions[nextIndex].baseSessionId || activeBaseSessionId;
            restoreDraftForSession(activeBaseSessionId);
            loadedBaseSessionId = "";
            sendButton.disabled = true;
          }

          sessions = nextSessions.map(function (session) {
            return {
              ...session,
              active: session.baseSessionId === activeBaseSessionId
            };
          });
          renderSessionTabs(sessions);
        }

        function setActiveSessionLabel(baseSessionId) {
          const nextBaseSessionId = baseSessionId || "mochi-chat";
          if (nextBaseSessionId !== activeBaseSessionId) {
            saveCurrentDraft();
            restoreDraftForSession(nextBaseSessionId);
          }
          activeBaseSessionId = nextBaseSessionId;
          if (loadedBaseSessionId !== activeBaseSessionId) {
            sendButton.disabled = true;
            statusEl.textContent = "Loading session...";
          }
          renderSessionTabs(sessions.map(function (session) {
            return {
              ...session,
              active: session.baseSessionId === activeBaseSessionId
            };
          }));
        }

        function ensureThinkingShell() {
          if (pendingShellEl && pendingEl && activityStackEl) {
            return;
          }

          pendingShellEl = document.createElement("div");
          pendingShellEl.className = "thinking-shell";

          pendingEl = document.createElement("div");
          pendingEl.className = "bubble assistant is-thinking";
          pendingEl.innerHTML = '<span class="thinking-label">Thinking<span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span></span>';

          activityStackEl = document.createElement("div");
          activityStackEl.className = "thinking-activity-stack";

          pendingShellEl.appendChild(pendingEl);
          pendingShellEl.appendChild(activityStackEl);
          messagesEl.appendChild(pendingShellEl);
          scrollToBottom();
        }

        function ensureStreamingReply() {
          ensureThinkingShell();
          if (streamingReplyEl) {
            return streamingReplyEl;
          }

          streamingReplyEl = document.createElement("div");
          streamingReplyEl.className = "bubble assistant";
          streamingReplyText = "";
          setBubbleContent(streamingReplyEl, "assistant", streamingReplyText);
          pendingShellEl.appendChild(streamingReplyEl);
          scrollToBottom();
          return streamingReplyEl;
        }

        function addActivity(activity) {
          ensureThinkingShell();
          activityStackEl.innerHTML = "";

          const wrapper = document.createElement("div");
          wrapper.className = "activity";

          const line = document.createElement("div");
          line.className = "activity-line";

          const dot = document.createElement("span");
          dot.className = "activity-dot";

          const text = document.createElement("span");
          text.textContent = activity.text || "";
          text.title = activity.text || "";

          line.appendChild(dot);
          line.appendChild(text);
          wrapper.appendChild(line);
          activityStackEl.appendChild(wrapper);
          scrollToBottom();
          return wrapper;
        }

        function clearActivity() {
          if (pendingShellEl) {
            pendingShellEl.remove();
            pendingShellEl = null;
            pendingEl = null;
            activityStackEl = null;
            streamingReplyEl = null;
            streamingReplyText = "";
          }
        }

        function appendReplyDelta(delta) {
          if (!delta) {
            return;
          }

          const bubble = ensureStreamingReply();
          streamingReplyText += delta;
          setBubbleContent(bubble, "assistant", streamingReplyText);
          scrollToBottom();
        }

        function syncReplyStream(text) {
          if (!text) {
            return;
          }

          const bubble = ensureStreamingReply();
          streamingReplyText = text;
          setBubbleContent(bubble, "assistant", streamingReplyText);
          scrollToBottom();
        }

        function clearReplyStream() {
          if (streamingReplyEl) {
            streamingReplyEl.remove();
            streamingReplyEl = null;
            streamingReplyText = "";
          }
        }

        function finalizeReply(text) {
          const finalText = text || "";
          if (streamingReplyEl) {
            const finalizedBubble = streamingReplyEl;
            streamingReplyText = finalText;
            if (pendingShellEl) {
              pendingShellEl.removeChild(finalizedBubble);
            }
            finalizedBubble.className = "bubble assistant";
            setBubbleContent(finalizedBubble, "assistant", finalText);
            messagesEl.appendChild(finalizedBubble);
            clearActivity();
            scrollToBottom();
            return;
          }

          clearActivity();
          addMessage("assistant", finalText, { scroll: true });
        }

        function setBubbleContent(element, role, text) {
          if (role === "assistant") {
            element.classList.add("markdown");
            element.innerHTML = renderMarkdown(text || "");
            return;
          }

          element.classList.remove("markdown");
          element.textContent = text || "";
        }

        function renderMarkdown(markdown) {
          const source = String(markdown || "").replace(/\\r\\n/g, "\\n");
          const codeBlocks = [];
          let text = source.replace(new RegExp("\\\\x60\\\\x60\\\\x60([^\\\\n\\\\x60]*)\\\\n([\\\\s\\\\S]*?)\\\\x60\\\\x60\\\\x60", "g"), function (_, lang, code) {
            const index = codeBlocks.length;
            codeBlocks.push({
              lang: String(lang || "").trim(),
              code: code.replace(/\\n$/, "")
            });
            return "\\n@@MOCHI_CODE_BLOCK_" + index + "@@\\n";
          });

          text = escapeHtml(text);
          const lines = text.split("\\n");
          const html = [];
          let paragraph = [];
          let listType = "";

          function flushParagraph() {
            if (!paragraph.length) {
              return;
            }
            html.push("<p>" + renderInline(paragraph.join(" ")) + "</p>");
            paragraph = [];
          }

          function closeList() {
            if (!listType) {
              return;
            }
            html.push("</" + listType + ">");
            listType = "";
          }

          for (const line of lines) {
            const codeMatch = line.match(/^@@MOCHI_CODE_BLOCK_(\\d+)@@$/);
            if (codeMatch) {
              flushParagraph();
              closeList();
              const block = codeBlocks[Number(codeMatch[1])] || { lang: "", code: "" };
              const langClass = block.lang ? ' class="language-' + escapeAttribute(block.lang) + '"' : "";
              html.push("<pre><code" + langClass + ">" + escapeHtml(block.code) + "</code></pre>");
              continue;
            }

            if (!line.trim()) {
              flushParagraph();
              closeList();
              continue;
            }

            if (/^---+$/.test(line.trim())) {
              flushParagraph();
              closeList();
              html.push("<hr />");
              continue;
            }

            const heading = line.match(/^(#{1,6})\\s+(.+)$/);
            if (heading) {
              flushParagraph();
              closeList();
              const level = heading[1].length;
              html.push("<h" + level + ">" + renderInline(heading[2]) + "</h" + level + ">");
              continue;
            }

            const quote = line.match(/^&gt;\\s?(.+)$/);
            if (quote) {
              flushParagraph();
              closeList();
              html.push("<blockquote>" + renderInline(quote[1]) + "</blockquote>");
              continue;
            }

            const ordered = line.match(/^\\s*\\d+\\.\\s+(.+)$/);
            if (ordered) {
              flushParagraph();
              if (listType !== "ol") {
                closeList();
                html.push("<ol>");
                listType = "ol";
              }
              html.push("<li>" + renderInline(ordered[1]) + "</li>");
              continue;
            }

            const unordered = line.match(/^\\s*[-*]\\s+(.+)$/);
            if (unordered) {
              flushParagraph();
              if (listType !== "ul") {
                closeList();
                html.push("<ul>");
                listType = "ul";
              }
              html.push("<li>" + renderInline(unordered[1]) + "</li>");
              continue;
            }

            closeList();
            paragraph.push(line.trim());
          }

          flushParagraph();
          closeList();
          return html.join("");
        }

        function renderInline(text) {
          return String(text || "")
            .replace(new RegExp("\\\\x60([^\\\\x60]+)\\\\x60", "g"), "<code>$1</code>")
            .replace(/\\*\\*([^*]+)\\*\\*/g, "<strong>$1</strong>")
            .replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\s)]+)\\)/g, function (_, label, href) {
              return '<a href="' + escapeAttribute(href) + '">' + label + "</a>";
            });
        }

        function escapeHtml(value) {
          return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }

        function escapeAttribute(value) {
          return escapeHtml(value).replace(new RegExp("\\\\x60", "g"), "&#96;");
        }

        function isMessageForActiveSession(message) {
          const baseSessionId = message && message.baseSessionId ? message.baseSessionId : "";
          return !baseSessionId || baseSessionId === activeBaseSessionId;
        }

        function acceptSessionSyncMessage(message) {
          const syncVersion = message && Number.isFinite(message.syncVersion) ? message.syncVersion : 0;
          if (!syncVersion) {
            return true;
          }
          if (syncVersion < latestSessionSyncVersion) {
            return false;
          }
          latestSessionSyncVersion = syncVersion;
          return true;
        }

        function addApprovalCard(request) {
          const approveLabel = request.action === "delete_file"
            ? "Allow Delete"
            : request.action === "delete_dir"
              ? "Allow Delete"
            : request.action === "run_command"
              ? "Allow Command"
            : request.reason === "clear-file"
              ? "Allow Clear"
              : "Allow Action";
          const div = document.createElement("div");
          div.className = "bubble approval";
          div.dataset.approvalId = request.id;

          const title = document.createElement("div");
          title.className = "approval-title";
          title.textContent = request.action === "delete_file"
            ? "Delete approval required"
            : request.action === "delete_dir"
              ? "Folder delete approval required"
            : request.action === "run_command"
              ? "Command approval required"
            : request.reason === "clear-file"
              ? "File clear approval required"
              : "Approval required";

          const meta = document.createElement("div");
          meta.className = "approval-meta";
          meta.textContent = request.relativePath
            ? request.relativePath
            : request.workspaceRoot || "Destructive action";
          meta.style.whiteSpace = "pre-wrap";

          const actions = document.createElement("div");
          actions.className = "approval-actions";

          function hideApprovalCard() {
            div.classList.add("is-hiding");
            approvalCards.delete(request.id);
            setTimeout(function () {
              if (div.parentNode) {
                div.parentNode.removeChild(div);
              }
            }, 160);
          }

          const approveButton = document.createElement("button");
          approveButton.type = "button";
          approveButton.textContent = approveLabel;
          approveButton.onclick = function () {
            approveButton.disabled = true;
            denyButton.disabled = true;
            vscode.postMessage({
              type: "approvalDecision",
              id: request.id,
              approved: true
            });
            hideApprovalCard();
          };

          const denyButton = document.createElement("button");
          denyButton.type = "button";
          denyButton.textContent = "Not Now";
          denyButton.className = "ghost";
          denyButton.onclick = function () {
            approveButton.disabled = true;
            denyButton.disabled = true;
            vscode.postMessage({
              type: "approvalDecision",
              id: request.id,
              approved: false
            });
            hideApprovalCard();
          };

          actions.appendChild(approveButton);
          actions.appendChild(denyButton);
          div.appendChild(title);
          div.appendChild(meta);
          div.appendChild(actions);
          messagesEl.appendChild(div);
          messagesEl.scrollTop = messagesEl.scrollHeight;
          approvalCards.set(request.id, div);
          return div;
        }

        window.sendPrompt = function () {
          const prompt = promptEl.value.trim();
          if (!prompt) {
            statusEl.textContent = "Type a prompt first.";
            return;
          }
          if (loadedBaseSessionId !== activeBaseSessionId) {
            statusEl.textContent = "Wait for this session to finish loading.";
            return;
          }

          addMessage("user", prompt, { scroll: true });
          clearActivity();
          ensureThinkingShell();
          statusEl.textContent = "Sending...";
          sendButton.disabled = true;

          vscode.postMessage({
            type: "send",
            prompt: prompt,
            includeSelection: true,
            baseSessionId: activeBaseSessionId
          });

          draftsBySession[activeBaseSessionId] = "";
          promptEl.value = "";
          promptEl.focus();
        };

        newSessionButton.addEventListener("click", function () {
          saveCurrentDraft();
          clearActivity();
          streamingReplyEl = null;
          loadedBaseSessionId = "";
          promptEl.value = "";
          sendButton.disabled = true;
          statusEl.textContent = "Creating a new session...";
          vscode.postMessage({ type: "newSession" });
        });

        signInButton.addEventListener("click", function () {
          openAuthDialog("signin");
        });

        registerButton.addEventListener("click", function () {
          openAuthDialog("register");
        });

        signOutButton.addEventListener("click", function () {
          statusEl.textContent = "Signing out...";
          vscode.postMessage({ type: "authSignOut" });
        });

        restoreButton.addEventListener("click", function () {
          openRestoreDialog();
        });

        workspaceButton.addEventListener("click", function () {
          statusEl.textContent = "Selecting workspace...";
          vscode.postMessage({ type: "selectWorkspace" });
        });

        promptEl.addEventListener("input", function () {
          saveCurrentDraft();
        });

        window.addEventListener("error", function (event) {
          vscode.postMessage({
            type: "clientError",
            value: event.message || "Unknown webview error"
          });
        });

        promptEl.addEventListener("keydown", function (event) {
          if (event.isComposing || event.keyCode === 229) {
            return;
          }

          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            window.sendPrompt();
          }
        });

        window.addEventListener("message", function (event) {
          const message = event.data;

          if (message.type === "reply") {
            if (!isMessageForActiveSession(message)) {
              return;
            }
            finalizeReply(message.value);
            statusEl.textContent = "Reply received.";
            sendButton.disabled = false;
            return;
          }

          if (message.type === "error") {
            if (!isMessageForActiveSession(message)) {
              return;
            }
            clearActivity();
            addMessage("error", message.value, { scroll: true });
            statusEl.textContent = "Agent request failed.";
            sendButton.disabled = false;
            return;
          }

          if (message.type === "approvalRequest") {
            if (!isMessageForActiveSession(message)) {
              return;
            }
            const request = message.value || {};
            if (!request.id || approvalCards.has(request.id)) {
              return;
            }
            addApprovalCard(request);
            statusEl.textContent = "Waiting for approval in chat.";
            return;
          }

          if (message.type === "activity") {
            if (!isMessageForActiveSession(message)) {
              return;
            }
            const activity = message.value || {};
            const visibleKinds = new Set(["tool", "approval", "agent"]);
            if (!visibleKinds.has(activity.kind)) {
              return;
            }
            addActivity(activity);
            statusEl.textContent = activity.kind === "approval"
              ? "Waiting for approval..."
              : "Working...";
            return;
          }

          if (message.type === "replyDelta") {
            if (!isMessageForActiveSession(message)) {
              return;
            }
            appendReplyDelta(message.value || "");
            statusEl.textContent = "Receiving response...";
            return;
          }

          if (message.type === "replyStreamSync") {
            if (!isMessageForActiveSession(message)) {
              return;
            }
            syncReplyStream(message.value || "");
            statusEl.textContent = "Receiving response...";
            return;
          }

          if (message.type === "replyStreamClear") {
            if (!isMessageForActiveSession(message)) {
              return;
            }
            clearReplyStream();
            statusEl.textContent = "Working...";
            return;
          }

          if (message.type === "clearActivity") {
            if (!isMessageForActiveSession(message)) {
              return;
            }
            clearActivity();
            statusEl.textContent = "Ready.";
            return;
          }

          if (message.type === "prefill") {
            promptEl.value = "Please help with this code:\\n\\n" + message.value;
            saveCurrentDraft();
            promptEl.focus();
            statusEl.textContent = "Selection added to the prompt box.";
            return;
          }

          if (message.type === "workspace") {
            return;
          }

          if (message.type === "authState") {
            renderAuthState(message.value || {});
            statusEl.textContent = "Ready.";
            return;
          }

          if (message.type === "authResult") {
            const value = message.value || {};
            setAuthBusy(false);
            if (value.ok) {
              closeAuthDialog();
              statusEl.textContent = value.message || "Signed in.";
            } else {
              showAuthError(value.error || "Authentication failed.");
            }
            return;
          }

          if (message.type === "checkpointList") {
            renderCheckpointList(message.value || []);
            return;
          }

          if (message.type === "checkpointRestoreResult") {
            const value = message.value || {};
            if (value.ok) {
              closeRestoreDialog();
              statusEl.textContent = value.message || "Checkpoint restored.";
            } else {
              restoreListEl.innerHTML = '<div class="restore-empty">' + escapeHtml(value.error || "Failed to restore checkpoint.") + '</div>';
            }
            return;
          }

          if (message.type === "sessionList") {
            if (!acceptSessionSyncMessage(message)) {
              return;
            }
            renderSessionTabs(message.value || []);
            return;
          }

          if (message.type === "sessionInfo") {
            if (!acceptSessionSyncMessage(message)) {
              return;
            }
            setActiveSessionLabel(message.value || "mochi-chat");
            return;
          }

          if (message.type === "sessionHistory") {
            if (!acceptSessionSyncMessage(message)) {
              return;
            }
            if (!isMessageForActiveSession(message)) {
              return;
            }
            clearActivity();
            renderSessionHistory(message.value || [], message.baseSessionId || activeBaseSessionId);
            statusEl.textContent = "Ready.";
            sendButton.disabled = false;
            return;
          }
        });

        statusEl.textContent = "Ready.";
        renderAuthState(authState);
        vscode.postMessage({ type: "ready" });
      })();
    </script>
  </body>
</html>`;
}

module.exports = {
  getWebviewHtml,
};
