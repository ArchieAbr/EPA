from datetime import datetime

from flask_sqlalchemy import SQLAlchemy

# Shared SQLAlchemy instance so models and app can both access it
_db = SQLAlchemy()

db = _db  # exposed alias for clarity


class Asset(db.Model):
    __tablename__ = "assets"
    id = db.Column(db.String, primary_key=True)
    asset_type = db.Column(db.String, nullable=False)
    geometry = db.Column(db.JSON, nullable=False)
    properties_json = db.Column(db.JSON, nullable=False)
    status = db.Column(db.String, default="active")
    last_work_order_id = db.Column(db.String, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class WorkOrder(db.Model):
    __tablename__ = "work_orders"
    id = db.Column(db.String, primary_key=True)
    reference = db.Column(db.String, nullable=False)
    name = db.Column(db.String, nullable=False)
    description = db.Column(db.Text, nullable=True)
    status = db.Column(db.String, nullable=True)
    priority = db.Column(db.String, nullable=True)
    assigned_to = db.Column(db.String, nullable=True)
    assigned_date = db.Column(db.String, nullable=True)
    due_date = db.Column(db.String, nullable=True)
    bounds = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class WorkOrderAsset(db.Model):
    __tablename__ = "work_order_assets"
    id = db.Column(db.String, primary_key=True)
    work_order_id = db.Column(db.String, db.ForeignKey("work_orders.id"), nullable=False)
    asset_id = db.Column(db.String, db.ForeignKey("assets.id"), nullable=True)
    design_geometry = db.Column(db.JSON, nullable=True)
    as_built_geometry = db.Column(db.JSON, nullable=True)
    design_properties = db.Column(db.JSON, nullable=True)
    as_built_properties = db.Column(db.JSON, nullable=True)
    action = db.Column(db.String, default="CREATE")
    status = db.Column(db.String, default="proposed")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


__all__ = ["db", "Asset", "WorkOrder", "WorkOrderAsset"]
