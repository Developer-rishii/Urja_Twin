"""REST API endpoints for UrjaTwin.

Endpoints:
- GET /plants (list of configured solar and wind plants)
- GET /plants/{id}/state (latest reading, expected, actual, soiling estimate, node status)
- GET /plants/{id}/forecast (96 blocks)
- GET /plants/{id}/actual (recent blocks)
- GET /plants/{id}/schedule (scheduled blocks)
- GET /plants/{id}/dsm (breach blocks + revised schedule)
- GET /plants/{id}/accuracy (measured results from ml/results.md as JSON)
- GET /plants/{id}/alerts (recent alerts)

Rules:
- Every endpoint returns a `source` field: 'historical_replay' or 'simulated_node'.
- Missing data returns empty list/dict with a clear message, never a 500 error.
- DSM tolerance read from settings.DSM_TOLERANCE_PCT.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional
import yaml
from fastapi import APIRouter, HTTPException, Query

from app.config import settings
from app import storage
from app.twin.physics import calculate_solar_power, calculate_wind_power
from app.forecast.service import forecast as run_forecast
from app.dsm.engine import check, revise, default_schedule
from app.sandbox.scenarios import simulate_scenario
from pydantic import BaseModel, Field

router = APIRouter(prefix="/plants", tags=["Plants"])

PLANTS_DIR = Path(__file__).resolve().parent.parent.parent / "plants"


def _load_plant_config(plant_id: str) -> Dict[str, Any]:
    yaml_file = PLANTS_DIR / f"{plant_id}.yaml"
    if not yaml_file.exists():
        raise HTTPException(status_code=404, detail=f"Plant '{plant_id}' not found")
    with open(yaml_file, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


@router.get("", response_model=Dict[str, Any])
def list_plants():
    """List all available plants with capacity and metadata."""
    plants = []
    if PLANTS_DIR.exists():
        for yf in sorted(PLANTS_DIR.glob("*.yaml")):
            try:
                with open(yf, "r", encoding="utf-8") as f:
                    cfg = yaml.safe_load(f)
                    plants.append({
                        "plant_id": cfg.get("plant_id"),
                        "plant_type": cfg.get("plant_type"),
                        "location": cfg.get("location"),
                        "capacity_kw": cfg.get("capacity_kw"),
                        "dsm_tolerance_pct": settings.DSM_TOLERANCE_PCT,
                    })
            except Exception:
                continue

    return {
        "source": settings.DATA_SOURCE_LABEL,
        "count": len(plants),
        "plants": plants,
    }


@router.get("/{plant_id}/state")
def get_plant_state(plant_id: str):
    """Get current digital twin state: latest reading, expected, actual, soiling estimate, node status."""
    cfg = _load_plant_config(plant_id)
    state = storage.get_twin_state(plant_id)
    latest_reading = storage.get_latest_reading(plant_id)

    if not state and not latest_reading:
        # Graceful empty state when no telemetry has arrived yet
        return {
            "source": settings.DATA_SOURCE_LABEL,
            "plant_id": plant_id,
            "plant_type": cfg.get("plant_type"),
            "capacity_kw": cfg.get("capacity_kw"),
            "last_ts": None,
            "expected_kw": 0.0,
            "actual_kw": 0.0,
            "gap_pct": 0.0,
            "soiling_loss_pct": cfg.get("soiling_loss", 0.0) * 100.0,
            "node_status": "offline",
            "message": "No telemetry readings recorded yet for this plant.",
        }

    actual = float(latest_reading.get("power_kw", 0.0)) if latest_reading else 0.0
    ts = latest_reading.get("ts") if latest_reading else None

    # Compute instantaneous physics expected power if not already cached in twin_state
    expected = state.get("expected_kw") if state else None
    if expected is None and latest_reading:
        if cfg.get("plant_type") == "solar_pv":
            expected = calculate_solar_power(
                irradiance=latest_reading.get("irradiance", 0.0),
                module_temp=latest_reading.get("module_temp", 25.0),
                p_stc_kw=cfg.get("p_stc_kw", 32000.0),
                gamma=cfg.get("gamma", -0.004),
                pr=cfg.get("performance_ratio", 0.9916),
                l_soil=cfg.get("soiling_loss", 0.0),
            )
        else:
            expected = calculate_wind_power(
                wind_speed=latest_reading.get("wind_speed", 0.0),
                p_rated_kw=cfg.get("p_rated_kw", 3600.0),
                rotor_area_m2=cfg.get("rotor_area_m2", 10207.03),
                cp=cfg.get("cp", 0.3313),
                v_cut_in=cfg.get("v_cut_in_mps", 3.0),
                v_cut_out=cfg.get("v_cut_out_mps", 25.0),
            )

    expected = round(float(expected or 0.0), 2)
    gap_pct = round(((actual - expected) / cfg.get("capacity_kw", 1.0)) * 100.0, 2)

    return {
        "source": settings.DATA_SOURCE_LABEL,
        "plant_id": plant_id,
        "plant_type": cfg.get("plant_type"),
        "capacity_kw": cfg.get("capacity_kw"),
        "last_ts": ts,
        "expected_kw": expected,
        "actual_kw": actual,
        "gap_pct": gap_pct,
        "soiling_loss_pct": round(float(state.get("soiling_loss_pct", 0.0)), 2) if state else 0.0,
        "node_status": state.get("node_status", "online") if state else "online",
        "message": "Twin state active.",
    }


@router.get("/{plant_id}/forecast")
def get_plant_forecast(
    plant_id: str,
    issue_time: Optional[str] = Query(None, description="ISO timestamp for issue time (e.g. 2020-06-10T12:00:00)"),
):
    """Get 96-block (24h ahead) generation forecast."""
    cfg = _load_plant_config(plant_id)

    # Use specified issue_time or latest telemetry timestamp or dataset default
    if not issue_time:
        latest = storage.get_latest_reading(plant_id)
        if latest and "ts" in latest:
            issue_time = latest["ts"]
        else:
            # Default replay issue dates from test set
            issue_time = "2020-06-10T12:00:00" if cfg.get("plant_type") == "solar_pv" else "2018-10-15T06:00:00"

    try:
        blocks = run_forecast(plant_id, issue_time)
        return {
            "source": settings.DATA_SOURCE_LABEL,
            "plant_id": plant_id,
            "issue_time": issue_time,
            "horizon_blocks": len(blocks),
            "forecast": blocks,
            "message": "96-block generation forecast generated successfully.",
        }
    except Exception as e:
        return {
            "source": settings.DATA_SOURCE_LABEL,
            "plant_id": plant_id,
            "issue_time": issue_time,
            "horizon_blocks": 0,
            "forecast": [],
            "message": f"Unable to generate forecast: {str(e)}",
        }


@router.get("/{plant_id}/actual")
def get_plant_actual(
    plant_id: str,
    limit: int = Query(96, ge=1, le=500, description="Number of recent 15-min blocks"),
):
    """Get recent historical telemetry readings."""
    _load_plant_config(plant_id)
    readings = storage.get_recent_readings(plant_id, limit=limit)
    return {
        "source": settings.DATA_SOURCE_LABEL,
        "plant_id": plant_id,
        "count": len(readings),
        "readings": readings,
        "message": f"Retrieved {len(readings)} recent telemetry blocks." if readings else "No telemetry readings available.",
    }


@router.get("/{plant_id}/schedule")
def get_plant_schedule(
    plant_id: str,
    issue_time: Optional[str] = Query(None, description="ISO timestamp for issue time"),
):
    """Get coarse baseline generation schedule (3-hour block average)."""
    cfg = _load_plant_config(plant_id)
    if not issue_time:
        issue_time = "2020-06-10T12:00:00" if cfg.get("plant_type") == "solar_pv" else "2018-10-15T06:00:00"

    try:
        fc = run_forecast(plant_id, issue_time)
        sched = default_schedule(fc)
        return {
            "source": settings.DATA_SOURCE_LABEL,
            "plant_id": plant_id,
            "issue_time": issue_time,
            "count": len(sched),
            "schedule": sched,
            "method": "3-hour coarse block average",
            "message": "Baseline schedule computed.",
        }
    except Exception as e:
        return {
            "source": settings.DATA_SOURCE_LABEL,
            "plant_id": plant_id,
            "issue_time": issue_time,
            "count": 0,
            "schedule": [],
            "message": f"Unable to generate schedule: {str(e)}",
        }


@router.get("/{plant_id}/dsm")
def get_plant_dsm(
    plant_id: str,
    issue_time: Optional[str] = Query(None, description="ISO timestamp for issue time"),
):
    """Check DSM tolerance breaches and calculate suggested revised schedule."""
    cfg = _load_plant_config(plant_id)
    capacity_kw = float(cfg.get("capacity_kw", 32000.0))
    tol_pct = float(settings.DSM_TOLERANCE_PCT)

    if not issue_time:
        issue_time = "2020-06-10T12:00:00" if cfg.get("plant_type") == "solar_pv" else "2018-10-15T06:00:00"

    try:
        fc = run_forecast(plant_id, issue_time)
        sched = default_schedule(fc)
        dsm_res = check(fc, sched, capacity_kw=capacity_kw, tol_pct=tol_pct)
        revised = revise(fc, sched, capacity_kw=capacity_kw, tol_pct=tol_pct)

        return {
            "source": settings.DATA_SOURCE_LABEL,
            "plant_id": plant_id,
            "issue_time": issue_time,
            "capacity_kw": capacity_kw,
            "tolerance_pct": tol_pct,
            "tolerance_band_kw": (tol_pct / 100.0) * capacity_kw,
            "total_blocks": len(fc),
            "total_breaches": dsm_res["total_breaches"],
            "relative_exposure_pct": dsm_res["relative_exposure_pct"],
            "breaches": dsm_res["breaches"],
            "revised_schedule": revised,
            "message": "DSM breach analysis and schedule revision complete.",
        }
    except Exception as e:
        return {
            "source": settings.DATA_SOURCE_LABEL,
            "plant_id": plant_id,
            "issue_time": issue_time,
            "capacity_kw": capacity_kw,
            "tolerance_pct": tol_pct,
            "total_breaches": 0,
            "relative_exposure_pct": 0.0,
            "breaches": [],
            "revised_schedule": [],
            "message": f"DSM check could not be completed: {str(e)}",
        }


@router.get("/{plant_id}/accuracy")
def get_plant_accuracy(plant_id: str):
    """Return benchmark evaluation metrics from ml/results.md in JSON format."""
    cfg = _load_plant_config(plant_id)
    is_solar = cfg.get("plant_type") == "solar_pv"

    # Measured benchmark metrics from Task T3 & T3b
    if is_solar:
        accuracy_data = {
            "plant_id": plant_id,
            "plant_type": "solar_pv",
            "capacity_kw": 32000.0,
            "split_date": "2020-06-09",
            "selected_model": "LightGBM + Physics Residual (Variant b)",
            "test_metrics": {
                "persistence_mae_kw": 8180.70,
                "yesterday_mae_kw": 1872.86,
                "physics_only_mae_kw": 274.00,
                "no_future_weather_mae_kw": 1571.18,
                "our_model_proxy_mae_kw": 206.88,
                "our_model_proxy_rmse_kw": 474.40,
                "our_model_mae_pct_capacity": 0.65,
                "our_model_noise_10_mae_kw": 493.33,
                "our_model_noise_20_mae_kw": 899.87,
                "improvement_vs_best_baseline_pct": 88.95,
            },
            "horizon_buckets": [
                {"bucket": "1-4", "hours": "0.25 - 1.0 hr", "model_mae_kw": 199.87, "no_weather_mae_kw": 1464.89},
                {"bucket": "5-16", "hours": "1.25 - 4.0 hr", "model_mae_kw": 199.83, "no_weather_mae_kw": 1525.14},
                {"bucket": "17-48", "hours": "4.25 - 12.0 hr", "model_mae_kw": 201.47, "no_weather_mae_kw": 1562.78},
                {"bucket": "49-96", "hours": "12.25 - 24.0 hr", "model_mae_kw": 212.83, "no_weather_mae_kw": 1597.14},
            ],
            "caveat": "Future weather at target step t+h serves as an optimistic forecast proxy from historical telemetry.",
        }
    else:
        accuracy_data = {
            "plant_id": plant_id,
            "plant_type": "wind_turbine",
            "capacity_kw": 3600.0,
            "split_date": "2018-10-01",
            "selected_model": "LightGBM Direct Power (Variant a)",
            "test_metrics": {
                "persistence_mae_kw": 840.01,
                "yesterday_mae_kw": 1175.85,
                "physics_only_mae_kw": 231.94,
                "no_future_weather_mae_kw": 861.98,
                "our_model_proxy_mae_kw": 189.47,
                "our_model_proxy_rmse_kw": 381.75,
                "our_model_mae_pct_capacity": 5.26,
                "our_model_noise_10_mae_kw": 279.98,
                "our_model_noise_20_mae_kw": 415.08,
                "improvement_vs_best_baseline_pct": 77.44,
            },
            "horizon_buckets": [
                {"bucket": "1-4", "hours": "0.25 - 1.0 hr", "model_mae_kw": 144.93, "no_weather_mae_kw": 358.07},
                {"bucket": "5-16", "hours": "1.25 - 4.0 hr", "model_mae_kw": 161.64, "no_weather_mae_kw": 511.42},
                {"bucket": "17-48", "hours": "4.25 - 12.0 hr", "model_mae_kw": 185.47, "no_weather_mae_kw": 800.85},
                {"bucket": "49-96", "hours": "12.25 - 24.0 hr", "model_mae_kw": 202.81, "no_weather_mae_kw": 1032.37},
            ],
            "caveat": "Future wind speed at target step t+h serves as an optimistic forecast proxy from historical telemetry.",
        }

    return {
        "source": settings.DATA_SOURCE_LABEL,
        "accuracy": accuracy_data,
        "message": "Accuracy benchmarks loaded.",
    }


@router.get("/{plant_id}/alerts")
def get_plant_alerts(
    plant_id: str,
    limit: int = Query(50, ge=1, le=200, description="Max number of alerts"),
):
    """Get recent operational, soiling, and DSM breach alerts."""
    _load_plant_config(plant_id)
    alerts = storage.get_alerts(plant_id, limit=limit)
    return {
        "source": settings.DATA_SOURCE_LABEL,
        "plant_id": plant_id,
        "count": len(alerts),
        "alerts": alerts,
        "message": f"Retrieved {len(alerts)} alerts." if alerts else "No alerts found.",
    }


class SimulateRequest(BaseModel):
    scenario: str = Field(..., description="clean_panels | add_battery | add_capacity | monsoon_cloud")
    params: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Scenario parameters")
    issue_time: Optional[str] = Field(None, description="Optional forecast issue time ISO string")


@router.post("/{plant_id}/simulate")
def simulate_plant_scenario(plant_id: str, request: SimulateRequest):
    """Run what-if sandbox simulation on a detached copy of digital twin state.

    Guarantees:
    - Never mutates plant twin state, database collections, or live telemetry.
    - Supported scenarios: clean_panels, add_battery, add_capacity, monsoon_cloud.
    """
    cfg = _load_plant_config(plant_id)

    # 1. Obtain baseline 96-block forecast (from DB or ML forecaster)
    issue_time = request.issue_time
    blocks = None
    if not issue_time:
        latest = storage.get_latest_reading(plant_id)
        if latest and "ts" in latest:
            issue_time = latest["ts"]
        else:
            issue_time = "2020-06-10T12:00:00" if cfg.get("plant_type") == "solar_pv" else "2018-10-15T06:00:00"

    try:
        blocks = run_forecast(plant_id, issue_time=issue_time)
    except Exception:
        blocks = None

    if not blocks:
        raise HTTPException(
            status_code=400,
            detail=f"No baseline forecast available for plant '{plant_id}' to run sandbox simulation.",
        )

    # 2. Get current twin state to read active soiling estimate (for solar)
    twin_state = storage.get_twin_state(plant_id) or {}
    current_soiling_pct = twin_state.get("soiling_loss_pct", None)

    # 3. Run sandbox simulation on a deepcopy inside simulate_scenario
    try:
        sim_result = simulate_scenario(
            plant_config=cfg,
            base_forecast_blocks=blocks,
            scenario=request.scenario,
            params=request.params,
            tolerance_pct=settings.DSM_TOLERANCE_PCT,
            current_soiling_pct=current_soiling_pct,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")

    return {
        "source": settings.DATA_SOURCE_LABEL,
        "simulation": sim_result,
        "message": "Sandbox simulation completed successfully on isolated twin copy.",
    }
