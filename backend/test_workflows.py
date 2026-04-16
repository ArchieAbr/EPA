"""
End-to-end workflow tests for the Offline-First GIS Asset Capture system.

These tests simulate the full lifecycle that a field engineer goes through:
  1. Download a work order and its existing assets
  2. Create, update, and delete assets while offline (queued locally)
  3. Accept design assets from the work order
  4. Sync the queued actions to the server
  5. Verify the server state matches expectations

Because the browser's IndexedDB cannot be tested from Python, these tests
simulate the *server-side* half of the workflow: they replay the exact sync
payloads that the frontend would build and verify the backend processes them
correctly.

Run with:  cd backend && python -m pytest test_workflows.py -v
"""

import json
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(__file__))

from app import app, db, reset_database, seed_if_empty
from models import Asset, AuditLog, WorkOrder

# The first work order in the seed data (Woodhouse Moor)
WO_ID = "WR-2026-0401"


# ─────────────────────── Fixtures ───────────────────────


@pytest.fixture
def client():
    """Fresh test client with a seeded temporary database."""
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


def _sync(client, actions):
    """POST actions to /api/sync, assert 200, return JSON."""
    res = client.post(
        "/api/sync",
        data=json.dumps({"actions": actions}),
        content_type="application/json",
    )
    assert res.status_code == 200
    return res.get_json()


# ═══════════════════════ Workflow 1: Full field session ═══════════════════════


