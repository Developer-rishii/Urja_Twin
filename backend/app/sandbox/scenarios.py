"""UrjaTwin Sandbox Scenarios Engine.

Allows plant operators and jury to run "what-if" simulations on renewable digital twins:
1. `clean_panels`: Simulates restorative solar panel cleaning by setting soiling loss to 0%,
   recomputing physical expected generation across the forecast horizon, and reporting total
   kWh gain and % improvement.
2. `add_battery`: Simulates dispatching a BESS (Battery Energy Storage System) with given capacity (MWh)
   to absorb overgeneration and discharge during undergeneration breaches relative to schedule.
3. `add_capacity`: Simulates plant expansion by increasing nameplate capacity by capacity_pct.
4. `monsoon_cloud`: Simulates heavy monsoon cloud cover (e.g. 60% irradiance attenuation for 6 hours).

CRITICAL RULE:
Twin original state and database collections MUST NEVER be modified by sandbox executions.
All computations run strictly in-memory on decoupled copies of forecasts/twin parameters.
"""

from copy import deepcopy
from typing import Any, Dict, List, Optional
import numpy as np

from app.twin.physics import calculate_solar_power, calculate_wind_power
from app.dsm.engine import check, default_schedule


def simulate_scenario(
    plant_config: Dict[str, Any],
    base_forecast_blocks: List[Dict[str, Any]],
    scenario: str,
    params: Optional[Dict[str, Any]] = None,
    tolerance_pct: float = 10.0,
    current_soiling_pct: Optional[float] = None,
) -> Dict[str, Any]:
    """Execute what-if sandbox simulation on a detached copy of plant forecast.

    Args:
        plant_config: Dict loaded from plant YAML (read-only)
        base_forecast_blocks: List of 96 forecast dicts [{'ts': ..., 'forecast_kw': ...}]
        scenario: 'clean_panels' | 'add_battery' | 'add_capacity' | 'monsoon_cloud'
        params: Optional scenario parameters
        tolerance_pct: DSM tolerance band percentage
        current_soiling_pct: Current soiling loss percentage (e.g. 8.0 for 8%)

    Returns:
        Structured result containing:
        - scenario
        - plant_id
        - assumptions
        - before: summary and block metrics
        - after: summary and block metrics
        - impact: delta metrics (e.g., kWh gained, breaches eliminated)
        - series: list of {ts, schedule_kw, before_kw, after_kw, battery_dispatch_kw (if battery), ...}
    """
    params = params or {}
    plant_id = plant_config.get("plant_id", "plant")
    plant_type = plant_config.get("plant_type", "solar_pv")
    capacity_kw = float(plant_config.get("capacity_kw", 1000.0))

    if not base_forecast_blocks:
        return {
            "scenario": scenario,
            "plant_id": plant_id,
            "error": "No baseline forecast blocks provided for simulation.",
            "before": {"total_kwh": 0.0, "breach_count": 0},
            "after": {"total_kwh": 0.0, "breach_count": 0},
            "series": [],
        }

    # Deep copy input data to guarantee 100% isolation of twin state
    blocks_copy = deepcopy(base_forecast_blocks)
    
    # Generate reference schedule using default_schedule
    schedule_blocks = default_schedule(blocks_copy)
    sched_map = {b["ts"]: float(b["schedule_kw"]) for b in schedule_blocks}

    # Initial DSM breach evaluation
    dsm_before = check(
        forecast_blocks=blocks_copy,
        schedule_blocks=schedule_blocks,
        capacity_kw=capacity_kw,
        tol_pct=tolerance_pct,
    )

    before_total_kwh = float(sum(float(b.get("forecast_kw", 0.0)) for b in blocks_copy) * 0.25)

    if scenario == "clean_panels":
        return _simulate_clean_panels(
            plant_config=plant_config,
            blocks=blocks_copy,
            schedule_blocks=schedule_blocks,
            sched_map=sched_map,
            capacity_kw=capacity_kw,
            tolerance_pct=tolerance_pct,
            before_total_kwh=before_total_kwh,
            dsm_before=dsm_before,
            params=params,
            current_soiling_pct=current_soiling_pct,
        )

    elif scenario == "add_battery":
        return _simulate_add_battery(
            plant_config=plant_config,
            blocks=blocks_copy,
            schedule_blocks=schedule_blocks,
            sched_map=sched_map,
            capacity_kw=capacity_kw,
            tolerance_pct=tolerance_pct,
            before_total_kwh=before_total_kwh,
            dsm_before=dsm_before,
            params=params,
        )

    elif scenario == "add_capacity":
        return _simulate_add_capacity(
            plant_config=plant_config,
            blocks=blocks_copy,
            schedule_blocks=schedule_blocks,
            capacity_kw=capacity_kw,
            tolerance_pct=tolerance_pct,
            before_total_kwh=before_total_kwh,
            dsm_before=dsm_before,
            params=params,
        )

    elif scenario == "monsoon_cloud":
        return _simulate_monsoon_cloud(
            plant_config=plant_config,
            blocks=blocks_copy,
            schedule_blocks=schedule_blocks,
            capacity_kw=capacity_kw,
            tolerance_pct=tolerance_pct,
            before_total_kwh=before_total_kwh,
            dsm_before=dsm_before,
            params=params,
        )

    else:
        raise ValueError(
            f"Unknown scenario '{scenario}'. Supported: 'clean_panels', 'add_battery', 'add_capacity', 'monsoon_cloud'"
        )


