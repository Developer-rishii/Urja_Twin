"""Forecast inference service for UrjaTwin.

Provides 96-block ahead generation forecasting (24 hours at 15-minute resolution).
Strictly adheres to data boundaries:
- Uses only past telemetry at or before issue_time (ts <= issue_time).
- Weather variables at future steps (issue_time < ts <= issue_time + 96 blocks)
  serve as the documented 'forecast proxy' (dataset ground truth future weather).
"""

from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List
import joblib
import numpy as np
import pandas as pd

from app.twin.physics import calculate_solar_power, calculate_wind_power

# Paths
# Support running both inside Docker container (at /app) and directly from workspace root
APP_DIR = Path(__file__).resolve().parent.parent.parent
if (APP_DIR / "ml" / "models").exists():
    BASE_DIR = APP_DIR
elif (APP_DIR.parent / "ml" / "models").exists():
    BASE_DIR = APP_DIR.parent
else:
    BASE_DIR = APP_DIR

MODELS_DIR = BASE_DIR / "ml" / "models"
DATA_DIR = BASE_DIR / "data" / "processed"

# Cache models and data in-memory
_MODEL_CACHE: Dict[str, Any] = {}
_DATA_CACHE: Dict[str, pd.DataFrame] = {}


def _get_model(plant_type: str):
    if plant_type not in _MODEL_CACHE:
        prefix = "solar" if plant_type == "solar_pv" else "wind"
        model_path = MODELS_DIR / f"{prefix}_lgb.pkl"
        meta_path = MODELS_DIR / f"{prefix}_meta.pkl"

        if not model_path.exists() or not meta_path.exists():
            raise FileNotFoundError(f"Model or metadata missing at {model_path}")

        _MODEL_CACHE[plant_type] = {
            "model": joblib.load(model_path),
            "meta": joblib.load(meta_path),
        }
    return _MODEL_CACHE[plant_type]


def _get_dataset(plant_type: str) -> pd.DataFrame:
    if plant_type not in _DATA_CACHE:
        file_name = "solar.csv" if plant_type == "solar_pv" else "wind.csv"
        df = pd.read_csv(DATA_DIR / file_name)
        df["dt"] = pd.to_datetime(df["ts"])
        df = df.sort_values("dt").reset_index(drop=True)
        if plant_type == "solar_pv":
            df["physics_p"] = calculate_solar_power(df["irradiance"], df["module_temp"])
        else:
            df["physics_p"] = calculate_wind_power(df["wind_speed"])
        _DATA_CACHE[plant_type] = df
    return _DATA_CACHE[plant_type]


def forecast(
    plant_id: str,
    issue_time: str,
    override_df: pd.DataFrame = None,
) -> List[Dict[str, Any]]:
    """Generate 96-block generation forecast starting from issue_time.

    Args:
        plant_id: Plant identifier ('solar_plant_1' or 'wind_plant_1').
        issue_time: ISO 8601 string (e.g. '2020-06-10T12:00:00').
        override_df: Optional DataFrame replacing historical readings for testing/leak detection.

    Returns:
        List of 96 dicts: [{'ts': iso_string, 'forecast_kw': float}, ...]
    """
    plant_type = "solar_pv" if "solar" in plant_id.lower() else "wind_turbine"
    model_bundle = _get_model(plant_type)
    model = model_bundle["model"]
    meta = model_bundle["meta"]
    features = meta["features"]
    variant = meta["variant"]
    capacity_kw = meta["capacity_kw"]

    df = override_df.copy() if override_df is not None else _get_dataset(plant_type).copy()
    if "dt" not in df.columns:
        df["dt"] = pd.to_datetime(df["ts"])

    target_dt = pd.to_datetime(issue_time)
    past_mask = df["dt"] <= target_dt
    past_indices = df[past_mask].index

    if len(past_indices) < 97:
        raise ValueError(f"Insufficient history at {issue_time} (need at least 96 historical blocks).")

    t_idx = past_indices[-1]

    # Telemetry available at issue_time t
    p_series = df["power_kw"]
    p_t = float(p_series.iloc[t_idx])
    lag_1 = float(p_series.iloc[t_idx - 1])
    lag_2 = float(p_series.iloc[t_idx - 2])
    lag_4 = float(p_series.iloc[t_idx - 4])
    lag_96 = float(p_series.iloc[t_idx - 96])
    rm_4 = float(p_series.iloc[t_idx - 3 : t_idx + 1].mean())
    rm_12 = float(p_series.iloc[t_idx - 11 : t_idx + 1].mean())

    future_rows = []
    # Generate features for h in 1..96
    for h in range(1, 97):
        h_idx = t_idx + h
        if h_idx < len(df):
            row_target = df.iloc[h_idx]
            dt_target = row_target["dt"]
            phys_target = float(row_target["physics_p"])
            if plant_type == "solar_pv":
                irr_target = float(row_target["irradiance"])
                amb_target = float(row_target["ambient_temp"])
                mod_target = float(row_target["module_temp"])
            else:
                ws_target = float(row_target["wind_speed"])
        else:
            # Fallback if horizon extends beyond dataset boundary
            dt_target = target_dt + timedelta(minutes=15 * h)
            phys_target = 0.0
            if plant_type == "solar_pv":
                irr_target, amb_target, mod_target = 0.0, 25.0, 25.0
            else:
                ws_target = 0.0

        hour_float = dt_target.hour + dt_target.minute / 60.0
        sin_hour = np.sin(2 * np.pi * hour_float / 24.0)
        cos_hour = np.cos(2 * np.pi * hour_float / 24.0)

        feat_dict = {
            "h": h,
            "p_t": p_t,
            "lag_1": lag_1,
            "lag_2": lag_2,
            "lag_4": lag_4,
            "lag_96": lag_96,
            "rm_4": rm_4,
            "rm_12": rm_12,
            "sin_hour": sin_hour,
            "cos_hour": cos_hour,
            "phys_target": phys_target,
            "dt_target": dt_target,
        }

        if plant_type == "solar_pv":
            feat_dict["irr_target"] = irr_target
            feat_dict["amb_target"] = amb_target
            feat_dict["mod_target"] = mod_target
        else:
            feat_dict["ws_target"] = ws_target

        future_rows.append(feat_dict)

    df_feats = pd.DataFrame(future_rows)
    X = df_feats[features]

    if variant == "residual":
        pred_res = model.predict(X)
        pred_kw = np.clip(df_feats["phys_target"].values + pred_res, 0.0, capacity_kw)
    else:
        pred_kw = np.clip(model.predict(X), 0.0, capacity_kw)

    results = []
    for i in range(96):
        ts_str = df_feats.iloc[i]["dt_target"].strftime("%Y-%m-%dT%H:%M:%S")
        results.append({
            "ts": ts_str,
            "forecast_kw": round(float(pred_kw[i]), 2),
        })

    return results
