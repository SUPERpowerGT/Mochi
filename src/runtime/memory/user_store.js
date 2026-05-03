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

  async applyPreferences(preferences = {}) {
    const items = preferences && typeof preferences === "object" ? Object.entries(preferences) : [];
    for (const [key, value] of items) {
      if (!value || typeof value !== "object") {
        continue;
      }

      await this.setPreference(key, value.value, {
        confidence: value.confidence || "synced",
        source: value.source || "session-sync",
      });
    }

    return this.getPreferences();
  }
}

module.exports = {
  UserStore,
};