def _simulate_clean_panels(
    plant_config: Dict[str, Any],
    blocks: List[Dict[str, Any]],
    schedule_blocks: List[Dict[str, Any]],
    sched_map: Dict[str, float],
    capacity_kw: float,
    tolerance_pct: float,
    before_total_kwh: float,
    dsm_before: Dict[str, Any],
    params: Dict[str, Any],
    current_soiling_pct: Optional[float],
) -> Dict[str, Any]:
    """Scenario 1: Clean panels to eliminate soiling loss (soiling_loss -> 0.0)."""
    nominal_soiling = float(plant_config.get("soiling_loss", 0.08))
    active_soiling = (current_soiling_pct / 100.0) if current_soiling_pct is not None else nominal_soiling
    target_soiling = float(params.get("target_soiling_loss", 0.0))  # 0.0 means fully clean

    # Clean multiplier: (1 - target) / (1 - active)
    multiplier = (1.0 - target_soiling) / max(0.01, (1.0 - active_soiling))

    after_blocks = []
    series_output = []

    for b in blocks:
        ts = b.get("ts")
        base_kw = float(b.get("forecast_kw", 0.0))
        cleaned_kw = min(capacity_kw, round(base_kw * multiplier, 2)) if base_kw > 0 else 0.0
        
        after_blocks.append({"ts": ts, "forecast_kw": cleaned_kw})
        series_output.append({
            "ts": ts,
            "schedule_kw": sched_map.get(ts, 0.0),
            "before_kw": round(base_kw, 2),
            "after_kw": cleaned_kw,
        })

    after_total_kwh = float(sum(b["forecast_kw"] for b in after_blocks) * 0.25)
    gain_kwh = max(0.0, round(after_total_kwh - before_total_kwh, 2))
    gain_pct = round((gain_kwh / max(1.0, before_total_kwh)) * 100.0, 2)

    dsm_after = check(
        forecast_blocks=after_blocks,
        schedule_blocks=schedule_blocks,
        capacity_kw=capacity_kw,
        tol_pct=tolerance_pct,
    )

    breaches_eliminated = max(0, dsm_before["total_breaches"] - dsm_after["total_breaches"])

    return {
        "scenario": "clean_panels",
        "plant_id": plant_config.get("plant_id"),
        "assumptions": [
            f"Pre-clean soiling loss assumed at {active_soiling * 100:.1f}%.",
            f"Post-clean residual soiling assumed at {target_soiling * 100:.1f}%.",
            "Inverter clip limit applied at plant nameplate capacity.",
        ],
        "params": {
            "active_soiling_pct": round(active_soiling * 100, 2),
            "target_soiling_pct": round(target_soiling * 100, 2),
        },
        "before": {
            "total_kwh": round(before_total_kwh, 2),
            "breach_count": dsm_before["total_breaches"],
            "relative_exposure_pct": dsm_before["relative_exposure_pct"],
        },
        "after": {
            "total_kwh": round(after_total_kwh, 2),
            "breach_count": dsm_after["total_breaches"],
            "relative_exposure_pct": dsm_after["relative_exposure_pct"],
        },
        "impact": {
            "gain_kwh": gain_kwh,
            "gain_pct": gain_pct,
            "breaches_eliminated": breaches_eliminated,
        },
        "summary": (
            f"Washing panels recovers {gain_kwh:,.1f} kWh (+{gain_pct}%) generation "
            f"and reduces DSM breach blocks from {dsm_before['total_breaches']} to {dsm_after['total_breaches']}."
        ),
        "series": series_output,
    }


