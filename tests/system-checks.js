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

  // ==================== Individual Tests ====================

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
    const registrations = await navigator.serviceWorker.getRegistrations();
    const hasSW = registrations.length > 0;
    return {
      success: hasSW,
      message: hasSW
        ? `${registrations.length} SW registered`
        : "No SW registered (may need page reload)",
    };
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
