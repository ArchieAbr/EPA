// CONFIGURATION
const API_BASE = "http://127.0.0.1:5000";

// MOCK JOB PACK DATA
const currentJobPack = {
  id: "WR-2025-9901",
  name: "Woodhouse Moor Circuit Upgrade",
  status: "Design Approval",
  description: "Install new 4-pole ring circuit for park event power supply.",
  center: [53.81, -1.56],

  // The "Design" (Black Lines/Dots)
  proposed_assets: [
    // Poles
    {
      type: "Feature",
      properties: { type: "Pole", status: "Proposed", id: "P-01" },
      geometry: { type: "Point", coordinates: [-1.561, 53.8105] }, // Top-Left
    },
    {
      type: "Feature",
      properties: { type: "Pole", status: "Proposed", id: "P-02" },
      geometry: { type: "Point", coordinates: [-1.559, 53.8105] }, // Top-Right
    },
    {
      type: "Feature",
      properties: { type: "Pole", status: "Proposed", id: "P-03" },
      geometry: { type: "Point", coordinates: [-1.559, 53.8095] }, // Bottom-Right
    },
    {
      type: "Feature",
      properties: { type: "Pole", status: "Proposed", id: "P-04" },
      geometry: { type: "Point", coordinates: [-1.561, 53.8095] }, // Bottom-Left
    },

    // Cables
    {
      type: "Feature",
      properties: { type: "Cable", status: "Proposed", voltage: "11kV" },
      geometry: {
        type: "LineString",
        coordinates: [
          [-1.561, 53.8105],
          [-1.559, 53.8105],
        ], // Top
      },
    },
    {
      type: "Feature",
      properties: { type: "Cable", status: "Proposed", voltage: "11kV" },
      geometry: {
        type: "LineString",
        coordinates: [
          [-1.559, 53.8105],
          [-1.559, 53.8095],
        ], // Right
      },
    },
    {
      type: "Feature",
      properties: { type: "Cable", status: "Proposed", voltage: "11kV" },
      geometry: {
        type: "LineString",
        coordinates: [
          [-1.559, 53.8095],
          [-1.561, 53.8095],
        ], // Bottom
      },
    },
    {
      type: "Feature",
      properties: { type: "Cable", status: "Proposed", voltage: "11kV" },
      geometry: {
        type: "LineString",
        coordinates: [
          [-1.561, 53.8095],
          [-1.561, 53.8105],
        ], // Left
      },
    },
  ],
};

// 1. Setup IndexedDB
const db = new Dexie("AssetDB");
db.version(1).stores({
  assets: "id, properties, geometry, pending_sync",
});

// 2. Setup Map
const map = L.map("map").setView(currentJobPack.center, 18);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap",
}).addTo(map);

// 3. TOOL & DRAWING LOGIC - Redlining
let currentTool = null;
let cableStartNode = null; // Tracks the first pole clicked for a cable
let tempLine = null; // The visual "rubber band" line - not working

// Called by the HTML buttons
window.activateTool = function (toolName) {
  currentTool = toolName;
  cableStartNode = null; // Reset cable state

  // Visual Feedback
  document.getElementById("map").style.cursor = "crosshair";

  if (toolName === "Cable") {
    alert(
      "Cable Tool Active:\n1. Click the first Pole.\n2. Click the second Pole to connect them.",
    );
  } else {
    console.log(`Tool Active: ${toolName}`);
  }
};

// Map Click Listener (Generic clicks on the background)
map.on("click", async function (e) {
  // If drawing a Point (Pole/Transformer), simple drop
  if (currentTool && currentTool !== "Cable") {
    createPointAsset(e.latlng, currentTool);
  }
});

// FEATURE CLICK LISTENER (For Snapping / Cables)
function onFeatureClick(e, featureProperties) {
  // Only care if we are in "Cable" mode - change this
  if (currentTool !== "Cable") return;

  const latlng = e.latlng;

  if (!cableStartNode) {
    // STEP 1: Select Start Node
    cableStartNode = latlng;

    // Visual feedback: Draw a temporary dashed line from start to mouse
    L.popup()
      .setLatLng(latlng)
      .setContent("<b>Start Point Selected</b><br>Click next pole to connect.")
      .openOn(map);
  } else {
    // STEP 2: Select End Node & Create Cable
    createCableAsset(cableStartNode, latlng);

    // Reset
    cableStartNode = null;
    map.closePopup();
  }

  // Stop the map from receiving this click too
  L.DomEvent.stopPropagation(e);
}

