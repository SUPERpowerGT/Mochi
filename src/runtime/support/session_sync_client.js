class SessionSyncClient {
  constructor(options = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl || process.env.MOCHI_IDENTITY_API_URL || "http://127.0.0.1:4000");
    this.authToken = String(options.authToken || "").trim();
    this.enabled = Boolean(this.baseUrl);
  }

  setAuthToken(token) {
    this.authToken = String(token || "").trim();
  }

  getAuthToken() {
    return this.authToken;
  }

  async uploadSnapshot(snapshot) {
    if (!this.enabled || !snapshot || !this.authToken) {
      return null;
    }

    const response = await fetch(`${this.baseUrl}/api/v1/session-sync/snapshot`, {
      method: "POST",
      headers: this.buildHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(snapshot),
    });

    if (!response.ok) {
      throw new Error(`Session sync upload failed with status ${response.status}`);
    }

    return response.json();
  }

  async fetchLatestSnapshot(query = {}) {
    if (!this.enabled || !this.authToken) {
      return null;
    }

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    }

    const response = await fetch(`${this.baseUrl}/api/v1/session-sync/latest?${params.toString()}`, {
      headers: this.buildHeaders(),
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Session sync fetch failed with status ${response.status}`);
    }

    const payload = await response.json();
    return payload && payload.snapshot ? payload.snapshot : null;
  }

  async listRestoreCheckpoints(query = {}) {
    if (!this.enabled || !this.authToken) {
      return [];
    }

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    }

    const response = await fetch(`${this.baseUrl}/api/v1/restore/checkpoints?${params.toString()}`, {
      headers: this.buildHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Restore checkpoint listing failed with status ${response.status}`);
    }

    const payload = await response.json();
    return payload && Array.isArray(payload.checkpoints) ? payload.checkpoints : [];
  }

  async fetchRestoreCheckpoint(query = {}) {
    if (!this.enabled || !this.authToken || !query.checkpointId) {
      return null;
    }

    const response = await fetch(`${this.baseUrl}/api/v1/restore/checkpoints/${encodeURIComponent(String(query.checkpointId))}`, {
      headers: this.buildHeaders(),
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Restore checkpoint fetch failed with status ${response.status}`);
    }

    const payload = await response.json();
    return payload && payload.checkpoint ? payload.checkpoint : null;
  }

  async fetchRestoreTree(query = {}) {
    if (!this.enabled || !this.authToken) {
      return [];
    }

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, String(value));
      }
    }

    const url = `${this.baseUrl}/api/v1/restore/tree${params.toString() ? `?${params.toString()}` : ""}`;
    const response = await fetch(url, {
      headers: this.buildHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Restore tree fetch failed with status ${response.status}`);
    }

    const payload = await response.json();
    return payload && Array.isArray(payload.tree) ? payload.tree : [];
  }

  async uploadChangeSummary(entry) {
    if (!this.enabled || !entry || !this.authToken) {
      return null;
    }

    const response = await fetch(`${this.baseUrl}/api/v1/change-summaries`, {
      method: "POST",
      headers: this.buildHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(entry),
    });

    if (!response.ok) {
      throw new Error(`Change summary upload failed with status ${response.status}`);
    }

    return response.json();
  }

  async uploadCommitSecurityReport(entry) {
    if (!this.enabled || !entry || !this.authToken) {
      return null;
    }

    const response = await fetch(`${this.baseUrl}/api/v1/commit-security-reports`, {
      method: "POST",
      headers: this.buildHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify(entry),
    });

    if (!response.ok) {
      throw new Error(`Commit security report upload failed with status ${response.status}`);
    }

    return response.json();
  }

  buildHeaders(extraHeaders = {}) {
    return {
      ...extraHeaders,
      Authorization: `Bearer ${this.authToken}`,
    };
  }
}

function normalizeBaseUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text.endsWith("/") ? text.slice(0, -1) : text;
}

module.exports = {
  SessionSyncClient,
};