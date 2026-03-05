import json, tempfile, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import app, db, seed_if_empty

db_fd, db_path = tempfile.mkstemp(suffix=".db")
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
app.config["TESTING"] = True

with app.app_context():
    db.create_all()
    seed_if_empty()

with app.test_client() as client:
    r1 = client.get("/api/workorders/WR-2026-0401")
    print("Before ACCEPT:", r1.status_code)

    r2 = client.post("/api/sync", data=json.dumps({"actions": [{
        "action": "ACCEPT", "asset_id": "D-0401-P01", "work_order_id": "WR-2026-0401",
        "asset_type": "Pole", "geometry": {"type": "Point", "coordinates": [-1.5607, 53.8095]},
        "properties": {"asset_type": "Pole", "status": "As-Built"},
    }]}), content_type="application/json")
    print("Sync result:", r2.get_json())

    r3 = client.get("/api/workorders/WR-2026-0401")
    print("After ACCEPT:", r3.status_code, r3.get_json())

os.close(db_fd)
os.unlink(db_path)