// HELPER: Create Point (Pole/Transformer)
let pendingAssetGeometry = null; // Stores geometry while form is open
let pendingAssetType = null; // Stores asset type (Pole/Transformer)

async function createPointAsset(latlng, type) {
  // Store geometry and type, then open form modal
  pendingAssetGeometry = {
    type: "Point",
    coordinates: [latlng.lng, latlng.lat],
  };
  pendingAssetType = type;

  openAssetModal(type);
}

// HELPER: Create Cable (LineString)
async function createCableAsset(startLatLng, endLatLng) {
  // Store geometry and type, then open form modal
  pendingAssetGeometry = {
    type: "LineString",
    coordinates: [
      [startLatLng.lng, startLatLng.lat],
      [endLatLng.lng, endLatLng.lat],
    ],
  };
  pendingAssetType = "Cable";

  openAssetModal("Cable");
}

// HELPER: Save to DB and Render
async function saveAndRender(asset) {
  await db.assets.add(asset);

  if (asset.geometry.type === "Point") {
    renderSingleRedMarker(asset);
  } else {
    renderSingleRedLine(asset); // New function for lines
  }

  // Reset Tool cursor
  document.getElementById("map").style.cursor = "";

  if (isServerReachable) syncOfflineChanges();
}

// HELPER: Delete Asset from DB and Re-render
async function deleteAsset(assetId) {
  await db.assets.delete(assetId);
  loadAssets(); // Re-render to remove from map
  map.closePopup();
  console.log(`Asset ${assetId} deleted.`);
}

// Expose to global scope for popup button onclick
window.deleteAsset = deleteAsset;

// ============================================================
// 3b. DYNAMIC DATA FORM LOGIC
// ============================================================

// MODAL CONTROL
function openAssetModal(assetType) {
  document.getElementById("modal-title").textContent = `New ${assetType}`;
  document.getElementById("asset-modal").classList.add("active");

  // Inject the correct form template
  const container = document.getElementById("form-fields-container");
  container.innerHTML = getFormTemplate(assetType);

  // Initialize interactive elements (must be done after template injection)
  initTrafficLights();
  initGradeSelectors();
  initPhotoCapture();

  // Reset to defaults
  resetTrafficLights();
  resetGradeSelectors();
  clearPhotoPreview();

  // Handle transformer-specific GMT fields
  if (assetType === "Transformer") {
    const gmtFields = document.getElementById("gmt-only-fields");
    if (gmtFields) gmtFields.classList.remove("active");
  }

  // Reset cursor (was crosshair from tool activation)
  document.getElementById("map").style.cursor = "";
}

function closeAssetModal() {
  document.getElementById("asset-modal").classList.remove("active");
  pendingAssetGeometry = null;
  pendingAssetType = null;
}

// Expose to global scope for HTML onclick
window.closeAssetModal = closeAssetModal;

// TRAFFIC LIGHT SELECTION
function initTrafficLights() {
  document.querySelectorAll(".traffic-light").forEach((container) => {
    container.querySelectorAll(".traffic-light-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        // Deselect siblings
        container
          .querySelectorAll(".traffic-light-btn")
          .forEach((b) => b.classList.remove("selected"));
        // Select this one
        this.classList.add("selected");
      });
    });
  });
}

function resetTrafficLights() {
  document.querySelectorAll(".traffic-light-btn").forEach((btn) => {
    btn.classList.remove("selected");
  });
  // Default to "None" (green) for all traffic lights
  document.querySelectorAll(".traffic-light").forEach((container) => {
    const greenBtn = container.querySelector(".traffic-light-btn.green");
    if (greenBtn) greenBtn.classList.add("selected");
  });
}

function getTrafficLightValue(fieldName) {
  const container = document.querySelector(
    `.traffic-light[data-field="${fieldName}"]`,
  );
  const selected = container?.querySelector(".traffic-light-btn.selected");
  return selected ? selected.dataset.value : "None";
}

// GRADE SELECTOR (1-5 for Transformers)
function initGradeSelectors() {
  document.querySelectorAll(".grade-selector").forEach((container) => {
    container.querySelectorAll(".grade-btn").forEach((btn) => {
      btn.addEventListener("click", function () {
        // Deselect siblings
        container
          .querySelectorAll(".grade-btn")
          .forEach((b) => b.classList.remove("selected"));
        // Select this one
        this.classList.add("selected");
      });
    });
  });
}

