"""
Offline-First GIS Asset Capture — Flask Backend

Endpoints:
  GET   /api/health                   Health check
  GET   /api/workorders               List all work orders (summary)
  GET   /api/workorders/<id>          Full work order including design_assets
  GET   /api/workorders/<id>/assets   Existing assets within the work order area
  POST  /api/sync                     Process an action queue from the client
"""

import json
import os
from datetime import datetime, timezone

from flask import Flask, jsonify, request
from flask_cors import CORS
from sqlalchemy.orm.attributes import flag_modified

from models import Asset, AuditLog, WorkOrder, db

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///app.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

CORS(app, resources={r"/api/*": {"origins": "*"}})
db.init_app(app)

WORK_ORDERS_FILE = "work_orders.json"
ASSETS_FILE = "database.geojson"


# ─────────────────────────── Seed helpers ───────────────────────────

def _seed_work_orders():
    """Load work orders from the JSON seed file."""
    if not os.path.exists(WORK_ORDERS_FILE):
        return
    with open(WORK_ORDERS_FILE, "r") as f:
        data = json.load(f)

    for wo in data.get("work_orders", []):
        record = WorkOrder(
            id=wo["id"],
            reference=wo.get("reference", wo["id"]),
            name=wo.get("name", ""),
            description=wo.get("description"),
            status=wo.get("status", "assigned"),
            priority=wo.get("priority", "normal"),
            assigned_to=wo.get("assigned_to"),
            assigned_date=wo.get("assigned_date"),
            due_date=wo.get("due_date"),
            bounds=wo.get("bounds"),
            design_assets=wo.get("design_assets", []),
        )
        db.session.add(record)
    db.session.commit()


def _seed_assets():
    """Load the existing asset register from the GeoJSON seed file."""
    if not os.path.exists(ASSETS_FILE):
        return
    with open(ASSETS_FILE, "r") as f:
        data = json.load(f)

    for feature in data.get("features", []):
        props = feature.get("properties", {})
        asset = Asset(
            id=feature.get("id", feature["properties"].get("id", "")),
            asset_type=props.get("asset_type", "Unknown"),
            geometry=feature.get("geometry"),
            properties=props,
            status=props.get("status", "active"),
        )
        db.session.add(asset)
    db.session.commit()


def seed_if_empty():
    """Create tables and populate with seed data when the database is empty."""
    db.create_all()
    if WorkOrder.query.first() is None:
        _seed_work_orders()
    if Asset.query.first() is None:
        _seed_assets()


# ─────────────────────────── Helpers ───────────────────────────

def _asset_to_geojson(asset: Asset) -> dict:
    """Serialise an Asset row to a GeoJSON Feature."""
    return {
        "id": asset.id,
        "type": "Feature",
        "properties": {**(asset.properties or {}), "status": asset.status},
        "geometry": asset.geometry,
    }


def _point_in_bounds(geometry: dict, bounds: dict) -> bool:
    """Check if a geometry's representative point falls within maxBounds."""
    max_bounds = bounds.get("maxBounds")
    if not max_bounds or len(max_bounds) != 2:
        return True  # No bounds constraint — include everything

    sw_lat, sw_lng = max_bounds[0]
    ne_lat, ne_lng = max_bounds[1]

    coords = geometry.get("coordinates")
    if not coords:
        return False

    geo_type = geometry.get("type", "")
    if geo_type == "Point":
        lng, lat = coords
    elif geo_type == "LineString":
        # Use first coordinate as representative
        lng, lat = coords[0]
    else:
        return False

    return sw_lat <= lat <= ne_lat and sw_lng <= lng <= ne_lng


# ─────────────────────────── Routes ───────────────────────────

@app.route("/api/health", methods=["GET", "HEAD"])
def health():
    """Simple health check endpoint."""
    return jsonify({"status": "ok"})


@app.route("/api/workorders", methods=["GET"])
def get_work_orders():
    """Return a summary list of all work orders (no design_assets)."""
    work_orders = WorkOrder.query.all()
    result = []
    for wo in work_orders:
        result.append({
            "id": wo.id,
            "reference": wo.reference,
            "name": wo.name,
            "description": wo.description,
            "status": wo.status,
            "priority": wo.priority,
            "assigned_to": wo.assigned_to,
            "assigned_date": wo.assigned_date,
            "due_date": wo.due_date,
            "bounds": wo.bounds,
            "asset_count": len(wo.design_assets or []),
        })
    return jsonify(result)


@app.route("/api/workorders/<wo_id>", methods=["GET"])
def get_work_order(wo_id):
    """Return full work order including design_assets (the job pack download)."""
    wo = db.session.get(WorkOrder, wo_id)
    if not wo:
        return jsonify({"error": "Work order not found"}), 404

    return jsonify({
        "id": wo.id,
        "reference": wo.reference,
        "name": wo.name,
        "description": wo.description,
        "status": wo.status,
        "priority": wo.priority,
        "assigned_to": wo.assigned_to,
        "assigned_date": wo.assigned_date,
        "due_date": wo.due_date,
        "bounds": wo.bounds,
        "design_assets": wo.design_assets or [],
    })


