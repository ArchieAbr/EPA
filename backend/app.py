import json
import os
import uuid
from datetime import datetime, timezone
from flask import Flask, jsonify, request
from flask_cors import CORS

from models import Asset, WorkOrder, WorkOrderAsset, db

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///app.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

CORS(app, resources={r"/*": {"origins": "*"}})  # Allows frontend to talk to this server
db.init_app(app)

DB_FILE = "database.geojson"
WORK_ORDERS_FILE = "work_orders.json"


# ==================== SEED HELPERS ====================

def _seed_assets_from_geojson():
    if not os.path.exists(DB_FILE):
        return
    with open(DB_FILE, "r") as f:
        data = json.load(f)
    for feature in data.get("features", []):
        asset_id = feature.get("id") or str(uuid.uuid4())
        asset_type = feature.get("properties", {}).get("asset_type") or feature.get("properties", {}).get("type") or "Unknown"
        status = feature.get("properties", {}).get("status", "active")
        asset = Asset(
            id=asset_id,
            asset_type=asset_type,
            geometry=feature.get("geometry"),
            properties_json=feature.get("properties", {}),
            status=status,
        )
        db.session.add(asset)
    db.session.commit()


def _derive_action_from_status(status: str) -> str:
    status = (status or "").lower()
    if status in ["existing", "active"]:
        return "MODIFY"
    if status in ["remove", "decommission", "decommissioned"]:
        return "DECOMMISSION"
    return "CREATE"


def _seed_work_orders_from_json():
    if not os.path.exists(WORK_ORDERS_FILE):
        return
    with open(WORK_ORDERS_FILE, "r") as f:
        data = json.load(f)

    for wo in data.get("work_orders", []):
        work_order = WorkOrder(
            id=wo["id"],
            reference=wo.get("reference", wo["id"]),
            name=wo.get("name", ""),
            description=wo.get("description"),
            status=wo.get("status"),
            priority=wo.get("priority"),
            assigned_to=wo.get("assigned_to"),
            assigned_date=wo.get("assigned_date"),
            due_date=wo.get("due_date"),
            bounds=wo.get("bounds"),
        )
        db.session.add(work_order)

        for design_feature in wo.get("design_assets", []):
            woa_id = design_feature.get("id") or str(uuid.uuid4())
            action = _derive_action_from_status(design_feature.get("properties", {}).get("status"))
            wo_asset = WorkOrderAsset(
                id=woa_id,
                work_order_id=wo["id"],
                asset_id=None,  # unknown/new until completion
                design_geometry=design_feature.get("geometry"),
                design_properties=design_feature.get("properties", {}),
                action=action,
                status="proposed",
            )
            db.session.add(wo_asset)

    db.session.commit()


def seed_if_empty():
    db.create_all()
    if Asset.query.first() is None:
        _seed_assets_from_geojson()
    if WorkOrder.query.first() is None:
        _seed_work_orders_from_json()


# ==================== SERIALIZERS & UTIL ====================

def _parse_ts(value):
    if not value:
        return None
    try:
        # Handle both naive and offset-aware ISO strings
        if isinstance(value, str):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None
    return None


def _serialize_wo_asset(wa: WorkOrderAsset):
    return {
        "id": wa.id,
        "work_order_id": wa.work_order_id,
        "asset_id": wa.asset_id,
        "design_geometry": wa.design_geometry,
        "as_built_geometry": wa.as_built_geometry,
        "design_properties": wa.design_properties,
        "as_built_properties": wa.as_built_properties,
        "action": wa.action,
        "status": wa.status,
        "updated_at": wa.updated_at.replace(tzinfo=timezone.utc).isoformat(),
    }


# ==================== WORK ORDER ENDPOINTS ====================

@app.route("/api/workorders", methods=["GET"])
def get_work_orders():
    """
    Get list of all work orders (summary view).
    Returns: Array of work orders without full design_assets (for list display).
    """
    work_orders = WorkOrder.query.all()
    summaries = []
    for wo in work_orders:
        asset_count = WorkOrderAsset.query.filter_by(work_order_id=wo.id).count()
        summaries.append(
            {
                "id": wo.id,
                "reference": wo.reference,
                "name": wo.name,
                "description": wo.description,
                "status": wo.status,
                "priority": wo.priority,
                "assigned_to": wo.assigned_to,
                "assigned_date": wo.assigned_date,
                "due_date": wo.due_date,
                "asset_count": asset_count,
                "bounds": wo.bounds,
            }
        )

    return jsonify(summaries)


