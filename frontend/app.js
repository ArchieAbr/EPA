// CONFIGURATION
const API_BASE = "http://127.0.0.1:5000"; 

// 1. Setup IndexedDB
const db = new Dexie("AssetDB");
db.version(1).stores({
    assets: 'id, properties, geometry, pending_sync' // Added pending_sync
});

// 2. Setup Map
const map = L.map('map').setView([53.8008, -1.5491], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

const statusBadge = document.getElementById('status');


// 3. HEARTBEAT & CONNECTION LOGIC (The Fix)
// Variable to track state
let isServerReachable = false;

async function checkServerStatus() {
    try {
        // Try to fetch a resource
        const response = await fetch(`${API_BASE}/api/assets`, { method: 'HEAD' });
        
        if (response.ok) {
            if (!isServerReachable) {
                console.log("System: Connection Restored");
                isServerReachable = true;
                updateStatusUI(true);
                syncOfflineChanges(); // Auto-sync when back online
            }
        } else {
            throw new Error("Server Error");
        }
    } catch (err) {
        if (isServerReachable) {
            console.log("System: Connection Lost");
            isServerReachable = false;
            updateStatusUI(false);
        }
    }
}

function updateStatusUI(online) {
    if (online) {
        statusBadge.innerHTML = '● Online';
        statusBadge.className = 'online'; // Green border
        statusBadge.style.color = '#27ae60';
    } else {
        statusBadge.innerHTML = '● Offline Mode';
        statusBadge.className = 'offline'; // Red border
        statusBadge.style.color = '#c0392b';
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
    map.eachLayer(layer => {
        if (layer instanceof L.Marker) map.removeLayer(layer);
    });

    // Add new markers
    features.forEach(f => {
        L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]])
         .bindPopup(`<b>${f.properties.name}</b><br>Status: ${f.properties.status}`)
         .addTo(map);
    });
}

// Placeholder for the Sync Logic
async function syncOfflineChanges() {
    console.log("Checking for offline changes to sync...");
}

// Initial Load
loadAssets();

// Standard Browser Events
window.addEventListener('online', checkServerStatus);
window.addEventListener('offline', () => updateStatusUI(false));