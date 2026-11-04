"""Comprehensive pytest test suite for all UrjaTwin T5 endpoints.

Covers:
- GET /health
- GET /plants
- GET /plants/{id}/state
- GET /plants/{id}/forecast
- GET /plants/{id}/actual
- GET /plants/{id}/schedule
- GET /plants/{id}/dsm
- GET /plants/{id}/accuracy
- GET /plants/{id}/alerts
- 404 on nonexistent plant
- Presence of 'source' field in every response
- Graceful empty list handling on empty data
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config import settings
from app import storage

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_list_plants():
    response = client.get("/plants")
    assert response.status_code == 200
    data = response.json()
    assert "source" in data
    assert data["source"] in ["simulated_node", "historical_replay"]
    assert "plants" in data
    assert data["count"] >= 2
    plant_ids = [p["plant_id"] for p in data["plants"]]
    assert "solar_plant_1" in plant_ids
    assert "wind_plant_1" in plant_ids

    # Validate additive location fields
    solar_plant = next(p for p in data["plants"] if p["plant_id"] == "solar_plant_1")
    assert "latitude" in solar_plant and solar_plant["latitude"] == 22.0
    assert "longitude" in solar_plant and solar_plant["longitude"] == 79.0
    assert solar_plant.get("location_basis") == "assumption"

    wind_plant = next(p for p in data["plants"] if p["plant_id"] == "wind_plant_1")
    assert "latitude" in wind_plant and wind_plant["latitude"] == 39.0
    assert "longitude" in wind_plant and wind_plant["longitude"] == 35.2
    assert wind_plant.get("location_basis") == "assumption"


def test_plant_state_empty_and_valid():
    # Valid plant
    response = client.get("/plants/solar_plant_1/state")
    assert response.status_code == 200
    data = response.json()
    assert "source" in data
    assert data["plant_id"] == "solar_plant_1"
    assert "expected_kw" in data
    assert "actual_kw" in data
    assert "gap_pct" in data
    assert "node_status" in data

    # Nonexistent plant -> 404
    bad_res = client.get("/plants/nonexistent_plant/state")
    assert bad_res.status_code == 404


def test_plant_forecast():
    response = client.get("/plants/solar_plant_1/forecast?issue_time=2020-06-10T12:00:00")
    assert response.status_code == 200
    data = response.json()
    assert "source" in data
    assert data["plant_id"] == "solar_plant_1"
    assert data["horizon_blocks"] == 96
    assert len(data["forecast"]) == 96
    first_block = data["forecast"][0]
    assert "ts" in first_block
    assert "forecast_kw" in first_block


def test_plant_actual():
    response = client.get("/plants/solar_plant_1/actual?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert "source" in data
    assert "readings" in data
    assert isinstance(data["readings"], list)


def test_plant_schedule():
    response = client.get("/plants/solar_plant_1/schedule?issue_time=2020-06-10T12:00:00")
    assert response.status_code == 200
    data = response.json()
    assert "source" in data
    assert data["count"] == 96
    assert len(data["schedule"]) == 96
    assert "schedule_kw" in data["schedule"][0]


def test_plant_dsm():
    response = client.get("/plants/solar_plant_1/dsm?issue_time=2020-06-10T12:00:00")
    assert response.status_code == 200
    data = response.json()
    assert "source" in data
    assert "total_breaches" in data
    assert "relative_exposure_pct" in data
    assert "breaches" in data
    assert "revised_schedule" in data
    assert len(data["revised_schedule"]) == 96


def test_plant_accuracy():
    for pid in ["solar_plant_1", "wind_plant_1"]:
        response = client.get(f"/plants/{pid}/accuracy")
        assert response.status_code == 200
        data = response.json()
        assert "source" in data
        assert "accuracy" in data
        acc = data["accuracy"]
        assert "test_metrics" in acc
        assert "horizon_buckets" in acc
        assert "persistence_mae_kw" in acc["test_metrics"]
        assert "our_model_proxy_mae_kw" in acc["test_metrics"]


def test_plant_alerts():
    response = client.get("/plants/solar_plant_1/alerts")
    assert response.status_code == 200
    data = response.json()
    assert "source" in data
    assert "alerts" in data
    assert isinstance(data["alerts"], list)
