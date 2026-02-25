// In-memory placeholder replacing IndexedDB while backend storage is built
class MemoryTable {
  constructor() {
    this.items = [];
  }

  async add(item) {
    this.items.push(item);
    return item.id ?? this.items.length;
  }

  async delete(id) {
    this.items = this.items.filter((i) => i.id !== id);
  }

  async get(id) {
    return this.items.find((i) => i.id === id);
  }

  async toArray() {
    return [...this.items];
  }

  where(field) {
    const self = this;
    return {
      equals(value) {
        return {
          async toArray() {
            return self.items.filter((i) => i[field] === value);
          },
          async count() {
            return self.items.filter((i) => i[field] === value).length;
          },
        };
      },
    };
  }

  async update(id, changes) {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx === -1) return 0;
    this.items[idx] = { ...this.items[idx], ...changes };
    return 1;
  }

  async count() {
    return this.items.length;
  }
}

const db = {
  assets: new MemoryTable(),
};

const DB = {
  addAsset(asset) {
    return db.assets.add(asset);
  },
  deleteAsset(id) {
    return db.assets.delete(id);
  },
  async getAssets() {
    return db.assets.toArray();
  },
  async getUnsynced() {
    return db.assets.where("pending_sync").equals(1).toArray();
  },
  async markSynced(ids) {
    for (const id of ids) {
      await db.assets.update(id, { pending_sync: 0 });
    }
  },
};

window.DB = DB;
window.db = db; // Expose a Dexie-like shape for tests and legacy calls
