# GIS Asset Capture — EPA Synoptic Project

## Overview

An offline-first Progressive Web Application for capturing distribution network assets in the field. Built as part of the Level 3 Software Development Technician End-Point Assessment (EPA) Synoptic Project.

The application allows field engineers to:

- Load a job pack (work order) containing design assets for a given area
- Navigate to site via an interactive Leaflet map
- Place new as-built assets (poles, transformers, cables) and give each a meaningful name
- Edit existing registered assets directly on the map, with CNAIM inspection forms pre-filled from stored data
- Accept planned design assets — filling in full CNAIM inspection data before committing them to the register
- Capture detailed inspection data through CNAIM-aligned forms
- Work entirely offline — all data persists in IndexedDB via Dexie.js
- Synchronise captured data back to the server on demand via a manual sync badge/button, using an **Action Queue** (transaction log) pattern

---

## Why the Architecture Changed

### Problems with the Previous Version

The original implementation (Phases 1–3b) suffered from several fundamental issues that would have made it unreliable and unmaintainable as the project scaled:

| Problem                           | Detail                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Flat-file database**            | The backend stored the entire asset register in a single `database.geojson` file. Every sync overwrote the file wholesale — no atomicity, no concurrency safety, and no audit trail.                                                                                                           |
| **State-diffing synchronisation** | The frontend attempted to reconcile local and remote state by diffing two full GeoJSON `FeatureCollection` objects. This was brittle: field ordering, floating-point drift in coordinates, and missing properties all caused false positives or silent data loss.                              |
| **No true persistence layer**     | The backend had a `models.py` with SQLAlchemy models that were never wired up. The actual data path bypassed the ORM entirely and read/wrote raw JSON, meaning there was no schema enforcement, no migrations path, and no relational integrity.                                               |
| **Monolithic frontend**           | A single 900+ line `app.js` handled map rendering, drawing tools, form logic, offline caching, and sync. This made the code difficult to test, debug, or extend.                                                                                                                               |
| **Fragile offline behaviour**     | Although Dexie.js was imported, the caching logic only stored a snapshot of the last server response. Edits were flagged with a `pending_sync: true` boolean, but there was no ordered queue — if the user made five changes offline, the sync had no reliable way to replay them in sequence. |
| **No Service Worker**             | Without a Service Worker, the application could not load at all when the device was offline. Map tiles, stylesheets, and scripts all required a live network connection.                                                                                                                       |
| **No audit trail**                | There was no record of what changed, when, or by whom. Once data was synced and the GeoJSON file was overwritten, the previous state was gone.                                                                                                                                                 |

### Design Rationale for the New Architecture

The rewrite addresses every issue above by introducing three core changes:

1. **Action Queue (Transaction Log) pattern** — instead of diffing state, every discrete user action (create, update, delete) is appended to an ordered queue in IndexedDB. On sync, the queue is replayed sequentially on the server. This is deterministic, auditable, and tolerant of intermittent connectivity.

2. **Proper relational backend** — SQLAlchemy models are now the single source of truth. Work orders, assets, and audit logs live in SQLite tables with enforced schemas. The flat GeoJSON file is demoted to seed data only.

3. **Service Worker + PWA shell** — a registered Service Worker pre-caches all static assets and intercepts map tile requests with a stale-while-revalidate strategy. The application loads and functions fully offline.

---

## Architecture

### System Layers

| Layer              | Technology                             | Purpose                                                                                      |
| ------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Service Worker** | sw.js (Cache API)                      | Pre-caches static assets; stale-while-revalidate for map tiles; enables full offline loading |
| **Map**            | Leaflet.js 1.9.4                       | Interactive mapping with custom point/polyline draw tools                                    |
| **Local Storage**  | IndexedDB via Dexie.js 4.0.11          | Three object stores: work orders, assets, and a sync queue                                   |
| **API Layer**      | Fetch API (api.js)                     | Thin wrapper around REST calls with timeout/abort handling                                   |
| **Backend**        | Python Flask 3.1 + SQLAlchemy + SQLite | RESTful API, relational asset register, audit log                                            |