def _simulate_add_battery(
    plant_config: Dict[str, Any],
    blocks: List[Dict[str, Any]],
    schedule_blocks: List[Dict[str, Any]],
    sched_map: Dict[str, float],
    capacity_kw: float,
    tolerance_pct: float,
    before_total_kwh: float,
    dsm_before: Dict[str, Any],
    params: Dict[str, Any],
) -> Dict[str, Any]:
    """Scenario 2: Add battery storage (BESS) for peak shifting and DSM breach mitigation."""
    capacity_mwh = float(params.get("capacity_mwh", 5.0))  # Default 5 MWh
    c_rate = float(params.get("c_rate", 0.5))              # Max power = capacity_mwh * c_rate in MW
    rt_efficiency = float(params.get("efficiency", 0.90))  # 90% round-trip efficiency
    initial_soc_pct = float(params.get("initial_soc_pct", 50.0))  # 50% initial state of charge

    max_storage_kwh = capacity_mwh * 1000.0
    max_power_kw = max_storage_kwh * c_rate
    soc_kwh = max_storage_kwh * (initial_soc_pct / 100.0)

    # Square root of round trip efficiency applied on each conversion
    one_way_eff = rt_efficiency ** 0.5

    tol_kw = capacity_kw * (tolerance_pct / 100.0)
    after_blocks = []
    series_output = []

    for b in blocks:
        ts = b.get("ts")
        fc_kw = float(b.get("forecast_kw", 0.0))
        sched_kw = sched_map.get(ts, 0.0)

        upper_bound = sched_kw + tol_kw
        lower_bound = max(0.0, sched_kw - tol_kw)

        battery_power_kw = 0.0  # Positive = discharging, Negative = charging

        if fc_kw > upper_bound:
            # Overgeneration: surplus energy above upper tolerance band -> charge battery
            surplus_kw = fc_kw - upper_bound
            charge_power_kw = min(surplus_kw, max_power_kw)
            headroom_kwh = max_storage_kwh - soc_kwh
            max_chargeable_kw = (headroom_kwh / 0.25) / one_way_eff if headroom_kwh > 0 else 0.0

            actual_charge_kw = min(charge_power_kw, max_chargeable_kw)
            energy_into_battery_kwh = actual_charge_kw * 0.25 * one_way_eff
            soc_kwh = min(max_storage_kwh, soc_kwh + energy_into_battery_kwh)
            battery_power_kw = -actual_charge_kw

        elif fc_kw < lower_bound:
            # Undergeneration: deficit energy below lower tolerance band -> discharge battery
            deficit_kw = lower_bound - fc_kw
            discharge_power_kw = min(deficit_kw, max_power_kw)
            available_kwh = soc_kwh
            max_dischargeable_kw = (available_kwh / 0.25) * one_way_eff if available_kwh > 0 else 0.0

            actual_discharge_kw = min(discharge_power_kw, max_dischargeable_kw)
            energy_from_battery_kwh = (actual_discharge_kw * 0.25) / one_way_eff
            soc_kwh = max(0.0, soc_kwh - energy_from_battery_kwh)
            battery_power_kw = actual_discharge_kw

        net_delivered_kw = max(0.0, round(fc_kw + battery_power_kw, 2))
        after_blocks.append({"ts": ts, "forecast_kw": net_delivered_kw})

        series_output.append({
            "ts": ts,
            "schedule_kw": round(sched_kw, 2),
            "before_kw": round(fc_kw, 2),
            "after_kw": net_delivered_kw,
            "battery_dispatch_kw": round(battery_power_kw, 2),
            "battery_soc_mwh": round(soc_kwh / 1000.0, 3),
        })

    after_total_kwh = float(sum(b["forecast_kw"] for b in after_blocks) * 0.25)

    dsm_after = check(
        forecast_blocks=after_blocks,
        schedule_blocks=schedule_blocks,
        capacity_kw=capacity_kw,
        tol_pct=tolerance_pct,
    )

    breaches_eliminated = max(0, dsm_before["total_breaches"] - dsm_after["total_breaches"])
    exposure_reduction_pct = round(
        max(0.0, dsm_before["relative_exposure_pct"] - dsm_after["relative_exposure_pct"]), 2
    )

    return {
        "scenario": "add_battery",
        "plant_id": plant_config.get("plant_id"),
        "assumptions": [
            f"BESS storage capacity: {capacity_mwh:.1f} MWh, {c_rate}C max power rate.",
            f"Round-trip efficiency: {rt_efficiency * 100:.1f}% (symmetric charge/discharge losses).",
            f"Initial SoC at {initial_soc_pct:.0f}%.",
            f"Automated DSM buffer dispatch targeting the ±{tolerance_pct}% band.",
        ],
        "params": {
            "capacity_mwh": capacity_mwh,
            "c_rate": c_rate,
            "efficiency": rt_efficiency,
            "initial_soc_pct": initial_soc_pct,
        },
        "before": {
            "total_kwh": round(before_total_kwh, 2),
            "breach_count": dsm_before["total_breaches"],
            "relative_exposure_pct": dsm_before["relative_exposure_pct"],
        },
        "after": {
            "total_kwh": round(after_total_kwh, 2),
            "breach_count": dsm_after["total_breaches"],
            "relative_exposure_pct": dsm_after["relative_exposure_pct"],
        },
        "impact": {
            "breaches_eliminated": breaches_eliminated,
            "exposure_reduction_pct": exposure_reduction_pct,
            "final_soc_mwh": round(soc_kwh / 1000.0, 3),
        },
        "summary": (
            f"A {capacity_mwh:.1f} MWh BESS mitigates {breaches_eliminated} DSM breach blocks "
            f"(reducing breaches from {dsm_before['total_breaches']} to {dsm_after['total_breaches']}) "
            f"and lowers relative penalty exposure by {exposure_reduction_pct}%."
        ),
        "series": series_output,
    }


