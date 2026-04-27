"""
Backend test suite for the Offline-First GIS Asset Capture API.

Covers every API endpoint, edge cases, and data-integrity checks.

Run with:  cd backend && python -m pytest test_backend.py -v
"""

import json
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(__file__))

from app import app, db, seed_if_empty
from models import Asset, AuditLog, WorkOrder


# Fixtures


@pytest.fixture
def client():
    """Create a test client backed by a temporary SQLite database."""
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["TESTING"] = True

    with app.app_context():
        db.create_all()
        seed_if_empty()

    with app.test_client() as c:
        yield c

    os.close(db_fd)
    os.unlink(db_path)


def _post_sync(client, actions):
    """Helper: POST a list of actions to /api/sync and return (response, json)."""
    res = client.post(
        "/api/sync",
        data=json.dumps({"actions": actions}),
        content_type="application/json",
    )
    return res, res.get_json()


def _make_action(action, asset_id, wo_id="WR-2026-0401", asset_type="Pole",
                 geometry=None, properties=None, **extra):
    """Build a single sync action dict."""
    entry = {
        "action": action,
        "asset_id": asset_id,
        "work_order_id": wo_id,
        "asset_type": asset_type,
        "geometry": geometry or {"type": "Point", "coordinates": [-1.56, 53.81]},
        "properties": properties or {"name": f"Test {asset_type}"},
    }
    entry.update(extra)
    return entry


# Health


class TestHealth:
    def test_health_get(self, client):
        res = client.get("/api/health")
        assert res.status_code == 200
        data = res.get_json()
        assert data["status"] == "ok"
        assert "boot_id" in data

    def test_health_head(self, client):
        res = client.head("/api/health")
        assert res.status_code == 200

    def test_boot_id_is_consistent(self, client):
        """Same server process returns the same boot_id."""
        d1 = client.get("/api/health").get_json()
        d2 = client.get("/api/health").get_json()
        assert d1["boot_id"] == d2["boot_id"]


# Work Orders


class TestWorkOrders:
    def test_list_returns_array(self, client):
        data = client.get("/api/workorders").get_json()
        assert isinstance(data, list)
        assert len(data) >= 1

    def test_list_excludes_design_assets(self, client):
        data = client.get("/api/workorders").get_json()
        for wo in data:
            assert "design_assets" not in wo
            assert "asset_count" in wo

    def test_list_contains_expected_fields(self, client):
        wo = client.get("/api/workorders").get_json()[0]
        for key in ("id", "reference", "name", "status", "priority", "bounds"):
            assert key in wo, f"Missing field: {key}"

    def test_detail_includes_design_assets(self, client):
        wo_id = client.get("/api/workorders").get_json()[0]["id"]
        data = client.get(f"/api/workorders/{wo_id}").get_json()
        assert data["id"] == wo_id
        assert "design_assets" in data
        assert isinstance(data["design_assets"], list)

    def test_detail_not_found(self, client):
        res = client.get("/api/workorders/NONEXISTENT")
        assert res.status_code == 404

    def test_assets_endpoint(self, client):
        wo_id = client.get("/api/workorders").get_json()[0]["id"]
        data = client.get(f"/api/workorders/{wo_id}/assets").get_json()
        assert isinstance(data, list)
        for feature in data:
            assert "geometry" in feature
            assert "properties" in feature

    def test_assets_not_found_wo(self, client):
        res = client.get("/api/workorders/NONEXISTENT/assets")
        assert res.status_code == 404


# Sync — CREATE


class TestSyncCreate:
    def test_create_single(self, client):
        res, data = _post_sync(client, [_make_action("CREATE", "c-001")])
        assert res.status_code == 200
        assert data["processed"] == 1
        assert data["results"][0]["status"] == "ok"

    def test_created_asset_appears_in_register(self, client):
        """After syncing a CREATE, the new asset shows up in the assets endpoint."""
        _post_sync(client, [_make_action(
            "CREATE", "c-register-001",
            geometry={"type": "Point", "coordinates": [-1.5607, 53.8095]},
        )])
        assets = client.get("/api/workorders/WR-2026-0401/assets").get_json()
        ids = [a["id"] for a in assets]
        assert "c-register-001" in ids

    def test_create_idempotent(self, client):
        """Syncing the same CREATE twice should succeed (treated as update)."""
        action = _make_action("CREATE", "c-idem-001")
        _post_sync(client, [action])
        res, data = _post_sync(client, [action])
        assert res.status_code == 200
        assert data["results"][0]["status"] == "ok"

    def test_create_cable(self, client):
        action = _make_action(
            "CREATE", "c-cable-001", asset_type="Cable",
            geometry={"type": "LineString", "coordinates": [[-1.56, 53.81], [-1.55, 53.81]]},
            properties={"name": "Test Cable", "voltageLevel": "LV"},
        )
        res, data = _post_sync(client, [action])
        assert data["results"][0]["status"] == "ok"

    def test_create_transformer(self, client):
        action = _make_action(
            "CREATE", "c-tx-001", asset_type="Transformer",
            properties={"name": "Test TX", "mounting": "Pole Mounted", "rating": "50kVA"},
        )
        res, data = _post_sync(client, [action])
        assert data["results"][0]["status"] == "ok"


# Sync — UPDATE


