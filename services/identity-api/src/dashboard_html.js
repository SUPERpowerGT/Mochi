function renderDashboardHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mochi Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f1ea;
      --panel: #fffdf8;
      --panel-2: #f7f3eb;
      --text: #1f1b16;
      --muted: #6d6256;
      --line: #ded4c7;
      --accent: #a44b24;
      --accent-soft: #f4d6c8;
      --ok: #2f7d4d;
      --warn: #a06310;
      --danger: #a43a2f;
      --shadow: 0 18px 40px rgba(63, 42, 24, 0.08);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      background:
        radial-gradient(circle at top left, rgba(164, 75, 36, 0.08), transparent 28%),
        linear-gradient(180deg, #faf7f1 0%, var(--bg) 100%);
      color: var(--text);
    }

    .shell {
      max-width: 1240px;
      margin: 0 auto;
      padding: 32px 20px 48px;
    }

    .hero {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 20px;
      align-items: stretch;
      margin-bottom: 24px;
    }

    .hero-card,
    .panel {
      background: rgba(255, 253, 248, 0.92);
      border: 1px solid var(--line);
      border-radius: 22px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(6px);
    }

    .hero-card {
      padding: 24px;
      position: relative;
      overflow: hidden;
    }

    .hero-card::after {
      content: "";
      position: absolute;
      inset: auto -80px -80px auto;
      width: 220px;
      height: 220px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(164, 75, 36, 0.13), transparent 70%);
    }

    h1 {
      margin: 0 0 10px;
      font-size: clamp(32px, 4vw, 48px);
      line-height: 1;
      letter-spacing: -0.04em;
    }

    .eyebrow {
      color: var(--accent);
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      margin-bottom: 12px;
      font-family: "Segoe UI", sans-serif;
      font-weight: 700;
    }

    .hero-copy {
      max-width: 56ch;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.6;
    }

    .hero-meta {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 18px;
      font-family: "Segoe UI", sans-serif;
    }

    .tag {
      border: 1px solid var(--line);
      background: var(--panel-2);
      padding: 8px 12px;
      border-radius: 999px;
      font-size: 12px;
      color: var(--muted);
    }

    .filters {
      padding: 20px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .auth-shell {
      padding: 20px;
      display: grid;
      gap: 12px;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-family: "Segoe UI", sans-serif;
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    select, button {
      border: 1px solid var(--line);
      background: white;
      border-radius: 12px;
      min-height: 42px;
      padding: 0 12px;
      color: var(--text);
      font-size: 14px;
    }

    textarea {
      border: 1px solid var(--line);
      background: white;
      border-radius: 12px;
      min-height: 108px;
      padding: 12px;
      color: var(--text);
      font-size: 14px;
      resize: vertical;
      font-family: "Segoe UI", sans-serif;
    }

    button {
      background: var(--accent);
      color: white;
      cursor: pointer;
      font-weight: 600;
    }

    button.secondary {
      background: var(--panel-2);
      color: var(--text);
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 18px;
    }

    .kpis {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 14px;
    }

    .kpi {
      padding: 18px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 18px;
      box-shadow: var(--shadow);
    }

    .kpi-label {
      font-family: "Segoe UI", sans-serif;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      margin-bottom: 10px;
    }

    .kpi-value {
      font-size: clamp(28px, 3vw, 40px);
      line-height: 1;
    }

    .dashboard-nav {
      position: sticky;
      top: 18px;
      z-index: 5;
      margin-top: 18px;
      padding: 14px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      background: rgba(255, 253, 248, 0.88);
      border: 1px solid var(--line);
      border-radius: 20px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(10px);
    }

    .nav-pill {
      border: 1px solid var(--line);
      background: linear-gradient(180deg, #fffdf9 0%, #f4ede4 100%);
      color: var(--muted);
      border-radius: 999px;
      padding: 10px 16px;
      min-height: auto;
      font-family: "Segoe UI", sans-serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
    }

    .nav-pill.active {
      background: linear-gradient(180deg, #b85b31 0%, #934221 100%);
      color: white;
      border-color: rgba(148, 66, 33, 0.85);
    }

    .nav-summary {
      margin-left: auto;
      align-self: center;
      color: var(--muted);
      font-family: "Segoe UI", sans-serif;
      font-size: 13px;
    }

    .content-stage {
      margin-top: 18px;
      position: relative;
    }

    .content-pane {
      display: none;
      animation: pane-rise 180ms ease-out;
    }

    .content-pane.active {
      display: block;
    }

    @keyframes pane-rise {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .section {
      padding: 20px;
    }

    .section h2 {
      margin: 0 0 8px;
      font-size: 24px;
      letter-spacing: -0.03em;
    }

    .section p {
      margin: 0 0 16px;
      color: var(--muted);
      line-height: 1.5;
      font-family: "Segoe UI", sans-serif;
    }

    .wide { grid-column: span 8; }
    .narrow { grid-column: span 4; }

    .full { grid-column: 1 / -1; }

    .auth-actions,
    .button-row,
    .tab-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .tab-button.active {
      background: var(--accent);
      color: white;
    }

    .hidden {
      display: none !important;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .auth-state {
      border: 1px solid var(--line);
      background: rgba(247, 243, 235, 0.85);
      border-radius: 16px;
      padding: 14px;
      font-family: "Segoe UI", sans-serif;
    }

    .banner {
      margin-top: 18px;
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid var(--line);
      background: rgba(247, 243, 235, 0.85);
      font-family: "Segoe UI", sans-serif;
      color: var(--muted);
    }

    .banner.error {
      border-color: rgba(164, 58, 47, 0.25);
      background: rgba(164, 58, 47, 0.08);
      color: var(--danger);
    }

    .banner.success {
      border-color: rgba(47, 125, 77, 0.25);
      background: rgba(47, 125, 77, 0.08);
      color: var(--ok);
    }

    .meta-list {
      display: grid;
      gap: 10px;
      font-family: "Segoe UI", sans-serif;
    }

    .meta-item {
      padding-bottom: 10px;
      border-bottom: 1px solid var(--line);
    }

    .meta-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .checkpoint-card {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
      background: rgba(255, 253, 248, 0.86);
      margin-bottom: 12px;
    }

    .checkpoint-card h3 {
      margin: 0 0 8px;
      font-size: 18px;
    }

    .report-card {
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 16px;
      background: rgba(255, 253, 248, 0.86);
      margin-bottom: 12px;
    }

    .report-card h3 {
      margin: 0 0 8px;
      font-size: 18px;
    }

    .checkpoint-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 10px;
      font-family: "Segoe UI", sans-serif;
      font-size: 12px;
      color: var(--muted);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-family: "Segoe UI", sans-serif;
    }

    th, td {
      text-align: left;
      padding: 11px 8px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      font-size: 14px;
    }

    th {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .status {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      font-family: "Segoe UI", sans-serif;
    }

    .status-ok { background: rgba(47, 125, 77, 0.12); color: var(--ok); }
    .status-warn { background: rgba(160, 99, 16, 0.12); color: var(--warn); }
    .status-danger { background: rgba(164, 58, 47, 0.12); color: var(--danger); }
    .status-neutral { background: rgba(109, 98, 86, 0.12); color: var(--muted); }

    .muted {
      color: var(--muted);
      font-family: "Segoe UI", sans-serif;
      font-size: 13px;
    }

    .empty {
      padding: 28px 16px;
      text-align: center;
      color: var(--muted);
      font-family: "Segoe UI", sans-serif;
      border: 1px dashed var(--line);
      border-radius: 16px;
      background: rgba(247, 243, 235, 0.7);
    }

    @media (max-width: 980px) {
      .hero,
      .kpis,
      .grid {
        grid-template-columns: 1fr;
      }

      .dashboard-nav {
        top: 10px;
      }

      .nav-summary {
        width: 100%;
        margin-left: 0;
      }

      .wide,
      .narrow {
        grid-column: auto;
      }

      .filters {
        grid-template-columns: 1fr;
      }

      .form-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="hero-card">
        <div class="eyebrow">Mochi Control Plane</div>
        <h1>Cross-Device Continuity Dashboard</h1>
        <div class="hero-copy">
          This dashboard shows whether session summary sync is actually working across users, devices, and workspaces. It is intentionally simple and optimized for demos, debugging, and architecture review.
        </div>
        <div class="hero-meta">
          <span class="tag">Summary-level sync</span>
          <span class="tag">Multi-user aware</span>
          <span class="tag">Cross-device continuity</span>
        </div>
        <div class="banner" id="messageBanner">Use the demo account or register a new user to unlock checkpoint history.</div>
      </div>

      <div class="hero-card auth-shell">
        <div class="tab-row">
          <button class="secondary tab-button active" id="loginTabButton">Login</button>
          <button class="secondary tab-button" id="registerTabButton">Register</button>
        </div>

        <div class="auth-state" id="authState"></div>

        <form id="loginForm">
          <div class="form-grid">
            <label>
              Email
              <input id="loginEmail" type="email" placeholder="alice@mochi.local" />
            </label>
            <label>
              Device Name
              <input id="loginDeviceName" type="text" placeholder="This Machine" />
            </label>
            <label>
              Password
              <input id="loginPassword" type="password" placeholder="mochi123" />
            </label>
          </div>
          <div class="button-row" style="margin-top: 12px;">
            <button type="submit">Login</button>
          </div>
        </form>

        <form id="registerForm" class="hidden">
          <div class="form-grid">
            <label>
              Display Name
              <input id="registerDisplayName" type="text" placeholder="New User" />
            </label>
            <label>
              Email
              <input id="registerEmail" type="email" placeholder="new@mochi.local" />
            </label>
            <label>
              Device Name
              <input id="registerDeviceName" type="text" placeholder="Primary Device" />
            </label>
            <label>
              Password
              <input id="registerPassword" type="password" placeholder="Create a password" />
            </label>
          </div>
          <div class="button-row" style="margin-top: 12px;">
            <button type="submit">Create Account</button>
          </div>
        </form>

        <div class="filters" id="filtersRow" style="padding: 0;">
          <label>
            Workspace
            <select id="workspaceFilter"></select>
          </label>
          <label>
            Action
            <button id="refreshButton" type="button">Refresh</button>
          </label>
          <select id="userFilter" style="display:none;"></select>
          <select id="deviceFilter" style="display:none;"></select>
        </div>
      </div>
    </section>

    <section class="kpis" id="kpis"></section>

    <nav class="dashboard-nav" aria-label="Dashboard sections">
      <button type="button" class="nav-pill active" data-pane="checkpoints">My Checkpoints</button>
      <button type="button" class="nav-pill" data-pane="diagnostics">Diagnostics</button>
      <div class="nav-summary" id="navSummary">Your synced sessions, ready to restore on any device.</div>
    </nav>

    <section class="content-stage">
      <div class="content-pane active" id="pane-checkpoints">
        <section class="grid">
          <article class="panel full section">
            <h2>Your Checkpoints</h2>
            <p>Auto-saved after every completed Mochi run. Sign in from the VS Code extension on any machine and use Restore to pick one of these.</p>
            <div id="checkpointList"></div>
          </article>

          <article class="panel narrow section" id="signedInOnlyAccountPanel">
            <h2>Account</h2>
            <div id="currentUserPanel"></div>
          </article>

          <article class="panel narrow section" id="signedInOnlyHelpPanel">
            <h2>How restore works</h2>
            <div class="meta-list">
              <div class="meta-item">
                <div class="meta-label">1. Use Mochi normally</div>
                <div class="muted">When signed in, every completed run uploads a checkpoint here automatically.</div>
              </div>
              <div class="meta-item">
                <div class="meta-label">2. Switch device</div>
                <div class="muted">Sign in to the same account from another machine (or with a different device name).</div>
              </div>
              <div class="meta-item">
                <div class="meta-label">3. Restore in the panel</div>
                <div class="muted">Click Restore in the chat panel and pick a card &mdash; chat history, summary, and task are hydrated locally.</div>
              </div>
            </div>
          </article>
        </section>
      </div>

      <div class="content-pane" id="pane-diagnostics">
        <section class="grid">
          <article class="panel wide section">
            <h2>Recent Snapshots</h2>
            <p>Latest summary snapshots uploaded by users and devices.</p>
            <div id="snapshotTable"></div>
          </article>

          <article class="panel narrow section">
            <h2>Sync Health</h2>
            <div id="healthSummary"></div>
          </article>

          <article class="panel narrow section">
            <h2>Devices</h2>
            <div id="deviceTable"></div>
          </article>

          <article class="panel wide section">
            <h2>Recent Events</h2>
            <div id="eventTable"></div>
          </article>

          <article class="panel wide section">
            <h2>Recent Changes</h2>
            <p>Run-level code change summaries.</p>
            <div id="changeSummaryList"></div>
          </article>

          <article class="panel narrow section">
            <h2>Security Reports</h2>
            <p>Latest commit vulnerability analyses.</p>
            <div id="securityReportList"></div>
          </article>
        </section>
      </div>
    </section>
  </div>

  <script>
    const AUTH_TOKEN_KEY = 'mochi.dashboard.token';
    const state = {
      token: localStorage.getItem(AUTH_TOKEN_KEY) || '',
      authUser: null,
      authSession: null,
      authMode: 'login'
    };

    const userFilter = document.getElementById('userFilter');
    const deviceFilter = document.getElementById('deviceFilter');
    const workspaceFilter = document.getElementById('workspaceFilter');
    const refreshButton = document.getElementById('refreshButton');
    const loginTabButton = document.getElementById('loginTabButton');
    const registerTabButton = document.getElementById('registerTabButton');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const authState = document.getElementById('authState');
    const currentUserPanel = document.getElementById('currentUserPanel');
    const checkpointList = document.getElementById('checkpointList');
    const messageBanner = document.getElementById('messageBanner');
    const changeSummaryList = document.getElementById('changeSummaryList');
    const securityReportList = document.getElementById('securityReportList');
    const accountIdentitySummary = null;
    const accountFilterSummary = null;
    const navSummary = document.getElementById('navSummary');
    const navPills = Array.from(document.querySelectorAll('.nav-pill'));

    const paneDescriptions = {
      checkpoints: 'Your synced sessions, ready to restore on any device.',
      diagnostics: 'Sync health, recent activity, and security reports.'
    };

    function authHeaders() {
      return state.token
        ? { Authorization: 'Bearer ' + state.token }
        : {};
    }

    async function fetchJson(url, options) {
      const response = await fetch(url, options || {});
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload && payload.error ? payload.error : 'Failed to load ' + url + ' (' + response.status + ')');
      }
      return payload;
    }

    function setMessage(text, kind) {
      messageBanner.textContent = text;
      messageBanner.className = 'banner' + (kind ? ' ' + kind : '');
    }

    function setAuthMode(mode) {
      state.authMode = mode === 'register' ? 'register' : 'login';
      loginForm.classList.toggle('hidden', state.authMode !== 'login');
      registerForm.classList.toggle('hidden', state.authMode !== 'register');
      loginTabButton.classList.toggle('active', state.authMode === 'login');
      registerTabButton.classList.toggle('active', state.authMode === 'register');
    }

    function persistToken(token) {
      state.token = token || '';
      if (state.token) {
        localStorage.setItem(AUTH_TOKEN_KEY, state.token);
      } else {
        localStorage.removeItem(AUTH_TOKEN_KEY);
      }
    }

    function setFilterOptions(select, options, selectedValue) {
      select.innerHTML = options.join('');
      if (typeof selectedValue === 'string' && Array.from(select.options).some((option) => option.value === selectedValue)) {
        select.value = selectedValue;
      }
    }

    function fillSelect(select, items, allLabel, valueKey, labelKey) {
      const current = select.value;
      const options = ['<option value="">' + allLabel + '</option>']
        .concat(items.map((item) => '<option value="' + escapeHtml(String(item[valueKey] || '')) + '">' + escapeHtml(String(item[labelKey] || item[valueKey] || '')) + '</option>'));
      select.innerHTML = options.join('');
      if (Array.from(select.options).some((option) => option.value === current)) {
        select.value = current;
      }
    }

    function renderKpis(overview) {
      const items = [
        ['Users', overview.totalUsers],
        ['Devices', overview.totalDevices],
        ['Workspaces', overview.totalWorkspaces],
        ['Snapshots', overview.totalSnapshots],
        ['Checkpoints', overview.totalCheckpoints || 0],
        ['Changes', overview.totalChanges || 0],
        ['Security', overview.totalSecurityReports || 0],
      ];
      document.getElementById('kpis').innerHTML = items.map(([label, value]) =>
        '<div class="kpi"><div class="kpi-label">' + escapeHtml(label) + '</div><div class="kpi-value">' + escapeHtml(String(value)) + '</div></div>'
      ).join('');
    }

    function renderCurrentUser() {
      if (!state.authUser) {
        authState.innerHTML = '<strong>Signed out.</strong><div class="muted" style="margin-top:6px;">Use the demo account alice@mochi.local with password mochi123, or register a new account.</div>';
        currentUserPanel.innerHTML = '<div class="empty">Log in to see your device-bound checkpoint history.</div>';
        return;
      }

      authState.innerHTML = '<strong>' + escapeHtml(state.authUser.displayName) + '</strong><div class="muted" style="margin-top:6px;">' + escapeHtml(state.authUser.email) + '</div><div class="muted" style="margin-top:6px;">Current device: ' + escapeHtml(state.authUser.deviceName || 'Unknown device') + '</div><div class="button-row" style="margin-top:12px;"><button type="button" class="secondary" id="logoutButton">Logout</button><button type="button" id="deleteAccountButton">Delete Account</button></div>';
      currentUserPanel.innerHTML = '<div class="meta-list">'
        + '<div class="meta-item"><div class="meta-label">User Id</div><div>' + escapeHtml(state.authUser.userId) + '</div></div>'
        + '<div class="meta-item"><div class="meta-label">Tenant</div><div>' + escapeHtml(state.authUser.tenantId) + '</div></div>'
        + '<div class="meta-item"><div class="meta-label">Device</div><div>' + escapeHtml(state.authUser.deviceName || 'Unknown') + '</div><div class="muted">' + escapeHtml(state.authUser.deviceId || '') + '</div></div>'
        + '<div class="meta-item"><div class="meta-label">Session Expires</div><div>' + escapeHtml(formatDate(state.authSession && state.authSession.expiresAt)) + '</div></div>'
        + '</div>';

      const logoutButton = document.getElementById('logoutButton');
      if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
      }

      const deleteAccountButton = document.getElementById('deleteAccountButton');
      if (deleteAccountButton) {
        deleteAccountButton.addEventListener('click', handleDeleteAccount);
      }
    }

    function renderScopeSummary() {
      // No-op: filters are hidden when scope is the signed-in user.
    }

    function setActivePane(pane) {
      const activePane = paneDescriptions[pane] ? pane : 'checkpoints';
      document.querySelectorAll('.content-pane').forEach((node) => {
        node.classList.toggle('active', node.id === 'pane-' + activePane);
      });
      navPills.forEach((button) => {
        button.classList.toggle('active', button.dataset.pane === activePane);
      });
      navSummary.textContent = paneDescriptions[activePane];
    }

    function renderCheckpoints(checkpoints) {
      if (!state.authUser) {
        checkpointList.innerHTML = '<div class="empty">Checkpoints are private. Log in to load them.</div>';
        return;
      }
      if (!checkpoints.length) {
        checkpointList.innerHTML = '<div class="empty">No checkpoints yet. Finish a signed-in plugin run and a cloud checkpoint will appear here automatically.</div>';
        return;
      }

      checkpointList.innerHTML = checkpoints.map((item) => {
        const detail = item.payload && item.payload.lastPrompt ? 'Last prompt: ' + item.payload.lastPrompt : (item.payload && item.payload.notes ? item.payload.notes : 'No extra details');
        return '<div class="checkpoint-card">'
          + '<div class="checkpoint-meta"><span>' + escapeHtml(item.kind || 'manual') + '</span><span>' + escapeHtml(formatDate(item.createdAt)) + '</span><span>' + escapeHtml(item.deviceName || item.deviceId || 'Unknown device') + '</span></div>'
          + '<h3>' + escapeHtml(item.title || 'Checkpoint') + '</h3>'
          + '<div class="muted" style="margin-bottom:10px;">' + escapeHtml(item.workspaceLabel || item.workspaceKey || 'Unknown workspace') + '</div>'
          + '<div style="font-family:Segoe UI,sans-serif; line-height:1.6; margin-bottom:10px;">' + escapeHtml(item.summary || 'No summary') + '</div>'
          + '<div class="muted">' + escapeHtml(detail) + '</div>'
          + '</div>';
      }).join('');
    }

    function renderChangeSummaries(changes) {
      if (!changes.length) {
        changeSummaryList.innerHTML = '<div class="empty">No change summaries yet. Run Mochi on a code-editing task to populate this feed.</div>';
        return;
      }

      changeSummaryList.innerHTML = changes.map((item) => {
        const changedPaths = Array.isArray(item.changedPaths) ? item.changedPaths : [];
        const changedPreview = changedPaths.length ? changedPaths.slice(0, 4).join(', ') : 'No changed files recorded';
        const promptPreview = item.prompt ? item.prompt.slice(0, 140) : 'No prompt captured';
        return '<div class="report-card">'
          + '<div class="checkpoint-meta"><span>' + escapeHtml(item.traceStatus || 'unknown') + '</span><span>' + escapeHtml(item.verificationStatus || 'unknown') + '</span><span>' + escapeHtml(formatDate(item.createdAt)) + '</span></div>'
          + '<h3>' + escapeHtml(item.workspaceLabel || 'Workspace change') + '</h3>'
          + '<div class="muted" style="margin-bottom:10px;">Prompt: ' + escapeHtml(promptPreview) + '</div>'
          + '<div style="font-family:Segoe UI,sans-serif; line-height:1.6; margin-bottom:10px;">' + escapeHtml(item.summary || 'No summary') + '</div>'
          + '<div class="muted">Changed: ' + escapeHtml(changedPreview) + '</div>'
          + '</div>';
      }).join('');
    }

    function renderSecurityReports(reports) {
      if (!reports.length) {
        securityReportList.innerHTML = '<div class="empty">No commit security reports yet. Use Local Agent: Analyze Latest Commit to generate one.</div>';
        return;
      }

      securityReportList.innerHTML = reports.map((item) => {
        const findings = Array.isArray(item.findings) ? item.findings : [];
        const findingPreview = findings.slice(0, 3).map((entry) => entry.title + ' (' + entry.severity + ')').join('; ');
        return '<div class="report-card">'
          + '<div class="checkpoint-meta"><span>' + renderStatusBadge(item.riskLevel || 'low') + '</span><span>' + escapeHtml(item.branchName || 'unknown branch') + '</span><span>' + escapeHtml(formatDate(item.createdAt)) + '</span></div>'
          + '<h3>' + escapeHtml(item.commitTitle || item.commitHash || 'Commit report') + '</h3>'
          + '<div class="muted" style="margin-bottom:10px;">' + escapeHtml(item.commitHash || '') + '</div>'
          + '<div style="font-family:Segoe UI,sans-serif; line-height:1.6; margin-bottom:10px;">' + escapeHtml(item.summary || 'No summary') + '</div>'
          + '<div class="muted">' + escapeHtml(findingPreview || 'No detailed findings') + '</div>'
          + '</div>';
      }).join('');
    }

    function renderSnapshots(snapshots) {
      if (!snapshots.length) {
        document.getElementById('snapshotTable').innerHTML = '<div class="empty">No synced session snapshots yet.</div>';
        return;
      }

      const rows = snapshots.map((item) => {
        const lastRun = item.lastRunTrace && item.lastRunTrace.outcome ? item.lastRunTrace.outcome : 'No run summary';
        const task = item.task && item.task.title ? item.task.title : 'No active task';
        return '<tr>' +
          '<td><strong>' + escapeHtml(item.userId) + '</strong><div class="muted">' + escapeHtml(item.deviceId) + '</div></td>' +
          '<td><strong>' + escapeHtml(item.workspaceLabel || item.workspaceKey) + '</strong><div class="muted">' + escapeHtml(item.workspaceKey || '') + '</div></td>' +
          '<td>' + escapeHtml(item.lastPrompt || 'No prompt captured') + '</td>' +
          '<td><strong>' + escapeHtml(task) + '</strong><div class="muted">' + escapeHtml(item.sessionSummary || 'No session summary') + '</div></td>' +
          '<td>' + renderStatusBadge(item.lastRunTrace && item.lastRunTrace.status ? item.lastRunTrace.status : 'unknown') + '<div class="muted">' + escapeHtml(lastRun) + '</div></td>' +
          '<td>' + escapeHtml(formatDate(item.syncedAt)) + '</td>' +
        '</tr>';
      }).join('');

      document.getElementById('snapshotTable').innerHTML = '<table><thead><tr><th>User / Device</th><th>Workspace</th><th>Last Prompt</th><th>Session Summary</th><th>Run Status</th><th>Synced At</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    function renderDevices(devices) {
      if (!devices.length) {
        document.getElementById('deviceTable').innerHTML = '<div class="empty">No devices found.</div>';
        return;
      }

      const rows = devices.map((item) =>
        '<tr>' +
          '<td><strong>' + escapeHtml(item.deviceName) + '</strong><div class="muted">' + escapeHtml(item.deviceId) + '</div></td>' +
          '<td>' + escapeHtml(item.userId) + '</td>' +
          '<td>' + escapeHtml(item.lastWorkspaceLabel || 'No workspace yet') + '</td>' +
          '<td>' + escapeHtml(formatDate(item.lastSyncedAt)) + '</td>' +
        '</tr>'
      ).join('');

      document.getElementById('deviceTable').innerHTML = '<table><thead><tr><th>Device</th><th>User</th><th>Last Workspace</th><th>Last Sync</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    function renderEvents(events) {
      if (!events.length) {
        document.getElementById('eventTable').innerHTML = '<div class="empty">No recent events yet.</div>';
        return;
      }

      const rows = events.map((item) =>
        '<tr>' +
          '<td>' + escapeHtml(formatDate(item.syncedAt)) + '</td>' +
          '<td><strong>' + escapeHtml(item.userId) + '</strong><div class="muted">' + escapeHtml(item.deviceId) + '</div></td>' +
          '<td>' + escapeHtml(item.workspaceLabel || item.workspaceKey) + '</td>' +
          '<td>' + escapeHtml(item.message) + '</td>' +
        '</tr>'
      ).join('');

      document.getElementById('eventTable').innerHTML = '<table><thead><tr><th>Time</th><th>Actor</th><th>Workspace</th><th>Event</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    function renderHealth(health) {
      const items = [
        ['Latest Sync', formatDate(health.latestSyncedAt)],
        ['Stale Threshold', health.staleThresholdMinutes + ' min'],
        ['Stale Snapshots', String(health.staleSnapshots)],
        ['Recent Success Rate', health.recentSuccessRate + '%'],
      ];
      document.getElementById('healthSummary').innerHTML = items.map(([label, value]) =>
        '<div style="padding: 12px 0; border-bottom: 1px solid var(--line);"><div class="muted" style="margin-bottom: 4px;">' + escapeHtml(label) + '</div><div style="font-size: 20px;">' + escapeHtml(value) + '</div></div>'
      ).join('');
    }

    function renderStatusBadge(status) {
      const normalized = String(status || 'unknown').toLowerCase();
      const type = normalized === 'completed' || normalized === 'passed' || normalized === 'low'
        ? 'ok'
        : normalized === 'failed' || normalized === 'denied' || normalized === 'high' || normalized === 'critical'
          ? 'danger'
          : normalized === 'running' || normalized === 'not_run' || normalized === 'medium' || normalized === 'warn'
            ? 'warn'
            : 'neutral';
      return '<span class="status status-' + type + '">' + escapeHtml(status) + '</span>';
    }

    function formatDate(value) {
      if (!value) {
        return '—';
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return String(value);
      }
      return date.toLocaleString();
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    async function loadAuthState() {
      if (!state.token) {
        state.authUser = null;
        state.authSession = null;
        renderCurrentUser();
        renderCheckpoints([]);
        return;
      }

      try {
        const response = await fetchJson('/api/v1/auth/me', {
          headers: authHeaders()
        });
        state.authUser = response.user || null;
        state.authSession = response.session || null;
        renderCurrentUser();
        if (state.authUser && !userFilter.value) {
          userFilter.value = state.authUser.userId;
        }
      } catch (error) {
        persistToken('');
        state.authUser = null;
        state.authSession = null;
        renderCurrentUser();
        renderCheckpoints([]);
        setMessage(error.message || String(error), 'error');
      }
    }

    async function loadCheckpoints() {
      if (!state.authUser || !state.token) {
        renderCheckpoints([]);
        return;
      }

      const params = new URLSearchParams();
      if (deviceFilter.value) params.set('deviceId', deviceFilter.value);
      if (workspaceFilter.value) params.set('workspaceKey', workspaceFilter.value);
      params.set('limit', '12');
      const query = params.toString();
      const response = await fetchJson('/api/v1/checkpoints' + (query ? '?' + query : ''), {
        headers: authHeaders()
      });
      renderCheckpoints(response.checkpoints || []);
    }

    async function handleLogin(event) {
      event.preventDefault();
      const response = await fetchJson('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: document.getElementById('loginEmail').value,
          password: document.getElementById('loginPassword').value,
          deviceName: document.getElementById('loginDeviceName').value || 'This Machine'
        })
      });
      persistToken(response.token || '');
      state.authUser = response.user || null;
      state.authSession = response.session || null;
      renderCurrentUser();
      setMessage('Logged in successfully.', 'success');
      await Promise.all([loadFilters(), loadDashboard(), loadCheckpoints()]);
    }

    async function handleRegister(event) {
      event.preventDefault();
      const response = await fetchJson('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: document.getElementById('registerDisplayName').value,
          email: document.getElementById('registerEmail').value,
          password: document.getElementById('registerPassword').value,
          deviceName: document.getElementById('registerDeviceName').value || 'Primary Device'
        })
      });
      persistToken(response.token || '');
      state.authUser = response.user || null;
      state.authSession = response.session || null;
      renderCurrentUser();
      setAuthMode('login');
      setMessage('Account created and signed in.', 'success');
      await Promise.all([loadFilters(), loadDashboard(), loadCheckpoints()]);
    }

    async function handleLogout() {
      if (state.token) {
        await fetchJson('/api/v1/auth/logout', {
          method: 'POST',
          headers: authHeaders()
        }).catch(() => null);
      }
      persistToken('');
      state.authUser = null;
      state.authSession = null;
      renderCurrentUser();
      renderCheckpoints([]);
      await Promise.all([loadFilters(), loadDashboard()]);
      setMessage('Signed out.', 'success');
    }

    async function handleDeleteAccount() {
      if (!state.authUser || !state.token) {
        throw new Error('Sign in before deleting an account.');
      }

      const confirmed = window.confirm('This will permanently delete your account and all related checkpoints, sync snapshots, change summaries, and security reports. Continue?');
      if (!confirmed) {
        return;
      }

      const deletedUser = state.authUser;
      await fetchJson('/api/v1/auth/account', {
        method: 'DELETE',
        headers: authHeaders()
      });

      persistToken('');
      state.authUser = null;
      state.authSession = null;
      renderCurrentUser();
      renderCheckpoints([]);
      await Promise.all([loadFilters(), loadDashboard()]);
      setMessage('Deleted account: ' + (deletedUser.displayName || deletedUser.userId), 'success');
      setActivePane('account');
    }

    async function loadFilters() {
      if (!state.authUser || !state.token) {
        setFilterOptions(userFilter, ['<option value="">Sign in first</option>'], '');
        setFilterOptions(deviceFilter, ['<option value="">Your devices after sign-in</option>'], '');
        setFilterOptions(workspaceFilter, ['<option value="">Your workspaces after sign-in</option>'], '');
        renderScopeSummary();
        return;
      }

      const [devicesResponse, dashboardResponse] = await Promise.all([
        fetchJson('/api/v1/devices', {
          headers: authHeaders()
        }),
        fetchJson('/api/v1/dashboard', {
          headers: authHeaders()
        })
      ]);

      setFilterOptions(
        userFilter,
        ['<option value="' + escapeHtml(state.authUser.userId || '') + '">' + escapeHtml(state.authUser.displayName || state.authUser.userId || 'Current User') + '</option>'],
        state.authUser.userId || ''
      );
      fillSelect(deviceFilter, devicesResponse.devices || [], 'All your devices', 'deviceId', 'deviceName');

      const workspaces = (dashboardResponse.dashboard && dashboardResponse.dashboard.snapshots || [])
        .map((item) => ({ workspaceKey: item.workspaceKey, workspaceLabel: item.workspaceLabel || item.workspaceKey }))
        .filter((item, index, array) => item.workspaceKey && array.findIndex((other) => other.workspaceKey === item.workspaceKey) === index);
      fillSelect(workspaceFilter, workspaces, 'All your workspaces', 'workspaceKey', 'workspaceLabel');

      renderScopeSummary();
    }

    async function loadDashboard() {
      if (!state.authUser || !state.token) {
        renderKpis({
          totalUsers: 0,
          totalDevices: 0,
          totalWorkspaces: 0,
          totalSnapshots: 0,
          totalCheckpoints: 0,
          totalChanges: 0,
          totalSecurityReports: 0
        });
        renderChangeSummaries([]);
        renderSecurityReports([]);
        renderSnapshots([]);
        renderDevices([]);
        renderEvents([]);
        renderHealth({ latestSyncedAt: null, staleThresholdMinutes: 60, staleSnapshots: 0, recentSuccessRate: 0 });
        return;
      }

      const params = new URLSearchParams();
      if (deviceFilter.value) params.set('deviceId', deviceFilter.value);
      if (workspaceFilter.value) params.set('workspaceKey', workspaceFilter.value);

      const response = await fetchJson('/api/v1/dashboard?' + params.toString(), {
        headers: authHeaders()
      });
      const dashboard = response.dashboard;
      renderKpis(dashboard.overview);
      renderChangeSummaries(dashboard.changes || []);
      renderSecurityReports(dashboard.securityReports || []);
      renderSnapshots(dashboard.snapshots);
      renderDevices(dashboard.devices);
      renderEvents(dashboard.events);
      renderHealth(dashboard.health);
    }

    async function refreshAll() {
      await loadAuthState();
      await Promise.all([loadFilters(), loadDashboard(), loadCheckpoints()]);
    }

    loginTabButton.addEventListener('click', () => setAuthMode('login'));
    registerTabButton.addEventListener('click', () => setAuthMode('register'));
    navPills.forEach((button) => button.addEventListener('click', () => setActivePane(button.dataset.pane)));
    loginForm.addEventListener('submit', (event) => handleLogin(event).catch((error) => setMessage(error.message || String(error), 'error')));
    registerForm.addEventListener('submit', (event) => handleRegister(event).catch((error) => setMessage(error.message || String(error), 'error')));

    refreshButton.addEventListener('click', () => {
      Promise.all([loadDashboard(), loadCheckpoints()]).catch((error) => setMessage(error.message || String(error), 'error'));
    });
    userFilter.addEventListener('change', () => Promise.all([loadDashboard(), loadCheckpoints()]).catch((error) => setMessage(error.message || String(error), 'error')));
    deviceFilter.addEventListener('change', () => Promise.all([loadDashboard(), loadCheckpoints()]).catch((error) => setMessage(error.message || String(error), 'error')));
    workspaceFilter.addEventListener('change', () => Promise.all([loadDashboard(), loadCheckpoints()]).catch((error) => setMessage(error.message || String(error), 'error')));

    renderCurrentUser();
    renderCheckpoints([]);
    renderScopeSummary();
    setActivePane('overview');
    refreshAll().catch((error) => {
      document.body.innerHTML = '<div style="padding:32px;font-family:Segoe UI,sans-serif;color:#a43a2f;">Failed to load dashboard: ' + escapeHtml(error.message || String(error)) + '</div>';
    });
  </script>
</body>
</html>`;
}

module.exports = {
  renderDashboardHtml,
};