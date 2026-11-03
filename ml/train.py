"""Model training pipeline for UrjaTwin 96-block generation forecasting.

Strict ML Rules enforced:
1. Time-based train/test split: Solar split date 2020-06-09, Wind split date 2018-10-01.
2. Validation slice taken strictly from the END of the train period (never test set).
3. Evaluates both Variant (a) direct power and Variant (b) physics residual on validation set.
4. Picks best variant and trains the production model saved to ml/models/.
5. Features use ONLY data available at issue time t, plus the documented forecast proxy (future weather).
6. Day-of-year feature dropped.
"""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "backend"))

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd

from app.twin.physics import calculate_solar_power, calculate_wind_power

MODELS_DIR = BASE_DIR / "ml" / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR = BASE_DIR / "data" / "processed"


def build_solar_tabular(df: pd.DataFrame, day_list: list, stride: int = 1) -> pd.DataFrame:
    rows = []
    p = df["power_kw"].values
    phys = df["physics_p"].values
    irr = df["irradiance"].values
    amb = df["ambient_temp"].values
    mod = df["module_temp"].values
    dts = df["dt"].values
    n = len(df)

    p_series = pd.Series(p)
    roll_4 = p_series.rolling(4).mean().values
    roll_12 = p_series.rolling(12).mean().values
    dates = df["dt"].dt.date.values

    for t in range(96, n - 96, stride):
        if dates[t] not in day_list:
            continue

        p_t = p[t]
        lag_1 = p[t - 1]
        lag_2 = p[t - 2]
        lag_4 = p[t - 4]
        lag_96 = p[t - 96]
        rm_4 = roll_4[t]
        rm_12 = roll_12[t]

        for h in range(1, 97):
            idx_target = t + h
            t_dt = pd.Timestamp(dts[idx_target])
            hour_float = t_dt.hour + t_dt.minute / 60.0
            sin_hour = np.sin(2 * np.pi * hour_float / 24.0)
            cos_hour = np.cos(2 * np.pi * hour_float / 24.0)

            phys_target = phys[idx_target]
            irr_target = irr[idx_target]
            amb_target = amb[idx_target]
            mod_target = mod[idx_target]

            actual_target = p[idx_target]
            res_target = actual_target - phys_target

            persist = p_t
            yesterday = p[idx_target - 96]

            rows.append({
                "t_idx": t,
                "target_idx": idx_target,
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
                "irr_target": irr_target,
                "amb_target": amb_target,
                "mod_target": mod_target,
                "actual": actual_target,
                "residual": res_target,
                "persist": persist,
                "yesterday": yesterday,
            })
    return pd.DataFrame(rows)


def build_wind_tabular(df: pd.DataFrame, day_list: list, stride: int = 4) -> pd.DataFrame:
    rows = []
    p = df["power_kw"].values
    phys = df["physics_p"].values
    ws = df["wind_speed"].values
    dts = df["dt"].values
    n = len(df)

    p_series = pd.Series(p)
    roll_4 = p_series.rolling(4).mean().values
    roll_12 = p_series.rolling(12).mean().values
    dates = df["dt"].dt.date.values

    for t in range(96, n - 96, stride):
        if dates[t] not in day_list:
            continue

        p_t = p[t]
        lag_1 = p[t - 1]
        lag_2 = p[t - 2]
        lag_4 = p[t - 4]
        lag_96 = p[t - 96]
        rm_4 = roll_4[t]
        rm_12 = roll_12[t]

        for h in range(1, 97):
            idx_target = t + h
            t_dt = pd.Timestamp(dts[idx_target])
            hour_float = t_dt.hour + t_dt.minute / 60.0
            sin_hour = np.sin(2 * np.pi * hour_float / 24.0)
            cos_hour = np.cos(2 * np.pi * hour_float / 24.0)

            phys_target = phys[idx_target]
            ws_target = ws[idx_target]
            actual_target = p[idx_target]
            res_target = actual_target - phys_target

            persist = p_t
            yesterday = p[idx_target - 96]

            rows.append({
                "t_idx": t,
                "target_idx": idx_target,
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
                "ws_target": ws_target,
                "actual": actual_target,
                "residual": res_target,
                "persist": persist,
                "yesterday": yesterday,
            })
    return pd.DataFrame(rows)


