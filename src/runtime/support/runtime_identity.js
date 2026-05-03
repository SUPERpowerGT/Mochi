const path = require("path");

const DEFAULT_IDENTITY = Object.freeze({
  tenantId: "local-dev",
  userId: "default",
  displayName: "Default User",
  deviceId: "default-device",
  deviceName: "Default Device",
});

function normalizeIdentity(identity = null) {
  const source = identity && typeof identity === "object" ? identity : {};
  const tenantId = sanitizeIdentitySegment(source.tenantId, DEFAULT_IDENTITY.tenantId);
  const userId = sanitizeIdentitySegment(source.userId, DEFAULT_IDENTITY.userId);
  const displayName = String(source.displayName || userId || DEFAULT_IDENTITY.displayName).trim();
  const deviceId = sanitizeIdentitySegment(source.deviceId, DEFAULT_IDENTITY.deviceId);
  const deviceName = String(source.deviceName || deviceId || DEFAULT_IDENTITY.deviceName).trim();

  return {
    tenantId,
    userId,
    displayName: displayName || DEFAULT_IDENTITY.displayName,
    deviceId,
    deviceName: deviceName || DEFAULT_IDENTITY.deviceName,
  };
}

function createIdentityStorageRoot(baseStorageRoot, identity) {
  const normalized = normalizeIdentity(identity);
  return path.join(
    baseStorageRoot,
    "tenants",
    normalized.tenantId,
    "users",
    normalized.userId,
    "devices",
    normalized.deviceId
  );
}

function createIdentityKey(identity) {
  const normalized = normalizeIdentity(identity);
  return `${normalized.tenantId}:${normalized.userId}:${normalized.deviceId}`;
}

function sanitizeIdentitySegment(value, fallback) {
  const text = String(value || fallback || "").trim().toLowerCase();
  const normalized = text.replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

module.exports = {
  DEFAULT_IDENTITY,
  normalizeIdentity,
  createIdentityStorageRoot,
  createIdentityKey,
};