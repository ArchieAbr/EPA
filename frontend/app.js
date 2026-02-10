// 1. Setup IndexedDB (The Local Database)
const db = new Dexie("AssetDB");
db.version(1).stores({
    assets: 'id, properties, geometry' // We store the GeoJSON feature
});

// 2. Setup Map
const map = L.map('map').setView([53.8008, -1.5491], 14);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
}).addTo(map);

const statusDiv = document.getElementById('status');

// 3. Main Function: Load Data
async function loadAssets() {
    try {
        // Attempt to fetch from API (Online)
        const response = await fetch('http://127.0.0.1:5000/api/assets');
        if (!response.ok) throw new Error("Offline");

        const data = await response.json();
        console.log("Online: Fetched from Flask");

        // Save to Local DB (Cache it)
        await db.assets.clear();
        await db.assets.bulkPut(data.features);

        updateStatus(true);
        renderMap(data.features);

    } catch (err) {
        console.log("Offline: Loading from IndexedDB");
        // Fetch from Local DB
        const localFeatures = await db.assets.toArray();

        updateStatus(false);
        renderMap(localFeatures);
    }
}

// 4. Render Markers
function renderMap(features) {
    // Clear existing layers (simplification)
    map.eachLayer(layer => {
        if (layer instanceof L.Marker) map.removeLayer(layer);
    });

    features.forEach(f => {
        L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]])
         .bindPopup(`<b>${f.properties.name}</b><br>Status: ${f.properties.status}`)
         .addTo(map);
    });
}

function updateStatus(isOnline) {
    statusDiv.textContent = isOnline ? "Online (Synced)" : "Offline Mode";
    statusDiv.className = isOnline ? "online" : "offline";
}

// Initial Load
loadAssets();