class TestFieldSessionWorkflow:
    """Simulate a complete field engineer session:
    download work order → create assets offline → sync → verify."""

    def test_download_work_order(self, client):
        """Engineer downloads the work order and its existing assets."""
        # Fetch summary list
        wo_list = client.get("/api/workorders").get_json()
        assert any(wo["id"] == WO_ID for wo in wo_list)

        # Fetch full work order (simulates the job pack download)
        wo = client.get(f"/api/workorders/{WO_ID}").get_json()
        assert wo["id"] == WO_ID
        assert len(wo["design_assets"]) > 0

        # Fetch existing assets in the area
        assets = client.get(f"/api/workorders/{WO_ID}/assets").get_json()
        assert isinstance(assets, list)

    def test_offline_create_then_sync(self, client):
        """Engineer goes offline, creates 3 assets, reconnects, and syncs."""
        # Record baseline
        before = client.get(f"/api/workorders/{WO_ID}/assets").get_json()
        baseline_count = len(before)

        # --- OFFLINE: these actions are queued in IndexedDB on the client ---
        offline_queue = [
            {
                "action": "CREATE",
                "asset_id": "temp-1001",
                "work_order_id": WO_ID,
                "asset_type": "Pole",
                "geometry": {"type": "Point", "coordinates": [-1.5607, 53.8095]},
                "properties": {"name": "New Pole 1", "material": "Wood", "assetType": "Pole",
                               "status": "As-Built"},
            },
            {
                "action": "CREATE",
                "asset_id": "temp-1002",
                "work_order_id": WO_ID,
                "asset_type": "Pole",
                "geometry": {"type": "Point", "coordinates": [-1.5595, 53.8100]},
                "properties": {"name": "New Pole 2", "material": "Steel", "assetType": "Pole",
                               "status": "As-Built"},
            },
            {
                "action": "CREATE",
                "asset_id": "temp-1003",
                "work_order_id": WO_ID,
                "asset_type": "Cable",
                "geometry": {"type": "LineString",
                             "coordinates": [[-1.5607, 53.8095], [-1.5595, 53.8100]]},
                "properties": {"name": "New Cable", "voltageLevel": "LV", "assetType": "Cable",
                               "status": "As-Built"},
            },
        ]

        # --- ONLINE: sync the queue ---
        result = _sync(client, offline_queue)
        assert result["processed"] == 3
        assert all(r["status"] == "ok" for r in result["results"])

        # Verify assets now exist in the register
        after = client.get(f"/api/workorders/{WO_ID}/assets").get_json()
        after_ids = [a["id"] for a in after]
        assert "temp-1001" in after_ids
        assert "temp-1002" in after_ids
        assert "temp-1003" in after_ids
        assert len(after) == baseline_count + 3

    def test_offline_update_then_sync(self, client):
        """Create an asset, go offline, edit it, sync the update."""
        _sync(client, [{
            "action": "CREATE",
            "asset_id": "upd-001",
            "work_order_id": WO_ID,
            "asset_type": "Pole",
            "geometry": {"type": "Point", "coordinates": [-1.5607, 53.8095]},
            "properties": {"name": "Original Name", "material": "Wood"},
        }])

        # --- OFFLINE: update queued ---
        result = _sync(client, [{
            "action": "UPDATE",
            "asset_id": "upd-001",
            "work_order_id": WO_ID,
            "asset_type": "Pole",
            "geometry": {"type": "Point", "coordinates": [-1.5607, 53.8095]},
            "properties": {"name": "Updated Name", "material": "Steel"},
        }])
        assert result["results"][0]["status"] == "ok"

        # Verify the update persisted
        with app.app_context():
            asset = db.session.get(Asset, "upd-001")
            assert asset.properties["name"] == "Updated Name"
            assert asset.properties["material"] == "Steel"

    def test_offline_delete_then_sync(self, client):
        """Create an asset, go offline, delete it, sync the deletion."""
        _sync(client, [{
            "action": "CREATE",
            "asset_id": "del-001",
            "work_order_id": WO_ID,
            "asset_type": "Pole",
            "geometry": {"type": "Point", "coordinates": [-1.5607, 53.8095]},
            "properties": {"name": "To Delete"},
        }])

        # Confirm it exists
        assets = client.get(f"/api/workorders/{WO_ID}/assets").get_json()
        assert any(a["id"] == "del-001" for a in assets)

        # --- OFFLINE: delete queued ---
        result = _sync(client, [{
            "action": "DELETE",
            "asset_id": "del-001",
            "work_order_id": WO_ID,
            "asset_type": "Pole",
        }])
        assert result["results"][0]["status"] == "ok"

        # Verify soft-deleted (no longer in active assets)
        assets = client.get(f"/api/workorders/{WO_ID}/assets").get_json()
        assert not any(a["id"] == "del-001" for a in assets)

        # But still in DB as decommissioned
        with app.app_context():
            asset = db.session.get(Asset, "del-001")
            assert asset.status == "decommissioned"


# ═══════════════════════ Workflow 2: Accept design assets ═══════════════════════


class TestAcceptDesignWorkflow:
    """Simulate accepting blackline design assets and converting them to as-built."""

    def test_accept_single_design(self, client):
        """Accept one design asset and verify it persists in the register."""
        design_id = "D-0401-P01"

        result = _sync(client, [{
            "action": "ACCEPT",
            "asset_id": design_id,
            "work_order_id": WO_ID,
            "asset_type": "Pole",
            "geometry": {"type": "Point", "coordinates": [-1.5607, 53.8095]},
            "properties": {"asset_type": "Pole", "status": "As-Built",
                           "accepted_from_design": design_id},
        }])
        assert result["results"][0]["status"] == "ok"

        # Work order should show this design as accepted
        wo = client.get(f"/api/workorders/{WO_ID}").get_json()
        design = next(d for d in wo["design_assets"] if d["id"] == design_id)
        assert design["properties"]["status"] == "accepted"

        # Asset should be in the register
        assets = client.get(f"/api/workorders/{WO_ID}/assets").get_json()
        assert any(a["id"] == design_id for a in assets)

    def test_accept_all_designs(self, client):
        """Accept every design asset in the work order in a single sync batch."""
        wo = client.get(f"/api/workorders/{WO_ID}").get_json()
        designs = wo["design_assets"]
        assert len(designs) > 0

        actions = []
        for d in designs:
            actions.append({
                "action": "ACCEPT",
                "asset_id": d["id"],
                "work_order_id": WO_ID,
                "asset_type": d["properties"].get("asset_type", "Unknown"),
                "geometry": d["geometry"],
                "properties": {**d["properties"], "status": "As-Built",
                               "accepted_from_design": d["id"]},
            })

        result = _sync(client, actions)
        assert result["processed"] == len(designs)
        assert all(r["status"] == "ok" for r in result["results"])

        # Every design should now be marked as accepted
        wo_after = client.get(f"/api/workorders/{WO_ID}").get_json()
        for d in wo_after["design_assets"]:
            assert d["properties"]["status"] == "accepted", f"{d['id']} not accepted"


