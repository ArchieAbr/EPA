// Frontend orchestrator

window.activateTool = activateTool;
window.openWorkOrderSelector = openWorkOrderSelector;
window.saveAssetForm = saveAssetForm;
window.deleteAsset = deleteAsset;
// BUG FIX: Expose modal closer used by inline HTML handlers
window.closeWorkOrderSelector = UI.hideWorkOrderSelector;

// Defensive guard: block any form submit from triggering navigation (captures bubbled submits)
document.addEventListener(
  "submit",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.debug("Submit blocked", e.target?.id || e.target);
  },
  true,
);

const map = MapController.initMap();
MapController.bindFeatureClick(handleFeatureClick);

// BUG FIX: Guard against default form submission (avoid page reload on save)
const assetFormEl = document.getElementById("asset-form");
if (assetFormEl) {
  assetFormEl.addEventListener("submit", (e) => {
    e.preventDefault();
    saveAssetForm(e);
    return false;
  });
}

map.on("click", (e) => {
  if (AppState.currentTool && AppState.currentTool !== "Cable") {
    createPointAsset(e.latlng, AppState.currentTool);
  }
});

// WORK ORDER FLOW
async function openWorkOrderSelector() {
  UI.showWorkOrderSelector();
  UI.setWorkOrderListLoading();
  const workOrders = await API.fetchWorkOrders();
  UI.renderWorkOrderList(
    workOrders,
    AppState.currentWorkOrder?.id,
    loadWorkOrder,
  );
}

async function loadWorkOrder(woId) {
  try {
    const workOrder = await API.fetchWorkOrder(woId);
    AppState.currentWorkOrder = workOrder;
    MapController.setBounds(workOrder.bounds);
    MapController.renderJobPackLayers(workOrder);
    UI.updateWorkOrderUI(workOrder);
    UI.hideWorkOrderSelector();
    UI.showToolsPanel();
    console.log("Loaded work order:", workOrder.id);
  } catch (error) {
    console.error("Error loading work order:", error);
    alert("Failed to load work order. Please try again.");
  }
}

// TOOLING AND ASSET CREATION
function activateTool(toolName) {
  AppState.currentTool = toolName;
  AppState.cableStartNode = null;
  UI.setMapCursor("crosshair");
  if (toolName === "Cable") {
    alert(
      "Cable Tool Active:\n1. Click the first Pole.\n2. Click the second Pole to connect them.",
    );
  }
}

function handleFeatureClick(e) {
  if (AppState.currentTool !== "Cable") return;
  const latlng = e.latlng;
  if (!AppState.cableStartNode) {
    AppState.cableStartNode = latlng;
    UI.showStartPointPopup(latlng);
  } else {
    createCableAsset(AppState.cableStartNode, latlng);
    AppState.cableStartNode = null;
    UI.clearPopup();
  }
}

function createPointAsset(latlng, type) {
  AppState.pendingAssetGeometry = {
    type: "Point",
    coordinates: [latlng.lng, latlng.lat],
  };
  AppState.pendingAssetType = type;
  UI.openAssetModal(type);
}

function createCableAsset(startLatLng, endLatLng) {
  AppState.pendingAssetGeometry = {
    type: "LineString",
    coordinates: [
      [startLatLng.lng, startLatLng.lat],
      [endLatLng.lng, endLatLng.lat],
    ],
  };
  AppState.pendingAssetType = "Cable";
  UI.openAssetModal("Cable");
}

// FORM SUBMISSION
async function saveAssetForm(evt) {
  if (evt && typeof evt.preventDefault === "function") {
    evt.preventDefault();
  }
  if (!AppState.pendingAssetGeometry || !AppState.pendingAssetType) {
    console.error("No pending asset to save");
    return false;
  }

  const form = document.getElementById("asset-form");
  const assetType = AppState.pendingAssetType;
  const properties = buildProperties(assetType, form);

  const newAsset = {
    id: Date.now(),
    type: "Feature",
    properties,
    geometry: AppState.pendingAssetGeometry,
    pending_sync: 1,
  };

  await DB.addAsset(newAsset);
  await MapController.loadAsBuilt();
  UI.setMapCursor("");

  if (AppState.isServerReachable) {
    syncOfflineChanges();
  }

  UI.closeAssetModal();
  console.log("Asset saved with form data:", newAsset.properties);
  return false;
}

