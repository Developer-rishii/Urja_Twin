"""Twin synchronization loop, soiling detection, and alert engine.

Step-by-step per 15-minute telemetry message:
1. Validate & store reading in MongoDB.
2. Twin sync:
   - Compute physics expected power.
   - Compare with actual power -> gap_pct = (actual - expected) / capacity * 100.
3. Soiling detection:
   - On daytime blocks (irradiance > 0.05 kW/m2), compute rolling ratio: actual / expected.
   - If ratio consistently below threshold (e.g. < 0.93 for >= 3 blocks) AND PM2.5/PM10 elevated,
     trigger alert "soiling suspected".
   - Compute estimated loss % and "cleaning se gain" (potential power regain in kW).
4. Update `twin_state` in MongoDB.
5. Trigger forecast refresh and update DSM breach check.
"""

from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional
import yaml
import numpy as np

from app.config import settings
from app import storage
from app.twin.physics import calculate_solar_power, calculate_wind_power
from app.forecast.service import forecast as run_forecast
from app.dsm.engine import check as run_dsm_check, default_schedule

PLANTS_DIR = Path(__file__).resolve().parent.parent.parent / "plants"


def _get_plant_config(plant_id: str) -> Dict[str, Any]:
    yaml_file = PLANTS_DIR / f"{plant_id}.yaml"
    if not yaml_file.exists():
        # Fallback defaults
        if "wind" in plant_id.lower():
            return {"plant_id": plant_id, "plant_type": "wind_turbine", "capacity_kw": 3600.0, "cp": 0.3313}
        return {"plant_id": plant_id, "plant_type": "solar_pv", "capacity_kw": 32000.0, "performance_ratio": 0.9916, "p_stc_kw": 32000.0}
    with open(yaml_file, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def process_telemetry(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Ingest a single telemetry message, run twin sync, soiling detection, and state update."""
    plant_id = payload.get("plant_id", "solar_plant_1")
    cfg = _get_plant_config(plant_id)
    plant_type = cfg.get("plant_type", "solar_pv")
    capacity_kw = float(cfg.get("capacity_kw", 32000.0))

    ts = payload.get("ts", datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S"))
    power_kw = float(payload.get("power_kw", 0.0))

    # Construct clean reading document
    reading_doc = {
        "plant_id": plant_id,
        "ts": ts,
        "power_kw": power_kw,
        "irradiance": float(payload.get("irradiance", 0.0)),
        "module_temp": float(payload.get("module_temp", 25.0)),
        "ambient_temp": float(payload.get("ambient_temp", 25.0)),
        "wind_speed": float(payload.get("wind_speed", 0.0)),
        "pressure": float(payload.get("pressure", 1013.25)),
        "pm25": float(payload.get("pm25", 25.0)),
        "pm10": float(payload.get("pm10", 45.0)),
        "source": payload.get("source", settings.DATA_SOURCE_LABEL),
    }
    storage.insert_reading(reading_doc)

    # 1. Twin Sync: Calculate physics expected power
    prev_state = storage.get_twin_state(plant_id) or {}
    pr = float(prev_state.get("pr", cfg.get("performance_ratio", 0.9916)))
    cp = float(prev_state.get("cp", cfg.get("cp", 0.3313)))
    soiling_loss = float(prev_state.get("soiling_loss", cfg.get("soiling_loss", 0.0)))

    if plant_type == "solar_pv":
        expected_kw = calculate_solar_power(
            irradiance=reading_doc["irradiance"],
            module_temp=reading_doc["module_temp"],
            p_stc_kw=cfg.get("p_stc_kw", 32000.0),
            gamma=cfg.get("gamma", -0.004),
            pr=pr,
            l_soil=soiling_loss,
        )
    else:
        expected_kw = calculate_wind_power(
            wind_speed=reading_doc["wind_speed"],
            p_rated_kw=cfg.get("p_rated_kw", 3600.0),
            rotor_area_m2=cfg.get("rotor_area_m2", 10207.03),
            cp=cp,
            v_cut_in=cfg.get("v_cut_in_mps", 3.0),
            v_cut_out=cfg.get("v_cut_out_mps", 25.0),
        )

    expected_kw = round(float(expected_kw), 2)
    gap_kw = round(power_kw - expected_kw, 2)
    gap_pct = round((gap_kw / capacity_kw) * 100.0, 2)

    # 2. Soiling Detection (for Solar plants)
    soiling_alert_triggered = False
    soiling_loss_pct = round(soiling_loss * 100.0, 2)
    cleaning_gain_kw = 0.0

    if plant_type == "solar_pv":
        # Check recent daytime readings to establish ratio trend
        recent_readings = storage.get_recent_readings(plant_id, limit=8)
        daytime_ratios = []
        for r in recent_readings:
            irr = r.get("irradiance", 0.0)
            act = r.get("power_kw", 0.0)
            if irr > 0.05 and act > 0.0:
                clean_exp = calculate_solar_power(
                    irradiance=irr,
                    module_temp=r.get("module_temp", 25.0),
                    p_stc_kw=cfg.get("p_stc_kw", 32000.0),
                    gamma=cfg.get("gamma", -0.004),
                    pr=pr,
                    l_soil=0.0,
                )
                if clean_exp > 10.0:
                    daytime_ratios.append(act / clean_exp)

        # High PM threshold or dust accumulation
        is_high_pm = reading_doc["pm25"] > 60.0 or reading_doc["pm10"] > 100.0

        if len(daytime_ratios) >= 3:
            avg_ratio = float(np.mean(daytime_ratios[-4:]))
            if avg_ratio < 0.93 and (is_high_pm or avg_ratio < 0.88):
                soiling_loss_fraction = max(0.0, 1.0 - avg_ratio)
                soiling_loss_pct = round(soiling_loss_fraction * 100.0, 2)
                cleaning_gain_kw = round(expected_kw * soiling_loss_fraction, 2)

                # Insert soiling alert
                alert_doc = {
                    "plant_id": plant_id,
                    "type": "soiling",
                    "ts": ts,
                    "message": f"Soiling suspected: performance ratio dropped to {avg_ratio:.2f} (estimated {soiling_loss_pct}% loss). Cleaning gain: +{cleaning_gain_kw:,.1f} kW.",
                    "severity": "medium",
                    "estimated_loss_pct": soiling_loss_pct,
                    "cleaning_gain_kw": cleaning_gain_kw,
                }
                storage.insert_alert(alert_doc)
                soiling_alert_triggered = True

    # 3. Forecast refresh and DSM check update
    try:
        fc = run_forecast(plant_id, ts)
        sched = default_schedule(fc)
        dsm_res = run_dsm_check(fc, sched, capacity_kw=capacity_kw, tol_pct=settings.DSM_TOLERANCE_PCT)
        if dsm_res["total_breaches"] > 0:
            breach_alert = {
                "plant_id": plant_id,
                "type": "dsm_breach",
                "ts": ts,
                "message": f"DSM breach alert: {dsm_res['total_breaches']} blocks breach tolerance band ({settings.DSM_TOLERANCE_PCT}%). Exposure: {dsm_res['relative_exposure_pct']}%.",
                "severity": "high",
                "total_breaches": dsm_res["total_breaches"],
                "relative_exposure_pct": dsm_res["relative_exposure_pct"],
            }
            storage.insert_alert(breach_alert)
    except Exception:
        pass

    # 4. Upsert Twin State
    new_state = {
        "plant_id": plant_id,
        "plant_type": plant_type,
        "capacity_kw": capacity_kw,
        "last_ts": ts,
        "actual_kw": power_kw,
        "expected_kw": expected_kw,
        "gap_kw": gap_kw,
        "gap_pct": gap_pct,
        "soiling_loss_pct": soiling_loss_pct,
        "cleaning_gain_kw": cleaning_gain_kw,
        "pr": pr,
        "cp": cp,
        "node_status": "online",
        "last_synced_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S"),
        "source": settings.DATA_SOURCE_LABEL,
    }
    storage.upsert_twin_state(plant_id, new_state)

    return {
        "status": "synced",
        "plant_id": plant_id,
        "ts": ts,
        "actual_kw": power_kw,
        "expected_kw": expected_kw,
        "gap_pct": gap_pct,
        "soiling_alert": soiling_alert_triggered,
    }