function resetGradeSelectors() {
  document.querySelectorAll(".grade-btn").forEach((btn) => {
    btn.classList.remove("selected");
  });
  // Default to Grade 1 (best) for all grade selectors
  document.querySelectorAll(".grade-selector").forEach((container) => {
    const grade1Btn = container.querySelector(".grade-btn.grade-1");
    if (grade1Btn) grade1Btn.classList.add("selected");
  });
}

function getGradeValue(fieldName) {
  const container = document.querySelector(
    `.grade-selector[data-field="${fieldName}"]`,
  );
  const selected = container?.querySelector(".grade-btn.selected");
  return selected ? parseInt(selected.dataset.value) : 1;
}

// GMT-ONLY FIELDS TOGGLE
function toggleGMTFields() {
  const mountingSelect = document.getElementById("tx-mounting");
  const gmtFields = document.getElementById("gmt-only-fields");

  if (mountingSelect.value === "Ground Mounted") {
    gmtFields.classList.add("active");
  } else {
    gmtFields.classList.remove("active");
  }
}

// Expose to global scope for HTML onchange
window.toggleGMTFields = toggleGMTFields;

// PHOTO CAPTURE & BASE64 CONVERSION
let pendingPhotoBase64 = null;

function initPhotoCapture() {
  const photoInput = document.getElementById("photo");
  const preview = document.getElementById("photo-preview");

  photoInput.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
      pendingPhotoBase64 = event.target.result; // Base64 string
      preview.src = pendingPhotoBase64;
      preview.classList.add("has-image");
      document.querySelector(".photo-upload-text").textContent =
        "✓ Photo captured";
    };
    reader.readAsDataURL(file);
  });
}

function clearPhotoPreview() {
  pendingPhotoBase64 = null;
  const preview = document.getElementById("photo-preview");
  preview.src = "";
  preview.classList.remove("has-image");
  document.querySelector(".photo-upload-text").textContent =
    "📷 Tap to capture or select photo";
}

// FORM SUBMISSION
async function saveAssetForm() {
  if (!pendingAssetGeometry || !pendingAssetType) {
    console.error("No pending asset to save");
    return;
  }

  // Collect form data
  const form = document.getElementById("asset-form");
  let properties = {};

  if (pendingAssetType === "Transformer") {
    // TRANSFORMER FORM DATA
    properties = {
      name: `New ${pendingAssetType}`,
      assetType: pendingAssetType,
      status: "As-Built",
      created_at: new Date().toISOString(),

      // Core Specification
      mounting: form["tx-mounting"].value,
      rating: form["tx-rating"].value,
      manufacturer: form["tx-manufacturer"].value,
      serialNo: form["tx-serial"].value,
      yearOfManufacture: parseInt(form["tx-year"].value) || null,
      coolingMedium: form["tx-cooling"].value,
      breatherType: form["tx-breather"].value,

      // Inspection / Condition
      tankGrade: getGradeValue("tx-tankGrade"),
      tankIssues: {
        surfaceRust: form["tx-surfaceRust"]?.checked || false,
        pitting: form["tx-pitting"]?.checked || false,
        weepingOil: form["tx-weepingOil"]?.checked || false,
        activeLeak: form["tx-activeLeak"]?.checked || false,
      },
      finsGrade: getGradeValue("tx-finsGrade"),
      bushings: form["tx-bushings"].value,
      silicaGel: form["tx-silicaGel"].value,
      oilLevel: form["tx-oilLevel"].value,

      // Advanced Data (GMT Only)
      oilAcidity: parseFloat(form["tx-oilAcidity"]?.value) || null,
      moistureContent: parseInt(form["tx-moisture"]?.value) || null,
      breakdownStrength: parseInt(form["tx-breakdown"]?.value) || null,

      // Consequence of Failure
      bunding: form["tx-bunding"].value,
      watercourseProximity: form["tx-watercourse"].value,

      // Photo
      photo: pendingPhotoBase64,
    };
  } else if (pendingAssetType === "Cable") {
    // CABLE FORM DATA
    properties = {
      name: `New ${pendingAssetType}`,
      assetType: pendingAssetType,
      status: "As-Built",
      created_at: new Date().toISOString(),

      // Core Specification
      voltageLevel: form["cable-voltage"].value,
      cableType: form["cable-type"].value,
      conductorMaterial: form["cable-conductor"].value,
      crossSectionalArea: form["cable-csa"].value,
      cores: form["cable-cores"].value,
      installationYear: parseInt(form["cable-year"].value) || null,

      // Loading & Environment
      dutyFactor: form["cable-duty"].value,
      situation: form["cable-situation"].value,
      topography: form["cable-topography"].value,

      // Condition Assessment (Traffic Lights)
      sheathCondition: getTrafficLightValue("cable-sheath"),
      jointCondition: getTrafficLightValue("cable-joints"),
      jointsCount: parseInt(form["cable-joints-count"].value) || 0,
      historicalFaults: parseInt(form["cable-faults"].value) || 0,
      knownIssues: {
        thirdPartyDamageRisk: form["cable-thirdParty"]?.checked || false,
        partialDischarge: form["cable-partialDischarge"]?.checked || false,
        thermalIssues: form["cable-thermal"]?.checked || false,
      },

      // Photo
      photo: pendingPhotoBase64,
    };
  } else {
    // POLE FORM DATA (existing logic)
    properties = {
      name: `New ${pendingAssetType}`,
      assetType: pendingAssetType,
      status: "As-Built",
      created_at: new Date().toISOString(),

      // Core Specification
      material: form.material.value,
      treatment: form.treatment.value,
      stoutness: form.stoutness.value,
      height: form.height.value,
      transformers: parseInt(form.transformers.value) || 0,

      // Inspection / Condition (Traffic Lights)
      topRot: getTrafficLightValue("topRot"),
      externalRot: getTrafficLightValue("externalRot"),
      birdDamage: getTrafficLightValue("birdDamage"),
      verticality: form.verticality.value,
      steelCorrosion: getTrafficLightValue("steelCorrosion"),
      soundTest: form.soundTest.value,

      // Photo
      photo: pendingPhotoBase64,
    };
  }

  const newAsset = {
    id: Date.now(),
    type: "Feature",
    properties: properties,
    geometry: pendingAssetGeometry,
    pending_sync: 1,
  };

  // Save and render
  await saveAndRender(newAsset);

  // Close modal and reset state
  closeAssetModal();
  console.log("Asset saved with form data:", newAsset.properties);
}

