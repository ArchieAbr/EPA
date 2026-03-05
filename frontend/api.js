// ============================================================
// API layer — communicates with the Flask backend
// ============================================================

const API = {
  /**
   * Fetch summary list of all work orders.
   * @returns {Promise<Array>}
   */
  async fetchWorkOrders() {
    try {
      const res = await fetch(`${AppConfig.API_BASE}/api/workorders`);
      if (!res.ok) throw new Error("Failed to fetch work orders");
      return await res.json();
    } catch (err) {
      console.error("API.fetchWorkOrders:", err);
      return [];
    }
  },

  /**
   * Fetch a full work order by ID (includes design_assets).
   * @param {string} woId
   * @returns {Promise<Object>}
   */
  async fetchWorkOrder(woId) {
    const res = await fetch(`${AppConfig.API_BASE}/api/workorders/${woId}`);
    if (!res.ok) throw new Error("Failed to load work order");
    return res.json();
  },

  /**
   * Fetch existing assets within a work order's geographic bounds.
   * @param {string} woId
   * @returns {Promise<Array>}
   */
  async fetchWorkOrderAssets(woId) {
    try {
      const res = await fetch(
        `${AppConfig.API_BASE}/api/workorders/${woId}/assets`,
      );
      if (!res.ok) throw new Error("Failed to fetch work order assets");
      return await res.json();
    } catch (err) {
      console.error("API.fetchWorkOrderAssets:", err);
      return [];
    }
  },

  /**
   * Send the sync queue to the server.
   * @param {Array} actions - Array of action queue entries
   * @returns {Promise<Object>} - Server response with per-action results
   */
  async sync(actions) {
    const res = await fetch(`${AppConfig.API_BASE}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actions }),
    });
    if (!res.ok) throw new Error("Sync request failed");
    return res.json();
  },

  /**
   * Quick health check (used for online/offline detection).
   * @returns {Promise<boolean>}
   */
  async healthCheck() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try {
      const res = await fetch(`${AppConfig.API_BASE}/api/health`, {
        method: "HEAD",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      clearTimeout(timeout);
      return false;
    }
  },
};

window.API = API;