def _simulate_add_capacity(
    plant_config: Dict[str, Any],
    blocks: List[Dict[str, Any]],
    schedule_blocks: List[Dict[str, Any]],
    capacity_kw: float,
    tolerance_pct: float,
    before_total_kwh: float,
    dsm_before: Dict[str, Any],
    params: Dict[str, Any],
) -> Dict[str, Any]:
    """Scenario 3: Expand nameplate plant capacity by capacity_pct (e.g. 15%)."""
    expansion_pct = float(params.get("capacity_pct", 15.0))
    scale = 1.0 + (expansion_pct / 100.0)
    new_capacity_kw = capacity_kw * scale

    after_blocks = []
    series_output = []

    sched_map = {b["ts"]: float(b["schedule_kw"]) for b in schedule_blocks}

    for b in blocks:
        ts = b.get("ts")
        base_kw = float(b.get("forecast_kw", 0.0))
        new_kw = round(base_kw * scale, 2)
        after_blocks.append({"ts": ts, "forecast_kw": new_kw})
        series_output.append({
            "ts": ts,
            "schedule_kw": sched_map.get(ts, 0.0),
            "before_kw": round(base_kw, 2),
            "after_kw": new_kw,
        })

    after_total_kwh = float(sum(b["forecast_kw"] for b in after_blocks) * 0.25)
    gain_kwh = round(after_total_kwh - before_total_kwh, 2)

    dsm_after = check(
        forecast_blocks=after_blocks,
        schedule_blocks=schedule_blocks,
        capacity_kw=new_capacity_kw,
        tol_pct=tolerance_pct,
    )

    return {
        "scenario": "add_capacity",
        "plant_id": plant_config.get("plant_id"),
        "assumptions": [
            f"Capacity expanded by +{expansion_pct:.1f}% ({capacity_kw:.0f} kW -> {new_capacity_kw:.0f} kW).",
            "Linear scaling on generation profile.",
        ],
        "params": {"capacity_pct": expansion_pct, "new_capacity_kw": new_capacity_kw},
        "before": {
            "total_kwh": round(before_total_kwh, 2),
            "breach_count": dsm_before["total_breaches"],
            "relative_exposure_pct": dsm_before["relative_exposure_pct"],
        },
        "after": {
            "total_kwh": round(after_total_kwh, 2),
            "breach_count": dsm_after["total_breaches"],
            "relative_exposure_pct": dsm_after["relative_exposure_pct"],
        },
        "impact": {
            "gain_kwh": gain_kwh,
            "gain_pct": expansion_pct,
        },
        "summary": (
            f"Expanding capacity by +{expansion_pct}% yields +{gain_kwh:,.1f} kWh extra generation."
        ),
        "series": series_output,
    }