// Expose to global scope for HTML onclick
window.saveAssetForm = saveAssetForm;

// 4. RENDERING LOGIC
// A. Render the "Black" Design Layer (Static)
function renderJobPackLayers() {
  const proposedLayer = L.layerGroup().addTo(map);

  L.geoJSON(currentJobPack.proposed_assets, {
    // Style for Lines
    style: {
      color: "#2c3e50",
      dashArray: "5, 10",
      weight: 3,
      opacity: 0.8,
    },
    // Style for Points
    pointToLayer: (f, latlng) =>
      L.circleMarker(latlng, {
        radius: 5,
        fillColor: "#2c3e50",
        color: "#fff",
        weight: 1,
        fillOpacity: 1,
      }),
    // FIX: Restore the Popups (This was missing!)
    onEachFeature: function (feature, layer) {
      layer.bindPopup(
        `<b>DESIGN: ${feature.properties.type}</b><br>Status: ${feature.properties.status}`,
      );
    },
  }).addTo(proposedLayer);
}

// B. Render the "Red" As-Built Layer (Dynamic from DB)
function renderSingleRedMarker(f) {
  const marker = L.circleMarker(
    [f.geometry.coordinates[1], f.geometry.coordinates[0]],
    {
      radius: 7,
      fillColor: "#e74c3c",
      color: "#c0392b",
      weight: 2,
      fillOpacity: 1,
    },
  );

  // CLICK HANDLER FOR SNAPPING
  marker.on("click", (e) => onFeatureClick(e, f.properties));

  // Build popup content based on asset type
  const p = f.properties;
  const syncStatus = f.pending_sync === 1 ? "Unsynced" : "Synced";

  // Photo thumbnail (if exists)
  const photoHtml = p.photo
    ? `<img src="${p.photo}" style="width:100%; max-height:100px; object-fit:cover; border-radius:4px; margin:8px 0;">`
    : "";

  let popupContent = "";

  if (p.assetType === "Transformer") {
    // TRANSFORMER POPUP
    const gradeColors = {
      1: "#27ae60",
      2: "#2ecc71",
      3: "#f1c40f",
      4: "#e67e22",
      5: "#e74c3c",
    };
    const getGradeDot = (grade) => {
      const color = gradeColors[grade] || "#95a5a6";
      return `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${color}; margin-right:4px;"></span>`;
    };

    // Tank issues summary
    const tankIssues = p.tankIssues || {};
    const issuesList = [];
    if (tankIssues.surfaceRust) issuesList.push("Surface Rust");
    if (tankIssues.pitting) issuesList.push("Pitting");
    if (tankIssues.weepingOil) issuesList.push("Weeping Oil");
    if (tankIssues.activeLeak) issuesList.push("Active Leak");
    const issuesText = issuesList.length > 0 ? issuesList.join(", ") : "None";

    // GMT-only data (if present)
    const gmtData =
      p.mounting === "Ground Mounted" &&
      (p.oilAcidity || p.moistureContent || p.breakdownStrength)
        ? `<hr style="border:none; border-top:1px solid #ecf0f1; margin:8px 0;">
         <b>Oil Analysis</b><br>
         Acidity: ${p.oilAcidity ?? "—"} mgKOH/g<br>
         Moisture: ${p.moistureContent ?? "—"} ppm<br>
         Breakdown: ${p.breakdownStrength ?? "—"} kV`
        : "";

    popupContent = `
      <div style="min-width:220px; font-size:0.85rem;">
        <b style="font-size:1rem;">${p.name}</b><br>
        <span style="color:#7f8c8d;">${syncStatus}</span>
        ${photoHtml}
        <hr style="border:none; border-top:1px solid #ecf0f1; margin:8px 0;">
        <b>Specification</b><br>
        ${p.mounting || "—"} | ${p.rating || "—"} kVA<br>
        ${p.manufacturer || "—"} (${p.yearOfManufacture || "—"})<br>
        Serial: ${p.serialNo || "—"}<br>
        Cooling: ${p.coolingMedium || "—"}<br>
        Breather: ${p.breatherType || "—"}
        <hr style="border:none; border-top:1px solid #ecf0f1; margin:8px 0;">
        <b>Condition</b><br>
        ${getGradeDot(p.tankGrade)}Tank Grade: ${p.tankGrade || "—"}<br>
        Issues: ${issuesText}<br>
        ${getGradeDot(p.finsGrade)}Fins Grade: ${p.finsGrade || "—"}<br>
        Bushings: ${p.bushings || "—"}<br>
        Silica Gel: ${p.silicaGel || "—"}<br>
        Oil Level: ${p.oilLevel || "—"}
        ${gmtData}
        <hr style="border:none; border-top:1px solid #ecf0f1; margin:8px 0;">
        <b>CoF</b><br>
        Bunding: ${p.bunding || "—"}<br>
        Watercourse: ${p.watercourseProximity || "—"}
        <hr style="border:none; border-top:1px solid #ecf0f1; margin:8px 0;">
        <button onclick="deleteAsset(${f.id})" style="width:100%; padding:6px; background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer;">Delete Asset</button>
      </div>
    `;
  } else {
    // POLE POPUP (existing logic)
    const conditionColors = {
      None: "#27ae60",
      Minor: "#f1c40f",
      "Surface Softening": "#f1c40f",
      Low: "#f1c40f",
      "Surface Rust": "#f1c40f",
      Significant: "#e67e22",
      Medium: "#e67e22",
      Pitting: "#e67e22",
      Critical: "#e74c3c",
      "Advanced Decay": "#e74c3c",
      High: "#e74c3c",
      "Section Loss": "#e74c3c",
    };

    const getConditionDot = (value) => {
      const color = conditionColors[value] || "#95a5a6";
      return `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${color}; margin-right:4px;"></span>`;
    };

    popupContent = `
      <div style="min-width:200px; font-size:0.85rem;">
        <b style="font-size:1rem;">${p.name}</b><br>
        <span style="color:#7f8c8d;">${syncStatus}</span>
        ${photoHtml}
        <hr style="border:none; border-top:1px solid #ecf0f1; margin:8px 0;">
        <b>Specification</b><br>
        ${p.material || "—"} | ${p.height || "—"} | ${p.stoutness || "—"}<br>
        Treatment: ${p.treatment || "—"}<br>
        Transformers: ${p.transformers ?? "—"}
        <hr style="border:none; border-top:1px solid #ecf0f1; margin:8px 0;">
        <b>Condition</b><br>
        ${getConditionDot(p.topRot)}Top Rot: ${p.topRot || "—"}<br>
        ${getConditionDot(p.externalRot)}External Rot: ${p.externalRot || "—"}<br>
        ${getConditionDot(p.birdDamage)}Bird Damage: ${p.birdDamage || "—"}<br>
        Verticality: ${p.verticality || "—"}<br>
        ${getConditionDot(p.steelCorrosion)}Steel Corrosion: ${p.steelCorrosion || "—"}<br>
        Sound Test: ${p.soundTest || "—"}
        <hr style="border:none; border-top:1px solid #ecf0f1; margin:8px 0;">
        <button onclick="deleteAsset(${f.id})" style="width:100%; padding:6px; background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer;">Delete Asset</button>
      </div>
    `;
  }

  if (f.pending_sync === 1) {
    marker.setStyle({ fillOpacity: 0.5, dashArray: "2, 2" });
  }
  marker.bindPopup(popupContent, { maxWidth: 300 });

  marker.addTo(map);
}

