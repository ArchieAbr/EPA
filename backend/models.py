"""
SQLite database models for the Offline-First GIS Asset Capture tool.

Tables:
  - WorkOrder:  Job packs with design assets (what engineers need to build/inspect).
  - Asset:      The master asset register (real-world network infrastructure).
  - AuditLog:   Historical record of every sync action for traceability.
"""

from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class WorkOrder(db.Model):
    """A job pack issued to a field engineer."""

    __tablename__ = "work_orders"

    id = db.Column(db.String, primary_key=True)
    reference = db.Column(db.String, nullable=False)
    name = db.Column(db.String, nullable=False)
    description = db.Column(db.Text, nullable=True)
    status = db.Column(db.String, default="assigned")
    priority = db.Column(db.String, default="normal")
    assigned_to = db.Column(db.String, nullable=True)
    assigned_date = db.Column(db.String, nullable=True)
    due_date = db.Column(db.String, nullable=True)
    bounds = db.Column(db.JSON, nullable=True)          # {center, zoom, minZoom, maxBounds}
    design_assets = db.Column(db.JSON, nullable=True)   # Array of GeoJSON features
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))


class Asset(db.Model):
    """A real-world infrastructure asset in the master register."""

    __tablename__ = "assets"

    id = db.Column(db.String, primary_key=True)
    asset_type = db.Column(db.String, nullable=False)           # Pole, Transformer, Cable
    geometry = db.Column(db.JSON, nullable=False)                # GeoJSON geometry object
    properties = db.Column(db.JSON, nullable=False, default={})  # All captured field data
    status = db.Column(db.String, default="active")              # active | decommissioned
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc),
                           onupdate=lambda: datetime.now(timezone.utc))


class AuditLog(db.Model):
    """Immutable log of every sync action processed by the server."""

    __tablename__ = "audit_log"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    action = db.Column(db.String, nullable=False)         # CREATE | UPDATE | DELETE
    asset_id = db.Column(db.String, nullable=False)
    work_order_id = db.Column(db.String, nullable=True)
    engineer = db.Column(db.String, nullable=True)
    payload = db.Column(db.JSON, nullable=True)            # Snapshot of what was sent
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


__all__ = ["db", "WorkOrder", "Asset", "AuditLog"]
