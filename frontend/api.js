// API calls for work orders and sync
const API = {
  async fetchWorkOrders() {
    try {
      const response = await fetch(`${AppConfig.API_BASE}/api/workorders`);
      if (!response.ok) throw new Error("Failed to fetch work orders");
      return await response.json();
    } catch (error) {
      console.error("Error fetching work orders:", error);
      return [];
    }
  },

  async fetchWorkOrder(woId) {
    const response = await fetch(
      `${AppConfig.API_BASE}/api/workorders/${woId}`,
    );
    if (!response.ok) throw new Error("Failed to load work order");
    return response.json();
  },

  async syncAssets(features) {
    const response = await fetch(`${AppConfig.API_BASE}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(features),
    });
    if (!response.ok) throw new Error("Sync failed");
    return response.json();
  },
};

window.API = API;