def train_solar():
    print("\n--- Training Solar Model ---")
    solar = pd.read_csv(DATA_DIR / "solar.csv")
    solar["dt"] = pd.to_datetime(solar["ts"])
    solar["physics_p"] = calculate_solar_power(solar["irradiance"], solar["module_temp"])

    days = solar["dt"].dt.date.unique()
    split_idx = int(len(days) * 0.75)  # 25 train days, 9 test days
    train_days = days[:split_idx]
    test_days = days[split_idx:]

    # Validation slice: last 4 days of train period
    val_days = train_days[-4:]
    pure_train_days = train_days[:-4]

    print(f"Solar Split Date: {days[split_idx]}")
    print(f"Train Days: {len(train_days)} (Pure Train: {len(pure_train_days)}, Val: {len(val_days)}), Test Days: {len(test_days)}")

    df_train = build_solar_tabular(solar, pure_train_days, stride=2)
    df_val = build_solar_tabular(solar, val_days, stride=4)

    features = [
        "h", "p_t", "lag_1", "lag_2", "lag_4", "lag_96", "rm_4", "rm_12",
        "sin_hour", "cos_hour", "phys_target", "irr_target", "amb_target", "mod_target"
    ]

    # Evaluate Variant A (direct) vs Variant B (residual) on Validation Slice
    m_a = lgb.LGBMRegressor(n_estimators=300, learning_rate=0.05, num_leaves=31, random_state=42, verbose=-1)
    m_a.fit(df_train[features], df_train["actual"], eval_set=[(df_val[features], df_val["actual"])], callbacks=[lgb.early_stopping(stopping_rounds=20, verbose=False)])
    pred_val_a = np.clip(m_a.predict(df_val[features]), 0, None)
    mae_val_a = float(np.mean(np.abs(df_val["actual"] - pred_val_a)))

    m_b = lgb.LGBMRegressor(n_estimators=300, learning_rate=0.05, num_leaves=31, random_state=42, verbose=-1)
    m_b.fit(df_train[features], df_train["residual"], eval_set=[(df_val[features], df_val["residual"])], callbacks=[lgb.early_stopping(stopping_rounds=20, verbose=False)])
    pred_val_b = np.clip(df_val["phys_target"] + m_b.predict(df_val[features]), 0, None)
    mae_val_b = float(np.mean(np.abs(df_val["actual"] - pred_val_b)))

    print(f"Solar Validation MAE - Variant A (direct)  : {mae_val_a:.2f} kW")
    print(f"Solar Validation MAE - Variant B (residual): {mae_val_b:.2f} kW")

    chosen_variant = "residual" if mae_val_b < mae_val_a else "direct"
    print(f"Chosen Variant for Solar: {chosen_variant}")

    # Train final model on full train set (pure_train + val) with early stopping on val
    df_full_train = build_solar_tabular(solar, train_days, stride=2)
    target_col = "residual" if chosen_variant == "residual" else "actual"

    final_model = lgb.LGBMRegressor(n_estimators=400, learning_rate=0.05, num_leaves=31, random_state=42, verbose=-1)
    final_model.fit(df_full_train[features], df_full_train[target_col], eval_set=[(df_val[features], df_val[target_col])], callbacks=[lgb.early_stopping(stopping_rounds=25, verbose=False)])

    model_metadata = {
        "plant_id": "solar_plant_1",
        "plant_type": "solar_pv",
        "features": features,
        "variant": chosen_variant,
        "split_date": str(days[split_idx]),
        "capacity_kw": 32000.0,
    }

    joblib.dump(final_model, MODELS_DIR / "solar_lgb.pkl")
    joblib.dump(model_metadata, MODELS_DIR / "solar_meta.pkl")
    print("Saved solar model to ml/models/solar_lgb.pkl")


