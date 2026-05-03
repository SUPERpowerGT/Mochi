const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { JsonFileStore } = require("../../src/runtime/memory/json_file_store");

function makeTmpStore(filename = "data.json", defaultData = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mochi-jfs-"));
  const store = new JsonFileStore({ storageRoot: root, filename, defaultData });
  return { store, root };
}

test("JsonFileStore.read returns a clone of defaultData when file missing", async () => {
  const { store, root } = makeTmpStore("a.json", { items: [] });
  try {
    const data = await store.read();
    assert.deepEqual(data, { items: [] });
    // Mutating the returned value must not affect defaultData
    data.items.push("x");
    const again = await store.read();
    assert.deepEqual(again.items, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("JsonFileStore.write then read round-trips", async () => {
  const { store, root } = makeTmpStore();
  try {
    await store.write({ hello: "world", nested: { a: 1 } });
    const data = await store.read();
    assert.deepEqual(data, { hello: "world", nested: { a: 1 } });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("JsonFileStore.update applies mutator atomically", async () => {
  const { store, root } = makeTmpStore("counter.json", { value: 0 });
  try {
    const next = await store.update((data) => {
      data.value += 1;
      return data;
    });
    assert.equal(next.value, 1);
    const again = await store.update((data) => {
      data.value += 10;
      return data;
    });
    assert.equal(again.value, 11);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("JsonFileStore.update queues concurrent updates correctly", async () => {
  const { store, root } = makeTmpStore("queue.json", { value: 0 });
  try {
    await Promise.all([
      store.update((data) => ({ ...data, value: data.value + 1 })),
      store.update((data) => ({ ...data, value: data.value + 1 })),
      store.update((data) => ({ ...data, value: data.value + 1 })),
    ]);
    const data = await store.read();
    assert.equal(data.value, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("JsonFileStore.read recovers from corrupt JSON by backing up the file", async () => {
  const { store, root } = makeTmpStore("corrupt.json", { value: "default" });
  try {
    await fs.promises.mkdir(root, { recursive: true });
    await fs.promises.writeFile(path.join(root, "corrupt.json"), "{ not json");
    const data = await store.read();
    assert.deepEqual(data, { value: "default" });
    const backups = fs
      .readdirSync(root)
      .filter((name) => name.startsWith("corrupt.json.corrupt-"));
    assert.ok(backups.length >= 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
