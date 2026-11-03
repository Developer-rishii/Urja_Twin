"""Daily recalibration loop for UrjaTwin physics twin parameters.

End-of-day recalibration:
- Solar: Re-fit PR (or soiling factor) based on observed actual vs expected power
  during valid daytime hours.
- Wind: Re-fit Cp based on cubic power curve operating points.
- Logs before/after error in twin_state and returns updated parameters.
"""

from typing import Any, Dict, List
import numpy as np


def recalibrate_solar(
    recent_daytime_readings: List[Dict[str, Any]],
    current_pr: float = 0.9916,
    p_stc_kw: float = 32000.0,
    gamma: float = -0.004,
) -> Dict[str, Any]:
    """Recalibrate solar PR using recent daytime readings.

    P_pv = P_stc * (G/1000) * [1 + gamma*(T_cell - 25)] * PR
    """
    valid = [
        r for r in recent_daytime_readings
        if r.get("irradiance", 0.0) > 0.05 and r.get("power_kw") is not None
    ]
    if len(valid) < 8:
        return {
            "recalibrated": False,
            "pr": current_pr,
            "message": "Insufficient daytime readings for recalibration (< 8 blocks).",
        }

    actuals = np.array([float(r["power_kw"]) for r in valid])
    irrs = np.array([float(r["irradiance"]) for r in valid])
    temps = np.array([float(r.get("module_temp", 25.0)) for r in valid])

    # X = P_stc * (G/1000) * [1 + gamma * (T_cell - 25)]
    # irradiance in kW/m2 -> G/1000 == irradiance
    X = p_stc_kw * irrs * (1.0 + gamma * (temps - 25.0))

    denom = np.sum(X ** 2)
    if denom <= 0:
        return {"recalibrated": False, "pr": current_pr, "message": "Zero denominator in PR fit."}

    new_pr = float(np.sum(actuals * X) / denom)
    # Physical sanity clipping
    new_pr = float(np.clip(new_pr, 0.70, 1.15))

    # Before / After errors
    before_errors = np.abs(actuals - (X * current_pr))
    after_errors = np.abs(actuals - (X * new_pr))

    before_mae = float(np.mean(before_errors))
    after_mae = float(np.mean(after_errors))

    return {
        "recalibrated": True,
        "old_pr": round(current_pr, 4),
        "new_pr": round(new_pr, 4),
        "before_mae_kw": round(before_mae, 2),
        "after_mae_kw": round(after_mae, 2),
        "sample_count": len(valid),
    }


def recalibrate_wind(
    recent_readings: List[Dict[str, Any]],
    current_cp: float = 0.3313,
    p_rated_kw: float = 3600.0,
    rotor_area_m2: float = 10207.03,
    rho: float = 1.225,
) -> Dict[str, Any]:
    """Recalibrate wind turbine Cp using recent operating points in cubic region."""
    valid = [
        r for r in recent_readings
        if 3.0 <= r.get("wind_speed", 0.0) < 12.0 and r.get("power_kw") is not None
    ]
    if len(valid) < 8:
        return {
            "recalibrated": False,
            "cp": current_cp,
            "message": "Insufficient cubic region readings (< 8 blocks).",
        }

    actuals = np.array([float(r["power_kw"]) for r in valid])
    speeds = np.array([float(r["wind_speed"]) for r in valid])

    coeff = 0.5 * rho * rotor_area_m2 * (speeds ** 3) / 1000.0
    denom = np.sum(coeff ** 2)
    if denom <= 0:
        return {"recalibrated": False, "cp": current_cp, "message": "Zero denominator in Cp fit."}

    new_cp = float(np.sum(actuals * coeff) / denom)
    new_cp = float(np.clip(new_cp, 0.20, 0.48))

    before_errors = np.abs(actuals - np.clip(coeff * current_cp, 0, p_rated_kw))
    after_errors = np.abs(actuals - np.clip(coeff * new_cp, 0, p_rated_kw))

    return {
        "recalibrated": True,
        "old_cp": round(current_cp, 4),
        "new_cp": round(new_cp, 4),
        "before_mae_kw": round(float(np.mean(before_errors)), 2),
        "after_mae_kw": round(float(np.mean(after_errors)), 2),
        "sample_count": len(valid),
    }
