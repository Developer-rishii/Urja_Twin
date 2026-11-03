"""MongoDB storage layer for UrjaTwin.

Manages collections:
- readings: plant_id, ts, power_kw, irradiance, module_temp, ambient_temp, wind_speed, etc.
- forecasts: plant_id, issue_time, horizon_blocks, source
- alerts: plant_id, type (dsm_breach, soiling, node_offline), ts, message, severity
- twin_state: plant_id, last_ts, expected_kw, actual_kw, gap_pct, soiling_ratio, pr, cp, node_status
"""

from typing import Any, Dict, List, Optional
from pymongo import MongoClient, ASCENDING, DESCENDING
from app.config import settings

_CLIENT: Optional[MongoClient] = None


def get_db():
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = MongoClient(settings.MONGO_URL, serverSelectionTimeoutMS=2000)
    db_name = settings.MONGO_URL.split("/")[-1].split("?")[0] or "urjatwin"
    return _CLIENT[db_name]


def init_indexes():
    """Create essential indexes for performance."""
    try:
        db = get_db()
        db.readings.create_index([("plant_id", ASCENDING), ("ts", DESCENDING)], background=True)
        db.forecasts.create_index([("plant_id", ASCENDING), ("issue_time", DESCENDING)], background=True)
        db.alerts.create_index([("plant_id", ASCENDING), ("ts", DESCENDING)], background=True)
        db.twin_state.create_index([("plant_id", ASCENDING)], unique=True, background=True)
    except Exception:
        pass


def insert_reading(doc: Dict[str, Any]):
    db = get_db()
    return db.readings.update_one(
        {"plant_id": doc["plant_id"], "ts": doc["ts"]},
        {"$set": doc},
        upsert=True,
    )


def get_latest_reading(plant_id: str) -> Optional[Dict[str, Any]]:
    db = get_db()
    doc = db.readings.find_one({"plant_id": plant_id}, sort=[("ts", DESCENDING)], projection={"_id": False})
    return doc


def get_recent_readings(plant_id: str, limit: int = 96) -> List[Dict[str, Any]]:
    db = get_db()
    cursor = db.readings.find({"plant_id": plant_id}, projection={"_id": False}).sort("ts", DESCENDING).limit(limit)
    docs = list(cursor)
    docs.reverse()
    return docs


def upsert_twin_state(plant_id: str, state: Dict[str, Any]):
    db = get_db()
    db.twin_state.update_one({"plant_id": plant_id}, {"$set": state}, upsert=True)


def get_twin_state(plant_id: str) -> Optional[Dict[str, Any]]:
    db = get_db()
    return db.twin_state.find_one({"plant_id": plant_id}, projection={"_id": False})


def insert_alert(alert: Dict[str, Any]):
    db = get_db()
    return db.alerts.insert_one(alert)


def get_alerts(plant_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    db = get_db()
    cursor = db.alerts.find({"plant_id": plant_id}, projection={"_id": False}).sort("ts", DESCENDING).limit(limit)
    return list(cursor)


def save_forecast(plant_id: str, issue_time: str, blocks: List[Dict[str, Any]], source: str):
    db = get_db()
    doc = {
        "plant_id": plant_id,
        "issue_time": issue_time,
        "blocks": blocks,
        "source": source,
    }
    db.forecasts.update_one(
        {"plant_id": plant_id, "issue_time": issue_time},
        {"$set": doc},
        upsert=True,
    )


def get_latest_forecast(plant_id: str) -> Optional[Dict[str, Any]]:
    db = get_db()
    return db.forecasts.find_one({"plant_id": plant_id}, sort=[("issue_time", DESCENDING)], projection={"_id": False})
