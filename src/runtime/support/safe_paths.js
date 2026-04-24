const path = require("path");

function normalizeRootPath(rootPath) {
  const value = String(rootPath || "").trim();
  if (!value) {
    throw new Error("A root path is required.");
  }

  return path.resolve(value);
}

function assertSimpleFilename(filename, label = "filename") {
  const value = String(filename || "").trim();
  if (!value) {
    throw new Error(`A ${label} is required.`);
  }

  if (value === "." || value === "..") {
    throw new Error(`Invalid ${label}.`);
  }

  if (path.basename(value) !== value) {
    throw new Error(`${label} must not include path separators.`);
  }

  return value;
}

function resolvePathInsideRoot(rootPath, unsafePath, label = "path") {
  const normalizedRoot = normalizeRootPath(rootPath);
  const value = String(unsafePath || "").trim();
  const target = value
    ? path.resolve(normalizedRoot, value)
    : normalizedRoot;
  const expectedPrefix = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : `${normalizedRoot}${path.sep}`;

  if (target !== normalizedRoot && !target.startsWith(expectedPrefix)) {
    throw new Error(`${label} must stay inside the allowed root.`);
  }

  return target;
}

function resolveChildFilename(rootPath, filename, label = "filename") {
  return resolvePathInsideRoot(rootPath, assertSimpleFilename(filename, label), label);
}

module.exports = {
  normalizeRootPath,
  assertSimpleFilename,
  resolvePathInsideRoot,
  resolveChildFilename,
};