class TestSyncUpdate:
    def test_update_existing(self, client):
        _post_sync(client, [_make_action("CREATE", "u-001", properties={"name": "Original"})])
        res, data = _post_sync(client, [_make_action("UPDATE", "u-001", properties={"name": "Updated"})])
        assert data["results"][0]["status"] == "ok"

    def test_update_nonexistent_creates(self, client):
        """UPDATE on a missing asset should create it to avoid data loss."""
        res, data = _post_sync(client, [_make_action("UPDATE", "u-ghost-001")])
        assert data["results"][0]["status"] == "ok"


# Sync — DELETE


class TestSyncDelete:
    def test_soft_delete(self, client):
        _post_sync(client, [_make_action("CREATE", "d-001")])
        res, data = _post_sync(client, [_make_action("DELETE", "d-001")])
        assert data["results"][0]["status"] == "ok"

    def test_deleted_asset_excluded_from_register(self, client):
        """Soft-deleted assets should not appear in the active asset list."""
        _post_sync(client, [_make_action(
            "CREATE", "d-exclude-001",
            geometry={"type": "Point", "coordinates": [-1.5607, 53.8095]},
        )])
        _post_sync(client, [_make_action("DELETE", "d-exclude-001")])
        assets = client.get("/api/workorders/WR-2026-0401/assets").get_json()
        ids = [a["id"] for a in assets]
        assert "d-exclude-001" not in ids

    def test_delete_nonexistent_no_error(self, client):
        """DELETE on a missing asset should not error."""
        res, data = _post_sync(client, [_make_action("DELETE", "d-ghost-001")])
        assert data["results"][0]["status"] == "ok"


# Sync — ACCEPT


class TestSyncAccept:
    def test_accept_design(self, client):
        design_id = "D-0401-P01"
        res, data = _post_sync(client, [_make_action(
            "ACCEPT", design_id,
            geometry={"type": "Point", "coordinates": [-1.5607, 53.8095]},
            properties={"asset_type": "Pole", "status": "As-Built",
                        "accepted_from_design": design_id},
        )])
        assert data["processed"] == 1
        assert data["results"][0]["status"] == "ok"

    def test_accept_marks_design_accepted(self, client):
        design_id = "D-0401-P01"
        _post_sync(client, [_make_action(
            "ACCEPT", design_id,
            geometry={"type": "Point", "coordinates": [-1.5607, 53.8095]},
            properties={"asset_type": "Pole", "status": "As-Built"},
        )])
        wo = client.get("/api/workorders/WR-2026-0401").get_json()
        design = next(d for d in wo["design_assets"] if d["id"] == design_id)
        assert design["properties"]["status"] == "accepted"

    def test_accept_creates_audit_entry(self, client):
        design_id = "D-0401-P02"
        _post_sync(client, [_make_action(
            "ACCEPT", design_id,
            geometry={"type": "Point", "coordinates": [-1.5595, 53.8100]},
            properties={"asset_type": "Pole", "status": "As-Built"},
        )])
        audit = client.get("/api/audit").get_json()
        entry = next((e for e in audit if e["action"] == "ACCEPT" and e["asset_id"] == design_id), None)
        assert entry is not None


# Sync — Batch & Edge Cases


class TestSyncEdgeCases:
    def test_batch_multiple(self, client):
        res, data = _post_sync(client, [
            _make_action("CREATE", "batch-001"),
            _make_action("CREATE", "batch-002"),
            _make_action("UPDATE", "batch-001", properties={"name": "Updated"}),
        ])
        assert data["processed"] == 3
        assert all(r["status"] == "ok" for r in data["results"])

    def test_empty_payload(self, client):
        res, data = _post_sync(client, [])
        assert data["processed"] == 0

    def test_invalid_action_skipped(self, client):
        res, data = _post_sync(client, [{
            "action": "INVALID",
            "asset_id": "skip-001",
        }])
        assert data["results"][0]["status"] == "skipped"

    def test_missing_asset_id_skipped(self, client):
        res, data = _post_sync(client, [{
            "action": "CREATE",
            "asset_type": "Pole",
        }])
        assert data["results"][0]["status"] == "skipped"

    def test_no_body(self, client):
        res = client.post("/api/sync", content_type="application/json")
        assert res.status_code == 200
        assert res.get_json()["processed"] == 0


# Audit Log


class TestAuditLog:
    def test_audit_records_created(self, client):
        _post_sync(client, [_make_action("CREATE", "audit-001")])
        data = client.get("/api/audit").get_json()
        assert isinstance(data, list)
        assert any(e["asset_id"] == "audit-001" for e in data)

    def test_audit_contains_expected_fields(self, client):
        _post_sync(client, [_make_action("CREATE", "audit-fields-001")])
        entry = client.get("/api/audit").get_json()[0]
        for key in ("id", "action", "asset_id", "work_order_id", "created_at"):
            assert key in entry


# Activity Feed


class TestActivity:
    def test_activity_returns_stats(self, client):
        data = client.get("/api/activity").get_json()
        assert "stats" in data
        stats = data["stats"]
        for key in ("active_assets", "decommissioned_assets", "work_orders", "total_audit_entries"):
            assert key in stats

    def test_activity_returns_recent(self, client):
        _post_sync(client, [_make_action("CREATE", "act-001")])
        data = client.get("/api/activity").get_json()
        assert "recent" in data
        assert isinstance(data["recent"], list)
        assert len(data["recent"]) >= 1


# Admin Dashboard


class TestAdmin:
    def test_admin_page_loads(self, client):
        res = client.get("/admin")
        assert res.status_code == 200
        assert b"<" in res.data  # Should contain HTML
