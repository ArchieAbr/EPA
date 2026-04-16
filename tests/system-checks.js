// ============================================================
// SYSTEM CHECKS — In-Browser Test Suite
// Run from console: SystemTests.runAll()
// ============================================================

const SystemTests = {
  results: [],
  passed: 0,
  failed: 0,

  // ==================== Test Runner ====================
  async runAll() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;

    console.log(
      "\n%cSYSTEM CHECKS STARTING...\n",
      "font-size: 16px; font-weight: bold; color: #3498db;",
    );

    // Core checks
    await this.test("IndexedDB (Dexie) Connection", this.testDexieConnection);
    await this.test("Sync Queue Operations", this.testSyncQueue);
    await this.test("Local Asset CRUD", this.testLocalAssetCRUD);
    await this.test("Work Order Cache", this.testWorkOrderCache);
    await this.test("Form Template - Pole", this.testPoleFormTemplate);
    await this.test(
      "Form Template - Transformer",
      this.testTransformerFormTemplate,
    );
    await this.test("Form Template - Cable", this.testCableFormTemplate);
    await this.test("Traffic Light Initialisation", this.testTrafficLightInit);
    await this.test(
      "Grade Selector Initialisation",
      this.testGradeSelectorInit,
    );
    await this.test("Map Controller Exists", this.testMapController);
    await this.test("Service Worker Registered", this.testServiceWorker);

    // API connectivity checks
    await this.test("API Health Check", this.testAPIHealth);
    await this.test("API Boot ID Present", this.testAPIBootId);
    await this.test("API Work Orders List", this.testAPIWorkOrders);
    await this.test("API Work Order Detail", this.testAPIWorkOrderDetail);
    await this.test("API Work Order Assets", this.testAPIWorkOrderAssets);
    await this.test("API Activity Feed", this.testAPIActivity);

    // Offline workflow checks
    await this.test("Offline Create + Sync", this.testOfflineCreateSync);

    this.printSummary();
    return {
      passed: this.passed,
      failed: this.failed,
      total: this.results.length,
    };
  },

  async test(name, testFn) {
    try {
      const result = await testFn.call(this);
      if (result.success) {
        this.passed++;
        this.results.push({ name, status: "PASS", message: result.message });
        console.log(`%c✓ ${name}`, "color: #27ae60;", result.message || "");
      } else {
        this.failed++;
        this.results.push({ name, status: "FAIL", message: result.message });
        console.log(`%c✗ ${name}`, "color: #e74c3c;", result.message);
      }
    } catch (error) {
      this.failed++;
      this.results.push({ name, status: "ERROR", message: error.message });
      console.log(`%c✗ ${name}`, "color: #e74c3c;", `ERROR: ${error.message}`);
    }
  },

  // ==================== IndexedDB Tests ====================

  async testDexieConnection() {
    if (typeof Dexie === "undefined") {
      return { success: false, message: "Dexie library not loaded" };
    }
    if (typeof idb === "undefined") {
      return { success: false, message: "idb (Dexie instance) not found" };
    }
    const count = await idb.local_assets.count();
    return {
      success: true,
      message: `Connected. ${count} local assets cached.`,
    };
  },

  async testSyncQueue() {
    // Add a test entry
    await DB.queueAction({
      action: "CREATE",
      asset_id: "test-sync-001",
      work_order_id: "TEST-WO",
      asset_type: "Pole",
      geometry: { type: "Point", coordinates: [0, 0] },
      properties: { name: "Test" },
    });

    const queue = await DB.getSyncQueue();
    const hasEntry = queue.some((e) => e.asset_id === "test-sync-001");

    // Clean up
    await DB.clearSyncQueue();
    const afterClear = await DB.getSyncQueueCount();

    if (!hasEntry)
      return { success: false, message: "Entry not found in queue" };
    if (afterClear !== 0)
      return { success: false, message: "Queue not cleared properly" };
    return { success: true, message: "Queue add/read/clear works" };
  },

  async testLocalAssetCRUD() {
    const testAsset = {
      id: "test-crud-001",
      type: "Feature",
      properties: { name: "Test Asset", assetType: "Pole" },
      geometry: { type: "Point", coordinates: [-1.56, 53.81] },
      work_order_id: "TEST-WO",
      _source: "local",
    };

    // Create
    await DB.putAsset(testAsset);
    const fetched = await DB.getAsset("test-crud-001");
    if (!fetched) return { success: false, message: "Asset not saved" };

    // Update
    await DB.putAsset({
      ...testAsset,
      properties: { ...testAsset.properties, name: "Updated" },
    });
    const updated = await DB.getAsset("test-crud-001");
    if (updated.properties.name !== "Updated")
      return { success: false, message: "Asset not updated" };

    // Delete
    await DB.removeAsset("test-crud-001");
    const deleted = await DB.getAsset("test-crud-001");
    if (deleted) return { success: false, message: "Asset not deleted" };

    return { success: true, message: "PUT / GET / DELETE all work" };
  },

  async testWorkOrderCache() {
    const testWO = {
      id: "TEST-WO-001",
      name: "Test Work Order",
      status: "assigned",
    };
    await DB.saveWorkOrder(testWO);
    const fetched = await DB.getWorkOrder("TEST-WO-001");
    await DB.deleteWorkOrder("TEST-WO-001");

    if (!fetched) return { success: false, message: "Work order not cached" };
    if (fetched.name !== "Test Work Order")
      return { success: false, message: "Wrong data returned" };
    return { success: true, message: "Work order cache OK" };
  },

  // ==================== Form Template Tests ====================

  async testPoleFormTemplate() {
    if (typeof getFormTemplate !== "function") {
      return { success: false, message: "getFormTemplate function not found" };
    }
    const template = getFormTemplate("Pole");
    const hasFields =
      template.includes('id="material"') &&
      template.includes('data-field="topRot"') &&
      template.includes('id="photo"');
    return {
      success: hasFields,
      message: hasFields
        ? "All required fields present"
        : "Missing required fields",
    };
  },

  async testTransformerFormTemplate() {
    const template = getFormTemplate("Transformer");
    const hasFields =
      template.includes('id="tx-mounting"') &&
      template.includes('id="tx-rating"') &&
      template.includes('data-field="tx-tankGrade"');
    return {
      success: hasFields,
      message: hasFields
        ? "All required fields present"
        : "Missing required fields",
    };
  },

  async testCableFormTemplate() {
    const template = getFormTemplate("Cable");
    const hasFields =
      template.includes('id="cable-voltage"') &&
      template.includes('data-field="cable-sheath"') &&
      template.includes('id="cable-faults"');
    return {
      success: hasFields,
      message: hasFields
        ? "All required fields present"
        : "Missing required fields",
    };
  },

  // ==================== UI Component Tests ====================

  async testTrafficLightInit() {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="traffic-light" data-field="test-tl">
        <button type="button" class="traffic-light-btn green" data-value="None">None</button>
        <button type="button" class="traffic-light-btn red" data-value="Critical">Critical</button>
      </div>
    `;
    document.body.appendChild(container);
    UI.initTrafficLights();
    const btns = container.querySelectorAll(".traffic-light-btn");
    const hasButtons = btns.length === 2;
    document.body.removeChild(container);
    return {
      success: hasButtons,
      message: hasButtons ? "Traffic light buttons found" : "No buttons found",
    };
  },

  async testGradeSelectorInit() {
    const container = document.createElement("div");
    container.innerHTML = `
      <div class="grade-selector" data-field="test-grade">
        <button type="button" class="grade-btn grade-1" data-value="1">1</button>
        <button type="button" class="grade-btn grade-2" data-value="2">2</button>
      </div>
    `;
    document.body.appendChild(container);
    UI.initGradeSelectors();
    const btns = container.querySelectorAll(".grade-btn");
    const hasButtons = btns.length === 2;
    document.body.removeChild(container);
    return {
      success: hasButtons,
      message: hasButtons ? "Grade selector buttons found" : "No buttons found",
    };
  },

  async testMapController() {
    if (typeof MapController === "undefined") {
      return { success: false, message: "MapController not found" };
    }
    const hasInit = typeof MapController.initMap === "function";
    const hasRender = typeof MapController.renderLocalAssets === "function";
    const hasBounds = typeof MapController.setBounds === "function";
    const allOk = hasInit && hasRender && hasBounds;
    return {
      success: allOk,
      message: allOk ? "All methods present" : "Missing methods",
    };
  },

  async testServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      return {
        success: false,
        message: "Service Workers not supported in this browser",
      };
    }
    // Wait up to 3 s for the SW to finish registering/activating
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((r) => setTimeout(() => r(null), 3000)),
    ]);
    if (ready && ready.active) {
      return { success: true, message: `SW active (scope: ${ready.scope})` };
    }
    // Fallback: check existing registrations
    const registrations = await navigator.serviceWorker.getRegistrations();
    const hasSW = registrations.length > 0;
    return {
      success: hasSW,
      message: hasSW
        ? `${registrations.length} SW registered`
        : "No SW registered (may need page reload)",
    };
  },

  // ==================== API Connectivity Tests ====================

  async testAPIHealth() {
    try {
      const res = await fetch(`${AppConfig.API_BASE}/api/health`);
      if (!res.ok) return { success: false, message: `Status ${res.status}` };
      const data = await res.json();
      return {
        success: data.status === "ok",
        message: `Server healthy, boot_id: ${data.boot_id || "—"}`,
      };
    } catch (e) {
      return { success: false, message: `Unreachable: ${e.message}` };
    }
  },

  async testAPIBootId() {
    try {
      const res = await fetch(`${AppConfig.API_BASE}/api/health`);
      const data = await res.json();
      const hasBootId =
        typeof data.boot_id === "string" && data.boot_id.length > 0;
      return {
        success: hasBootId,
        message: hasBootId
          ? `boot_id = ${data.boot_id}`
          : "boot_id missing or empty",
      };
    } catch (e) {
      return { success: false, message: `Unreachable: ${e.message}` };
    }
  },

  async testAPIWorkOrders() {
    try {
      const res = await fetch(`${AppConfig.API_BASE}/api/workorders`);
      const data = await res.json();
      const ok = Array.isArray(data) && data.length > 0;
      return {
        success: ok,
        message: ok
          ? `${data.length} work orders found`
          : "No work orders returned",
      };
    } catch (e) {
      return { success: false, message: e.message };
    }
  },

  async testAPIWorkOrderDetail() {
    try {
      const list = await (
        await fetch(`${AppConfig.API_BASE}/api/workorders`)
      ).json();
      if (!list.length)
        return { success: false, message: "No work orders to test" };
      const woId = list[0].id;
      const res = await fetch(`${AppConfig.API_BASE}/api/workorders/${woId}`);
      const data = await res.json();
      const ok = data.id === woId && Array.isArray(data.design_assets);
      return {
        success: ok,
        message: ok
          ? `${woId}: ${data.design_assets.length} design assets`
          : "Unexpected response shape",
      };
    } catch (e) {
      return { success: false, message: e.message };
    }
  },

  async testAPIWorkOrderAssets() {
    try {
      const list = await (
        await fetch(`${AppConfig.API_BASE}/api/workorders`)
      ).json();
      if (!list.length)
        return { success: false, message: "No work orders to test" };
      const woId = list[0].id;
      const res = await fetch(
        `${AppConfig.API_BASE}/api/workorders/${woId}/assets`,
      );
      const data = await res.json();
      const ok = Array.isArray(data);
      return {
        success: ok,
        message: ok
          ? `${data.length} existing assets in bounds`
          : "Not an array",
      };
    } catch (e) {
      return { success: false, message: e.message };
    }
  },

  async testAPIActivity() {
    try {
      const res = await fetch(`${AppConfig.API_BASE}/api/activity`);
      const data = await res.json();
      const ok = data.stats && typeof data.stats.active_assets === "number";
      return {
        success: ok,
        message: ok
          ? `${data.stats.active_assets} active assets, ${data.stats.work_orders} work orders`
          : "Unexpected response shape",
      };
    } catch (e) {
      return { success: false, message: e.message };
    }
  },

  // ==================== Offline Workflow Test ====================

  async testOfflineCreateSync() {
    // This test creates a temporary asset in IndexedDB, queues a sync action,
    // sends it to the server, then cleans up — verifying the full round-trip.
    const testId = `sys-test-${Date.now()}`;
    const woId = AppState.currentWorkOrder?.id;
    if (!woId)
      return {
        success: false,
        message: "No work order loaded — load one first",
      };

    try {
      // 1. Save asset locally
      await DB.putAsset({
        id: testId,
        type: "Feature",
        properties: {
          name: "System Test Asset",
          assetType: "Pole",
          status: "As-Built",
        },
        geometry: { type: "Point", coordinates: [-1.5607, 53.8095] },
        work_order_id: woId,
        _source: "local",
      });

      // 2. Queue a CREATE action
      await DB.queueAction({
        action: "CREATE",
        asset_id: testId,
        work_order_id: woId,
        asset_type: "Pole",
        geometry: { type: "Point", coordinates: [-1.5607, 53.8095] },
        properties: { name: "System Test Asset" },
      });

      // 3. Sync to server
      const queue = await DB.getSyncQueue();
      const result = await API.sync(queue);
      const entry = result.results.find((r) => r.asset_id === testId);
      if (!entry || entry.status !== "ok") {
        return { success: false, message: `Sync failed for ${testId}` };
      }

      // 4. Clean up: delete from server and local
      await API.sync([
        {
          action: "DELETE",
          asset_id: testId,
          work_order_id: woId,
          asset_type: "Pole",
        },
      ]);
      await DB.removeAsset(testId);
      await DB.clearSyncQueue();

      return { success: true, message: "Create → queue → sync → cleanup OK" };
    } catch (e) {
      // Best-effort cleanup
      await DB.removeAsset(testId).catch(() => {});
      await DB.clearSyncQueue().catch(() => {});
      return { success: false, message: e.message };
    }
  },

  // ==================== Summary ====================
  printSummary() {
    const total = this.results.length;
    const pct = total > 0 ? ((this.passed / total) * 100).toFixed(0) : 0;
    console.log(
      `\n%c━━━ RESULTS: ${this.passed}/${total} passed (${pct}%) ━━━`,
      `font-size: 14px; font-weight: bold; color: ${this.failed === 0 ? "#27ae60" : "#e74c3c"};`,
    );
    if (this.failed > 0) {
      console.log(
        "%cFailed tests:",
        "color: #e74c3c; font-weight: bold;",
        this.results
          .filter((r) => r.status !== "PASS")
          .map((r) => `${r.name}: ${r.message}`)
          .join("\n"),
      );
    }
  },
};

window.SystemTests = SystemTests;