# ═══════════════════════ Workflow 3: Mixed offline batch ═══════════════════════


class TestMixedOfflineBatch:
    """Simulate a realistic offline session with a mix of creates, updates,
    deletes, and accepts in a single sync batch."""

    def test_mixed_batch(self, client):
        # Pre-create an asset that we'll update and another we'll delete
        _sync(client, [
            {
                "action": "CREATE",
                "asset_id": "mix-existing-001",
                "work_order_id": WO_ID,
                "asset_type": "Pole",
                "geometry": {"type": "Point", "coordinates": [-1.5607, 53.8095]},
                "properties": {"name": "Will Update"},
            },
            {
                "action": "CREATE",
                "asset_id": "mix-existing-002",
                "work_order_id": WO_ID,
                "asset_type": "Pole",
                "geometry": {"type": "Point", "coordinates": [-1.5600, 53.8095]},
                "properties": {"name": "Will Delete"},
            },
        ])

        # --- OFFLINE: engineer queues a mix of actions ---
        offline_actions = [
            # New asset
            {
                "action": "CREATE",
                "asset_id": "mix-new-001",
                "work_order_id": WO_ID,
                "asset_type": "Transformer",
                "geometry": {"type": "Point", "coordinates": [-1.5590, 53.8100]},
                "properties": {"name": "New TX", "mounting": "Pole Mounted"},
            },
            # Update existing
            {
                "action": "UPDATE",
                "asset_id": "mix-existing-001",
                "work_order_id": WO_ID,
                "asset_type": "Pole",
                "geometry": {"type": "Point", "coordinates": [-1.5607, 53.8095]},
                "properties": {"name": "Updated Pole"},
            },
            # Delete existing
            {
                "action": "DELETE",
                "asset_id": "mix-existing-002",
                "work_order_id": WO_ID,
                "asset_type": "Pole",
            },
            # Accept a design
            {
                "action": "ACCEPT",
                "asset_id": "D-0401-T01",
                "work_order_id": WO_ID,
                "asset_type": "Transformer",
                "geometry": {"type": "Point", "coordinates": [-1.5579, 53.8101]},
                "properties": {"asset_type": "Transformer", "status": "As-Built"},
            },
        ]

        result = _sync(client, offline_actions)
        assert result["processed"] == 4
        assert all(r["status"] == "ok" for r in result["results"])

        # Verify each outcome
        assets = client.get(f"/api/workorders/{WO_ID}/assets").get_json()
        asset_ids = [a["id"] for a in assets]

        assert "mix-new-001" in asset_ids, "New asset should exist"
        assert "mix-existing-001" in asset_ids, "Updated asset should still exist"
        assert "mix-existing-002" not in asset_ids, "Deleted asset should be gone"
        assert "D-0401-T01" in asset_ids, "Accepted design should be in register"

        # Verify the update took effect
        with app.app_context():
            updated = db.session.get(Asset, "mix-existing-001")
            assert updated.properties["name"] == "Updated Pole"

        # Verify audit log has 6 entries (2 pre-create + 4 offline)
        audit = client.get("/api/audit").get_json()
        assert len(audit) >= 6


