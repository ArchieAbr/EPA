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
async function createPointAsset(latlng, type) {
  const newAsset = {
    id: Date.now(),
    type: "Feature",
    properties: {
      name: `New ${type}`,
      status: "As-Built",
      created_at: new Date().toISOString(),
    },
    geometry: {
      type: "Point",
      coordinates: [latlng.lng, latlng.lat],
    },
    pending_sync: 1,
  };
  await saveAndRender(newAsset);
}

// HELPER: Create Cable (LineString)
async function createCableAsset(startLatLng, endLatLng) {
  const newAsset = {
    id: Date.now(),
    type: "Feature",
    properties: {
      name: "New 11kV Cable",
      status: "As-Built",
      voltage: "11kV",
      created_at: new Date().toISOString(),
    },
    geometry: {
      type: "LineString",
      coordinates: [
        [startLatLng.lng, startLatLng.lat],
        [endLatLng.lng, endLatLng.lat],
      ],
    },
    pending_sync: 1,
  };
  await saveAndRender(newAsset);
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
        opacity: 0.8 
    }, 
    // Style for Points
    pointToLayer: (f, latlng) => L.circleMarker(latlng, {
        radius: 5,
        fillColor: "#2c3e50", 
        color: "#fff",
        weight: 1,
        fillOpacity: 1
    }),
    // FIX: Restore the Popups (This was missing!)
    onEachFeature: function (feature, layer) {
        layer.bindPopup(`<b>DESIGN: ${feature.properties.type}</b><br>Status: ${feature.properties.status}`);
    }
  }).addTo(proposedLayer);
}

// B. Render the "Red" As-Built Layer (Dynamic from DB)
function renderSingleRedMarker(f) {
    const marker = L.circleMarker([f.geometry.coordinates[1], f.geometry.coordinates[0]], {
        radius: 7,              
        fillColor: "#e74c3c",   
        color: "#c0392b",       
        weight: 2,
        fillOpacity: 1
    });

    // CLICK HANDLER FOR SNAPPING
    marker.on('click', (e) => onFeatureClick(e, f.properties));

    if (f.pending_sync === 1) {
        marker.setStyle({ fillOpacity: 0.5, dashArray: "2, 2" });
        marker.bindPopup(`<b>${f.properties.name}</b><br>(Unsynced)`);
    } else {
        marker.bindPopup(`<b>${f.properties.name}</b><br>Synced`);
    }
    
    marker.addTo(map);
}

// NEW: Render Red Lines (Cables)
function renderSingleRedLine(f) {
    // Swap coordinates because Leaflet is [Lat, Lng] but GeoJSON is [Lng, Lat]
    const latlngs = f.geometry.coordinates.map(coord => [coord[1], coord[0]]);

    const polyline = L.polyline(latlngs, {
        color: "#e74c3c", // Red
        weight: 4,
        opacity: 0.8
    });

    if (f.pending_sync === 1) {
        polyline.setStyle({ dashArray: "10, 10", opacity: 0.5 });
        polyline.bindPopup(`<b>${f.properties.name}</b><br>(Unsynced)`);
    } else {
        polyline.bindPopup(`<b>${f.properties.name}</b><br>Synced`);
    }

    polyline.addTo(map);
}

// Update loadAssets to handle lines too
async function loadAssets() {
    // Clear old Red layers (Simple clear all non-tile layers)
    map.eachLayer((layer) => {
        // Clear Red Circles AND Red Lines
        if ((layer instanceof L.CircleMarker && layer.options.fillColor === "#e74c3c") ||
            (layer instanceof L.Polyline && layer.options.color === "#e74c3c")) {
            map.removeLayer(layer);
        }
    });

    const localFeatures = await db.assets.toArray();
    localFeatures.forEach(f => {
        if (f.geometry.type === 'Point') renderSingleRedMarker(f);
        if (f.geometry.type === 'LineString') renderSingleRedLine(f);
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
