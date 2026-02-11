// CONFIGURATION
const API_BASE = "http://127.0.0.1:5000";

// MOCK JOB PACK DATA
const currentJobPack = {
    id: "WR-2025-9901",
    name: "Woodhouse Moor Circuit Upgrade",
    status: "Design Approval",
    description: "Install new 4-pole ring circuit for park event power supply.",
    center: [53.8100, -1.5600],
    
    // The "Design" (Black Lines/Dots)
    proposed_assets: [
        // Poles
        {
            type: "Feature",
            properties: { type: "Pole", status: "Proposed", id: "P-01" },
            geometry: { type: "Point", coordinates: [-1.5610, 53.8105] } // Top-Left
        },
        {
            type: "Feature",
            properties: { type: "Pole", status: "Proposed", id: "P-02" },
            geometry: { type: "Point", coordinates: [-1.5590, 53.8105] } // Top-Right
        },
        {
            type: "Feature",
            properties: { type: "Pole", status: "Proposed", id: "P-03" },
            geometry: { type: "Point", coordinates: [-1.5590, 53.8095] } // Bottom-Right
        },
        {
            type: "Feature",
            properties: { type: "Pole", status: "Proposed", id: "P-04" },
            geometry: { type: "Point", coordinates: [-1.5610, 53.8095] } // Bottom-Left
        },

        // Cables
        {
            type: "Feature",
            properties: { type: "Cable", status: "Proposed", voltage: "11kV" },
            geometry: { 
                type: "LineString", 
                coordinates: [[-1.5610, 53.8105], [-1.5590, 53.8105]] // Top
            }
        },
        {
            type: "Feature",
            properties: { type: "Cable", status: "Proposed", voltage: "11kV" },
            geometry: { 
                type: "LineString", 
                coordinates: [[-1.5590, 53.8105], [-1.5590, 53.8095]] // Right
            }
        },
        {
            type: "Feature",
            properties: { type: "Cable", status: "Proposed", voltage: "11kV" },
            geometry: { 
                type: "LineString", 
                coordinates: [[-1.5590, 53.8095], [-1.5610, 53.8095]] // Bottom
            }
        },
        {
            type: "Feature",
            properties: { type: "Cable", status: "Proposed", voltage: "11kV" },
            geometry: { 
                type: "LineString", 
                coordinates: [[-1.5610, 53.8095], [-1.5610, 53.8105]] // Left
            }
        }
    ]
};

// 1. Setup IndexedDB
const db = new Dexie("AssetDB");
db.version(1).stores({
  assets: "id, properties, geometry, pending_sync", // Added pending_sync
});

// 2. Setup Map
const map = L.map('map').setView([53.8100, -1.5600], 20);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap",
}).addTo(map);

// 3. HEARTBEAT & CONNECTION LOGIC (The Fix)
// Variable to track state
const statusBadge = document.getElementById("status");

// Variable to track state
let isServerReachable = false;

async function checkServerStatus() {
  // Set UI to "Checking" only if we were previously offline
  if (!isServerReachable) {
    updateStatusUI("checking");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000); // Force timeout after 2 seconds

  try {
    const response = await fetch(`${API_BASE}/api/assets`, {
      method: "HEAD",
      signal: controller.signal, // Attach the stopwatch
    });

    clearTimeout(timeoutId); // Stop the timer if successful

    if (response.ok) {
      if (!isServerReachable) {
        console.log("System: Connection Restored");
        isServerReachable = true;
        updateStatusUI("online");
        syncOfflineChanges();
      }
    }
  } catch (err) {
    // If it timed out or failed
    if (isServerReachable || statusBadge.classList.contains("checking")) {
      console.log("System: Connection Lost (Timeout or Error)");
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

// Start the Heartbeat (Checks every 5 seconds)
setInterval(checkServerStatus, 5000);
// Also check immediately on load
checkServerStatus();

// 4. DATA LOGIC
async function loadAssets() {
  try {
    // 1. Try Network First
    const response = await fetch(`${API_BASE}/api/assets`);
    if (!response.ok) throw new Error("Network fail");

    const data = await response.json();
    console.log("Loaded live data:", data);

    // 2. Update Local DB (Cache)
    await db.assets.clear();
    await db.assets.bulkPut(data.features);

    renderMap(data.features);
  } catch (err) {
    console.log("Network failed, loading from DB...");
    // 3. Fallback to IndexedDB
    const localFeatures = await db.assets.toArray();
    renderMap(localFeatures);
  }
}

function renderMap(features) {
  map.invalidateSize(); // Fixes layout glitches

  // Clear old markers
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker) map.removeLayer(layer);
  });

  // Add new markers
  features.forEach((f) => {
    L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]])
      .bindPopup(
        `<b>${f.properties.name}</b><br>Status: ${f.properties.status}`,
      )
      .addTo(map);
  });
}
function renderJobPackLayers() {
  // 1. Create a specific layer group for "Proposed" work
  const proposedLayer = L.layerGroup().addTo(map);

  L.geoJSON(currentJobPack.proposed_assets, {
    // Style for Lines (Cables)
    style: function (feature) {
      return {
        color: "#000000", // Black
        dashArray: "10, 10", // Dashed Line (Standard for "Proposed")
        weight: 3,
        opacity: 0.7,
      };
    },
    // Style for Points (Poles)
    pointToLayer: function (feature, latlng) {
      return L.circleMarker(latlng, {
        radius: 6,
        fillColor: "#000000", // Black
        color: "#fff",
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8,
      });
    },
    onEachFeature: function (feature, layer) {
      layer.bindPopup(
        `<b>PROPOSED ${feature.properties.type}</b><br>Do not energise until tested.`,
      );
    },
  }).addTo(proposedLayer);
}
renderJobPackLayers();
// Placeholder for the Sync Logic
async function syncOfflineChanges() {
  console.log("Checking for offline changes to sync...");
}

// Initial Load
loadAssets();

// Standard Browser Events
window.addEventListener("online", checkServerStatus);
window.addEventListener("offline", () => updateStatusUI(false));
