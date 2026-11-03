"""Unit tests for twin sync loop, soiling alert detection, and recalibration."""

import pytest
from app.twin.sync import process_telemetry
from app.twin.calibrate import recalibrate_solar, recalibrate_wind
from app import storage


def test_twin_sync_normal_telemetry():
    """Processing a telemetry block must save to readings and update twin state."""
    reading = {
        "plant_id": "solar_plant_1",
        "ts": "2026-06-10T12:00:00",
        "power_kw": 22000.0,
        "irradiance": 0.85,
        "module_temp": 42.0,
        "ambient_temp": 32.0,
        "pm25": 20.0,
        "pm10": 35.0,
    }
    result = process_telemetry(reading)
    assert result["status"] == "synced"
    assert result["plant_id"] == "solar_plant_1"
    assert result["actual_kw"] == 22000.0
    assert result["expected_kw"] > 0.0

    state = storage.get_twin_state("solar_plant_1")
    assert state is not None
    assert state["actual_kw"] == 22000.0
    assert state["expected_kw"] == result["expected_kw"]
    assert state["node_status"] == "online"


def test_soiling_alert_trigger():
    """Consecutive low actual-to-expected ratio with high PM must trigger a soiling alert."""
    plant_id = "solar_plant_1"
    # Feed 4 consecutive blocks where actual is significantly lower than clean expected (~20% drop) and PM is high
    for i in range(4):
        reading = {
            "plant_id": plant_id,
            "ts": f"2026-06-11T12:{i*15:02d}:00",
            "power_kw": 16000.0,  # ~16 MW instead of ~22 MW expected
            "irradiance": 0.85,
            "module_temp": 40.0,
            "pm25": 85.0,  # High PM2.5
            "pm10": 130.0, # High PM10
        }
        res = process_telemetry(reading)

    # Check alert in storage
    alerts = storage.get_alerts(plant_id, limit=10)
    soiling_alerts = [a for a in alerts if a.get("type") == "soiling"]
    assert len(soiling_alerts) > 0
    latest = soiling_alerts[0]
    assert "Soiling suspected" in latest["message"]
    assert latest["severity"] == "medium"
    assert latest["estimated_loss_pct"] > 5.0
    assert latest["cleaning_gain_kw"] > 0.0


def test_recalibrate_solar():
    """Recalibration must calculate updated PR and compare before/after errors."""
    fake_readings = [
        {"irradiance": 0.7, "module_temp": 35.0, "power_kw": 18000.0}
        for _ in range(12)
    ]
    res = recalibrate_solar(fake_readings, current_pr=0.9916)
    assert res["recalibrated"] is True
    assert "new_pr" in res
    assert "before_mae_kw" in res
    assert "after_mae_kw" in res
    assert res["after_mae_kw"] <= res["before_mae_kw"]