# ═══════════════════════ Workflow 4: Database reset ═══════════════════════


class TestDatabaseReset:
    """Verify that reset_database() restores the seed state,
    matching the behavior of run.sh --reset."""

    def test_reset_clears_user_assets(self, client):
        """After adding assets and resetting, only seed data remains."""
        _sync(client, [{
            "action": "CREATE",
            "asset_id": "reset-test-001",
            "work_order_id": WO_ID,
            "asset_type": "Pole",
            "geometry": {"type": "Point", "coordinates": [-1.56, 53.81]},
            "properties": {"name": "Should be wiped"},
        }])

        # Reset
        with app.app_context():
            reset_database()

        # The user-created asset should be gone
        assets = client.get(f"/api/workorders/{WO_ID}/assets").get_json()
        assert not any(a["id"] == "reset-test-001" for a in assets)

    def test_reset_restores_work_orders(self, client):
        """After reset, all seed work orders are present and unmodified."""
        # Accept a design to modify the work order
        _sync(client, [{
            "action": "ACCEPT",
            "asset_id": "D-0401-P01",
            "work_order_id": WO_ID,
            "asset_type": "Pole",
            "geometry": {"type": "Point", "coordinates": [-1.5607, 53.8095]},
            "properties": {"asset_type": "Pole", "status": "As-Built"},
        }])

        with app.app_context():
            reset_database()

        # Work order's design assets should be back to 'proposed'
        wo = client.get(f"/api/workorders/{WO_ID}").get_json()
        for d in wo["design_assets"]:
            assert d["properties"]["status"] == "proposed", (
                f"Design {d['id']} should be 'proposed' after reset"
            )

    def test_reset_clears_audit_log(self, client):
        """Audit log should be empty after a reset."""
        _sync(client, [{
            "action": "CREATE",
            "asset_id": "audit-reset-001",
            "work_order_id": WO_ID,
            "asset_type": "Pole",
            "geometry": {"type": "Point", "coordinates": [-1.56, 53.81]},
            "properties": {"name": "Audit entry"},
        }])

        with app.app_context():
            reset_database()

        audit = client.get("/api/audit").get_json()
        assert len(audit) == 0

    def test_boot_id_in_health(self, client):
        """Health endpoint includes a boot_id for frontend cache invalidation."""
        data = client.get("/api/health").get_json()
        assert "boot_id" in data
        assert isinstance(data["boot_id"], str)
        assert len(data["boot_id"]) > 0


# ═══════════════════════ Workflow 5: Idempotent re-sync ═══════════════════════


class TestIdempotentResync:
    """If connectivity drops mid-sync, the client may re-send the same queue.
    Verify that replaying the same actions is safe."""

    def test_duplicate_sync_is_safe(self, client):
        actions = [
            {
                "action": "CREATE",
                "asset_id": "idem-001",
                "work_order_id": WO_ID,
                "asset_type": "Pole",
                "geometry": {"type": "Point", "coordinates": [-1.5607, 53.8095]},
                "properties": {"name": "Idempotent Pole"},
            },
            {
                "action": "ACCEPT",
                "asset_id": "D-0401-P03",
                "work_order_id": WO_ID,
                "asset_type": "Pole",
                "geometry": {"type": "Point", "coordinates": [-1.5580, 53.8100]},
                "properties": {"asset_type": "Pole", "status": "As-Built"},
            },
        ]

        # First sync
        r1 = _sync(client, actions)
        assert all(r["status"] == "ok" for r in r1["results"])

        # Exact same payload again (simulating retry)
        r2 = _sync(client, actions)
        assert all(r["status"] == "ok" for r in r2["results"])

        # Asset should still be present exactly once
        assets = client.get(f"/api/workorders/{WO_ID}/assets").get_json()
        count = sum(1 for a in assets if a["id"] == "idem-001")
        assert count == 1