@app.route("/api/workorders/<wo_id>/assets", methods=["GET"])
def get_work_order_assets(wo_id):
    """Return existing assets that fall within the work order's geographic bounds.

    This is fetched when the engineer downloads a work order so they can see
    what infrastructure already exists in the area.
    """
    wo = db.session.get(WorkOrder, wo_id)
    if not wo:
        return jsonify({"error": "Work order not found"}), 404

    all_assets = Asset.query.filter_by(status="active").all()
    features = []
    for asset in all_assets:
        if wo.bounds and not _point_in_bounds(asset.geometry, wo.bounds):
            continue
        features.append(_asset_to_geojson(asset))

    return jsonify(features)


# ─────────────────────────── Sync endpoint ───────────────────────────

@app.route("/api/sync", methods=["POST"])
def sync():
    """Process an action queue sent from the client.

    Expects JSON body:
    {
      "actions": [
        {
          "action": "CREATE" | "UPDATE" | "DELETE",
          "asset_id": "<string>",
          "work_order_id": "<string>",
          "asset_type": "<string>",
          "geometry": { GeoJSON geometry },
          "properties": { ... },
          "timestamp": "<ISO-8601>"
        },
        ...
      ]
    }

    Processes each action sequentially (last-writer-wins).
    Returns per-action results and writes to the AuditLog.
    """
    payload = request.get_json(silent=True) or {}
    actions = payload.get("actions", [])

    if not actions:
        return jsonify({"status": "ok", "processed": 0, "results": []})

    now = datetime.now(timezone.utc)
    results = []

    for entry in actions:
        action = (entry.get("action") or "").upper()
        asset_id = entry.get("asset_id")
        wo_id = entry.get("work_order_id")
        asset_type = entry.get("asset_type", "Unknown")
        geometry = entry.get("geometry")
        properties = entry.get("properties", {})

        if not asset_id or action not in ("CREATE", "UPDATE", "DELETE", "ACCEPT"):
            results.append({"asset_id": asset_id, "status": "skipped", "reason": "invalid"})
            continue

        try:
            if action in ("CREATE", "ACCEPT"):
                existing = db.session.get(Asset, asset_id)
                if existing:
                    # Treat as update if asset already exists (idempotent re-sync)
                    existing.geometry = geometry or existing.geometry
                    existing.properties = properties or existing.properties
                    existing.asset_type = asset_type or existing.asset_type
                    existing.updated_at = now
                else:
                    asset = Asset(
                        id=asset_id,
                        asset_type=asset_type,
                        geometry=geometry,
                        properties=properties,
                        status="active",
                        created_at=now,
                        updated_at=now,
                    )
                    db.session.add(asset)

                # For ACCEPT actions, mark the design asset as accepted in
                # the work order so it is no longer rendered as a blackline.
                if action == "ACCEPT" and wo_id:
                    wo = db.session.get(WorkOrder, wo_id)
                    if wo and wo.design_assets:
                        updated_designs = []
                        for da in wo.design_assets:
                            if da.get("id") == asset_id:
                                da = {**da, "properties": {**da.get("properties", {}), "status": "accepted"}}
                            updated_designs.append(da)
                        wo.design_assets = updated_designs
                        flag_modified(wo, "design_assets")

            elif action == "UPDATE":
                existing = db.session.get(Asset, asset_id)
                if existing:
                    if geometry:
                        existing.geometry = geometry
                    if properties:
                        existing.properties = properties
                    existing.asset_type = asset_type or existing.asset_type
                    existing.updated_at = now
                else:
                    # Asset doesn't exist yet — create it to avoid data loss
                    asset = Asset(
                        id=asset_id,
                        asset_type=asset_type,
                        geometry=geometry,
                        properties=properties,
                        status="active",
                        created_at=now,
                        updated_at=now,
                    )
                    db.session.add(asset)

            elif action == "DELETE":
                existing = db.session.get(Asset, asset_id)
                if existing:
                    existing.status = "decommissioned"
                    existing.updated_at = now

            # Write audit log entry
            log = AuditLog(
                action=action,
                asset_id=asset_id,
                work_order_id=wo_id,
                engineer=entry.get("engineer"),
                payload=entry,
                created_at=now,
            )
            db.session.add(log)
            results.append({"asset_id": asset_id, "status": "ok"})

        except Exception as exc:
            results.append({"asset_id": asset_id, "status": "error", "reason": str(exc)})

    db.session.commit()

    return jsonify({
        "status": "ok",
        "processed": len(results),
        "results": results,
    })


# ─────────────────────────── Audit log (read-only) ───────────────────────────

@app.route("/api/audit", methods=["GET"])
def get_audit_log():
    """Return the audit log (most recent first, limited to 100 entries)."""
    logs = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(100).all()
    return jsonify([
        {
            "id": log.id,
            "action": log.action,
            "asset_id": log.asset_id,
            "work_order_id": log.work_order_id,
            "engineer": log.engineer,
            "payload": log.payload,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ])


# ─────────────────────────── Entrypoint ───────────────────────────

if __name__ == "__main__":
    with app.app_context():
        seed_if_empty()
    app.run(debug=True, port=5000)