@app.route("/api/workorders/<wo_id>", methods=["GET"])
def get_work_order(wo_id):
    """
    Get a single work order by ID (full details including design_assets).
    This is the "job pack download" endpoint.
    """
    wo = WorkOrder.query.filter_by(id=wo_id).first()
    if not wo:
        return jsonify({"error": "Work order not found"}), 404

    design_assets = []
    wo_assets = WorkOrderAsset.query.filter_by(work_order_id=wo_id).all()
    for wa in wo_assets:
        design_assets.append(
            {
                "id": wa.id,
                "type": "Feature",
                "properties": wa.design_properties or {},
                "geometry": wa.design_geometry,
            }
        )

    response = {
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
        "design_assets": design_assets,
        "created_at": wo.created_at.isoformat(),
        "updated_at": wo.updated_at.isoformat(),
    }

    return jsonify(response)


# ==================== EXISTING ASSET ENDPOINTS ====================

# Route 1: Get all assets (this simulates getting a job pack)
@app.route("/api/assets", methods=["GET"])
def get_assets():
    assets = Asset.query.all()
    features = []
    for a in assets:
        features.append(
            {
                "id": a.id,
                "type": "Feature",
                "properties": a.properties_json,
                "geometry": a.geometry,
            }
        )
    return jsonify({"type": "FeatureCollection", "features": features})

# Route 2: Sync offline changes (Simulates returning to office)
@app.route("/api/sync", methods=["POST"])
def sync_changes():
    """
    Upsert WorkOrderAsset changes from client and return server changes since last_sync_ts.
    Simple conflict rule: last-writer-wins by updated_at (server stamps now when applying).
    """

    payload = request.get_json(silent=True) or {}
    device_id = payload.get("device_id")  # not used yet, kept for future auditing
    last_sync_ts = payload.get("last_sync_ts")
    changes = payload.get("changes", [])

    last_sync_dt = _parse_ts(last_sync_ts) if last_sync_ts else None
    now_utc = datetime.utcnow().replace(tzinfo=timezone.utc)

    # Apply incoming changes
    for change in changes:
        wo_id = change.get("work_order_id")
        if not wo_id:
            continue  # skip invalid rows

        incoming_id = change.get("id") or str(uuid.uuid4())
        incoming_updated_at = _parse_ts(change.get("updated_at")) or now_utc

        existing = WorkOrderAsset.query.filter_by(id=incoming_id).first()

        # If exists and is newer or equal, skip (server wins)
        if existing and existing.updated_at and existing.updated_at >= incoming_updated_at:
            continue

        if not existing:
            existing = WorkOrderAsset(id=incoming_id, work_order_id=wo_id)
            db.session.add(existing)

        # Upsert fields
        existing.work_order_id = wo_id
        existing.asset_id = change.get("asset_id")
        existing.design_geometry = change.get("design_geometry", existing.design_geometry)
        existing.as_built_geometry = change.get("as_built_geometry", existing.as_built_geometry)
        existing.design_properties = change.get("design_properties", existing.design_properties)
        existing.as_built_properties = change.get("as_built_properties", existing.as_built_properties)
        existing.action = change.get("action", existing.action or "CREATE")
        existing.status = change.get("status", existing.status or "proposed")
        existing.updated_at = now_utc

    db.session.commit()

    # Collect server-side changes since last_sync_dt
    server_changes_query = WorkOrderAsset.query
    if last_sync_dt:
        server_changes_query = server_changes_query.filter(WorkOrderAsset.updated_at > last_sync_dt)
    server_changes = [_serialize_wo_asset(wa) for wa in server_changes_query.all()]

    return jsonify({
        "sync_ts": now_utc.isoformat(),
        "server_changes": server_changes,
    })


