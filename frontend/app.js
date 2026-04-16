// ============================================================
// Frontend orchestrator — wires up map, forms, DB, and sync
// ============================================================

/* ── Expose handlers to inline HTML ── */
window.activateTool = activateTool;
window.openWorkOrderSelector = openWorkOrderSelector;
window.saveAssetForm = saveAssetForm;
window.deleteAsset = deleteAsset;
window.acceptDesignAsset = acceptDesignAsset;
window.cancelCableDrawing = cancelCableDrawing;
window.clearLocalData = clearLocalData;
window.closeWorkOrderSelector = () => UI.hideWorkOrderSelector();

// Block accidental form submissions causing page reload
document.addEventListener(
  "submit",
  (e) => {
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);

const map = MapController.initMap();
MapController.bindFeatureClick(handleFeatureClick);

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

// ──────────────────── Work Order Flow ────────────────────

async function openWorkOrderSelector() {
  UI.showWorkOrderSelector();
  UI.setWorkOrderListLoading();

  // Try fetching from server; fall back to local cache
  let workOrders = [];
  if (AppState.isServerReachable) {
    workOrders = await API.fetchWorkOrders();
  }
  if (workOrders.length === 0) {
    // Show locally cached work orders when offline
    workOrders = await DB.getAllWorkOrders();
  }

  UI.renderWorkOrderList(
    workOrders,
    AppState.currentWorkOrder?.id,
    loadWorkOrder,
  );
}

/**
 * Download a work order + its existing assets, cache locally, and render.
 */
async function loadWorkOrder(woId) {
  try {
    let workOrder;
    let existingAssets = [];

    if (AppState.isServerReachable) {
      // ONLINE: fetch from server and cache locally, fall back to local on error
      try {
        workOrder = await API.fetchWorkOrder(woId);
        existingAssets = await API.fetchWorkOrderAssets(woId);

        // Cache work order
        await DB.saveWorkOrder(workOrder);

        // Tag each existing asset with the work_order_id and save locally
        const tagged = existingAssets.map((a) => ({
          ...a,
          work_order_id: woId,
          _source: "server", // so we know it came from the register
        }));
        await DB.saveAssets(tagged);
      } catch (serverErr) {
        console.warn(
          "Server fetch failed, falling back to local cache:",
          serverErr,
        );
        workOrder = await DB.getWorkOrder(woId);
        if (!workOrder) {
          alert("Work order not available. Please try again.");
          return;
        }
        existingAssets = await DB.getAssets(woId);
      }
    } else {
      // OFFLINE: load from local cache
      workOrder = await DB.getWorkOrder(woId);
      if (!workOrder) {
        alert("Work order not available offline.");
        return;
      }
      existingAssets = await DB.getAssets(woId);
    }

    AppState.currentWorkOrder = workOrder;
    localStorage.setItem("activeWorkOrderId", workOrder.id);
    MapController.setBounds(workOrder.bounds);

    // Determine which design assets have already been accepted
    const acceptedIds = workOrder.accepted_designs || [];
    MapController.renderJobPackLayers(workOrder, acceptedIds);
    await renderLocalAssets();

    UI.updateWorkOrderUI(workOrder);
    UI.hideWorkOrderSelector();
    UI.showToolsPanel();
    await updateSyncBadge();

    console.log(
      "Loaded work order:",
      workOrder.id,
      `(${existingAssets.length} existing assets cached)`,
    );
  } catch (error) {
    console.error("Error loading work order:", error);
    alert("Failed to load work order. Please try again.");
  }
}

// ──────────────────── Tool Activation ────────────────────

function activateTool(toolName) {
  AppState.currentTool = toolName;
  AppState.cableStartNode = null;
  AppState.editingAssetId = null;
  AppState.pendingCableProperties = null;
  UI.setMapCursor("crosshair");

  if (toolName === "Cable") {
    // Form-first: fill in cable details before drawing
    AppState.pendingAssetType = "Cable";
    UI.openAssetModal("Cable");
    UI.setMapCursor("");
  }
}

function handleFeatureClick(e) {
  if (AppState.currentTool !== "Cable" || !AppState.pendingCableProperties)
    return;
  const latlng = e.latlng;
  if (!AppState.cableStartNode) {
    AppState.cableStartNode = latlng;
    UI.showStartPointPopup(latlng);
  } else {
    saveCableFromDrawing(AppState.cableStartNode, latlng);
    AppState.cableStartNode = null;
    UI.clearPopup();
  }
}

// ──────────────────── Asset Creation ────────────────────

function createPointAsset(latlng, type) {
  AppState.pendingAssetGeometry = {
    type: "Point",
    coordinates: [latlng.lng, latlng.lat],
  };
  AppState.pendingAssetType = type;
  AppState.editingAssetId = null;
  UI.openAssetModal(type);
}

/**
 * Called after two map clicks to finalise a cable whose properties
 * were already captured by the form-first modal.
 */
async function saveCableFromDrawing(startLatLng, endLatLng) {
  const geometry = {
    type: "LineString",
    coordinates: [
      [startLatLng.lng, startLatLng.lat],
      [endLatLng.lng, endLatLng.lat],
    ],
  };
  const properties = AppState.pendingCableProperties;
  const woId = AppState.currentWorkOrder?.id || null;
  const assetId = `temp-${Date.now()}`;

  const asset = {
    id: assetId,
    type: "Feature",
    properties,
    geometry,
    work_order_id: woId,
    _source: "local",
  };

  await DB.putAsset(asset);
  await DB.queueAction({
    action: "CREATE",
    asset_id: assetId,
    work_order_id: woId,
    asset_type: "Cable",
    geometry,
    properties,
  });

  await renderLocalAssets();
  await updateSyncBadge();

  // Reset cable drawing state
  AppState.pendingCableProperties = null;
  AppState.currentTool = null;
  UI.setMapCursor("");
  UI.hideCableDrawingBanner();
  console.log(`Cable created (local): ${assetId}`);
}

function cancelCableDrawing() {
  AppState.pendingCableProperties = null;
  AppState.cableStartNode = null;
  AppState.currentTool = null;
  UI.setMapCursor("");
  UI.hideCableDrawingBanner();
  UI.clearPopup();
  console.log("Cable drawing cancelled.");
}

// ──────────────────── Form Submission ────────────────────

async function saveAssetForm(evt) {
  if (evt && typeof evt.preventDefault === "function") evt.preventDefault();

  const form = document.getElementById("asset-form");
  const assetType = AppState.pendingAssetType;

  if (!assetType) {
    console.error("No pending asset type to save");
    return false;
  }

  // ── Cable form-first: save properties now, then enter drawing mode ──
  if (assetType === "Cable" && !AppState.pendingAssetGeometry) {
    AppState.pendingCableProperties = buildProperties("Cable", form);
    UI.closeAssetModal();
    UI.setMapCursor("crosshair");
    UI.showCableDrawingBanner();
    console.log("Cable properties saved — click two assets to draw the cable.");
    return false;
  }

  // ── Standard point asset save (Pole / Transformer) ──
  if (!AppState.pendingAssetGeometry) {
    console.error("No pending asset geometry to save");
    return false;
  }

  const properties = buildProperties(assetType, form);
  const woId = AppState.currentWorkOrder?.id || null;

  const assetId = AppState.editingAssetId || `temp-${Date.now()}`;
  const isUpdate = !!AppState.editingAssetId;

  const asset = {
    id: assetId,
    type: "Feature",
    properties,
    geometry: AppState.pendingAssetGeometry,
    work_order_id: woId,
    _source: "local",
  };

  // 1. Update local IndexedDB so the UI reflects the change immediately
  await DB.putAsset(asset);

  // 2. Queue the action for later sync
  await DB.queueAction({
    action: isUpdate ? "UPDATE" : "CREATE",
    asset_id: assetId,
    work_order_id: woId,
    asset_type: assetType,
    geometry: asset.geometry,
    properties,
  });

  // 3. Refresh the map
  await renderLocalAssets();
  await updateSyncBadge();

  UI.setMapCursor("");
  UI.closeAssetModal();
  console.log(`Asset ${isUpdate ? "updated" : "created"} (local):`, assetId);
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

  // Default: Pole
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

// ──────────────────── Delete Asset ────────────────────

async function deleteAsset(assetId) {
  const woId = AppState.currentWorkOrder?.id || null;
  const asset = await DB.getAsset(String(assetId));

  // Queue the DELETE action
  await DB.queueAction({
    action: "DELETE",
    asset_id: String(assetId),
    work_order_id: woId,
    asset_type:
      asset?.properties?.assetType ||
      asset?.properties?.asset_type ||
      "Unknown",
    geometry: asset?.geometry,
    properties: asset?.properties,
  });

  // Remove from local cache
  await DB.removeAsset(String(assetId));

  // Refresh
  await renderLocalAssets();
  await updateSyncBadge();
  MapController.getMap()?.closePopup();
  console.log(`Asset ${assetId} deleted (queued for sync).`);
}

// ──────────────────── Accept Design Asset ────────────────────

/**
 * Accept a blackline (proposed) design asset, converting it to an as-built asset.
 * The design feature is looked up from the current work order's design_assets by ID,
 * then saved to IndexedDB as a local asset and queued for sync.
 */
async function acceptDesignAsset(designId) {
  const wo = AppState.currentWorkOrder;
  if (!wo || !wo.design_assets) {
    console.error("No work order loaded — cannot accept design.");
    return;
  }

  // Find the design feature by its ID
  const designFeature = wo.design_assets.find((f) => f.id === designId);
  if (!designFeature) {
    console.error(`Design asset '${designId}' not found in work order.`);
    return;
  }

  const assetType =
    designFeature.properties.asset_type ||
    designFeature.properties.type ||
    "Unknown";

  // Build the as-built asset from the design
  const asset = {
    id: designId,
    type: "Feature",
    properties: {
      ...designFeature.properties,
      status: "As-Built",
      accepted_from_design: designId,
      accepted_at: new Date().toISOString(),
    },
    geometry: designFeature.geometry,
    work_order_id: wo.id,
    _source: "local",
  };

  // Normalise the assetType key so renderers pick it up correctly
  if (!asset.properties.assetType && asset.properties.asset_type) {
    asset.properties.assetType = asset.properties.asset_type;
  }

  // 1. Persist the as-built asset in IndexedDB
  await DB.putAsset(asset);

  // 2. Queue an ACCEPT sync action
  await DB.queueAction({
    action: "ACCEPT",
    asset_id: designId,
    work_order_id: wo.id,
    asset_type: assetType,
    geometry: designFeature.geometry,
    properties: asset.properties,
    design_id: designId,
  });

  // 3. Track accepted design IDs in the cached work order
  if (!wo.accepted_designs) wo.accepted_designs = [];
  if (!wo.accepted_designs.includes(designId)) {
    wo.accepted_designs.push(designId);
  }
  await DB.saveWorkOrder(wo);

  // 4. Re-render: remove accepted design from grey layer, show as blue as-built
  const acceptedIds = wo.accepted_designs || [];
  MapController.renderJobPackLayers(wo, acceptedIds);
  await renderLocalAssets();
  await updateSyncBadge();

  MapController.getMap()?.closePopup();
  console.log(`Design '${designId}' accepted as as-built asset.`);
}

// ──────────────────── Clear Local Data ────────────────────

async function clearLocalData() {
  if (
    !confirm(
      "Clear all local data?\nThis removes cached work orders, assets, and unsynced changes from this browser.",
    )
  ) {
    return;
  }
  await DB.clearAll();
  localStorage.removeItem("activeWorkOrderId");
  AppState.currentWorkOrder = null;
  AppState.currentTool = null;
  AppState.cableStartNode = null;
  AppState.pendingCableProperties = null;
  MapController.renderLocalAssets([]);
  await updateSyncBadge();
  console.log("Local data cleared.");
  // Reload to reset UI to initial state
  location.reload();
}

// ──────────────────── Sync Logic ────────────────────

async function syncOfflineChanges() {
  const queue = await DB.getSyncQueue();
  if (queue.length === 0) {
    console.log("Nothing to sync.");
    return;
  }

  console.log(`Syncing ${queue.length} queued actions...`);
  UI.updateStatus("checking");

  try {
    const result = await API.sync(queue);
    console.log("Sync result:", result);

    // Clear the queue on success
    await DB.clearSyncQueue();
    await updateSyncBadge();

    UI.updateStatus("online");
    UI.showToast(`✓ Synced ${result.processed} action(s)`);
    console.log(`Sync complete: ${result.processed} actions processed.`);
  } catch (err) {
    console.error("Sync failed:", err);
    UI.updateStatus("offline");
  }
}

// ──────────────────── Map Rendering ────────────────────

async function renderLocalAssets() {
  const woId = AppState.currentWorkOrder?.id;
  const assets = woId ? await DB.getAssets(woId) : [];
  MapController.renderLocalAssets(assets);
}

// ──────────────────── Sync Badge ────────────────────

async function updateSyncBadge() {
  const count = await DB.getSyncQueueCount();
  AppState.pendingSyncCount = count;
  UI.updateSyncBadge(count);
}

// ──────────────────── Connection Health Check ────────────────────

async function checkServerStatus() {
  const wasReachable = AppState.isServerReachable;
  const isReachable = await API.healthCheck();

  AppState.isServerReachable = isReachable;

  if (isReachable) {
    UI.updateStatus("online");
    // Auto-sync when connection is restored
    if (!wasReachable) {
      console.log("Connection restored — auto-syncing...");
      await syncOfflineChanges();
    }
  } else {
    UI.updateStatus("offline");
  }
}

// ──────────────────── Init ────────────────────

(async function init() {
  // Check connectivity first
  await checkServerStatus();
  await updateSyncBadge();

  // Auto-restore last active work order (prevents reset on SW / page reload)
  const savedWoId = localStorage.getItem("activeWorkOrderId");
  if (savedWoId) {
    try {
      await loadWorkOrder(savedWoId);
    } catch {
      localStorage.removeItem("activeWorkOrderId");
      openWorkOrderSelector();
    }
  } else {
    openWorkOrderSelector();
  }

  // Periodic health check
  setInterval(checkServerStatus, 5000);
})();

window.addEventListener("online", checkServerStatus);
window.addEventListener("offline", () => {
  AppState.isServerReachable = false;
  UI.updateStatus("offline");
});
