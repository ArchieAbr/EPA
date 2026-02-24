// ============================================================
// SYSTEM CHECKS - In-Browser Test Suite
// Run from console: SystemTests.runAll()
// ============================================================

const SystemTests = {
  results: [],
  passed: 0,
  failed: 0,

  // ==================== TEST RUNNER ====================
  async runAll() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;

    console.log(
      "\n%cSYSTEM CHECKS STARTING...\n",
      "font-size: 16px; font-weight: bold; color: #3498db;",
    );

    // Core functionality tests
    await this.test("IndexedDB Connection", this.testIndexedDBConnection);
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
    await this.test("Asset Creation - Pole", this.testPoleCreation);
    await this.test(
      "Asset Creation - Transformer",
      this.testTransformerCreation,
    );
    await this.test("Asset Creation - Cable", this.testCableCreation);
    await this.test("Asset Deletion", this.testAssetDeletion);
    await this.test("Photo Capture Init", this.testPhotoCapture);

    this.printSummary();
    return {
      passed: this.passed,
      failed: this.failed,
      total: this.results.length,
    };
  },

  // Test wrapper with error handling
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

  // ==================== INDIVIDUAL TESTS ====================

  // Test 1: IndexedDB Connection
  async testIndexedDBConnection() {
    if (typeof db === "undefined") {
      return { success: false, message: "Dexie db instance not found" };
    }
    const count = await db.assets.count();
    return { success: true, message: `Connected. ${count} assets in DB.` };
  },

  // Test 2: Pole Form Template
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

  // Test 3: Transformer Form Template
  async testTransformerFormTemplate() {
    const template = getFormTemplate("Transformer");
    const hasFields =
      template.includes('id="tx-mounting"') &&
      template.includes('id="gmt-only-fields"') &&
      template.includes('data-field="tx-tankGrade"');
    return {
      success: hasFields,
      message: hasFields
        ? "All required fields present"
        : "Missing required fields",
    };
  },

  // Test 4: Cable Form Template
  async testCableFormTemplate() {
    const template = getFormTemplate("Cable");
    const hasFields =
      template.includes('id="cable-voltage"') &&
      template.includes('data-field="cable-sheath"') &&
      template.includes('id="cable-joints-count"');
    return {
      success: hasFields,
      message: hasFields
        ? "All required fields present"
        : "Missing required fields",
    };
  },

  // Test 5: Traffic Light Initialisation
  async testTrafficLightInit() {
    // Inject a test template and check initialisation
    const container = document.getElementById("form-fields-container");
    const originalHTML = container.innerHTML;

    container.innerHTML = getFormTemplate("Pole");
    initTrafficLights();

    const trafficLights = container.querySelectorAll(".traffic-light");
    const hasButtons =
      trafficLights.length > 0 &&
      trafficLights[0].querySelectorAll(".traffic-light-btn").length === 4;

    container.innerHTML = originalHTML;

    return {
      success: hasButtons,
      message: hasButtons
        ? `${trafficLights.length} traffic lights found`
        : "Traffic lights not initialised",
    };
  },

  // Test 6: Grade Selector Initialisation
  async testGradeSelectorInit() {
    const container = document.getElementById("form-fields-container");
    const originalHTML = container.innerHTML;

    container.innerHTML = getFormTemplate("Transformer");
    initGradeSelectors();

    const gradeSelectors = container.querySelectorAll(".grade-selector");
    const hasButtons = gradeSelectors.length > 0;

    container.innerHTML = originalHTML;

    return {
      success: hasButtons,
      message: hasButtons
        ? `${gradeSelectors.length} grade selectors found`
        : "Grade selectors not initialised",
    };
  },

  // Test 7: Pole Asset Creation
  async testPoleCreation() {
    const testId = Date.now();
    const testAsset = {
      id: testId,
      type: "Feature",
      properties: {
        name: "Test Pole",
        assetType: "Pole",
        material: "Wood",
        status: "As-Built",
      },
      geometry: {
        type: "Point",
        coordinates: [-1.5, 53.5],
      },
      pending_sync: 1,
    };

    await db.assets.add(testAsset);
    const retrieved = await db.assets.get(testId);
    await db.assets.delete(testId); // Cleanup

    const success = retrieved && retrieved.properties.assetType === "Pole";
    return {
      success,
      message: success
        ? "Pole saved and retrieved from IndexedDB"
        : "Failed to save/retrieve pole",
    };
  },

  // Test 8: Transformer Asset Creation
  async testTransformerCreation() {
    const testId = Date.now();
    const testAsset = {
      id: testId,
      type: "Feature",
      properties: {
        name: "Test Transformer",
        assetType: "Transformer",
        mounting: "Ground Mounted",
        rating: "500",
        tankGrade: 2,
      },
      geometry: {
        type: "Point",
        coordinates: [-1.5, 53.5],
      },
      pending_sync: 1,
    };

    await db.assets.add(testAsset);
    const retrieved = await db.assets.get(testId);
    await db.assets.delete(testId);

    const success = retrieved && retrieved.properties.tankGrade === 2;
    return {
      success,
      message: success
        ? "Transformer saved with grade data"
        : "Failed to save transformer",
    };
  },

  // Test 9: Cable Asset Creation
  async testCableCreation() {
    const testId = Date.now();
    const testAsset = {
      id: testId,
      type: "Feature",
      properties: {
        name: "Test Cable",
        assetType: "Cable",
        voltageLevel: "HV",
        cableType: "XLPE",
      },
      geometry: {
        type: "LineString",
        coordinates: [
          [-1.5, 53.5],
          [-1.6, 53.6],
        ],
      },
      pending_sync: 1,
    };

    await db.assets.add(testAsset);
    const retrieved = await db.assets.get(testId);
    await db.assets.delete(testId);

    const success = retrieved && retrieved.geometry.type === "LineString";
    return {
      success,
      message: success
        ? "Cable LineString saved correctly"
        : "Failed to save cable geometry",
    };
  },

  // Test 10: Asset Deletion
  async testAssetDeletion() {
    const testId = Date.now();
    const testAsset = {
      id: testId,
      type: "Feature",
      properties: { name: "Delete Test" },
      geometry: { type: "Point", coordinates: [0, 0] },
      pending_sync: 1,
    };

    await db.assets.add(testAsset);
    await db.assets.delete(testId);
    const retrieved = await db.assets.get(testId);

    const success = retrieved === undefined;
    return {
      success,
      message: success
        ? "Asset deleted successfully"
        : "Asset still exists after deletion",
    };
  },

  // Test 11: Photo Capture Element
  async testPhotoCapture() {
    const container = document.getElementById("form-fields-container");
    const originalHTML = container.innerHTML;

    container.innerHTML = getFormTemplate("Pole");

    const photoInput = container.querySelector("#photo");
    const photoPreview = container.querySelector("#photo-preview");

    container.innerHTML = originalHTML;

    const success = photoInput && photoPreview;
    return {
      success,
      message: success
        ? "Photo input and preview elements found"
        : "Photo elements missing from template",
    };
  },

  // ==================== SUMMARY ====================
  printSummary() {
    const total = this.results.length;
    const passRate = ((this.passed / total) * 100).toFixed(0);

    console.log("\n%c" + "=".repeat(50), "color: #666;");
    console.log(
      `%cRESULTS: ${this.passed}/${total} passed (${passRate}%)`,
      `font-size: 14px; font-weight: bold; color: ${this.failed === 0 ? "#27ae60" : "#e74c3c"};`,
    );

    if (this.failed > 0) {
      console.log("%c\nFailed tests:", "color: #e74c3c; font-weight: bold;");
      this.results
        .filter((r) => r.status !== "PASS")
        .forEach((r) => console.log(`  - ${r.name}: ${r.message}`));
    }

    console.log("%c" + "=".repeat(50) + "\n", "color: #666;");
  },

  // ==================== QUICK CHECKS ====================
  // Run individual checks
  async quickCheck() {
    console.log("\n%c🔍 QUICK CHECK", "font-size: 14px; font-weight: bold;");
    const assetCount = await db.assets.count();
    const unsyncedCount = await db.assets
      .where("pending_sync")
      .equals(1)
      .count();
    console.log(`  Assets in DB: ${assetCount}`);
    console.log(`  Unsynced: ${unsyncedCount}`);
    console.log(`  Form templates: ${Object.keys(formTemplates).join(", ")}`);
    console.log(
      `  Server reachable: ${typeof isServerReachable !== "undefined" ? isServerReachable : "unknown"}`,
    );
  },
};

// Expose to global scope
window.SystemTests = SystemTests;

// Usage instructions
console.log(
  "%c📋 System Tests loaded. Run: SystemTests.runAll()",
  "color: #3498db; font-weight: bold;",
);