### Data Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           BROWSER (PWA Shell)                                │
│                                                                              │
│  ┌──────────┐   ┌───────────────────┐   ┌──────────────────────────────────┐ │
│  │ Service  │   │                   │   │  IndexedDB (Dexie.js)            │ │
│  │ Worker   │   │    app.js         │◄─►│                                  │ │
│  │ (sw.js)  │   │  (orchestrator)   │   │  local_work_orders  [id]        │ │
│  │          │   │                   │   │  local_assets       [id, wo_id] │ │
│  │ caches:  │   │  Step A: Provision│   │  sync_queue         [++id]      │ │
│  │  static  │   │  Step B: Capture  │   │                                  │ │
│  │  tiles   │   │  Step C: Sync     │   └──────────────────────────────────┘ │
│  └──────────┘   └────────┬──────────┘                                        │
│                          │                                                   │
│              ┌───────────▼────────────┐                                      │
│              │  api.js (fetch wrapper)│                                      │
│              └───────────┬────────────┘                                      │
└──────────────────────────┼───────────────────────────────────────────────────┘
                           │  HTTP (JSON)
              ┌────────────▼─────────────┐
              │     Flask Backend        │
              │                          │
              │  GET  /api/health        │
              │  GET  /api/workorders    │
              │  GET  /api/workorders/id │
              │  GET  /api/workorders/   │
              │         id/assets        │
              │  POST /api/sync          │
              │  GET  /api/audit         │
              └────────────┬─────────────┘
                           │
              ┌────────────▼─────────────┐
              │   SQLite (SQLAlchemy)    │
              │                          │
              │  work_orders             │
              │  assets                  │
              │  audit_log               │
              └──────────────────────────┘
```

### The Three-Step Workflow

The application follows a clear three-step workflow that maps directly to how a field engineer uses the tool:

#### Step A — Provisioning (Go Online → Cache Locally)

1. The engineer selects a work order from the sidebar.
2. `app.js` calls `API.fetchWorkOrder(id)` to retrieve the work order and `API.fetchWorkOrderAssets(id)` to retrieve existing assets within the work order's geographic bounding box.
3. Both responses are written into IndexedDB (`local_work_orders` and `local_assets` stores).
4. If the server is unreachable, the application falls back to whatever is already cached in IndexedDB — the engineer can continue working with stale data.
5. Design assets (from the work order) are rendered on the map in **black dashed** style. Existing as-built assets are rendered in **blue solid** style.

#### Step B — Data Capture (Work Offline)

1. **New asset** — the engineer taps the map to place a pole or transformer, or draws a cable between two points. A CNAIM-aligned form modal opens; all fields (including the asset name) are filled in before saving.
2. **Edit existing asset** — tapping a blue (registered) asset opens a popup with an **Edit Asset** button. The CNAIM form opens pre-filled with the asset's stored data. On save, the updated properties replace the previous values.
3. **Accept design asset** — tapping a black-dashed design asset opens a popup with an **Accept Design** button. Before the asset is committed to the register, the CNAIM inspection form opens so the engineer can record condition data at the point of acceptance.
4. **Delete asset** — removes the asset from `local_assets` and appends a `DELETE` action to the queue.
5. On save, every change is written to `local_assets` in IndexedDB **and** an action object is appended to the `sync_queue`:
   ```json
   { "action": "CREATE", "asset_id": "WR-2025-9901-1748302841649", "geometry": { ... }, "properties": { "name": "Hyde Park Pole A", ... } }
   ```
6. The sync badge in the top-right corner displays the current queue depth (e.g. "3 pending").

#### Step C — Synchronisation (Manual Replay)

1. A background health check pings `GET /api/health` every 5 seconds to track connectivity status.
2. The sync badge in the top-right corner shows the number of pending actions. The engineer presses the badge (or the **Force Sync** button in the sidebar) to trigger synchronisation manually.
3. If the server is unreachable, the sync is blocked with a toast notification — no actions are lost.
4. The entire `sync_queue` array is sent in a single `POST /api/sync` request.
5. The server processes each action sequentially:
   - **CREATE** → inserts a new row into the `assets` table and writes an audit log entry.
   - **UPDATE** → overwrites geometry/properties on the existing row and logs the change.
   - **DELETE** → soft-deletes the asset (sets status to `decommissioned`) and logs the deletion.
   - **ACCEPT** → creates a new as-built asset from a design asset and marks the corresponding entry in the work order's `design_assets` as accepted.
6. On a successful `200` response, the local `sync_queue` is cleared, the badge resets to zero, and the current work order is reloaded from the server so the map immediately reflects the synced state.

### Server-Restart Detection

The health-check response includes a `boot_id` — a timestamp generated when the Flask process starts. If the frontend detects a new `boot_id`, it knows the server has restarted and clears its locally cached work order and asset data so stale references cannot cause conflicts. The sync queue is intentionally **preserved** through restarts so that any pending offline actions are not lost.

### Conflict Resolution: Last-Writer-Wins

The Action Queue uses a **last-writer-wins** strategy. If two engineers edit the same asset offline, whichever sync arrives at the server last will overwrite the other. This is an intentional trade-off:

- It is simple, predictable, and easy to reason about.
- The `audit_log` table preserves a full history of every action, so no data is truly lost — it can always be reviewed or rolled back manually.
- For the EPA scope (single-user field capture), concurrent conflicts are unlikely.

---

## Technologies

| Component           | Technology                     | Version / Source             |
| ------------------- | ------------------------------ | ---------------------------- |
| Map rendering       | Leaflet.js                     | 1.9.4 — unpkg CDN            |
| Draw controls       | Custom click-based tools       | map.js (no third-party lib)  |
| **Offline storage** | Dexie.js                       | 4.0.11 — unpkg CDN           |
| Backend API         | Flask + Flask-CORS             | 3.1 — pip (requirements.txt) |
| ORM                 | Flask-SQLAlchemy               | pip (requirements.txt)       |
| Database            | SQLite                         | Built-in (Python stdlib)     |
| PWA support         | Service Worker + manifest.json | Native browser APIs          |
| Styling             | Custom CSS                     | styles.css                   |

---

## Project Structure

```
├── backend/
│   ├── app.py               # Flask API server (8 routes, seed helpers)
│   ├── models.py            # SQLAlchemy models: WorkOrder, Asset, AuditLog
│   ├── database.geojson     # Seed data — 15 existing assets across 3 areas
│   ├── work_orders.json     # Seed data — 3 work orders with design assets
│   ├── requirements.txt     # Python dependencies
│   ├── test_backend.py      # 33 pytest API endpoint tests
│   └── test_workflows.py    # 12 pytest workflow simulation tests
│
├── frontend/
│   ├── index.html           # PWA shell — Dexie CDN, SW registration, sync badge
│   ├── styles.css           # All CSS including sync badge and form styles
│   ├── app.js               # Main orchestrator (provision → capture → sync)
│   ├── db.js                # Dexie.js IndexedDB wrapper (3 stores)
│   ├── api.js               # REST API communication layer
│   ├── state.js             # Shared AppConfig and AppState objects
│   ├── map.js               # Leaflet map setup, layer rendering, draw tools
│   ├── ui.js                # UI helpers — panels, modals, sidebar controls
│   ├── forms.js             # CNAIM-aligned form templates (pole, transformer, cable)
│   ├── sw.js                # Service Worker — static cache + tile cache
│   └── manifest.json        # PWA manifest for standalone mode
│
└── tests/
    └── system-checks.js     # 18 in-browser integration tests (run via console)