function buildProperties(assetType, form) {
  if (assetType === "Transformer") {
    return {
      name: `New ${assetType}`,
      assetType,
      status: "As-Built",
      created_at: new Date().toISOString(),
      mounting: form["tx-mounting"].value,
      rating: form["tx-rating"].value,
      manufacturer: form["tx-manufacturer"].value,
      serialNo: form["tx-serial"].value,
      yearOfManufacture: parseInt(form["tx-year"].value) || null,
      coolingMedium: form["tx-cooling"].value,
      breatherType: form["tx-breather"].value,
      tankGrade: UI.getGradeValue("tx-tankGrade"),
      tankIssues: {
        surfaceRust: form["tx-surfaceRust"]?.checked || false,
        pitting: form["tx-pitting"]?.checked || false,
        weepingOil: form["tx-weepingOil"]?.checked || false,
        activeLeak: form["tx-activeLeak"]?.checked || false,
      },
      finsGrade: UI.getGradeValue("tx-finsGrade"),
      bushings: form["tx-bushings"].value,
      silicaGel: form["tx-silicaGel"].value,
      oilLevel: form["tx-oilLevel"].value,
      oilAcidity: parseFloat(form["tx-oilAcidity"]?.value) || null,
      moistureContent: parseInt(form["tx-moisture"]?.value) || null,
      breakdownStrength: parseInt(form["tx-breakdown"]?.value) || null,
      bunding: form["tx-bunding"].value,
      watercourseProximity: form["tx-watercourse"].value,
      photo: AppState.pendingPhotoBase64,
    };
  }

  if (assetType === "Cable") {
    return {
      name: `New ${assetType}`,
      assetType,
      status: "As-Built",
      created_at: new Date().toISOString(),
      voltageLevel: form["cable-voltage"].value,
      cableType: form["cable-type"].value,
      conductorMaterial: form["cable-conductor"].value,
      crossSectionalArea: form["cable-csa"].value,
      cores: form["cable-cores"].value,
      installationYear: parseInt(form["cable-year"].value) || null,
      dutyFactor: form["cable-duty"].value,
      situation: form["cable-situation"].value,
      topography: form["cable-topography"].value,
      sheathCondition: UI.getTrafficLightValue("cable-sheath"),
      jointCondition: UI.getTrafficLightValue("cable-joints"),
      jointsCount: parseInt(form["cable-joints-count"].value) || 0,
      historicalFaults: parseInt(form["cable-faults"].value) || 0,
      knownIssues: {
        thirdPartyDamageRisk: form["cable-thirdParty"]?.checked || false,
        partialDischarge: form["cable-partialDischarge"]?.checked || false,
        thermalIssues: form["cable-thermal"]?.checked || false,
      },
      photo: AppState.pendingPhotoBase64,
    };
  }

  return {
    name: `New ${assetType}`,
    assetType,
    status: "As-Built",
    created_at: new Date().toISOString(),
    material: form.material.value,
    treatment: form.treatment.value,
    stoutness: form.stoutness.value,
    height: form.height.value,
    transformers: parseInt(form.transformers.value) || 0,
    topRot: UI.getTrafficLightValue("topRot"),
    externalRot: UI.getTrafficLightValue("externalRot"),
    birdDamage: UI.getTrafficLightValue("birdDamage"),
    verticality: form.verticality.value,
    steelCorrosion: UI.getTrafficLightValue("steelCorrosion"),
    soundTest: form.soundTest.value,
    photo: AppState.pendingPhotoBase64,
  };
}

// DELETE ASSET
async function deleteAsset(assetId) {
  await DB.deleteAsset(assetId);
  await MapController.loadAsBuilt();
  MapController.getMap()?.closePopup();
  console.log(`Asset ${assetId} deleted.`);
}

// SYNC LOGIC
async function syncOfflineChanges() {
  const unsynced = await DB.getUnsynced();
  if (unsynced.length === 0) return;

  console.log(`Syncing ${unsynced.length} items...`);
  UI.updateStatus("checking");

  try {
    await API.syncAssets(unsynced);
    await DB.markSynced(unsynced.map((a) => a.id));
    await MapController.loadAsBuilt();
    UI.updateStatus("online");
  } catch (err) {
    console.error("Sync failed", err);
    UI.updateStatus("offline");
  }
}

// CONNECTION HEALTH CHECK
async function checkServerStatus() {
  if (!AppState.isServerReachable) UI.updateStatus("checking");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(`${AppConfig.API_BASE}/api/assets`, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (response.ok) {
      if (!AppState.isServerReachable) {
        AppState.isServerReachable = true;
        UI.updateStatus("online");
        syncOfflineChanges();
      }
      return;
    }
  } catch (err) {
    // fall through
  }

  AppState.isServerReachable = false;
  UI.updateStatus("offline");
}

// INIT
(async function init() {
  openWorkOrderSelector();
  await MapController.loadAsBuilt();
  setInterval(checkServerStatus, 5000);
  checkServerStatus();
})();

window.addEventListener("online", checkServerStatus);
window.addEventListener("offline", () => UI.updateStatus("offline"));
