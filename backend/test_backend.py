import json
import unittest
from datetime import datetime, timedelta

from app import app
from models import Asset, WorkOrder, WorkOrderAsset, db


class BackendIntegrationTests(unittest.TestCase):
    def setUp(self):
        app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
        app.config["TESTING"] = True
        self.ctx = app.app_context()
        self.ctx.push()
        db.create_all()

        # Seed baseline data
        wo = WorkOrder(
            id="WO-1",
            reference="WO-1",
            name="Test Work Order",
            description="Test work order description",
            status="assigned",
        )

        asset1 = Asset(
            id="A-1",
            asset_type="Pole",
            geometry={"type": "Point", "coordinates": [-1.5, 53.5]},
            properties_json={"asset_type": "Pole", "status": "active"},
            status="active",
        )
        asset2 = Asset(
            id="A-2",
            asset_type="Cable",
            geometry={"type": "LineString", "coordinates": [[-1.5, 53.5], [-1.6, 53.6]]},
            properties_json={"asset_type": "Cable", "status": "active"},
            status="active",
        )

        old_ts = datetime.utcnow() - timedelta(days=1)

        woa_create = WorkOrderAsset(
            id="WOA-CREATE",
            work_order_id=wo.id,
            design_geometry={"type": "Point", "coordinates": [-1.51, 53.51]},
            design_properties={"asset_type": "Transformer", "status": "proposed"},
            action="CREATE",
            status="proposed",
            updated_at=old_ts,
        )

        woa_modify = WorkOrderAsset(
            id="WOA-MODIFY",
            work_order_id=wo.id,
            asset_id=asset1.id,
            design_geometry={"type": "Point", "coordinates": [-1.52, 53.52]},
            design_properties={"asset_type": "Pole", "status": "existing"},
            as_built_geometry={"type": "Point", "coordinates": [-1.53, 53.53]},
            as_built_properties={"asset_type": "Pole", "status": "active", "name": "Updated Pole"},
            action="MODIFY",
            status="proposed",
            updated_at=old_ts,
        )

        woa_decom = WorkOrderAsset(
            id="WOA-DECOM",
            work_order_id=wo.id,
            asset_id=asset2.id,
            design_geometry={"type": "LineString", "coordinates": [[-1.5, 53.5], [-1.6, 53.6]]},
            design_properties={"asset_type": "Cable", "status": "decommission"},
            action="DECOMMISSION",
            status="proposed",
            updated_at=old_ts,
        )

        db.session.add_all([wo, asset1, asset2, woa_create, woa_modify, woa_decom])
        db.session.commit()

        self.client = app.test_client()

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.ctx.pop()

    def test_get_workorders_list(self):
        print("\n[GET] /api/workorders — list work orders")
        resp = self.client.get("/api/workorders")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["asset_count"], 3)

    def test_get_workorder_detail(self):
        print("\n[GET] /api/workorders/WO-1 — work order pack")
        resp = self.client.get("/api/workorders/WO-1")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["id"], "WO-1")
        self.assertEqual(len(data["design_assets"]), 3)

    def test_get_assets(self):
        print("\n[GET] /api/assets — asset register snapshot")
        resp = self.client.get("/api/assets")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["type"], "FeatureCollection")
        self.assertEqual(len(data["features"]), 2)

    def test_sync_upsert_returns_new_change(self):
        print("\n[POST] /api/sync — upsert offline change and return server delta")
        last_sync = datetime.utcnow().isoformat()
        payload = {
            "device_id": "dev-test",
            "last_sync_ts": last_sync,
            "changes": [
                {
                    "id": "WOA-NEW",
                    "work_order_id": "WO-1",
                    "asset_id": None,
                    "as_built_geometry": {"type": "Point", "coordinates": [-1.7, 53.7]},
                    "as_built_properties": {"asset_type": "Pole", "name": "New Pole"},
                    "action": "CREATE",
                    "status": "proposed",
                    "updated_at": datetime.utcnow().isoformat() + "Z",
                }
            ],
        }

        resp = self.client.post(
            "/api/sync",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        server_changes = [c["id"] for c in data["server_changes"]]
        self.assertIn("WOA-NEW", server_changes)

        stored = WorkOrderAsset.query.filter_by(id="WOA-NEW").first()
        self.assertIsNotNone(stored)
        self.assertEqual(stored.action.lower(), "create")

    def test_complete_work_order_applies_actions(self):
        print("\n[POST] /api/workorders/WO-1/complete — apply as-built changes")
        initial_asset_count = Asset.query.count()
        resp = self.client.post("/api/workorders/WO-1/complete")
        self.assertEqual(resp.status_code, 200)
        data = resp.get_json()
        self.assertEqual(data["status"], "completed")
        self.assertEqual(data["summary"], {"created": 1, "updated": 1, "decommissioned": 1})

        self.assertEqual(Asset.query.count(), initial_asset_count + 1)

        asset1 = Asset.query.get("A-1")
        asset2 = Asset.query.get("A-2")

        self.assertEqual(asset1.properties_json.get("name"), "Updated Pole")
        self.assertEqual(asset1.last_work_order_id, "WO-1")
        self.assertEqual(asset2.status, "decommissioned")

        wa_statuses = {wa.id: wa.status for wa in WorkOrderAsset.query.all()}
        self.assertTrue(all(status == "confirmed" for status in wa_statuses.values()))


if __name__ == "__main__":
    runner = unittest.TextTestRunner(verbosity=2)
    unittest.main(testRunner=runner)