```

### Frontend Module Responsibilities

| Module       | Responsibility                                                                                                                                                                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **app.js**   | Top-level orchestrator. Wires together all other modules. Implements the three-step workflow (provision, capture, sync), asset naming, edit-existing, accept-design, delete, manual sync trigger, and sync badge updates.                                                                                            |
| **db.js**    | All IndexedDB access via Dexie.js. Exposes CRUD methods for work orders, assets, and sync queue entries. No business logic.                                                                                                                                                                                          |
| **api.js**   | All HTTP communication. Exposes `fetchWorkOrders`, `fetchWorkOrder`, `fetchWorkOrderAssets`, `sync`, and `healthCheck`. Returns parsed JSON or throws.                                                                                                                                                               |
| **state.js** | Shared configuration (`API_BASE`) and mutable application state (`currentWorkOrder`, `currentTool`, `isServerReachable`, `pendingSyncCount`).                                                                                                                                                                        |
| **map.js**   | Leaflet map initialisation, tile layer, draw controls, design/as-built layer rendering. Asset popups include Edit Asset / Delete Asset (blue registered assets) and Accept Design (black-dashed design assets). Exports `MapController` with methods like `renderJobPackLayers`, `renderLocalAssets`, `clearLayers`. |
| **ui.js**    | DOM manipulation for the sidebar, toolbar, modal, work order list, and sync badge. Includes `populateAssetForm()` which pre-fills all form fields from an existing property object. No data logic.                                                                                                                   |
| **forms.js** | Pure HTML template functions for each asset type. Returns markup strings consumed by `ui.js` and `app.js`.                                                                                                                                                                                                           |
| **sw.js**    | Service Worker. Pre-caches the static shell on install. Intercepts fetch requests: cache-first for static files, stale-while-revalidate for OpenStreetMap tiles, network-only for `/api/` calls.                                                                                                                     |

---

## API Endpoints

| Method | Path                          | Description                                                                                                                                                                   |
| ------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/health`                 | Returns `{ "status": "ok", "boot_id": "..." }` — used by the frontend to detect connectivity and server restarts                                                              |
| `GET`  | `/api/workorders`             | Returns all work orders as a JSON array (`id`, `reference`, `name`, `description`, `status`, `priority`, `assigned_to`, `assigned_date`, `due_date`, `bounds`, `asset_count`) |
| `GET`  | `/api/workorders/<id>`        | Returns a single work order including its `design_assets` GeoJSON                                                                                                             |
| `GET`  | `/api/workorders/<id>/assets` | Returns existing as-built assets filtered to the work order's geographic bounding box                                                                                         |
| `POST` | `/api/sync`                   | Accepts `{ "actions": [...] }` — processes each action (CREATE / UPDATE / DELETE / ACCEPT) sequentially and writes audit log entries                                          |
| `GET`  | `/api/audit`                  | Returns the audit log, most recent first (limited to 100 entries)                                                                                                             |
| `GET`  | `/api/activity`               | Returns database statistics (active assets, decommissioned, work orders, audit entries) and the 50 most recent audit entries                                                  |
| `GET`  | `/admin`                      | Serves a live activity dashboard that polls `/api/activity` every two seconds                                                                                                 |

