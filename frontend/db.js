// ============================================================
// IndexedDB layer via Dexie.js
// Three stores: local_work_orders, local_assets, sync_queue
// ============================================================

const idb = new Dexie("OfflineGIS");

idb.version(1).stores({
  local_work_orders: "id",
  local_assets: "id, work_order_id",
  sync_queue: "++id, action, asset_id, work_order_id",
});

const DB = {
  // ─────────── Work Order cache ───────────

  /** Save a full work order (with design_assets) to local storage. */
  async saveWorkOrder(wo) {
    await idb.local_work_orders.put(wo);
  },

  /** Retrieve a cached work order by ID. */
  async getWorkOrder(id) {
    return idb.local_work_orders.get(id);
  },

  /** List all cached work orders. */
  async getAllWorkOrders() {
    return idb.local_work_orders.toArray();
  },

  /** Remove a work order and its associated local assets from the cache. */
  async deleteWorkOrder(id) {
    await idb.local_assets.where("work_order_id").equals(id).delete();
    await idb.local_work_orders.delete(id);
  },

  // ─────────── Local asset cache ───────────

  /** Bulk-save an array of assets (used when downloading a work order). */
  async saveAssets(assets) {
    await idb.local_assets.bulkPut(assets);
  },

  /** Get all local assets, optionally filtered by work_order_id. */
  async getAssets(workOrderId) {
    if (workOrderId) {
      return idb.local_assets
        .where("work_order_id")
        .equals(workOrderId)
        .toArray();
    }
    return idb.local_assets.toArray();
  },

  /** Get a single asset by ID. */
  async getAsset(id) {
    return idb.local_assets.get(id);
  },

  /** Add or update a single local asset. */
  async putAsset(asset) {
    await idb.local_assets.put(asset);
  },

  /** Delete a local asset by ID. */
  async removeAsset(id) {
    await idb.local_assets.delete(id);
  },

  // ─────────── Sync queue (action log) ───────────

  /**
   * Record an action in the sync queue.
   * @param {Object} entry - { action, asset_id, work_order_id, asset_type, geometry, properties }
   */
  async queueAction(entry) {
    await idb.sync_queue.add({
      ...entry,
      timestamp: new Date().toISOString(),
    });
  },

  /** Return all pending sync queue entries (ordered by auto-increment ID). */
  async getSyncQueue() {
    return idb.sync_queue.toArray();
  },

  /** Number of pending actions. */
  async getSyncQueueCount() {
    return idb.sync_queue.count();
  },

  /** Clear the entire sync queue (called after successful sync). */
  async clearSyncQueue() {
    await idb.sync_queue.clear();
  },
};

// Expose globally
window.DB = DB;
window.idb = idb; // Expose for tests