def train_wind():
    print("\n--- Training Wind Model ---")
    wind = pd.read_csv(DATA_DIR / "wind.csv")
    wind["dt"] = pd.to_datetime(wind["ts"])
    wind["physics_p"] = calculate_wind_power(wind["wind_speed"])

    days = wind["dt"].dt.date.unique()
    split_idx = int(len(days) * 0.75)  # 273 train days, 92 test days
    train_days = days[:split_idx]
    test_days = days[split_idx:]

    val_days = train_days[-20:]  # last 20 days of train period
    pure_train_days = train_days[:-20]

    print(f"Wind Split Date: {days[split_idx]}")
    print(f"Train Days: {len(train_days)} (Pure Train: {len(pure_train_days)}, Val: {len(val_days)}), Test Days: {len(test_days)}")

    df_train = build_wind_tabular(wind, pure_train_days, stride=8)
    df_val = build_wind_tabular(wind, val_days, stride=8)

    features = [
        "h", "p_t", "lag_1", "lag_2", "lag_4", "lag_96", "rm_4", "rm_12",
        "sin_hour", "cos_hour", "phys_target", "ws_target"
    ]

    m_a = lgb.LGBMRegressor(n_estimators=300, learning_rate=0.05, num_leaves=31, random_state=42, verbose=-1)
    m_a.fit(df_train[features], df_train["actual"], eval_set=[(df_val[features], df_val["actual"])], callbacks=[lgb.early_stopping(stopping_rounds=20, verbose=False)])
    pred_val_a = np.clip(m_a.predict(df_val[features]), 0, 3600.0)
    mae_val_a = float(np.mean(np.abs(df_val["actual"] - pred_val_a)))

    m_b = lgb.LGBMRegressor(n_estimators=300, learning_rate=0.05, num_leaves=31, random_state=42, verbose=-1)
    m_b.fit(df_train[features], df_train["residual"], eval_set=[(df_val[features], df_val["residual"])], callbacks=[lgb.early_stopping(stopping_rounds=20, verbose=False)])
    pred_val_b = np.clip(df_val["phys_target"] + m_b.predict(df_val[features]), 0, 3600.0)
    mae_val_b = float(np.mean(np.abs(df_val["actual"] - pred_val_b)))

    print(f"Wind Validation MAE - Variant A (direct)  : {mae_val_a:.2f} kW")
    print(f"Wind Validation MAE - Variant B (residual): {mae_val_b:.2f} kW")

    chosen_variant = "direct" if mae_val_a <= mae_val_b else "residual"
    print(f"Chosen Variant for Wind: {chosen_variant}")

    df_full_train = build_wind_tabular(wind, train_days, stride=8)
    target_col = "residual" if chosen_variant == "residual" else "actual"

    final_model = lgb.LGBMRegressor(n_estimators=400, learning_rate=0.05, num_leaves=31, random_state=42, verbose=-1)
    final_model.fit(df_full_train[features], df_full_train[target_col], eval_set=[(df_val[features], df_val[target_col])], callbacks=[lgb.early_stopping(stopping_rounds=25, verbose=False)])

    model_metadata = {
        "plant_id": "wind_plant_1",
        "plant_type": "wind_turbine",
        "features": features,
        "variant": chosen_variant,
        "split_date": str(days[split_idx]),
        "capacity_kw": 3600.0,
    }

    joblib.dump(final_model, MODELS_DIR / "wind_lgb.pkl")
    joblib.dump(model_metadata, MODELS_DIR / "wind_meta.pkl")
    print("Saved wind model to ml/models/wind_lgb.pkl")


if __name__ == "__main__":
    train_solar()
    train_wind()
    print("\nTraining completed successfully.")