### Sync Payload Format

```json
{
  "actions": [
    {
      "action": "CREATE",
      "asset_id": "WR-2025-9901-1748302841649",
      "work_order_id": "WR-2025-9901",
      "geometry": { "type": "Point", "coordinates": [-1.558, 53.81] },
      "properties": { "asset_type": "Pole", "material": "Wood" }
    },
    {
      "action": "UPDATE",
      "asset_id": "ASSET-003",
      "geometry": { "type": "Point", "coordinates": [-1.559, 53.811] },
      "properties": { "condition": "Good" }
    },
    {
      "action": "DELETE",
      "asset_id": "WR-2025-9901-1748302799000"
    },
    {
      "action": "ACCEPT",
      "asset_id": "design-asset-001",
      "work_order_id": "WR-2026-0401",
      "asset_type": "Pole",
      "geometry": { "type": "Point", "coordinates": [-1.558, 53.81] },
      "properties": { "status": "As-Built" }
    }
  ]
}
```

---

## Database Schema

### SQLite Tables (Backend)

**work_orders**

| Column        | Type      | Notes                                                    |
| ------------- | --------- | -------------------------------------------------------- |
| id            | TEXT (PK) | e.g. `WR-2026-0401`                                      |
| reference     | TEXT      | Human-readable reference code                            |
| name          | TEXT      | Descriptive name of the work order                       |
| description   | TEXT      | Full job description (nullable)                          |
| status        | TEXT      | `assigned` / `in_progress` / `complete`                  |
| priority      | TEXT      | e.g. `normal` / `high`                                   |
| assigned_to   | TEXT      | Engineer name (nullable)                                 |
| assigned_date | TEXT      | ISO-8601 date string (nullable)                          |
| due_date      | TEXT      | ISO-8601 date string (nullable)                          |
| bounds        | JSON      | `{center, zoom, minZoom, maxBounds}` map viewport config |
| design_assets | JSON      | Array of GeoJSON features representing planned assets    |
| created_at    | DATETIME  | UTC timestamp                                            |
| updated_at    | DATETIME  | UTC timestamp                                            |

**assets**

| Column     | Type      | Notes                                          |
| ---------- | --------- | ---------------------------------------------- |
| id         | TEXT (PK) | e.g. `ASSET-001` or `WR-2026-0401-<timestamp>` |
| asset_type | TEXT      | `Pole` / `Transformer` / `Cable`               |
| geometry   | JSON      | GeoJSON geometry object                        |
| properties | JSON      | All captured field attributes                  |
| status     | TEXT      | `active` / `decommissioned`                    |
| created_at | DATETIME  | UTC timestamp                                  |
| updated_at | DATETIME  | UTC timestamp                                  |

**audit_log**

