"""Deviation Settlement Mechanism (DSM) calculation and schedule revision engine.

Implements:
1. Tolerance check:
   deviation_pct = (forecast - schedule) / capacity * 100
   breach if abs(deviation_pct) > tol
2. Schedule revision:
   Shifts scheduled power toward the forecast just enough to bring deviation
   within the allowable tolerance band.
3. Default schedule generator:
   Calculates coarse 3-hour (12-block) averages of the forecast so realistic
   breaches occur during demo re-forecasts.

Note:
- Tolerance is read dynamically (default 10, not yet verified against latest CERC regulation).
- Rupee penalties are not hardcoded (no verified tariff rate); returns breach count
  and relative exposure instead.
"""

from typing import Any, Dict, List, Optional
import numpy as np


def default_schedule(forecast_blocks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Generate default coarse schedule using 3-hour (12-block) rolling block averages.

    In practical grid operations, generators submit schedules in advance blocks.
    A 3-hour block average creates realistic schedule-forecast deviations suitable
    for demonstrating DSM breach detection and revision.
    """
    n = len(forecast_blocks)
    if n == 0:
        return []

    schedule = []
    block_size = 12  # 12 blocks * 15 min = 3 hours

    for i in range(0, n, block_size):
        chunk = forecast_blocks[i : i + block_size]
        valid_vals = [
            b["forecast_kw"]
            for b in chunk
            if b.get("forecast_kw") is not None and not np.isnan(b["forecast_kw"])
        ]
        avg_val = float(np.mean(valid_vals)) if valid_vals else 0.0
        avg_val = round(max(0.0, avg_val), 2)

        for b in chunk:
            schedule.append({
                "ts": b["ts"],
                "schedule_kw": avg_val,
            })
    return schedule


def check(
    forecast_blocks: List[Dict[str, Any]],
    schedule_blocks: List[Dict[str, Any]],
    capacity_kw: float,
    tol_pct: Optional[float] = None,
) -> Dict[str, Any]:
    """Check schedule against forecast for DSM tolerance breaches.

    Args:
        forecast_blocks: List of dicts with 'ts' and 'forecast_kw'.
        schedule_blocks: List of dicts with 'ts' and 'schedule_kw'.
        capacity_kw: Total plant capacity in kW (> 0).
        tol_pct: Tolerance percentage. If None, defaults to 10.0 (from config default).

    Returns:
        Dict containing:
        - tolerance_pct: float
        - total_blocks_checked: int
        - total_breaches: int
        - relative_exposure_pct: sum of excess deviation percentages
        - breaches: list of breach details per block
    """
    if tol_pct is None:
        # Default 10, not yet verified against latest CERC regulation
        tol_pct = 10.0

    if capacity_kw <= 0:
        raise ValueError(f"Plant capacity must be positive, got {capacity_kw}")

    # Map schedule by timestamp for robust matching
    sched_map = {b["ts"]: b["schedule_kw"] for b in schedule_blocks if "ts" in b}

    breaches = []
    total_checked = 0
    total_excess_pct = 0.0

    for f_block in forecast_blocks:
        ts = f_block.get("ts")
        f_val = f_block.get("forecast_kw")
        s_val = sched_map.get(ts)

        # Rule 2: Skip blocks with missing data (None, NaN, or unmapped)
        if f_val is None or s_val is None or np.isnan(f_val) or np.isnan(s_val):
            continue

        total_checked += 1
        # deviation_pct = (forecast - schedule) / capacity * 100
        dev_pct = ((f_val - s_val) / capacity_kw) * 100.0
        abs_dev = abs(dev_pct)

        # Use small float tolerance 1e-9 to prevent roundoff boundary false positives
        if abs_dev > (tol_pct + 1e-9):
            # Severity is the percentage beyond allowable tolerance
            severity_pct = round(abs_dev - tol_pct, 4)
            total_excess_pct += severity_pct

            breaches.append({
                "ts": ts,
                "forecast_kw": round(float(f_val), 2),
                "schedule_kw": round(float(s_val), 2),
                "deviation_kw": round(float(f_val - s_val), 2),
                "deviation_pct": round(float(dev_pct), 2),
                "tolerance_pct": tol_pct,
                "severity_pct": severity_pct,
                "direction": "over_injection" if dev_pct > 0 else "under_injection",
            })

    return {
        "tolerance_pct": tol_pct,
        "capacity_kw": capacity_kw,
        "total_blocks_checked": total_checked,
        "total_breaches": len(breaches),
        "relative_exposure_pct": round(float(total_excess_pct), 2),
        "breaches": breaches,
    }


def revise(
    forecast_blocks: List[Dict[str, Any]],
    schedule_blocks: List[Dict[str, Any]],
    capacity_kw: float,
    tol_pct: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Shift schedule toward forecast just enough to be inside tolerance.

    Args:
        forecast_blocks: List of dicts with 'ts' and 'forecast_kw'.
        schedule_blocks: List of dicts with 'ts' and 'schedule_kw'.
        capacity_kw: Total plant capacity in kW (> 0).
        tol_pct: Tolerance percentage. If None, defaults to 10.0 (from config default).

    Returns:
        List of dicts [{'ts': ts, 'schedule_kw': revised_kw, 'was_revised': bool}, ...]
    """
    if tol_pct is None:
        # Default 10, not yet verified against latest CERC regulation
        tol_pct = 10.0

    if capacity_kw <= 0:
        raise ValueError(f"Plant capacity must be positive, got {capacity_kw}")

    sched_map = {b["ts"]: b["schedule_kw"] for b in schedule_blocks if "ts" in b}
    revised_schedule = []
    max_allowed_dev_kw = (tol_pct / 100.0) * capacity_kw

    for f_block in forecast_blocks:
        ts = f_block.get("ts")
        f_val = f_block.get("forecast_kw")
        s_val = sched_map.get(ts)

        if f_val is None or s_val is None or np.isnan(f_val) or np.isnan(s_val):
            # Keep original block untouched if data missing
            revised_schedule.append({
                "ts": ts,
                "schedule_kw": s_val,
                "was_revised": False,
            })
            continue

        dev_kw = f_val - s_val
        abs_dev_kw = abs(dev_kw)

        if abs_dev_kw > max_allowed_dev_kw:
            # Shift schedule toward forecast just enough to be inside tolerance
            if dev_kw > 0:
                # Under-scheduling: schedule must be raised to f_val - max_allowed_dev_kw
                new_s = f_val - max_allowed_dev_kw
            else:
                # Over-scheduling: schedule must be lowered to f_val + max_allowed_dev_kw
                new_s = f_val + max_allowed_dev_kw

            new_s = max(0.0, new_s)
            revised_schedule.append({
                "ts": ts,
                "schedule_kw": round(float(new_s), 2),
                "was_revised": True,
            })
        else:
            revised_schedule.append({
                "ts": ts,
                "schedule_kw": round(float(s_val), 2),
                "was_revised": False,
            })

    return revised_schedule