def _simulate_monsoon_cloud(
    plant_config: Dict[str, Any],
    blocks: List[Dict[str, Any]],
    schedule_blocks: List[Dict[str, Any]],
    capacity_kw: float,
    tolerance_pct: float,
    before_total_kwh: float,
    dsm_before: Dict[str, Any],
    params: Dict[str, Any],
) -> Dict[str, Any]:
    """Scenario 4: Severe monsoon cloud cover attenuates generation for duration_blocks."""
    attenuation = float(params.get("attenuation", 0.4))
    duration_blocks = int(params.get("duration_blocks", 24))
    start_block = int(params.get("start_block", 28))

    after_blocks = []
    series_output = []
    sched_map = {b["ts"]: float(b["schedule_kw"]) for b in schedule_blocks}

    for idx, b in enumerate(blocks):
        ts = b.get("ts")
        base_kw = float(b.get("forecast_kw", 0.0))
        if start_block <= idx < (start_block + duration_blocks):
            attenuated_kw = round(base_kw * attenuation, 2)
        else:
            attenuated_kw = base_kw

        after_blocks.append({"ts": ts, "forecast_kw": attenuated_kw})
        series_output.append({
            "ts": ts,
            "schedule_kw": sched_map.get(ts, 0.0),
            "before_kw": round(base_kw, 2),
            "after_kw": attenuated_kw,
        })

    after_total_kwh = float(sum(b["forecast_kw"] for b in after_blocks) * 0.25)
    loss_kwh = round(before_total_kwh - after_total_kwh, 2)

    dsm_after = check(
        forecast_blocks=after_blocks,
        schedule_blocks=schedule_blocks,
        capacity_kw=capacity_kw,
        tol_pct=tolerance_pct,
    )

    breaches_added = max(0, dsm_after["total_breaches"] - dsm_before["total_breaches"])

    return {
        "scenario": "monsoon_cloud",
        "plant_id": plant_config.get("plant_id"),
        "assumptions": [
            f"Monsoon cloud attenuation factor: {attenuation:.2f} for {duration_blocks * 15 / 60:.1f} hours.",
            "Schedule remains committed at pre-monsoon day-ahead baseline.",
        ],
        "params": {
            "attenuation": attenuation,
            "duration_blocks": duration_blocks,
            "start_block": start_block,
        },
        "before": {
            "total_kwh": round(before_total_kwh, 2),
            "breach_count": dsm_before["total_breaches"],
            "relative_exposure_pct": dsm_before["relative_exposure_pct"],
        },
        "after": {
            "total_kwh": round(after_total_kwh, 2),
            "breach_count": dsm_after["total_breaches"],
            "relative_exposure_pct": dsm_after["relative_exposure_pct"],
        },
        "impact": {
            "loss_kwh": loss_kwh,
            "breaches_added": breaches_added,
        },
        "summary": (
            f"Severe monsoon cloud event causes a {loss_kwh:,.1f} kWh deficit and adds {breaches_added} DSM breaches."
        ),
        "series": series_output,
    }
