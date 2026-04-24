const fs = require("fs");
const path = require("path");

class JsonFileStore {
  constructor(options = {}) {
    this.storageRoot = options.storageRoot;
    this.filename = options.filename;
    this.defaultData = options.defaultData || {};
    this.filePath = path.join(this.storageRoot, this.filename); // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
    this.updateQueue = Promise.resolve();
  }

  async read() {
    await fs.promises.mkdir(this.storageRoot, { recursive: true });

    try {
      const raw = await fs.promises.readFile(this.filePath, "utf8");
      return JSON.parse(raw);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return this.cloneDefaultData();
      }
      if (error instanceof SyntaxError) {
        await this.backupCorruptFile();
        return this.cloneDefaultData();
      }
      throw error;
    }
  }

  async write(data) {
    await fs.promises.mkdir(this.storageRoot, { recursive: true });
    await this.writeAtomic(data);
  }

  async update(mutator) {
    const runUpdate = async () => {
      const data = await this.read();
      const nextData = (await mutator(data)) || data;
      await this.write(nextData);
      return nextData;
    };

    const result = this.updateQueue.then(runUpdate, runUpdate);
    this.updateQueue = result.catch(() => {});
    return result;
  }

  cloneDefaultData() {
    return JSON.parse(JSON.stringify(this.defaultData));
  }

  async writeAtomic(data) {
    const tmpPath = this.createTempPath();
    const payload = `${JSON.stringify(data, null, 2)}\n`;

    try {
      await fs.promises.writeFile(tmpPath, payload, "utf8");
      await fs.promises.rename(tmpPath, this.filePath);
    } catch (error) {
      await removeIfExists(tmpPath);
      throw error;
    }
  }

  createTempPath() {
    const uniquePart = [
      process.pid,
      Date.now(),
      Math.random().toString(16).slice(2),
    ].join(".");
    return path.join(this.storageRoot, `${this.filename}.${uniquePart}.tmp`);
  }

  async backupCorruptFile() {
    const backupPath = path.join(
      this.storageRoot,
      `${this.filename}.corrupt-${Date.now()}`
    );

    try {
      await fs.promises.rename(this.filePath, backupPath);
    } catch (error) {
      if (!error || error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

async function removeIfExists(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (!error || error.code !== "ENOENT") {
      throw error;
    }
  }
}

module.exports = {
  JsonFileStore,
};