// NEW: Render Red Lines (Cables)
function renderSingleRedLine(f) {
  // Swap coordinates because Leaflet is [Lat, Lng] but GeoJSON is [Lng, Lat]
  const latlngs = f.geometry.coordinates.map((coord) => [coord[1], coord[0]]);

  const polyline = L.polyline(latlngs, {
    color: "#e74c3c", // Red
    weight: 4,
    opacity: 0.8,
  });

  // Build detailed popup content for cables
  const syncStatus = f.pending_sync === 1 ? "(Unsynced)" : "Synced";
  const p = f.properties;

  // Helper to format traffic light values with color
  const formatCondition = (value) => {
    const colors = {
      None: "#27ae60",
      Minor: "#f39c12",
      Significant: "#e67e22",
      Critical: "#e74c3c",
    };
    const color = colors[value] || "#999";
    return `<span style="color:${color}; font-weight:bold;">${value || "N/A"}</span>`;
  };

  let popupContent = `
    <div style="min-width:200px;">
      <b style="font-size:14px;">${p.name || "Cable"}</b>
      <span style="float:right; font-size:11px; color:#666;">${syncStatus}</span>
      <hr style="margin:8px 0; border:none; border-top:1px solid #ddd;">
  `;

  // Core Specification
  if (p.voltageLevel || p.cableType || p.conductorMaterial) {
    popupContent += `
      <div style="margin-bottom:8px;">
        <b style="font-size:11px; color:#666;">SPECIFICATION</b><br>
        ${p.voltageLevel ? `<b>Voltage:</b> ${p.voltageLevel}<br>` : ""}
        ${p.cableType ? `<b>Type:</b> ${p.cableType}<br>` : ""}
        ${p.conductorMaterial ? `<b>Conductor:</b> ${p.conductorMaterial}<br>` : ""}
        ${p.crossSectionalArea ? `<b>CSA:</b> ${p.crossSectionalArea} mm²<br>` : ""}
        ${p.cores ? `<b>Cores:</b> ${p.cores}<br>` : ""}
        ${p.installationYear ? `<b>Installed:</b> ${p.installationYear}<br>` : ""}
      </div>
    `;
  }

  // Loading & Environment
  if (p.dutyFactor || p.situation || p.topography) {
    popupContent += `
      <div style="margin-bottom:8px;">
        <b style="font-size:11px; color:#666;">ENVIRONMENT</b><br>
        ${p.dutyFactor ? `<b>Duty Factor:</b> ${p.dutyFactor}<br>` : ""}
        ${p.situation ? `<b>Situation:</b> ${p.situation}<br>` : ""}
        ${p.topography ? `<b>Topography:</b> ${p.topography}<br>` : ""}
      </div>
    `;
  }

  // Condition Assessment
  if (p.sheathCondition || p.jointCondition) {
    popupContent += `
      <div style="margin-bottom:8px;">
        <b style="font-size:11px; color:#666;">CONDITION</b><br>
        ${p.sheathCondition ? `<b>Sheath:</b> ${formatCondition(p.sheathCondition)}<br>` : ""}
        ${p.jointCondition ? `<b>Joints:</b> ${formatCondition(p.jointCondition)}<br>` : ""}
        ${p.jointsCount !== undefined ? `<b>Joint Count:</b> ${p.jointsCount}<br>` : ""}
        ${p.historicalFaults !== undefined ? `<b>Historical Faults:</b> ${p.historicalFaults}<br>` : ""}
      </div>
    `;
  }

  // Known Issues
  if (p.knownIssues) {
    const issues = [];
    if (p.knownIssues.thirdPartyDamageRisk) issues.push("Third Party Risk");
    if (p.knownIssues.partialDischarge) issues.push("Partial Discharge");
    if (p.knownIssues.thermalIssues) issues.push("Thermal Issues");
    if (issues.length > 0) {
      popupContent += `
        <div style="margin-bottom:8px;">
          <b style="font-size:11px; color:#666;">ISSUES</b><br>
          <span style="color:#e74c3c;">${issues.join(", ")}</span>
        </div>
      `;
    }
  }

  // Delete button
  popupContent += `
      <button onclick="deleteAsset(${f.id})" style="width:100%; padding:6px; background:#e74c3c; color:white; border:none; border-radius:4px; cursor:pointer;">Delete Asset</button>
    </div>
  `;

  if (f.pending_sync === 1) {
    polyline.setStyle({ dashArray: "10, 10", opacity: 0.5 });
  }
  polyline.bindPopup(popupContent, { maxWidth: 300 });

  polyline.addTo(map);
}

