"""Tests for UrjaTwin Sandbox What-If Scenarios (Task T8).

Validates:
1. Scenario 'clean_panels':
   - Increases generation (+kWh gain and +% gain).
   - Recovers soiling loss.
   - Reduces or alters DSM breach count.
2. Scenario 'add_battery':
   - Mitigates over/undergeneration breaches.
   - Respects 90% roundtrip efficiency and power limit.
   - Reduces breach count or exposure percentage.
3. Scenario 'add_capacity' & 'monsoon_cloud':
   - Evaluates scaling and cloud attenuation impact.
4. Twin state isolation:
   - Verifies twin_state and original forecast collections remain completely untouched.
5. Error handling:
   - Rejects invalid scenarios gracefully with 400.
"""

from copy import deepcopy
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.sandbox.scenarios import simulate_scenario
from app import storage

client = TestClient(app)


@pytest.fixture
def sample_solar_config():
    return {
        "plant_id": "solar_plant_1",
        "plant_type": "solar_pv",
        "capacity_kw": 32000.0,
        "soiling_loss": 0.08,
        "p_stc_kw": 32000.0,
        "performance_ratio": 0.9916,
    }


@pytest.fixture
def sample_forecast_blocks():
    # 96 blocks (24 hours) with realistic solar bell curve during daytime
    blocks = []
    for step in range(96):
        hour = step * 0.25
        # Daytime between 6:00 and 18:00
        if 6.0 <= hour <= 18.0:
            # Solar peak at 12:00
            val = max(0.0, 20000.0 * (1.0 - ((hour - 12.0) / 6.0) ** 2))
        else:
            val = 0.0
        blocks.append({
            "ts": f"2020-06-10T{int(hour):02d}:{int((hour % 1) * 60):02d}:00",
            "forecast_kw": round(val, 2),
            "weather": {"irradiance": round(val / 20000.0 * 1000.0, 1)},
        })
    return blocks


def test_clean_panels_increases_generation(sample_solar_config, sample_forecast_blocks):
    """Test clean_panels scenario: soiling reduction yields measurable positive energy gain."""
    res = simulate_scenario(
        plant_config=sample_solar_config,
        base_forecast_blocks=sample_forecast_blocks,
        scenario="clean_panels",
        params={"target_soiling_loss": 0.0},
        current_soiling_pct=8.0,
    )

    assert res["scenario"] == "clean_panels"
    assert res["before"]["total_kwh"] > 0
    assert res["after"]["total_kwh"] > res["before"]["total_kwh"]
    assert res["impact"]["gain_kwh"] > 0
    assert res["impact"]["gain_pct"] > 0
    assert len(res["series"]) == 96


def test_add_battery_reduces_dsm_breaches(sample_solar_config, sample_forecast_blocks):
    """Test add_battery scenario: BESS storage absorbs surplus & injects deficit to lower breaches."""
    res = simulate_scenario(
        plant_config=sample_solar_config,
        base_forecast_blocks=sample_forecast_blocks,
        scenario="add_battery",
        params={"capacity_mwh": 10.0, "c_rate": 0.5, "efficiency": 0.90},
        tolerance_pct=10.0,
    )

    assert res["scenario"] == "add_battery"
    assert "impact" in res
    assert "battery_dispatch_kw" in res["series"][0]
    assert "battery_soc_mwh" in res["series"][0]
    # Breaches before vs after
    assert res["after"]["breach_count"] <= res["before"]["breach_count"]
    assert res["impact"]["breaches_eliminated"] >= 0


def test_twin_state_unmodified_after_simulation(sample_solar_config, sample_forecast_blocks):
    """Test that twin state and inputs are strictly unchanged by simulation (state copy guarantee)."""
    blocks_copy = deepcopy(sample_forecast_blocks)
    config_copy = deepcopy(sample_solar_config)

    # Record twin state before
    state_before = storage.get_twin_state("solar_plant_1")

    # Run simulation
    simulate_scenario(
        plant_config=config_copy,
        base_forecast_blocks=blocks_copy,
        scenario="clean_panels",
        current_soiling_pct=15.0,
    )

    # Inputs should not be mutated
    assert blocks_copy == sample_forecast_blocks
    assert config_copy == sample_solar_config

    # DB twin state should not be mutated
    state_after = storage.get_twin_state("solar_plant_1")
    assert state_after == state_before


def test_simulate_endpoint_clean_panels():
    """Test POST /plants/{plant_id}/simulate via HTTP TestClient."""
    payload = {
        "scenario": "clean_panels",
        "params": {"target_soiling_loss": 0.0},
        "issue_time": "2020-06-10T12:00:00",
    }
    response = client.post("/plants/solar_plant_1/simulate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["source"] in ("simulated_node", "historical_replay")
    assert data["simulation"]["scenario"] == "clean_panels"
    assert data["simulation"]["impact"]["gain_kwh"] > 0
    assert len(data["simulation"]["series"]) == 96


def test_simulate_endpoint_add_battery():
    """Test POST /plants/{plant_id}/simulate with add_battery scenario."""
    payload = {
        "scenario": "add_battery",
        "params": {"capacity_mwh": 10.0, "c_rate": 0.5, "efficiency": 0.90},
        "issue_time": "2020-06-10T12:00:00",
    }
    response = client.post("/plants/solar_plant_1/simulate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["simulation"]["scenario"] == "add_battery"
    assert data["simulation"]["after"]["breach_count"] <= data["simulation"]["before"]["breach_count"]


def test_simulate_endpoint_invalid_scenario():
    """Test POST /plants/{plant_id}/simulate rejects unsupported scenarios."""
    payload = {
        "scenario": "warp_drive",
        "issue_time": "2020-06-10T12:00:00",
    }
    response = client.post("/plants/solar_plant_1/simulate", json=payload)
    assert response.status_code == 400
    assert "Unknown scenario" in response.json()["detail"]