| Column        | Type         | Notes                                        |
| ------------- | ------------ | -------------------------------------------- |
| id            | INTEGER (PK) | Auto-increment                               |
| action        | TEXT         | `CREATE` / `UPDATE` / `DELETE` / `ACCEPT`    |
| asset_id      | TEXT         | The asset that was affected                  |
| work_order_id | TEXT         | Associated work order (nullable)             |
| engineer      | TEXT         | Engineer identifier (nullable)               |
| payload       | JSON         | Snapshot of the full action at time of entry |
| created_at    | DATETIME     | UTC timestamp                                |

### IndexedDB Stores (Frontend)

| Store               | Key           | Indexes                               | Purpose                                     |
| ------------------- | ------------- | ------------------------------------- | ------------------------------------------- |
| `local_work_orders` | `id`          | —                                     | Cached work order data for offline access   |
| `local_assets`      | `id`          | `work_order_id`                       | Cached + locally-created assets             |
| `sync_queue`        | `++id` (auto) | `action`, `asset_id`, `work_order_id` | Ordered action log awaiting synchronisation |

---

## Offline Behaviour

### Service Worker Caching Strategy

| Request Type                  | Strategy                                                                                   | Rationale                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Static assets (HTML, CSS, JS) | **Cache-first** — serve from cache, fall back to network                                   | Ensures the application shell loads instantly, even offline                                         |
| Map tiles (OpenStreetMap)     | **Stale-while-revalidate** — serve cached tile immediately, fetch fresh copy in background | Map tiles change infrequently; this provides fast rendering whilst keeping tiles reasonably current |
| API calls (`/api/*`)          | **Network-only** — never cached by the Service Worker                                      | API responses are handled by the application layer (IndexedDB), not the Service Worker              |

### What Happens When the Device Goes Offline

1. The Service Worker serves the cached application shell — the page loads normally.
2. Map tiles that have been previously viewed are served from the tile cache. Unvisited areas show grey placeholders.
3. The health-check timer (`GET /api/health` every 5 seconds) detects the loss of connectivity and sets `AppState.isServerReachable = false`.
4. All data capture continues as normal — assets are saved to IndexedDB and actions are appended to the sync queue.
5. When connectivity returns, the health check updates the status indicator. The engineer presses the sync badge to flush the queue manually.

---

## CNAIM-Aligned Data Forms

Each asset type has a dedicated form with fields aligned to CNAIM (Common Network Asset Indices Methodology) standards:

| Asset           | Form Sections                                                                                                                                                                                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pole**        | Asset Name, Core Specification (Material, Treatment, Stoutness, Height, Transformers), Inspection/Condition (Top Rot, External Rot, Bird Damage, Verticality, Steel Corrosion, Sound Test)                                                                                                                                                         |
| **Transformer** | Asset Name, Core Specification (Mounting Type PMT/GMT, Rating, Manufacturer, Serial, Year, Cooling Medium, Breather), Inspection/Condition (Tank Grade 1–5, Tank Issues, Fins Grade, Bushings, Silica Gel, Oil Level), Advanced Data GMT-only (Oil Acidity, Moisture, Breakdown Strength), Consequence of Failure (Bunding, Watercourse Proximity) |
| **Cable**       | Asset Name, Core Specification (Voltage Level, Cable Type, Conductor Material, CSA, Cores, Installation Year), Loading & Environment (Duty Factor, Situation, Topography), Condition Assessment (Sheath Condition, Joint Condition, Joints Count, Historical Faults, Known Issues)                                                                 |

### Form UI Components

- **Asset Name Field** — free-text field present on all forms; defaults to a sensible placeholder if left blank.
- **Traffic Light Selectors** — 4-state condition indicators (None → Minor → Significant → Critical) with colour-coded buttons.
- **Grade Selectors (1–5)** — used for transformer condition grading: 1 (New) → 5 (Failed).
- **Conditional Sections** — GMT-only transformer fields appear only when "Ground Mounted" is selected.
- **Form Pre-population** — when editing an existing asset, all fields are pre-filled from the stored property data so engineers only need to update values that have changed.
- **Photo Capture** — file input converts images to Base64 via `FileReader` for offline storage.

---

## Running Locally

### Prerequisites