@app.route("/api/workorders/<wo_id>/complete", methods=["POST"])
def complete_work_order(wo_id):
    """
    Apply as-built changes from WorkOrderAssets into the Asset register.
    Rules:
      - CREATE: insert new Asset using as-built (fallback to design) geometry/properties; link back to WO.
      - MODIFY: update existing Asset with as-built (fallback to design); leave status unchanged unless provided.
      - DECOMMISSION: mark Asset.status = decommissioned.
    All affected WorkOrderAssets are marked confirmed.
    """

    wo = WorkOrder.query.filter_by(id=wo_id).first()
    if not wo:
        return jsonify({"error": "Work order not found"}), 404

    wo_assets = WorkOrderAsset.query.filter_by(work_order_id=wo_id).all()
    if not wo_assets:
        return jsonify({"status": "noop", "message": "No work order assets to apply"})

    now_utc = datetime.utcnow().replace(tzinfo=timezone.utc)

    summary = {"created": 0, "updated": 0, "decommissioned": 0}

    for wa in wo_assets:
        action = (wa.action or "CREATE").lower()

        # Pick as-built values first, fallback to design
        geometry = wa.as_built_geometry or wa.design_geometry
        properties = wa.as_built_properties or wa.design_properties or {}
        status = properties.get("status") or ("decommissioned" if action == "decommission" else "active")

        asset = None
        if wa.asset_id:
            asset = Asset.query.filter_by(id=wa.asset_id).first()

        if action == "create":
            if asset is None:
                asset_id = wa.asset_id or str(uuid.uuid4())
                asset = Asset(
                    id=asset_id,
                    asset_type=properties.get("asset_type") or properties.get("type") or "Unknown",
                    geometry=geometry,
                    properties_json=properties,
                    status=status,
                    last_work_order_id=wo_id,
                )
                db.session.add(asset)
                wa.asset_id = asset_id
                summary["created"] += 1
            else:
                # Treat as update if asset already exists
                asset.geometry = geometry or asset.geometry
                asset.properties_json = properties or asset.properties_json
                asset.status = status or asset.status
                asset.last_work_order_id = wo_id
                summary["updated"] += 1

        elif action == "modify":
            if asset is None:
                # If we don't have an asset yet, create one so data isn't lost
                asset_id = wa.asset_id or str(uuid.uuid4())
                asset = Asset(
                    id=asset_id,
                    asset_type=properties.get("asset_type") or properties.get("type") or "Unknown",
                    geometry=geometry,
                    properties_json=properties,
                    status=status,
                    last_work_order_id=wo_id,
                )
                db.session.add(asset)
                wa.asset_id = asset_id
                summary["created"] += 1
            else:
                asset.geometry = geometry or asset.geometry
                asset.properties_json = properties or asset.properties_json
                asset.status = status or asset.status
                asset.last_work_order_id = wo_id
                summary["updated"] += 1

        elif action == "decommission":
            if asset is None:
                # Create a record to track decommission if missing
                asset_id = wa.asset_id or str(uuid.uuid4())
                asset = Asset(
                    id=asset_id,
                    asset_type=properties.get("asset_type") or properties.get("type") or "Unknown",
                    geometry=geometry,
                    properties_json=properties,
                    status="decommissioned",
                    last_work_order_id=wo_id,
                )
                db.session.add(asset)
                wa.asset_id = asset_id
                summary["decommissioned"] += 1
            else:
                asset.status = "decommissioned"
                asset.geometry = geometry or asset.geometry
                asset.properties_json = properties or asset.properties_json
                asset.last_work_order_id = wo_id
                summary["decommissioned"] += 1
        else:
            # Default: treat unknown actions as modify
            if asset is None:
                asset_id = wa.asset_id or str(uuid.uuid4())
                asset = Asset(
                    id=asset_id,
                    asset_type=properties.get("asset_type") or properties.get("type") or "Unknown",
                    geometry=geometry,
                    properties_json=properties,
                    status=status,
                    last_work_order_id=wo_id,
                )
                db.session.add(asset)
                wa.asset_id = asset_id
                summary["created"] += 1
            else:
                asset.geometry = geometry or asset.geometry
                asset.properties_json = properties or asset.properties_json
                asset.status = status or asset.status
                asset.last_work_order_id = wo_id
                summary["updated"] += 1

        if asset:
            asset.updated_at = now_utc

        wa.status = "confirmed"
        wa.updated_at = now_utc

    db.session.commit()

    return jsonify({
        "status": "completed",
        "work_order_id": wo_id,
        "summary": summary,
    })

if __name__ == "__main__":
    with app.app_context():
        seed_if_empty()
    app.run(debug=True, port=5000)