// Update loadAssets to handle lines too
async function loadAssets() {
  // Clear old Red layers (Simple clear all non-tile layers)
  map.eachLayer((layer) => {
    // Clear Red Circles AND Red Lines
    if (
      (layer instanceof L.CircleMarker &&
        layer.options.fillColor === "#e74c3c") ||
      (layer instanceof L.Polyline && layer.options.color === "#e74c3c")
    ) {
      map.removeLayer(layer);
    }
  });

  const localFeatures = await db.assets.toArray();
  localFeatures.forEach((f) => {
    if (f.geometry.type === "Point") renderSingleRedMarker(f);
    if (f.geometry.type === "LineString") renderSingleRedLine(f);
  });
}

//Non-fucntional

// Load from DB on startup
async function loadAssets() {
  // Clear old Red markers (but keep Black design layer)
  map.eachLayer((layer) => {
    // Hacky way to find Red markers to clear them before re-rendering
    if (
      layer instanceof L.CircleMarker &&
      layer.options.fillColor === "#e74c3c"
    ) {
      map.removeLayer(layer);
    }
  });

  // Load local data
  const localFeatures = await db.assets.toArray();
  localFeatures.forEach(renderSingleRedMarker);
}

// 5. SYNC LOGIC
async function syncOfflineChanges() {
  const unsynced = await db.assets.where("pending_sync").equals(1).toArray();
  if (unsynced.length === 0) return;

  console.log(`Syncing ${unsynced.length} items...`);
  updateStatusUI("checking");

  try {
    const response = await fetch(`${API_BASE}/api/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(unsynced),
    });

    if (response.ok) {
      // Mark local items as synced
      for (const asset of unsynced) {
        await db.assets.update(asset.id, { pending_sync: 0 });
      }
      loadAssets(); // Re-render to remove "Ghost" effect
      updateStatusUI("online");
      console.log("Sync Complete!");
    }
  } catch (err) {
    console.error("Sync failed", err);
    updateStatusUI("offline");
  }
}

// 6. CONNECTION HEALTH CHECK
const statusBadge = document.getElementById("status");
let isServerReachable = false;

async function checkServerStatus() {
  if (!isServerReachable) updateStatusUI("checking");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    const response = await fetch(`${API_BASE}/api/assets`, {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (response.ok) {
      if (!isServerReachable) {
        isServerReachable = true;
        updateStatusUI("online");
        syncOfflineChanges(); // Auto-sync on reconnect
      }
    }
  } catch (err) {
    if (isServerReachable || statusBadge.classList.contains("checking")) {
      isServerReachable = false;
      updateStatusUI("offline");
    }
  }
}

function updateStatusUI(state) {
  if (state === "online") {
    statusBadge.innerHTML = "● Online";
    statusBadge.className = "online";
  } else if (state === "offline") {
    statusBadge.innerHTML = "● Offline Mode";
    statusBadge.className = "offline";
  } else if (state === "checking") {
    statusBadge.innerHTML = "● Checking...";
    statusBadge.className = "checking";
  }
}

// INITIALIZATION
renderJobPackLayers(); // Draw Black Lines
loadAssets(); // Draw Red Dots - change?
setInterval(checkServerStatus, 5000);
checkServerStatus();

// Standard Browser Events
window.addEventListener("online", checkServerStatus);
window.addEventListener("offline", () => updateStatusUI(false));
