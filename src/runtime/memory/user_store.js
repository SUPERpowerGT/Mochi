const { JsonFileStore } = require("./json_file_store");
const { nowIso } = require("./memory_utils");

class UserStore {
  constructor(options = {}) {
    this.store = new JsonFileStore({
      storageRoot: options.storageRoot,
      filename: "user.json",
      defaultData: {
        version: 1,
        preferences: {},
      },
    });
  }

  async getPreferences() {
    const data = await this.store.read();
    return data.preferences || {};
  }

  async setPreference(key, value, metadata = {}) {
    const data = await this.store.update((current) => {
      current.preferences[key] = {
        value,
        confidence: metadata.confidence || "explicit",
        source: metadata.source || "user",
        updatedAt: nowIso(),
      };
      return current;
    });

    return data.preferences[key];
  }

  async resetAllPreferences() {
    return this.store.write({
      version: 1,
      preferences: {},
    });
  }
}

module.exports = {
  UserStore,
};
