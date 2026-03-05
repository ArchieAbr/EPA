"""
Backend test suite for the Offline-First GIS Asset Capture API.

Run with:  python -m pytest test_backend.py -v
"""

import json
import os
import sys
import tempfile

import pytest

# Ensure the backend directory is on the path
sys.path.insert(0, os.path.dirname(__file__))

from app import app, db, seed_if_empty


@pytest.fixture
def client():
    """Create a test client with a temporary database."""
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["TESTING"] = True

    with app.app_context():
        db.create_all()
        seed_if_empty()

    with app.test_client() as client:
        yield client

    os.close(db_fd)
    os.unlink(db_path)


# ─────────── Health ───────────

def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "ok"


# ─────────── Work Orders ───────────

def test_list_work_orders(client):
    res = client.get("/api/workorders")
    assert res.status_code == 200
    data = res.get_json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # Summary should not include full design_assets
    assert "design_assets" not in data[0]
    assert "asset_count" in data[0]


def test_get_work_order_detail(client):
    res = client.get("/api/workorders")
    wo_id = res.get_json()[0]["id"]

    res = client.get(f"/api/workorders/{wo_id}")
    assert res.status_code == 200
    data = res.get_json()
    assert data["id"] == wo_id
    assert "design_assets" in data
    assert isinstance(data["design_assets"], list)


def test_get_work_order_not_found(client):
    res = client.get("/api/workorders/NONEXISTENT")
    assert res.status_code == 404


# ─────────── Existing Assets per Work Order ───────────

def test_get_work_order_assets(client):
    res = client.get("/api/workorders")
    wo_id = res.get_json()[0]["id"]

    res = client.get(f"/api/workorders/{wo_id}/assets")
    assert res.status_code == 200
    data = res.get_json()
    assert isinstance(data, list)
    # Each item should be a GeoJSON feature
    if len(data) > 0:
        assert "geometry" in data[0]
        assert "properties" in data[0]


# ─────────── Sync: CREATE ───────────

def test_sync_create(client):
    res = client.post(
        "/api/sync",
        data=json.dumps({
            "actions": [
                {
                    "action": "CREATE",
                    "asset_id": "temp-test-001",
                    "work_order_id": "WR-2025-9901",
                    "asset_type": "Pole",
                    "geometry": {"type": "Point", "coordinates": [-1.56, 53.81]},
                    "properties": {"name": "Test Pole", "material": "Wood"},
                    "timestamp": "2026-03-05T12:00:00Z",
                }
            ]
        }),
        content_type="application/json",
    )
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "ok"
    assert data["processed"] == 1
    assert data["results"][0]["status"] == "ok"


# ─────────── Sync: UPDATE ───────────

def test_sync_update(client):
    # First create
    client.post(
        "/api/sync",
        data=json.dumps({
            "actions": [
                {
                    "action": "CREATE",
                    "asset_id": "temp-test-002",
                    "work_order_id": "WR-2025-9901",
                    "asset_type": "Pole",
                    "geometry": {"type": "Point", "coordinates": [-1.56, 53.81]},
                    "properties": {"name": "Original"},
                }
            ]
        }),
        content_type="application/json",
    )

    # Then update
    res = client.post(
        "/api/sync",
        data=json.dumps({
            "actions": [
                {
                    "action": "UPDATE",
                    "asset_id": "temp-test-002",
                    "work_order_id": "WR-2025-9901",
                    "asset_type": "Pole",
                    "geometry": {"type": "Point", "coordinates": [-1.56, 53.81]},
                    "properties": {"name": "Updated"},
                }
            ]
        }),
        content_type="application/json",
    )
    assert res.status_code == 200
    assert res.get_json()["results"][0]["status"] == "ok"


# ─────────── Sync: DELETE (soft) ───────────

def test_sync_delete(client):
    # Create then delete
    client.post(
        "/api/sync",
        data=json.dumps({
            "actions": [
                {
                    "action": "CREATE",
                    "asset_id": "temp-test-003",
                    "work_order_id": "WR-2025-9901",
                    "asset_type": "Cable",
                    "geometry": {"type": "LineString", "coordinates": [[-1.56, 53.81], [-1.55, 53.81]]},
                    "properties": {"name": "Test Cable"},
                }
            ]
        }),
        content_type="application/json",
    )

    res = client.post(
        "/api/sync",
        data=json.dumps({
            "actions": [
                {
                    "action": "DELETE",
                    "asset_id": "temp-test-003",
                    "work_order_id": "WR-2025-9901",
                    "asset_type": "Cable",
                }
            ]
        }),
        content_type="application/json",
    )
    assert res.status_code == 200
    assert res.get_json()["results"][0]["status"] == "ok"


# ─────────── Sync: Multiple actions in one batch ───────────

def test_sync_batch(client):
    res = client.post(
        "/api/sync",
        data=json.dumps({
            "actions": [
                {
                    "action": "CREATE",
                    "asset_id": "batch-001",
                    "work_order_id": "WR-2025-9901",
                    "asset_type": "Pole",
                    "geometry": {"type": "Point", "coordinates": [-1.56, 53.81]},
                    "properties": {"name": "Batch Pole 1"},
                },
                {
                    "action": "CREATE",
                    "asset_id": "batch-002",
                    "work_order_id": "WR-2025-9901",
                    "asset_type": "Pole",
                    "geometry": {"type": "Point", "coordinates": [-1.555, 53.81]},
                    "properties": {"name": "Batch Pole 2"},
                },
                {
                    "action": "UPDATE",
                    "asset_id": "batch-001",
                    "work_order_id": "WR-2025-9901",
                    "asset_type": "Pole",
                    "geometry": {"type": "Point", "coordinates": [-1.56, 53.81]},
                    "properties": {"name": "Batch Pole 1 Updated"},
                },
            ]
        }),
        content_type="application/json",
    )
    assert res.status_code == 200
    data = res.get_json()
    assert data["processed"] == 3
    assert all(r["status"] == "ok" for r in data["results"])


# ─────────── Sync: Empty payload ───────────

def test_sync_empty(client):
    res = client.post(
        "/api/sync",
        data=json.dumps({"actions": []}),
        content_type="application/json",
    )
    assert res.status_code == 200
    assert res.get_json()["processed"] == 0


# ─────────── Audit Log ───────────

def test_audit_log(client):
    # Create an asset to generate audit entry
    client.post(
        "/api/sync",
        data=json.dumps({
            "actions": [
                {
                    "action": "CREATE",
                    "asset_id": "audit-test-001",
                    "work_order_id": "WR-2025-9901",
                    "asset_type": "Pole",
                    "geometry": {"type": "Point", "coordinates": [-1.56, 53.81]},
                    "properties": {"name": "Audit Test"},
                }
            ]
        }),
        content_type="application/json",
    )

    res = client.get("/api/audit")
    assert res.status_code == 200
    data = res.get_json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["action"] == "CREATE"
    assert data[0]["asset_id"] == "audit-test-001"
