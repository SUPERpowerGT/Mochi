const crypto = require("crypto");
const http = require("http");
const { URL } = require("url");
const { Pool } = require("pg");
const { renderDashboardHtml } = require("./dashboard_html");

const PORT = Number(process.env.PORT || 4000);
const DATABASE_URL = process.env.DATABASE_URL || "postgres://postgres:postgres@postgres:5432/mochi";
const DEFAULT_TENANT_ID = "local-dev";
const AUTH_SESSION_TTL_DAYS = 14;
const DEFAULT_DEMO_PASSWORD = "mochi123";

const pool = new Pool({
  connectionString: DATABASE_URL,
});

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      email TEXT,
      password_hash TEXT,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (LOWER(email)) WHERE email IS NOT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS session_sync_snapshots (
      id BIGSERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL,
      workspace_key TEXT NOT NULL,
      workspace_label TEXT NOT NULL,
      base_session_id TEXT NOT NULL,
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload JSONB NOT NULL,
      UNIQUE (tenant_id, user_id, workspace_key, base_session_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
      workspace_key TEXT NOT NULL,
      workspace_label TEXT NOT NULL,
      base_session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS change_summaries (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
      workspace_key TEXT NOT NULL,
      workspace_label TEXT NOT NULL,
      base_session_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      summary TEXT NOT NULL,
      changed_paths JSONB NOT NULL,
      verification_status TEXT NOT NULL,
      trace_status TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS commit_security_reports (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
      workspace_key TEXT NOT NULL,
      workspace_label TEXT NOT NULL,
      commit_hash TEXT NOT NULL,
      branch_name TEXT NOT NULL,
      commit_title TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      findings JSONB NOT NULL,
      summary TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(
    `INSERT INTO tenants (id, name)
     VALUES ($1, $2)
     ON CONFLICT (id) DO NOTHING`,
    [DEFAULT_TENANT_ID, "Local Development"]
  );

  const defaultUsers = [
    ["alice", DEFAULT_TENANT_ID, "Alice", "alice@mochi.local"],
    ["bob", DEFAULT_TENANT_ID, "Bob", "bob@mochi.local"],
    ["charlie", DEFAULT_TENANT_ID, "Charlie", "charlie@mochi.local"],
  ];
  const defaultPasswordHash = hashPassword(DEFAULT_DEMO_PASSWORD);

  for (const [id, tenantId, displayName, email] of defaultUsers) {
    await pool.query(
      `INSERT INTO users (id, tenant_id, display_name, email, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         email = COALESCE(users.email, EXCLUDED.email),
         password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash)`,
      [id, tenantId, displayName, email, defaultPasswordHash]
    );
  }

  const defaultDevices = [
    ["this-machine", "alice", DEFAULT_TENANT_ID, "This Machine"],
    ["lab-pc", "alice", DEFAULT_TENANT_ID, "Lab PC"],
    ["dorm-laptop", "alice", DEFAULT_TENANT_ID, "Dorm Laptop"],
    ["this-machine-bob", "bob", DEFAULT_TENANT_ID, "This Machine"],
    ["lab-pc-bob", "bob", DEFAULT_TENANT_ID, "Lab PC"],
    ["this-machine-charlie", "charlie", DEFAULT_TENANT_ID, "This Machine"],
  ];

  for (const [id, userId, tenantId, displayName] of defaultDevices) {
    await pool.query(
      `INSERT INTO devices (id, user_id, tenant_id, display_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [id, userId, tenantId, displayName]
    );
  }

  await pool.query(`DELETE FROM auth_sessions WHERE expires_at <= NOW()`);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt:${salt}:${derivedKey}`;
}

function verifyPassword(password, passwordHash) {
  const text = String(passwordHash || "");
  const parts = text.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const [, salt, storedKey] = parts;
  const candidateKey = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidateKey, "hex"), Buffer.from(storedKey, "hex"));
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDisplayName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function createId(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

function slugifyText(value, fallback = "item") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function createSessionToken() {
  return crypto.randomBytes(24).toString("hex");
}

function getSessionExpiry() {
  return new Date(Date.now() + AUTH_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function parseAuthToken(request) {
  const header = String(request.headers.authorization || "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}

async function listProfiles() {
  const result = await pool.query(
    `SELECT users.id AS "userId", users.tenant_id AS "tenantId", users.display_name AS "displayName", users.email AS "email"
     FROM users
     ORDER BY users.id ASC`
  );
  return result.rows;
}

async function getProfile(userId) {
  const result = await pool.query(
    `SELECT users.id AS "userId", users.tenant_id AS "tenantId", users.display_name AS "displayName", users.email AS "email"
     FROM users
     WHERE users.id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function listDevices({ userId = "" } = {}) {
  const conditions = [];
  const values = [];

  if (userId) {
    values.push(userId);
    conditions.push(`devices.user_id = $${values.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT devices.id AS "deviceId", devices.user_id AS "userId", devices.tenant_id AS "tenantId", devices.display_name AS "deviceName"
     FROM devices
     ${whereClause}
     ORDER BY devices.user_id ASC, devices.id ASC`,
    values
  );
  return result.rows;
}

async function getDevice(deviceId) {
  const result = await pool.query(
    `SELECT devices.id AS "deviceId", devices.user_id AS "userId", devices.tenant_id AS "tenantId", devices.display_name AS "deviceName"
     FROM devices
     WHERE devices.id = $1`,
    [deviceId]
  );
  return result.rows[0] || null;
}

async function findUserByEmail(email) {
  const result = await pool.query(
    `SELECT users.id AS "userId", users.tenant_id AS "tenantId", users.display_name AS "displayName", users.email AS "email", users.password_hash AS "passwordHash"
     FROM users
     WHERE LOWER(users.email) = LOWER($1)`,
    [email]
  );
  return result.rows[0] || null;
}

async function createDeviceForUser({ userId, tenantId, deviceName }) {
  const normalizedDeviceName = normalizeDisplayName(deviceName) || "Primary Device";
  const existing = await pool.query(
    `SELECT devices.id AS "deviceId", devices.user_id AS "userId", devices.tenant_id AS "tenantId", devices.display_name AS "deviceName"
     FROM devices
     WHERE devices.user_id = $1 AND LOWER(devices.display_name) = LOWER($2)
     LIMIT 1`,
    [userId, normalizedDeviceName]
  );
  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const deviceId = `${slugifyText(normalizedDeviceName, "device")}-${crypto.randomBytes(3).toString("hex")}`;
  const inserted = await pool.query(
    `INSERT INTO devices (id, user_id, tenant_id, display_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id AS "deviceId", user_id AS "userId", tenant_id AS "tenantId", display_name AS "deviceName"`,
    [deviceId, userId, tenantId, normalizedDeviceName]
  );
  return inserted.rows[0] || null;
}

async function ensureOwnedDevice({ userId, tenantId, deviceId, deviceName }) {
  const normalizedDeviceId = String(deviceId || "").trim();
  if (!normalizedDeviceId) {
    return null;
  }

  const existing = await getDevice(normalizedDeviceId);
  if (existing) {
    if (existing.userId !== userId || existing.tenantId !== tenantId) {
      throw new Error("Device does not belong to the authenticated user.");
    }
    return existing;
  }

  const normalizedDeviceName = normalizeDisplayName(deviceName) || normalizedDeviceId;
  const inserted = await pool.query(
    `INSERT INTO devices (id, user_id, tenant_id, display_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id AS "deviceId", user_id AS "userId", tenant_id AS "tenantId", display_name AS "deviceName"`,
    [normalizedDeviceId, userId, tenantId, normalizedDeviceName]
  );
  return inserted.rows[0] || null;
}

async function createUserAccount({ tenantId, displayName, email, password, deviceName }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedDisplayName = normalizeDisplayName(displayName);

  if (!normalizedDisplayName || !normalizedEmail || !password) {
    throw new Error("Display name, email, and password are required.");
  }

  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    throw new Error("Email is already registered.");
  }

  const userId = `${slugifyText(normalizedDisplayName, "user")}-${crypto.randomBytes(3).toString("hex")}`;
  const passwordHash = hashPassword(password);
  const result = await pool.query(
    `INSERT INTO users (id, tenant_id, display_name, email, password_hash)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id AS "userId", tenant_id AS "tenantId", display_name AS "displayName", email AS "email"`,
    [userId, tenantId || DEFAULT_TENANT_ID, normalizedDisplayName, normalizedEmail, passwordHash]
  );
  const user = result.rows[0];
  const device = await createDeviceForUser({
    userId: user.userId,
    tenantId: user.tenantId,
    deviceName: deviceName || "Primary Device",
  });
  return { user, device };
}

async function createAuthSession({ userId, tenantId, deviceId }) {
  const token = createSessionToken();
  const expiresAt = getSessionExpiry();
  const result = await pool.query(
    `INSERT INTO auth_sessions (token, user_id, tenant_id, device_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING token, expires_at AS "expiresAt", created_at AS "createdAt"`,
    [token, userId, tenantId, deviceId || null, expiresAt]
  );
  return result.rows[0] || null;
}

async function getAuthSession(token) {
  const result = await pool.query(
    `SELECT auth_sessions.token AS "token",
            auth_sessions.expires_at AS "expiresAt",
            auth_sessions.created_at AS "createdAt",
            auth_sessions.last_seen_at AS "lastSeenAt",
            users.id AS "userId",
            users.tenant_id AS "tenantId",
            users.display_name AS "displayName",
            users.email AS "email",
            devices.id AS "deviceId",
            devices.display_name AS "deviceName"
     FROM auth_sessions
     JOIN users ON users.id = auth_sessions.user_id
     LEFT JOIN devices ON devices.id = auth_sessions.device_id
     WHERE auth_sessions.token = $1 AND auth_sessions.expires_at > NOW()`,
    [token]
  );
  return result.rows[0] || null;
}

async function touchAuthSession(token) {
  await pool.query(
    `UPDATE auth_sessions SET last_seen_at = NOW() WHERE token = $1`,
    [token]
  );
}

async function deleteAuthSession(token) {
  await pool.query(
    `DELETE FROM auth_sessions WHERE token = $1`,
    [token]
  );
}

async function deleteUserAccount({ userId, tenantId }) {
  if (!userId || !tenantId) {
    throw new Error("User identity is required to delete an account.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `DELETE FROM users
       WHERE id = $1 AND tenant_id = $2
       RETURNING id AS "userId", tenant_id AS "tenantId", display_name AS "displayName", email AS "email"`,
      [userId, tenantId]
    );
    if (!result.rows[0]) {
      throw new Error("Account not found.");
    }
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getAuthenticatedContext(request) {
  const token = parseAuthToken(request);
  if (!token) {
    return null;
  }
  const session = await getAuthSession(token);
  if (!session) {
    return null;
  }
  await touchAuthSession(token);
  return session;
}

async function upsertSessionSyncSnapshot(snapshot) {
  const result = await pool.query(
    `INSERT INTO session_sync_snapshots (
      tenant_id,
      user_id,
      device_id,
      workspace_key,
      workspace_label,
      base_session_id,
      synced_at,
      payload
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    ON CONFLICT (tenant_id, user_id, workspace_key, base_session_id)
    DO UPDATE SET
      device_id = EXCLUDED.device_id,
      workspace_label = EXCLUDED.workspace_label,
      synced_at = EXCLUDED.synced_at,
      payload = EXCLUDED.payload
    RETURNING id, synced_at AS "syncedAt"`,
    [
      snapshot.tenantId,
      snapshot.userId,
      snapshot.deviceId,
      snapshot.workspaceKey,
      snapshot.workspaceLabel,
      snapshot.baseSessionId,
      snapshot.syncedAt || new Date().toISOString(),
      JSON.stringify(snapshot),
    ]
  );
  return result.rows[0] || null;
}

async function getLatestSessionSyncSnapshot({ tenantId, userId, workspaceKey }) {
  const result = await pool.query(
    `SELECT payload
     FROM session_sync_snapshots
     WHERE tenant_id = $1 AND user_id = $2 AND workspace_key = $3
     ORDER BY synced_at DESC
     LIMIT 1`,
    [tenantId, userId, workspaceKey]
  );
  return result.rows[0] ? result.rows[0].payload : null;
}

async function createCheckpoint({
  tenantId,
  userId,
  deviceId,
  workspaceKey,
  workspaceLabel,
  baseSessionId,
  title,
  summary,
  kind,
  payload,
}) {
  const checkpointId = createId("ckpt");
  const result = await pool.query(
    `INSERT INTO checkpoints (
      id,
      tenant_id,
      user_id,
      device_id,
      workspace_key,
      workspace_label,
      base_session_id,
      title,
      summary,
      kind,
      payload
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
    RETURNING id AS "checkpointId", tenant_id AS "tenantId", user_id AS "userId", device_id AS "deviceId", workspace_key AS "workspaceKey", workspace_label AS "workspaceLabel", base_session_id AS "baseSessionId", title, summary, kind, payload, created_at AS "createdAt"`,
    [
      checkpointId,
      tenantId,
      userId,
      deviceId || null,
      workspaceKey,
      workspaceLabel,
      baseSessionId,
      title,
      summary,
      kind,
      JSON.stringify(payload || {}),
    ]
  );
  return result.rows[0] || null;
}

async function createCheckpointFromSnapshot(snapshot) {
  const taskTitle = snapshot.task && snapshot.task.title ? snapshot.task.title : "Checkpoint";
  const summary = String(snapshot.sessionSummary || snapshot.lastPrompt || "Synced session summary.").slice(0, 1200);
  return createCheckpoint({
    tenantId: snapshot.tenantId,
    userId: snapshot.userId,
    deviceId: snapshot.deviceId,
    workspaceKey: snapshot.workspaceKey,
    workspaceLabel: snapshot.workspaceLabel,
    baseSessionId: snapshot.baseSessionId,
    title: `${taskTitle} @ ${snapshot.workspaceLabel}`,
    summary,
    kind: "session-sync",
    payload: snapshot,
  });
}

async function createChangeSummary(entry) {
  const result = await pool.query(
    `INSERT INTO change_summaries (
      id,
      tenant_id,
      user_id,
      device_id,
      workspace_key,
      workspace_label,
      base_session_id,
      prompt,
      summary,
      changed_paths,
      verification_status,
      trace_status,
      payload
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13::jsonb)
    RETURNING id AS "changeId", tenant_id AS "tenantId", user_id AS "userId", device_id AS "deviceId", workspace_key AS "workspaceKey", workspace_label AS "workspaceLabel", base_session_id AS "baseSessionId", prompt, summary, changed_paths AS "changedPaths", verification_status AS "verificationStatus", trace_status AS "traceStatus", payload, created_at AS "createdAt"`,
    [
      createId("chg"),
      entry.tenantId,
      entry.userId,
      entry.deviceId || null,
      entry.workspaceKey,
      entry.workspaceLabel,
      entry.baseSessionId,
      entry.prompt || "",
      entry.summary || "",
      JSON.stringify(Array.isArray(entry.changedPaths) ? entry.changedPaths : []),
      entry.verificationStatus || "unknown",
      entry.traceStatus || "unknown",
      JSON.stringify(entry.payload || {}),
    ]
  );
  return result.rows[0] || null;
}

async function listChangeSummaries({ tenantId = "", userId = "", workspaceKey = "", limit = 20 } = {}) {
  const values = [];
  const conditions = [];

  if (tenantId) {
    values.push(tenantId);
    conditions.push(`change_summaries.tenant_id = $${values.length}`);
  }
  if (userId) {
    values.push(userId);
    conditions.push(`change_summaries.user_id = $${values.length}`);
  }
  if (workspaceKey) {
    values.push(workspaceKey);
    conditions.push(`change_summaries.workspace_key = $${values.length}`);
  }

  values.push(Math.max(1, Math.min(Number(limit) || 20, 50)));
  const limitPlaceholder = `$${values.length}`;
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT id AS "changeId", tenant_id AS "tenantId", user_id AS "userId", device_id AS "deviceId", workspace_key AS "workspaceKey", workspace_label AS "workspaceLabel", base_session_id AS "baseSessionId", prompt, summary, changed_paths AS "changedPaths", verification_status AS "verificationStatus", trace_status AS "traceStatus", payload, created_at AS "createdAt"
     FROM change_summaries
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT ${limitPlaceholder}`,
    values
  );
  return result.rows;
}

async function createCommitSecurityReport(entry) {
  const result = await pool.query(
    `INSERT INTO commit_security_reports (
      id,
      tenant_id,
      user_id,
      device_id,
      workspace_key,
      workspace_label,
      commit_hash,
      branch_name,
      commit_title,
      risk_level,
      findings,
      summary,
      payload
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13::jsonb)
    RETURNING id AS "reportId", tenant_id AS "tenantId", user_id AS "userId", device_id AS "deviceId", workspace_key AS "workspaceKey", workspace_label AS "workspaceLabel", commit_hash AS "commitHash", branch_name AS "branchName", commit_title AS "commitTitle", risk_level AS "riskLevel", findings, summary, payload, created_at AS "createdAt"`,
    [
      createId("sec"),
      entry.tenantId,
      entry.userId,
      entry.deviceId || null,
      entry.workspaceKey,
      entry.workspaceLabel,
      entry.commitHash,
      entry.branchName,
      entry.commitTitle,
      entry.riskLevel,
      JSON.stringify(Array.isArray(entry.findings) ? entry.findings : []),
      entry.summary || "",
      JSON.stringify(entry.payload || {}),
    ]
  );
  return result.rows[0] || null;
}

async function listCommitSecurityReports({ tenantId = "", userId = "", workspaceKey = "", limit = 20 } = {}) {
  const values = [];
  const conditions = [];

  if (tenantId) {
    values.push(tenantId);
    conditions.push(`commit_security_reports.tenant_id = $${values.length}`);
  }
  if (userId) {
    values.push(userId);
    conditions.push(`commit_security_reports.user_id = $${values.length}`);
  }
  if (workspaceKey) {
    values.push(workspaceKey);
    conditions.push(`commit_security_reports.workspace_key = $${values.length}`);
  }

  values.push(Math.max(1, Math.min(Number(limit) || 20, 50)));
  const limitPlaceholder = `$${values.length}`;
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT id AS "reportId", tenant_id AS "tenantId", user_id AS "userId", device_id AS "deviceId", workspace_key AS "workspaceKey", workspace_label AS "workspaceLabel", commit_hash AS "commitHash", branch_name AS "branchName", commit_title AS "commitTitle", risk_level AS "riskLevel", findings, summary, payload, created_at AS "createdAt"
     FROM commit_security_reports
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT ${limitPlaceholder}`,
    values
  );
  return result.rows;
}

async function listCheckpoints({ userId = "", deviceId = "", workspaceKey = "", limit = 20 } = {}) {
  const values = [];
  const conditions = [];

  if (userId) {
    values.push(userId);
    conditions.push(`checkpoints.user_id = $${values.length}`);
  }

  if (deviceId) {
    values.push(deviceId);
    conditions.push(`checkpoints.device_id = $${values.length}`);
  }

  if (workspaceKey) {
    values.push(workspaceKey);
    conditions.push(`checkpoints.workspace_key = $${values.length}`);
  }

  values.push(Math.max(1, Math.min(Number(limit) || 20, 50)));
  const limitPlaceholder = `$${values.length}`;
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT checkpoints.id AS "checkpointId",
            checkpoints.tenant_id AS "tenantId",
            checkpoints.user_id AS "userId",
            checkpoints.device_id AS "deviceId",
            checkpoints.workspace_key AS "workspaceKey",
            checkpoints.workspace_label AS "workspaceLabel",
            checkpoints.base_session_id AS "baseSessionId",
            checkpoints.title AS "title",
            checkpoints.summary AS "summary",
            checkpoints.kind AS "kind",
            checkpoints.payload AS "payload",
            checkpoints.created_at AS "createdAt",
            devices.display_name AS "deviceName"
     FROM checkpoints
     LEFT JOIN devices ON devices.id = checkpoints.device_id
     ${whereClause}
     ORDER BY checkpoints.created_at DESC
     LIMIT ${limitPlaceholder}`,
    values
  );
  return result.rows;
}

async function getCheckpoint(checkpointId, userId) {
  const values = [checkpointId];
  let whereClause = `WHERE checkpoints.id = $1`;
  if (userId) {
    values.push(userId);
    whereClause += ` AND checkpoints.user_id = $2`;
  }
  const result = await pool.query(
    `SELECT checkpoints.id AS "checkpointId",
            checkpoints.tenant_id AS "tenantId",
            checkpoints.user_id AS "userId",
            checkpoints.device_id AS "deviceId",
            checkpoints.workspace_key AS "workspaceKey",
            checkpoints.workspace_label AS "workspaceLabel",
            checkpoints.base_session_id AS "baseSessionId",
            checkpoints.title AS "title",
            checkpoints.summary AS "summary",
            checkpoints.kind AS "kind",
            checkpoints.payload AS "payload",
            checkpoints.created_at AS "createdAt",
            devices.display_name AS "deviceName"
     FROM checkpoints
     LEFT JOIN devices ON devices.id = checkpoints.device_id
     ${whereClause}
     LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}

async function listRestoreCandidates({ tenantId = "", userId = "", workspaceKey = "", limit = 10 } = {}) {
  const values = [];
  const conditions = [];

  if (tenantId) {
    values.push(tenantId);
    conditions.push(`checkpoints.tenant_id = $${values.length}`);
  }
  if (userId) {
    values.push(userId);
    conditions.push(`checkpoints.user_id = $${values.length}`);
  }
  if (workspaceKey) {
    values.push(workspaceKey);
    conditions.push(`checkpoints.workspace_key = $${values.length}`);
  }

  values.push(Math.max(1, Math.min(Number(limit) || 10, 30)));
  const limitPlaceholder = `$${values.length}`;
  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await pool.query(
    `SELECT checkpoints.id AS "checkpointId",
            checkpoints.tenant_id AS "tenantId",
            checkpoints.user_id AS "userId",
            checkpoints.device_id AS "deviceId",
            checkpoints.workspace_key AS "workspaceKey",
            checkpoints.workspace_label AS "workspaceLabel",
            checkpoints.base_session_id AS "baseSessionId",
            checkpoints.title AS "title",
            checkpoints.summary AS "summary",
            checkpoints.kind AS "kind",
            checkpoints.created_at AS "createdAt",
            devices.display_name AS "deviceName"
     FROM checkpoints
     LEFT JOIN devices ON devices.id = checkpoints.device_id
     ${whereClause}
     ORDER BY checkpoints.created_at DESC
     LIMIT ${limitPlaceholder}`,
    values
  );
  return result.rows;
}

async function getRestoreCheckpoint({ checkpointId, tenantId = "", userId = "", workspaceKey = "" } = {}) {
  const values = [checkpointId];
  const conditions = [`checkpoints.id = $1`];

  if (tenantId) {
    values.push(tenantId);
    conditions.push(`checkpoints.tenant_id = $${values.length}`);
  }
  if (userId) {
    values.push(userId);
    conditions.push(`checkpoints.user_id = $${values.length}`);
  }
  if (workspaceKey) {
    values.push(workspaceKey);
    conditions.push(`checkpoints.workspace_key = $${values.length}`);
  }

  const result = await pool.query(
    `SELECT checkpoints.id AS "checkpointId",
            checkpoints.tenant_id AS "tenantId",
            checkpoints.user_id AS "userId",
            checkpoints.device_id AS "deviceId",
            checkpoints.workspace_key AS "workspaceKey",
            checkpoints.workspace_label AS "workspaceLabel",
            checkpoints.base_session_id AS "baseSessionId",
            checkpoints.title AS "title",
            checkpoints.summary AS "summary",
            checkpoints.kind AS "kind",
            checkpoints.payload AS "payload",
            checkpoints.created_at AS "createdAt",
            devices.display_name AS "deviceName"
     FROM checkpoints
     LEFT JOIN devices ON devices.id = checkpoints.device_id
     WHERE ${conditions.join(" AND ")}
     LIMIT 1`,
    values
  );
  return result.rows[0] || null;
}

async function getDashboardData({ tenantId = "", userId = "", deviceId = "", workspaceKey = "" } = {}) {
  const snapshotFilters = [];
  const checkpointFilters = [];
  const deviceFilters = [];
  const userFilters = [];
  const snapshotValues = [];
  const deviceValues = [];
  const checkpointValues = [];
  const userValues = [];

  if (tenantId) {
    snapshotValues.push(tenantId);
    checkpointValues.push(tenantId);
    deviceValues.push(tenantId);
    userValues.push(tenantId);
    snapshotFilters.push(`tenant_id = $${snapshotValues.length}`);
    checkpointFilters.push(`tenant_id = $${checkpointValues.length}`);
    deviceFilters.push(`devices.tenant_id = $${deviceValues.length}`);
    userFilters.push(`tenant_id = $${userValues.length}`);
  }

  if (userId) {
    snapshotValues.push(userId);
    checkpointValues.push(userId);
    deviceValues.push(userId);
    userValues.push(userId);
    snapshotFilters.push(`user_id = $${snapshotValues.length}`);
    checkpointFilters.push(`user_id = $${checkpointValues.length}`);
    deviceFilters.push(`users.id = $${deviceValues.length}`);
    userFilters.push(`id = $${userValues.length}`);
  }

  if (deviceId) {
    snapshotValues.push(deviceId);
    checkpointValues.push(deviceId);
    deviceValues.push(deviceId);
    snapshotFilters.push(`device_id = $${snapshotValues.length}`);
    checkpointFilters.push(`device_id = $${checkpointValues.length}`);
    deviceFilters.push(`devices.id = $${deviceValues.length}`);
  }

  if (workspaceKey) {
    snapshotValues.push(workspaceKey);
    checkpointValues.push(workspaceKey);
    snapshotFilters.push(`workspace_key = $${snapshotValues.length}`);
    checkpointFilters.push(`workspace_key = $${checkpointValues.length}`);
  }

  const snapshotWhere = snapshotFilters.length ? `WHERE ${snapshotFilters.join(" AND ")}` : "";
  const deviceWhere = deviceFilters.length ? `WHERE ${deviceFilters.join(" AND ")}` : "";
  const checkpointWhere = checkpointFilters.length ? `WHERE ${checkpointFilters.join(" AND ")}` : "";
  const userWhere = userFilters.length ? `WHERE ${userFilters.join(" AND ")}` : "";

  const [snapshotRows, checkpointRows, changeSummaryRows, securityReportRows, deviceRows, workspaceCountRows, snapshotCountRows, latestSyncRows, userCountRows, deviceCountRows, checkpointCountRows, changeCountRows, securityCountRows] = await Promise.all([
    pool.query(
      `SELECT tenant_id AS "tenantId", user_id AS "userId", device_id AS "deviceId", workspace_key AS "workspaceKey", workspace_label AS "workspaceLabel", base_session_id AS "baseSessionId", synced_at AS "syncedAt", payload
       FROM session_sync_snapshots
       ${snapshotWhere}
       ORDER BY synced_at DESC
       LIMIT 12`,
      snapshotValues
    ),
    pool.query(
      `SELECT id AS "checkpointId", tenant_id AS "tenantId", user_id AS "userId", device_id AS "deviceId", workspace_key AS "workspaceKey", workspace_label AS "workspaceLabel", base_session_id AS "baseSessionId", title, summary, kind, payload, created_at AS "createdAt"
       FROM checkpoints
       ${checkpointWhere}
       ORDER BY created_at DESC
       LIMIT 8`,
      checkpointValues
    ),
    pool.query(
      `SELECT id AS "changeId", tenant_id AS "tenantId", user_id AS "userId", device_id AS "deviceId", workspace_key AS "workspaceKey", workspace_label AS "workspaceLabel", base_session_id AS "baseSessionId", prompt, summary, changed_paths AS "changedPaths", verification_status AS "verificationStatus", trace_status AS "traceStatus", payload, created_at AS "createdAt"
       FROM change_summaries
       ${checkpointWhere}
       ORDER BY created_at DESC
       LIMIT 8`,
      checkpointValues
    ),
    pool.query(
      `SELECT id AS "reportId", tenant_id AS "tenantId", user_id AS "userId", device_id AS "deviceId", workspace_key AS "workspaceKey", workspace_label AS "workspaceLabel", commit_hash AS "commitHash", branch_name AS "branchName", commit_title AS "commitTitle", risk_level AS "riskLevel", findings, summary, payload, created_at AS "createdAt"
       FROM commit_security_reports
       ${checkpointWhere}
       ORDER BY created_at DESC
       LIMIT 8`,
      checkpointValues
    ),
    pool.query(
      `SELECT devices.id AS "deviceId", devices.display_name AS "deviceName", users.id AS "userId", MAX(session_sync_snapshots.synced_at) AS "lastSyncedAt", MAX(session_sync_snapshots.workspace_label) AS "lastWorkspaceLabel"
       FROM devices
       JOIN users ON users.id = devices.user_id
       LEFT JOIN session_sync_snapshots ON session_sync_snapshots.device_id = devices.id AND session_sync_snapshots.user_id = users.id
       ${deviceWhere}
       GROUP BY devices.id, devices.display_name, users.id
       ORDER BY MAX(session_sync_snapshots.synced_at) DESC NULLS LAST, devices.id ASC`,
      deviceValues
    ),
    pool.query(
      `SELECT COUNT(DISTINCT workspace_key) AS "totalWorkspaces"
       FROM session_sync_snapshots
       ${snapshotWhere}`,
      snapshotValues
    ),
    pool.query(
      `SELECT COUNT(*) AS "totalSnapshots"
       FROM session_sync_snapshots
       ${snapshotWhere}`,
      snapshotValues
    ),
    pool.query(
      `SELECT MAX(synced_at) AS "latestSyncedAt"
       FROM session_sync_snapshots
       ${snapshotWhere}`,
      snapshotValues
    ),
    pool.query(
      `SELECT COUNT(*) AS "totalUsers" FROM users ${userWhere}`,
      userValues
    ),
    pool.query(
      `SELECT COUNT(*) AS "totalDevices"
       FROM devices
       JOIN users ON users.id = devices.user_id
       ${deviceWhere}`,
      deviceValues
    ),
    pool.query(
      `SELECT COUNT(*) AS "totalCheckpoints" FROM checkpoints ${checkpointWhere}`,
      checkpointValues
    ),
    pool.query(
      `SELECT COUNT(*) AS "totalChanges" FROM change_summaries ${checkpointWhere}`,
      checkpointValues
    ),
    pool.query(
      `SELECT COUNT(*) AS "totalSecurityReports" FROM commit_security_reports ${checkpointWhere}`,
      checkpointValues
    ),
  ]);

  const snapshots = snapshotRows.rows.map((row) => {
    const payload = row.payload || {};
    return {
      tenantId: row.tenantId,
      userId: row.userId,
      deviceId: row.deviceId,
      workspaceKey: row.workspaceKey,
      workspaceLabel: row.workspaceLabel,
      baseSessionId: row.baseSessionId,
      syncedAt: row.syncedAt,
      sessionSummary: payload.sessionSummary || "",
      lastPrompt: payload.lastPrompt || "",
      task: payload.task || null,
      lastRunTrace: payload.lastRunTrace || null,
    };
  });

  const workspaceCountRow = workspaceCountRows.rows[0] || {};
  const snapshotCountRow = snapshotCountRows.rows[0] || {};
  const latestSyncRow = latestSyncRows.rows[0] || {};
  const userCountRow = userCountRows.rows[0] || {};
  const deviceCountRow = deviceCountRows.rows[0] || {};
  const checkpointCountRow = checkpointCountRows.rows[0] || {};
  const changeCountRow = changeCountRows.rows[0] || {};
  const securityCountRow = securityCountRows.rows[0] || {};
  const latestSyncedAt = latestSyncRow.latestSyncedAt || null;
  const latestSyncAgeMinutes = latestSyncedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(latestSyncedAt).getTime()) / 60000))
    : null;

  return {
    overview: {
      totalUsers: Number(userCountRow.totalUsers || 0),
      totalDevices: Number(deviceCountRow.totalDevices || 0),
      totalWorkspaces: Number(workspaceCountRow.totalWorkspaces || 0),
      totalSnapshots: Number(snapshotCountRow.totalSnapshots || 0),
      totalCheckpoints: Number(checkpointCountRow.totalCheckpoints || 0),
      totalChanges: Number(changeCountRow.totalChanges || 0),
      totalSecurityReports: Number(securityCountRow.totalSecurityReports || 0),
      latestSyncedAt,
    },
    snapshots,
    checkpoints: checkpointRows.rows,
    changes: changeSummaryRows.rows,
    securityReports: securityReportRows.rows,
    devices: deviceRows.rows,
    events: snapshots.map((item) => ({
      syncedAt: item.syncedAt,
      userId: item.userId,
      deviceId: item.deviceId,
      workspaceKey: item.workspaceKey,
      workspaceLabel: item.workspaceLabel,
      message: item.lastPrompt
        ? `Uploaded session summary after prompt: ${item.lastPrompt}`
        : "Uploaded synced session summary.",
    })),
    health: {
      latestSyncedAt,
      staleThresholdMinutes: 60,
      staleSnapshots: snapshots.filter((item) => {
        if (!item.syncedAt) {
          return true;
        }
        return Date.now() - new Date(item.syncedAt).getTime() > 60 * 60 * 1000;
      }).length,
      recentSuccessRate: snapshots.length ? 100 : 0,
      latestSyncAgeMinutes,
    },
  };
}

function createEmptyDashboardData() {
  return {
    overview: {
      totalUsers: 0,
      totalDevices: 0,
      totalWorkspaces: 0,
      totalSnapshots: 0,
      totalCheckpoints: 0,
      totalChanges: 0,
      totalSecurityReports: 0,
      latestSyncedAt: null,
    },
    snapshots: [],
    checkpoints: [],
    changes: [],
    securityReports: [],
    devices: [],
    events: [],
    health: {
      latestSyncedAt: null,
      staleThresholdMinutes: 60,
      staleSnapshots: 0,
      recentSuccessRate: 0,
      latestSyncAgeMinutes: null,
    },
  };
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    request.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > 1024 * 1024) {
        reject(new Error("Request body too large."));
      }
    });
    request.on("end", () => {
      try {
        resolve(buffer ? JSON.parse(buffer) : {});
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
  });
  response.end(html);
}

function sendUnauthorized(response, message = "Authentication required.") {
  sendJson(response, 401, {
    ok: false,
    error: message,
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  try {
    if (request.method === "GET" && (requestUrl.pathname === "/" || requestUrl.pathname === "/dashboard")) {
      sendHtml(response, 200, renderDashboardHtml());
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/health") {
      await pool.query("SELECT 1");
      sendJson(response, 200, {
        ok: true,
        service: "identity-api",
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/v1/auth/register") {
      const body = await readJsonBody(request);
      const account = await createUserAccount({
        tenantId: body.tenantId || DEFAULT_TENANT_ID,
        displayName: body.displayName,
        email: body.email,
        password: body.password,
        deviceName: body.deviceName || "Primary Device",
      });
      const session = await createAuthSession({
        userId: account.user.userId,
        tenantId: account.user.tenantId,
        deviceId: account.device && account.device.deviceId ? account.device.deviceId : null,
      });
      sendJson(response, 201, {
        ok: true,
        token: session.token,
        session,
        user: {
          ...account.user,
          deviceId: account.device ? account.device.deviceId : null,
          deviceName: account.device ? account.device.deviceName : null,
        },
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/v1/auth/login") {
      const body = await readJsonBody(request);
      const email = normalizeEmail(body.email);
      const password = String(body.password || "");
      const deviceName = normalizeDisplayName(body.deviceName) || "This Machine";

      const user = await findUserByEmail(email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        sendJson(response, 401, {
          ok: false,
          error: "Invalid email or password.",
        });
        return;
      }

      const device = await createDeviceForUser({
        userId: user.userId,
        tenantId: user.tenantId,
        deviceName,
      });
      await pool.query(
        `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
        [user.userId]
      );
      const session = await createAuthSession({
        userId: user.userId,
        tenantId: user.tenantId,
        deviceId: device ? device.deviceId : null,
      });

      sendJson(response, 200, {
        ok: true,
        token: session.token,
        session,
        user: {
          userId: user.userId,
          tenantId: user.tenantId,
          displayName: user.displayName,
          email: user.email,
          deviceId: device ? device.deviceId : null,
          deviceName: device ? device.deviceName : null,
        },
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/v1/auth/me") {
      const auth = await getAuthenticatedContext(request);
      if (!auth) {
        sendUnauthorized(response);
        return;
      }

      sendJson(response, 200, {
        ok: true,
        user: {
          userId: auth.userId,
          tenantId: auth.tenantId,
          displayName: auth.displayName,
          email: auth.email,
          deviceId: auth.deviceId || null,
          deviceName: auth.deviceName || null,
        },
        session: {
          expiresAt: auth.expiresAt,
          createdAt: auth.createdAt,
          lastSeenAt: auth.lastSeenAt,
        },
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/v1/auth/logout") {
      const token = parseAuthToken(request);
      if (!token) {
        sendUnauthorized(response);
        return;
      }
      await deleteAuthSession(token);
      sendJson(response, 200, {
        ok: true,
      });
      return;
    }

    if (request.method === "DELETE" && requestUrl.pathname === "/api/v1/auth/account") {
      const auth = await getAuthenticatedContext(request);
      if (!auth) {
        sendUnauthorized(response);
        return;
      }

      const deletedUser = await deleteUserAccount({
        userId: auth.userId,
        tenantId: auth.tenantId,
      });

      sendJson(response, 200, {
        ok: true,
        deletedUser,
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/v1/profiles") {
      const auth = await getAuthenticatedContext(request);
      if (!auth) {
        sendUnauthorized(response);
        return;
      }

      const profiles = [{
        userId: auth.userId,
        tenantId: auth.tenantId,
        displayName: auth.displayName,
        email: auth.email,
      }];
      sendJson(response, 200, {
        ok: true,
        profiles,
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/v1/devices") {
      const auth = await getAuthenticatedContext(request);
      if (!auth) {
        sendUnauthorized(response);
        return;
      }

      const devices = await listDevices({
        userId: auth.userId,
      });
      sendJson(response, 200, {
        ok: true,
        devices,
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/v1/session-sync/latest") {
      const auth = await getAuthenticatedContext(request);
      if (!auth) {
        sendUnauthorized(response);
        return;
      }

      const snapshot = await getLatestSessionSyncSnapshot({
        tenantId: auth.tenantId,
        userId: auth.userId,
        workspaceKey: requestUrl.searchParams.get("workspaceKey") || "",
      });
      if (!snapshot) {
        sendJson(response, 404, {
          ok: false,
          error: "Session snapshot not found.",
        });
        return;
      }

      sendJson(response, 200, {
        ok: true,
        snapshot,
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/v1/dashboard") {
      const auth = await getAuthenticatedContext(request);
      const dashboard = auth
        ? await getDashboardData({
            tenantId: auth.tenantId,
            userId: auth.userId,
            deviceId: requestUrl.searchParams.get("deviceId") || "",
            workspaceKey: requestUrl.searchParams.get("workspaceKey") || "",
          })
        : createEmptyDashboardData();
      sendJson(response, 200, {
        ok: true,
        authenticated: Boolean(auth),
        dashboard,
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/v1/change-summaries") {
      const auth = await getAuthenticatedContext(request);
      if (!auth) {
        sendUnauthorized(response);
        return;
      }

      const items = await listChangeSummaries({
        tenantId: auth.tenantId,
        userId: auth.userId,
        workspaceKey: requestUrl.searchParams.get("workspaceKey") || "",
        limit: requestUrl.searchParams.get("limit") || 20,
      });
      sendJson(response, 200, {
        ok: true,
        changes: items,
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/v1/commit-security-reports") {
      const auth = await getAuthenticatedContext(request);
      if (!auth) {
        sendUnauthorized(response);
        return;
      }

      const items = await listCommitSecurityReports({
        tenantId: auth.tenantId,
        userId: auth.userId,
        workspaceKey: requestUrl.searchParams.get("workspaceKey") || "",
        limit: requestUrl.searchParams.get("limit") || 20,
      });
      sendJson(response, 200, {
        ok: true,
        reports: items,
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/v1/restore/checkpoints") {
      const auth = await getAuthenticatedContext(request);
      if (!auth) {
        sendUnauthorized(response);
        return;
      }

      const checkpoints = await listRestoreCandidates({
        tenantId: auth.tenantId,
        userId: auth.userId,
        workspaceKey: requestUrl.searchParams.get("workspaceKey") || "",
        limit: requestUrl.searchParams.get("limit") || 10,
      });
      sendJson(response, 200, {
        ok: true,
        checkpoints,
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/v1/checkpoints") {
      const auth = await getAuthenticatedContext(request);
      if (!auth) {
        sendUnauthorized(response);
        return;
      }

      const checkpoints = await listCheckpoints({
        userId: auth.userId,
        deviceId: requestUrl.searchParams.get("deviceId") || "",
        workspaceKey: requestUrl.searchParams.get("workspaceKey") || "",
        limit: requestUrl.searchParams.get("limit") || 20,
      });
      sendJson(response, 200, {
        ok: true,
        checkpoints,
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/v1/checkpoints") {
      const auth = await getAuthenticatedContext(request);
      if (!auth) {
        sendUnauthorized(response);
        return;
      }

      const body = await readJsonBody(request);
      const checkpoint = await createCheckpoint({
        tenantId: auth.tenantId,
        userId: auth.userId,
        deviceId: auth.deviceId,
        workspaceKey: String(body.workspaceKey || "manual-workspace").trim(),
        workspaceLabel: String(body.workspaceLabel || body.workspaceKey || "Manual Workspace").trim(),
        baseSessionId: String(body.baseSessionId || "manual-session").trim(),
        title: String(body.title || "Manual checkpoint").trim(),
        summary: String(body.summary || "").trim() || "No summary provided.",
        kind: String(body.kind || "manual").trim(),
        payload: {
          notes: body.notes || "",
          source: "dashboard",
          extra: body.payload || {},
        },
      });
      sendJson(response, 201, {
        ok: true,
        checkpoint,
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/v1/change-summaries") {
      const auth = await getAuthenticatedContext(request);
      if (!auth) {
        sendUnauthorized(response);
        return;
      }

      const body = await readJsonBody(request);
      const requiredFields = ["workspaceKey", "workspaceLabel", "baseSessionId", "summary"];
      const missing = requiredFields.filter((field) => !body[field]);
      if (missing.length) {
        sendJson(response, 400, {
          ok: false,
          error: `Missing required fields: ${missing.join(", ")}`,
        });
        return;
      }

      const device = await ensureOwnedDevice({
        userId: auth.userId,
        tenantId: auth.tenantId,
        deviceId: body.deviceId || auth.deviceId,
        deviceName: body.deviceName || auth.deviceName,
      });
      const change = await createChangeSummary({
        ...body,
        tenantId: auth.tenantId,
        userId: auth.userId,
        deviceId: device && device.deviceId ? device.deviceId : auth.deviceId,
      });
      sendJson(response, 201, {
        ok: true,
        change,
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/v1/commit-security-reports") {
      const auth = await getAuthenticatedContext(request);
      if (!auth) {
        sendUnauthorized(response);
        return;
      }

      const body = await readJsonBody(request);
      const requiredFields = ["workspaceKey", "workspaceLabel", "commitHash", "branchName", "commitTitle", "riskLevel", "summary"];
      const missing = requiredFields.filter((field) => !body[field]);
      if (missing.length) {
        sendJson(response, 400, {
          ok: false,
          error: `Missing required fields: ${missing.join(", ")}`,
        });
        return;
      }

      const device = await ensureOwnedDevice({
        userId: auth.userId,
        tenantId: auth.tenantId,
        deviceId: body.deviceId || auth.deviceId,
        deviceName: body.deviceName || auth.deviceName,
      });
      const report = await createCommitSecurityReport({
        ...body,
        tenantId: auth.tenantId,
        userId: auth.userId,
        deviceId: device && device.deviceId ? device.deviceId : auth.deviceId,
      });
      sendJson(response, 201, {
        ok: true,
        report,
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/v1/session-sync/snapshot") {
      const auth = await getAuthenticatedContext(request);
      if (!auth) {
        sendUnauthorized(response);
        return;
      }

      const snapshot = await readJsonBody(request);
      const requiredFields = ["workspaceKey", "workspaceLabel", "baseSessionId"];
      const missing = requiredFields.filter((field) => !snapshot[field]);
      if (missing.length) {
        sendJson(response, 400, {
          ok: false,
          error: `Missing required fields: ${missing.join(", ")}`,
        });
        return;
      }

      const device = await ensureOwnedDevice({
        userId: auth.userId,
        tenantId: auth.tenantId,
        deviceId: snapshot.deviceId || auth.deviceId,
        deviceName: snapshot.deviceName || auth.deviceName,
      });
      const authorizedSnapshot = {
        ...snapshot,
        tenantId: auth.tenantId,
        userId: auth.userId,
        deviceId: device && device.deviceId ? device.deviceId : auth.deviceId,
      };

      const saved = await upsertSessionSyncSnapshot(authorizedSnapshot);
      const checkpoint = await createCheckpointFromSnapshot(authorizedSnapshot);
      sendJson(response, 200, {
        ok: true,
        saved,
        checkpoint,
      });
      return;
    }

    const profileMatch = request.method === "GET"
      ? requestUrl.pathname.match(/^\/api\/v1\/profiles\/([a-zA-Z0-9._-]+)$/)
      : null;
    if (profileMatch) {
      const profile = await getProfile(profileMatch[1]);
      if (!profile) {
        sendJson(response, 404, {
          ok: false,
          error: "Profile not found.",
        });
        return;
      }

      sendJson(response, 200, {
        ok: true,
        profile,
      });
      return;
    }

    const deviceMatch = request.method === "GET"
      ? requestUrl.pathname.match(/^\/api\/v1\/devices\/([a-zA-Z0-9._-]+)$/)
      : null;
    if (deviceMatch) {
      const device = await getDevice(deviceMatch[1]);
      if (!device) {
        sendJson(response, 404, {
          ok: false,
          error: "Device not found.",
        });
        return;
      }

      sendJson(response, 200, {
        ok: true,
        device,
      });
      return;
    }

    const checkpointMatch = request.method === "GET"
      ? requestUrl.pathname.match(/^\/api\/v1\/checkpoints\/([a-zA-Z0-9._-]+)$/)
      : null;
    if (checkpointMatch) {
      const auth = await getAuthenticatedContext(request);
      if (!auth) {
        sendUnauthorized(response);
        return;
      }

      const checkpoint = await getCheckpoint(checkpointMatch[1], auth.userId);
      if (!checkpoint) {
        sendJson(response, 404, {
          ok: false,
          error: "Checkpoint not found.",
        });
        return;
      }

      sendJson(response, 200, {
        ok: true,
        checkpoint,
      });
      return;
    }

    const restoreCheckpointPrefix = "/api/v1/restore/checkpoints/";
    const restoreCheckpointId = request.method === "GET" && requestUrl.pathname.startsWith(restoreCheckpointPrefix)
      ? decodeURIComponent(requestUrl.pathname.slice(restoreCheckpointPrefix.length)).split("?")[0].trim()
      : "";
    if (restoreCheckpointId && !restoreCheckpointId.includes("/")) {
      const auth = await getAuthenticatedContext(request);
      if (!auth) {
        sendUnauthorized(response);
        return;
      }

      const checkpoint = await getRestoreCheckpoint({
        checkpointId: restoreCheckpointId,
        tenantId: auth.tenantId,
        userId: auth.userId,
      });
      if (!checkpoint) {
        sendJson(response, 404, {
          ok: false,
          error: "Checkpoint not found.",
        });
        return;
      }

      sendJson(response, 200, {
        ok: true,
        checkpoint,
      });
      return;
    }

    sendJson(response, 404, {
      ok: false,
      error: "Not found.",
    });
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error.message || String(error),
    });
  }
});

initializeDatabase()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`identity-api listening on port ${PORT}`);
      console.log(`demo login: alice@mochi.local / ${DEFAULT_DEMO_PASSWORD}`);
    });
  })
  .catch((error) => {
    console.error(error.message || String(error));
    process.exit(1);
  });