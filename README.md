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

| Technology              | Version | Purpose                                                                                                                                                                                                                        |
| ----------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Leaflet.js**          | 1.9.4   | Interactive map rendering. Displays tile layers (OpenStreetMap), draws point markers (`L.circleMarker`) for poles/transformers, and polylines (`L.polyline`) for cable routes. Handles map click events for asset placement.   |
| **Dexie.js**            | 3.2.4   | Promise-based wrapper around the browser's **IndexedDB**. Provides the local database (`AssetDB`) that persists captured assets on-device. Each record carries a `pending_sync` flag used to track what still needs uploading. |
| **OpenStreetMap Tiles** | —       | Base map imagery served via the standard `{s}.tile.openstreetmap.org` URL template. Provides the geographic context behind the asset layers.                                                                                   |
| **GeoJSON**             | —       | The data interchange format used throughout — the mock job pack, the local DB records, and the server-side file all store features as GeoJSON `Point` and `LineString` geometries.                                             |

### Backend

| Technology                            | Purpose                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Python / Flask**                    | Lightweight HTTP server exposing two REST endpoints. Handles reading and writing the server-side asset store.                                      |
| **Flask-CORS**                        | Enables Cross-Origin Resource Sharing so the frontend (served from a different origin/port) can call the API.                                      |
| **GeoJSON file** (`database.geojson`) | Flat-file database. A `FeatureCollection` that the sync endpoint appends new features to. Keeps the PoC dependency-free with no external database. |

## Key Concepts

### Offline-First Workflow

1. The app polls `GET /api/assets` every 5 seconds to determine connectivity.
2. When the server is unreachable, the status badge shows **Offline Mode** and all new assets are written to IndexedDB with `pending_sync: 1`.
3. On reconnection the app automatically calls `POST /api/sync` with all unsynced records, marks them as synced locally, and re-renders the map.

### Two-Layer Map Rendering

| Layer                 | Colour                              | Source                               | Meaning                                               |
| --------------------- | ----------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| **Design (Proposed)** | Dark grey (`#2c3e50`), dashed lines | Hard-coded mock job pack in `app.js` | The planned circuit layout awaiting construction      |
| **As-Built**          | Red (`#e74c3c`)                     | IndexedDB (local)                    | Assets the field engineer has actually placed on-site |

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
```

## API Endpoints

| Method | Path          | Description                                                                                                                             |
| ------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/assets` | Returns the full GeoJSON `FeatureCollection` from the server file. Also used as a health-check (HEAD request) for connectivity polling. |
| `POST` | `/api/sync`   | Accepts a JSON array of GeoJSON features and appends them to `database.geojson`.                                                        |

## Development Phases

- **Phase 1** — Basic UI layout and simple functionality (offline checking, maps, menus, etc)
- **Phase 2** — Mock job pack and Redlining
- **Comments** — Add ability to remove assets from the map
- **Phase 3a** — Dynamic Data Forms & Frontend Refactoring (see notes below)
- next stage: Implement backend DB syncing (Phase_3b)

---

## Phase 3 Notes (Significant Changes)

### Phase 3a — Dynamic Data Forms & Frontend Refactoring

#### Overview

Implemented CNAIM-aligned data collection forms for each asset type. When a user places an asset on the map, a modal now appears asking for specific attributes. Photo attachment with Base64 encoding supports offline storage in IndexedDB.

#### New Features

**1. Asset Data Forms**
Each asset type now has a dedicated form with fields aligned to CNAIM (Common Network Asset Indices Methodology) standards:

| Asset           | Form Sections                                                                                                                                                                                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pole**        | Core Specification (Material, Treatment, Stoutness, Height, Transformers), Inspection/Condition (Top Rot, External Rot, Bird Damage, Verticality, Steel Corrosion, Sound Test)                                                                                                                                                         |
| **Transformer** | Core Specification (Mounting Type PMT/GMT, Rating, Manufacturer, Serial, Year, Cooling Medium, Breather), Inspection/Condition (Tank Grade 1-5, Tank Issues, Fins Grade, Bushings, Silica Gel, Oil Level), Advanced Data GMT-only (Oil Acidity, Moisture, Breakdown Strength), Consequence of Failure (Bunding, Watercourse Proximity) |
| **Cable**       | Core Specification (Voltage Level, Cable Type, Conductor Material, CSA, Cores, Installation Year), Loading & Environment (Duty Factor, Situation, Topography), Condition Assessment (Sheath Condition, Joint Condition, Joints Count, Historical Faults, Known Issues)                                                                 |

**2. Traffic Light Selectors**
4-state condition indicators (None → Minor → Significant → Critical) with colour-coded buttons matching severity.

**3. Grade Selectors (1-5)**
Used for transformer condition grading: 1 (New) → 5 (Failed).

**4. Conditional Form Sections**
GMT-only fields for transformers only appear when "Ground Mounted" is selected.

**5. Photo Attachment**
File input converts images to Base64 strings via FileReader for offline storage in IndexedDB.

**6. Enhanced Popups**
Asset popups now display captured data with formatted condition indicators and styled sections.

#### Refactoring

**CSS Extraction**

- Moved all inline styles from `index.html` to separate `styles.css` file
- Reduced `index.html` from ~500 lines to ~116 lines (HTML only)

**Form Template Separation**

- Created `forms.js` with template literals for each asset type
- Forms are now injected dynamically via `getFormTemplate(assetType)`
- Interactive elements (traffic lights, grade selectors, photo capture) initialised after injection

#### File Structure (Updated)

```
frontend/
├── index.html      # 116 lines — UI shell, modal container
├── styles.css      # 468 lines — All CSS extracted here
├── forms.js        # 494 lines — Form template literals
└── app.js          # 907 lines — Map logic, drawing tools, form handlers, sync
```

#### Technical Notes

- `openAssetModal(assetType)` now injects HTML from `forms.js` and re-initialises event handlers
- `saveAssetForm()` collects form data based on `pendingAssetType` (Pole/Transformer/Cable)
- Cable workflow updated: `createCableAsset()` now opens modal instead of saving directly


