# Offline GIS Asset Capture

A progressive web application for capturing and managing electrical network assets in the field, with full offline support and background synchronisation.

## Overview

Field engineers use this tool to view proposed circuit designs on a map and record **as-built** assets (poles, transformers, cables) while on-site — even without internet connectivity. Changes are stored locally in the browser and automatically synced to the server when a connection is restored.

## Architecture

```
┌─────────────────────────┐         HTTP (REST)         ┌──────────────────────┐
│       Frontend          │ ◄──────────────────────────► │      Backend         │
│  (Static HTML/JS)       │   GET /api/assets            │   (Flask Server)     │
│                         │   POST /api/sync             │                      │
│  Leaflet Map + Dexie DB │                              │  database.geojson    │
└─────────────────────────┘                              └──────────────────────┘
```

## Technologies

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| **Leaflet.js** | 1.9.4 | Interactive map rendering. Displays tile layers (OpenStreetMap), draws point markers (`L.circleMarker`) for poles/transformers, and polylines (`L.polyline`) for cable routes. Handles map click events for asset placement. |
| **Dexie.js** | 3.2.4 | Promise-based wrapper around the browser's **IndexedDB**. Provides the local database (`AssetDB`) that persists captured assets on-device. Each record carries a `pending_sync` flag used to track what still needs uploading. |
| **OpenStreetMap Tiles** | — | Base map imagery served via the standard `{s}.tile.openstreetmap.org` URL template. Provides the geographic context behind the asset layers. |
| **GeoJSON** | — | The data interchange format used throughout — the mock job pack, the local DB records, and the server-side file all store features as GeoJSON `Point` and `LineString` geometries. |

### Backend

| Technology | Purpose |
|---|---|
| **Python / Flask** | Lightweight HTTP server exposing two REST endpoints. Handles reading and writing the server-side asset store. |
| **Flask-CORS** | Enables Cross-Origin Resource Sharing so the frontend (served from a different origin/port) can call the API. |
| **GeoJSON file** (`database.geojson`) | Flat-file database. A `FeatureCollection` that the sync endpoint appends new features to. Keeps the PoC dependency-free with no external database. |

## Key Concepts

### Offline-First Workflow

1. The app polls `GET /api/assets` every 5 seconds to determine connectivity.
2. When the server is unreachable, the status badge shows **Offline Mode** and all new assets are written to IndexedDB with `pending_sync: 1`.
3. On reconnection the app automatically calls `POST /api/sync` with all unsynced records, marks them as synced locally, and re-renders the map.

### Two-Layer Map Rendering

| Layer | Colour | Source | Meaning |
|---|---|---|---|
| **Design (Proposed)** | Dark grey (`#2c3e50`), dashed lines | Hard-coded mock job pack in `app.js` | The planned circuit layout awaiting construction |
| **As-Built** | Red (`#e74c3c`) | IndexedDB (local) | Assets the field engineer has actually placed on-site |

Unsynced as-built features render with reduced opacity and dashed outlines to give a visual "ghost" effect until confirmed by the server.

### Drawing Tools

- **Add Pole / Add Transformer** — switches the map cursor to crosshair mode. Clicking the map drops a red `CircleMarker` at that location.
- **Add Cable Route** — two-click workflow: click a start pole, then click an end pole to draw a `LineString` between them. Click events on existing markers are intercepted for snapping.

## Project Structure

```
EPA/
├── backend/
│   ├── app.py              # Flask server (2 endpoints)
│   └── database.geojson    # Flat-file GeoJSON data store
├── frontend/
│   ├── index.html          # UI shell — sidebar + map container
│   └── app.js              # Map logic, drawing tools, IndexedDB, sync
└── README.md
```

## Running Locally

```bash
# Backend
cd backend
pip install flask flask-cors
python app.py                # Starts on http://127.0.0.1:5000

# Frontend
cd frontend
# Serve with any static file server, e.g.:
python -m http.server 8080   # Open http://localhost:8080
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/assets` | Returns the full GeoJSON `FeatureCollection` from the server file. Also used as a health-check (HEAD request) for connectivity polling. |
| `POST` | `/api/sync` | Accepts a JSON array of GeoJSON features and appends them to `database.geojson`. |

## Development Phases

- **Phase 1** — Basic UI layout and simple functionality (offline checking, maps, menus, etc)
- **Phase 2** — Mock job pack