- **Python 3.9+** — [python.org](https://www.python.org/downloads/)
- **pip** — included with Python 3.9+
- A modern browser (Chrome, Edge, or Firefox) — Safari works but has limited PWA install support on macOS

### Quick Start (recommended)

The `run.sh` script resets the database to its default seed state and starts the Flask server in one command:

```bash
./run.sh
```

Then, in a second terminal, serve the frontend:

```bash
cd frontend
python -m http.server 8080
```

Open `http://localhost:8080` in your browser. The application is ready to use.

### Step-by-Step Setup

#### 1 — Install Python dependencies

```bash
cd backend
pip install -r requirements.txt
```

#### 2 — Start the backend

```bash
python app.py
```

The server starts on `http://127.0.0.1:5000`. On first run it creates `instance/app.db` (SQLite) and seeds it from `work_orders.json` and `database.geojson`.

To reset the database to its original seed state at any time:

```bash
python app.py --reset
```

#### 3 — Serve the frontend

Serve the `frontend/` directory over HTTP. The simplest option is VS Code's **Live Server** extension (right-click `index.html` → _Open with Live Server_), or:

```bash
cd frontend
python -m http.server 8080
```

Then open `http://localhost:8080` in a browser.

> **Note:** Service Workers require HTTPS or `localhost`. Opening `index.html` directly via `file://` will not register the Service Worker and offline mode will not work.

### Using the Application

Once both the backend and frontend are running:

1. **Select a work order** — click _Select Work Order_ in the sidebar and choose one of the three seeded job packs. This downloads the work order and its existing assets, caching them for offline use.
2. **Explore the map** — existing (registered) assets appear as **blue** markers. Planned design assets appear as **black dashed** outlines.
3. **Add a new asset** — select _Add Pole_ or _Add Transformer_ from the toolbar, then click anywhere on the map. Fill in the CNAIM form and click _Save Asset_. The new asset appears in **red** (unsynced).
4. **Add a cable** — select _Add Cable Route_, complete the form, then click a start asset followed by an end asset on the map.
5. **Accept a design asset** — click a black-dashed design asset on the map and press _Accept Design_. Complete the inspection form; the asset moves to solid black (accepted, awaiting sync).
6. **Edit an existing asset** — click a blue registered asset and press _Edit Asset_. Update any fields and save.
7. **Sync to the server** — press the **sync badge** (top-right corner) or _Force Sync_ in the sidebar to send all pending changes to the backend.
8. **Admin dashboard** — visit `http://127.0.0.1:5000/admin` to see a live view of database activity and recent sync actions.

### Installing as a PWA

The application can be installed as a standalone Progressive Web App on desktop or mobile:

- **Chrome / Edge (desktop)** — look for the install icon (⊕) in the browser address bar and click _Install_.
- **Chrome (Android)** — tap the browser menu and select _Add to Home Screen_.
- **Safari (iOS)** — tap the Share button and select _Add to Home Screen_.

Once installed, the application launches in its own window without browser chrome and can load fully offline (provided the frontend has been visited at least once while online to populate the Service Worker cache).

### Running Tests

**Backend (pytest):**

```bash
cd backend
pytest test_backend.py test_workflows.py -v
```

- `test_backend.py` — 33 tests across 10 classes covering health, work orders, sync CRUD (create, update, delete, accept), edge cases, audit log, activity feed, and admin.
- `test_workflows.py` — 12 tests across 5 classes simulating field session lifecycle, accept design workflow, mixed offline batch, database reset, and idempotent re-sync.

All 45 tests should pass with zero warnings.

**Frontend (browser console):**

Open the application in a browser, then run in the developer console:

```js
SystemTests.runAll();
```

This executes 18 integration tests covering Dexie connectivity, sync queue operations, asset CRUD, work order caching, form templates (pole, transformer, cable), UI components (traffic lights, grade selectors), map controller, Service Worker registration, API connectivity (health, boot ID, work orders, assets, activity feed), and a full offline create-sync round-trip.

---

## Seed Data

### Work Orders (work_orders.json)

| ID           | Area                             | Design Assets                                            |
| ------------ | -------------------------------- | -------------------------------------------------------- |
| WR-2026-0401 | Woodhouse Moor New LV Feeder     | 6 proposed assets (3 poles, 1 PMT, 2 ABC cable sections) |
| WR-2026-0402 | Hyde Park 11kV Circuit Extension | 9 proposed assets (4 poles, 1 GMT, 4 cable sections)     |
| WR-2026-0403 | Headingley New Customer Feeder   | 6 proposed assets (2 poles, 1 GMT, 3 cable sections)     |

### Existing Assets (database.geojson)

15 as-built assets (ASSET-001 through ASSET-015) distributed across the three work order areas: poles, transformers, and cables with realistic properties (material, voltage, condition ratings).

---

## Development Phases

| Phase | Focus                                                                     | Status   |
| ----- | ------------------------------------------------------------------------- | -------- |
| 1     | Interactive map with Leaflet.js                                           | Complete |
| 2     | Drawing tools (poles, transformers, cables)                               | Complete |
| 3a    | Dynamic CNAIM data forms and frontend refactoring                         | Complete |
| 3b    | IndexedDB caching with Dexie.js                                           | Complete |
| 4     | Architecture rewrite — Action Queue, relational backend, modular frontend | Complete |
| 5     | Service Worker, PWA manifest, full offline support                        | Complete |
| 6     | Backend and frontend test suites                                          | Complete |
| 7     | Final documentation                                                       | Complete |

---

## Glossary

| Term                       | Definition                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Action Queue**           | An ordered list of discrete operations (CREATE, UPDATE, DELETE) stored in IndexedDB and replayed on the server during synchronisation. Also known as a transaction log or event log. |
| **As-built**               | An asset that physically exists on site, as opposed to a design asset which only exists on paper.                                                                                    |
| **CNAIM**                  | Common Network Asset Indices Methodology — the UK standard for condition-based risk assessment of electricity distribution assets.                                                   |
| **Design asset**           | A planned asset from the work order that has not yet been constructed. Rendered on the map in black dashed style.                                                                    |
| **Last-writer-wins**       | A conflict resolution strategy where the most recent write overwrites any previous value. Simple but effective for single-user field capture.                                        |
| **Stale-while-revalidate** | A caching strategy where the cached version is served immediately whilst a fresh copy is fetched in the background for next time.                                                    |
| **Work order**             | A job pack issued to a field engineer, containing a geographic area and a set of design assets to be surveyed or constructed.                                                        |

---

## Recent Changes

### Blackline Acceptance

Engineers can now accept proposed (blackline) design assets directly from the map. Clicking a design asset's popup reveals an **Accept Design** button. Before the asset is committed to the register, the CNAIM inspection form opens so the engineer can record condition data at the point of acceptance. On save, the asset is removed from the design layer, queued as an `ACCEPT` sync action, and immediately rendered in **black solid** style (awaiting sync). The backend updates the work order's `design_assets` JSON to mark the item as accepted, preventing it from reappearing.

### Asset Colour Differentiation

Map assets use a four-state colour and style system to communicate their status at a glance:

| State                           | Colour          | Style  | Description                                              |
| ------------------------------- | --------------- | ------ | -------------------------------------------------------- |
| **Planned design**              | Black (#2c3e50) | Dashed | Asset exists only in the work order; not yet constructed |
| **Accepted — awaiting sync**    | Black (#2c3e50) | Solid  | Accepted from design by engineer; not yet synced         |
| **New capture — awaiting sync** | Red (#e74c3c)   | Dashed | Newly placed by engineer in the field; not yet synced    |
| **Registered**                  | Blue (#2980b9)  | Solid  | Confirmed and stored in the server register              |

A **Map Key** panel in the sidebar summarises these states for quick reference in the field.

### Activity Monitoring (Admin Dashboard)

A live activity dashboard is available at `/admin` for verifying database changes during testing:

- **Console logging** — every sync request is logged to the terminal with structured per-action detail (action type, asset ID, asset type, work order).
- **`/api/activity` endpoint** — returns current database statistics (active assets, decommissioned, work orders, audit entries) plus the 50 most recent audit log entries.
- **Admin dashboard** (`/admin`) — a dark-themed live page that polls `/api/activity` every two seconds, displaying stats cards and a scrollable activity table with colour-coded action badges. New rows are highlighted with a green animation.

### Database Reset (Version Control)

The database can be rolled back to its default seed state at any time:

```bash
# Reset the server database (drops all tables, re-seeds from JSON/GeoJSON)
python3 backend/app.py --reset

# Or use the convenience script which resets and starts the server:
./run.sh
```

A **Clear Local Data** button in the sidebar's Actions panel wipes the browser's IndexedDB cache (work orders, assets, and unsynced changes), ensuring the frontend matches the freshly reset backend.

### Map Key

A collapsible **Map Key** panel has been added to the sidebar below the Developer Tools section. It displays colour swatches and shape indicators for all four asset states (registered, unsynced capture, accepted/planned, pole circle, transformer diamond), giving field engineers an at-a-glance legend without needing to leave the map view.

### Cable Drawing Workflow

The cable tool now follows a **form-first** workflow:

1. Select the Cable tool — the data entry form opens immediately.
2. Fill in cable properties (voltage, type, conductor, condition, etc.) and click **Save**.
3. A banner appears: _"Cable drawing active — click the first asset, then the second to connect them."_
4. Click the start pole/transformer, then the end pole/transformer — the cable is drawn between them.

Asset popups are suppressed while cable drawing is active, so clicking a pole to set an endpoint no longer opens a confusing popup. A **Cancel** button on the banner allows aborting at any time.

### Cable Length Labels

Built-as-laid (red) cables now display their calculated length at the midpoint of the line, matching the behaviour that already existed for design cables.

#### Length Calculation

Cable lengths are calculated in plain JavaScript using the **Haversine formula** — no third-party library is used. The implementation lives in `frontend/map.js` (`haversineDistance` and `calculateLineLength`).

The Haversine formula calculates the great-circle distance between two GPS coordinates on the surface of the Earth, modelled as a sphere with radius $R = 6{,}371{,}000\text{ m}$:

$$a = \sin^2\!\left(\frac{\Delta\phi}{2}\right) + \cos\phi_1 \cdot \cos\phi_2 \cdot \sin^2\!\left(\frac{\Delta\lambda}{2}\right)$$

$$c = 2 \cdot \text{atan2}\!\left(\sqrt{a},\, \sqrt{1-a}\right) \qquad d = R \cdot c$$

where $\phi$ is latitude and $\lambda$ is longitude, both in radians. For a multi-segment cable (a `LineString` with more than two vertices), `calculateLineLength` sums the Haversine distance across every consecutive pair of points.

The calculation is **horizontal only** — it does not account for the height difference between poles or cable sag. For the spans typical of LV distribution networks (30–80 m), this is an acceptable approximation. A production system could extend the formula to three dimensions by storing a `z` altitude value on each GeoJSON coordinate and computing $d_{3D} = \sqrt{d_{horizontal}^2 + \Delta h^2}$ per segment, though GPS altitude error (±10–30 m) would need to be considered.

Results are displayed as metres below 1 km and kilometres (to 2 decimal places) above.

### Shell Script

A `run.sh` script at the project root resets the database and starts the Flask server in a single command.

### Offline Sync Race Condition Fix

A bug introduced by the boot*id cache invalidation caused offline actions to be lost on reconnection. When the server restarted (new `boot_id`), `checkServerStatus()` cleared all local caches — including the sync queue — \_before* `syncOfflineChanges()` had a chance to flush pending actions. The fix reorders the logic so that:

1. Pending actions are synced to the server first.
2. Stale caches are cleared afterwards (if the `boot_id` has changed).

Additionally, the Service Worker was updated to call `self.skipWaiting()` on install and `self.clients.claim()` on activate. This ensures that when the SW cache version is bumped, the new worker takes control immediately rather than waiting for all tabs to close. Without this, code fixes deployed via updated static files were not reaching the browser due to the cache-first serving strategy.

### Manual Sync and Post-Sync Persistence Fix

Auto-sync on reconnection has been replaced with **manual-only synchronisation**. Syncs now only occur when the engineer explicitly presses the sync badge or the Force Sync button. This change was made for three reasons:

1. **Predictability** — the engineer controls exactly when data leaves the device, avoiding surprises from background flushes.
2. **Queue safety** — the previous auto-sync interacted poorly with the `boot_id` cache invalidation. On a server restart, the sequence was: auto-sync fires → boot_id mismatch detected → `DB.clearAll()` wipes all local data including the sync queue. If the auto-sync failed (e.g. timeout), pending actions were silently destroyed.
3. **Post-sync visibility** — after a successful sync, `syncOfflineChanges()` now reloads the active work order from the server so the map immediately reflects the synced state. Previously, synced assets would disappear on the next page refresh because the local cache had been cleared without being repopulated.

The `boot_id` mismatch handler was also narrowed: it now clears only the cached work orders and assets (`local_work_orders`, `local_assets`) whilst **preserving the sync queue**, ensuring that pending offline actions survive a server restart.

---

## Attributions

| Asset                                   | Author | Source                                                      |
| --------------------------------------- | ------ | ----------------------------------------------------------- |
| Application icon (`icons/icon-512.png`) | joalfa | [Flaticon](https://www.flaticon.com/free-icons/downloading) |

> Icon licence: free for use with attribution — [flaticon.com](https://www.flaticon.com)
