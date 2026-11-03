"""Evaluation and Honesty Analysis script for UrjaTwin 96-block generation forecasting.

Implements Task T3b Honest Accuracy Add-On:
1. Baselines on the exact same test rows:
   - Persistence (power at issue time t)
   - Same-Time-Yesterday (target - 96 blocks)
   - Physics-only: theoretical equation using forecast proxy weather (zero ML)
   - No-Future-Weather Model: LightGBM trained with only past telemetry and hour sin/cos (no weather at t+h)
   - Main Model with Forecast Proxy Weather
   - Main Model with +10% standard deviation weather noise (fixed seed 42)
   - Main Model with +20% standard deviation weather noise (fixed seed 42)
2. Horizon bucket MAE breakdown for both the main model and the no-future-weather model.
3. Prints split assertion: min/max of train and test with assert train_max < test_min.
"""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / "backend"))

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd

from app.twin.physics import calculate_solar_power, calculate_wind_power
from ml.train import build_solar_tabular, build_wind_tabular

DATA_DIR = BASE_DIR / "data" / "processed"
MODELS_DIR = BASE_DIR / "ml" / "models"


def build_no_future_solar_tabular(df: pd.DataFrame, day_list: list, stride: int = 2) -> pd.DataFrame:
    rows = []
    p = df["power_kw"].values
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
        irr_t = irr[t]
        amb_t = amb[t]
        mod_t = mod[t]

        for h in range(1, 97):
            idx_target = t + h
            t_dt = pd.Timestamp(dts[idx_target])
            hour_float = t_dt.hour + t_dt.minute / 60.0
            sin_hour = np.sin(2 * np.pi * hour_float / 24.0)
            cos_hour = np.cos(2 * np.pi * hour_float / 24.0)
            actual_target = p[idx_target]

            rows.append({
                "h": h,
                "p_t": p_t,
                "lag_1": lag_1,
                "lag_2": lag_2,
                "lag_4": lag_4,
                "lag_96": lag_96,
                "rm_4": rm_4,
                "rm_12": rm_12,
                "irr_t": irr_t,
                "amb_t": amb_t,
                "mod_t": mod_t,
                "sin_hour": sin_hour,
                "cos_hour": cos_hour,
                "actual": actual_target,
            })
    return pd.DataFrame(rows)


def build_no_future_wind_tabular(df: pd.DataFrame, day_list: list, stride: int = 8) -> pd.DataFrame:
    rows = []
    p = df["power_kw"].values
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
        ws_t = ws[t]

        for h in range(1, 97):
            idx_target = t + h
            t_dt = pd.Timestamp(dts[idx_target])
            hour_float = t_dt.hour + t_dt.minute / 60.0
            sin_hour = np.sin(2 * np.pi * hour_float / 24.0)
            cos_hour = np.cos(2 * np.pi * hour_float / 24.0)
            actual_target = p[idx_target]

            rows.append({
                "h": h,
                "p_t": p_t,
                "lag_1": lag_1,
                "lag_2": lag_2,
                "lag_4": lag_4,
                "lag_96": lag_96,
                "rm_4": rm_4,
                "rm_12": rm_12,
                "ws_t": ws_t,
                "sin_hour": sin_hour,
                "cos_hour": cos_hour,
                "actual": actual_target,
            })
    return pd.DataFrame(rows)


def evaluate_solar():
    print("==================================================")
    print("           EVALUATION: SOLAR PLANT 1              ")
    print("==================================================")
    solar = pd.read_csv(DATA_DIR / "solar.csv")
    solar["dt"] = pd.to_datetime(solar["ts"])
    solar["physics_p"] = calculate_solar_power(solar["irradiance"], solar["module_temp"])

    days = solar["dt"].dt.date.unique()
    split_idx = int(len(days) * 0.75)
    train_days = list(days[:split_idx])
    test_days = list(days[split_idx:])
    val_days = train_days[-4:]
    pure_train_days = train_days[:-4]

    train_data = solar[solar["dt"].dt.date < days[split_idx]]
    test_data = solar[solar["dt"].dt.date >= days[split_idx]]

    train_min = train_data["ts"].min()
    train_max = train_data["ts"].max()
    test_min = test_data["ts"].min()
    test_max = test_data["ts"].max()

    print(f"Solar Train range: {train_min} to {train_max}")
    print(f"Solar Test range : {test_min} to {test_max}")
    assert train_max < test_min, f"Data leakage error: train_max ({train_max}) >= test_min ({test_min})"
    print("ASSERTION PASSED: train_max < test_min. Zero test rows appear in training data.")

    # 1. Main model evaluation dataset
    df_test = build_solar_tabular(solar, test_days, stride=1)
    print(f"Total test prediction rows evaluated across 96 horizons: {len(df_test)}")

    model = joblib.load(MODELS_DIR / "solar_lgb.pkl")
    meta = joblib.load(MODELS_DIR / "solar_meta.pkl")
    features = meta["features"]
    capacity_kw = meta["capacity_kw"]

    # Baseline 1 & 2: Persistence & Same-time-yesterday
    mae_persist = float(np.mean(np.abs(df_test["actual"] - df_test["persist"])))
    mae_yesterday = float(np.mean(np.abs(df_test["actual"] - df_test["yesterday"])))

    # Baseline 3: Physics-only (with proxy weather, zero ML)
    mae_physics = float(np.mean(np.abs(df_test["actual"] - df_test["phys_target"])))

    # Model 1: Our Model with Proxy Weather
    pred_res = model.predict(df_test[features])
    pred_proxy = np.clip(df_test["phys_target"] + pred_res, 0.0, capacity_kw)
    mae_proxy = float(np.mean(np.abs(df_test["actual"] - pred_proxy)))

    # Model 2: No-Future-Weather Model
    print("Training Solar No-Future-Weather model on train split...")
    df_nf_tr = build_no_future_solar_tabular(solar, pure_train_days, stride=2)
    df_nf_va = build_no_future_solar_tabular(solar, val_days, stride=4)
    df_nf_te = build_no_future_solar_tabular(solar, test_days, stride=1)

    nf_feats = [
        "h", "p_t", "lag_1", "lag_2", "lag_4", "lag_96", "rm_4", "rm_12",
        "irr_t", "amb_t", "mod_t", "sin_hour", "cos_hour"
    ]
    m_nf = lgb.LGBMRegressor(n_estimators=300, learning_rate=0.05, num_leaves=31, random_state=42, verbose=-1)
    m_nf.fit(df_nf_tr[nf_feats], df_nf_tr["actual"], eval_set=[(df_nf_va[nf_feats], df_nf_va["actual"])], callbacks=[lgb.early_stopping(20, verbose=False)])
    pred_nf = np.clip(m_nf.predict(df_nf_te[nf_feats]), 0.0, capacity_kw)
    mae_no_weather = float(np.mean(np.abs(df_nf_te["actual"] - pred_nf)))

    # Model 3: Sensitivity Test with +10% Weather Noise
    np.random.seed(42)
    noise_10 = np.random.normal(1.0, 0.10, size=len(df_test))
    irr_10 = np.clip(df_test["irr_target"].values * noise_10, 0.0, None)
    phys_10 = calculate_solar_power(irr_10, df_test["mod_target"].values)
    df_10 = df_test.copy()
    df_10["irr_target"] = irr_10
    df_10["phys_target"] = phys_10
    pred_10 = np.clip(df_10["phys_target"] + model.predict(df_10[features]), 0.0, capacity_kw)
    mae_noise_10 = float(np.mean(np.abs(df_test["actual"] - pred_10)))

    # Model 4: Sensitivity Test with +20% Weather Noise
    np.random.seed(42)
    noise_20 = np.random.normal(1.0, 0.20, size=len(df_test))
    irr_20 = np.clip(df_test["irr_target"].values * noise_20, 0.0, None)
    phys_20 = calculate_solar_power(irr_20, df_test["mod_target"].values)
    df_20 = df_test.copy()
    df_20["irr_target"] = irr_20
    df_20["phys_target"] = phys_20
    pred_20 = np.clip(df_20["phys_target"] + model.predict(df_20[features]), 0.0, capacity_kw)
    mae_noise_20 = float(np.mean(np.abs(df_test["actual"] - pred_20)))

    # Bucket analysis for No-Future-Weather vs Proxy Model
    buckets = [(1, 4), (5, 16), (17, 48), (49, 96)]
    bucket_results = []
    for b_min, b_max in buckets:
        mask = (df_test["h"] >= b_min) & (df_test["h"] <= b_max)
        b_mae_proxy = float(np.mean(np.abs(df_test.loc[mask, "actual"] - pred_proxy[mask])))
        b_mae_nf = float(np.mean(np.abs(df_nf_te.loc[mask, "actual"] - pred_nf[mask])))
        bucket_results.append((f"{b_min}-{b_max}", b_mae_proxy, b_mae_nf))

    return {
        "plant": "Solar Plant 1",
        "capacity_kw": capacity_kw,
        "persist": mae_persist,
        "yesterday": mae_yesterday,
        "physics": mae_physics,
        "no_weather": mae_no_weather,
        "proxy": mae_proxy,
        "noise_10": mae_noise_10,
        "noise_20": mae_noise_20,
        "buckets": bucket_results,
    }


def evaluate_wind():
    print("\n==================================================")
    print("            EVALUATION: WIND PLANT 1              ")
    print("==================================================")
    wind = pd.read_csv(DATA_DIR / "wind.csv")
    wind["dt"] = pd.to_datetime(wind["ts"])
    wind["physics_p"] = calculate_wind_power(wind["wind_speed"])

    days = wind["dt"].dt.date.unique()
    split_idx = int(len(days) * 0.75)
    train_days = list(days[:split_idx])
    test_days = list(days[split_idx:])
    val_days = train_days[-20:]
    pure_train_days = train_days[:-20]

    train_data = wind[wind["dt"].dt.date < days[split_idx]]
    test_data = wind[wind["dt"].dt.date >= days[split_idx]]

    train_min = train_data["ts"].min()
    train_max = train_data["ts"].max()
    test_min = test_data["ts"].min()
    test_max = test_data["ts"].max()

    print(f"Wind Train range : {train_min} to {train_max}")
    print(f"Wind Test range  : {test_min} to {test_max}")
    assert train_max < test_min, f"Data leakage error: train_max ({train_max}) >= test_min ({test_min})"
    print("ASSERTION PASSED: train_max < test_min. Zero test rows appear in training data.")

    df_test = build_wind_tabular(wind, test_days, stride=4)
    print(f"Total test prediction rows evaluated across 96 horizons: {len(df_test)}")

    model = joblib.load(MODELS_DIR / "wind_lgb.pkl")
    meta = joblib.load(MODELS_DIR / "wind_meta.pkl")
    features = meta["features"]
    capacity_kw = meta["capacity_kw"]

    mae_persist = float(np.mean(np.abs(df_test["actual"] - df_test["persist"])))
    mae_yesterday = float(np.mean(np.abs(df_test["actual"] - df_test["yesterday"])))
    mae_physics = float(np.mean(np.abs(df_test["actual"] - df_test["phys_target"])))

    # Main Model
    pred_proxy = np.clip(model.predict(df_test[features]), 0.0, capacity_kw)
    mae_proxy = float(np.mean(np.abs(df_test["actual"] - pred_proxy)))

    # No-Future-Weather Model
    print("Training Wind No-Future-Weather model on train split...")
    df_nf_tr = build_no_future_wind_tabular(wind, pure_train_days, stride=8)
    df_nf_va = build_no_future_wind_tabular(wind, val_days, stride=8)
    df_nf_te = build_no_future_wind_tabular(wind, test_days, stride=4)

    nf_feats = [
        "h", "p_t", "lag_1", "lag_2", "lag_4", "lag_96", "rm_4", "rm_12",
        "ws_t", "sin_hour", "cos_hour"
    ]
    m_nf = lgb.LGBMRegressor(n_estimators=300, learning_rate=0.05, num_leaves=31, random_state=42, verbose=-1)
    m_nf.fit(df_nf_tr[nf_feats], df_nf_tr["actual"], eval_set=[(df_nf_va[nf_feats], df_nf_va["actual"])], callbacks=[lgb.early_stopping(20, verbose=False)])
    pred_nf = np.clip(m_nf.predict(df_nf_te[nf_feats]), 0.0, capacity_kw)
    mae_no_weather = float(np.mean(np.abs(df_nf_te["actual"] - pred_nf)))

    # Noise Sensitivity
    np.random.seed(42)
    noise_10 = np.random.normal(1.0, 0.10, size=len(df_test))
    ws_10 = np.clip(df_test["ws_target"].values * noise_10, 0.0, None)
    phys_10 = calculate_wind_power(ws_10)
    df_10 = df_test.copy()
    df_10["ws_target"] = ws_10
    df_10["phys_target"] = phys_10
    pred_10 = np.clip(model.predict(df_10[features]), 0.0, capacity_kw)
    mae_noise_10 = float(np.mean(np.abs(df_test["actual"] - pred_10)))

    np.random.seed(42)
    noise_20 = np.random.normal(1.0, 0.20, size=len(df_test))
    ws_20 = np.clip(df_test["ws_target"].values * noise_20, 0.0, None)
    phys_20 = calculate_wind_power(ws_20)
    df_20 = df_test.copy()
    df_20["ws_target"] = ws_20
    df_20["phys_target"] = phys_20
    pred_20 = np.clip(model.predict(df_20[features]), 0.0, capacity_kw)
    mae_noise_20 = float(np.mean(np.abs(df_test["actual"] - pred_20)))

    buckets = [(1, 4), (5, 16), (17, 48), (49, 96)]
    bucket_results = []
    for b_min, b_max in buckets:
        mask = (df_test["h"] >= b_min) & (df_test["h"] <= b_max)
        b_mae_proxy = float(np.mean(np.abs(df_test.loc[mask, "actual"] - pred_proxy[mask])))
        b_mae_nf = float(np.mean(np.abs(df_nf_te.loc[mask, "actual"] - pred_nf[mask])))
        bucket_results.append((f"{b_min}-{b_max}", b_mae_proxy, b_mae_nf))

    return {
        "plant": "Wind Plant 1",
        "capacity_kw": capacity_kw,
        "persist": mae_persist,
        "yesterday": mae_yesterday,
        "physics": mae_physics,
        "no_weather": mae_no_weather,
        "proxy": mae_proxy,
        "noise_10": mae_noise_10,
        "noise_20": mae_noise_20,
        "buckets": bucket_results,
    }


def print_honesty_report(s_res, w_res):
    print("\n==========================================================================================================================")
    print("                                      HONEST ACCURACY BREAKDOWN COMPARISON TABLE                                          ")
    print("==========================================================================================================================")
    headers = [
        "Plant", "Persistence", "Yesterday", "Physics-only", "No-Future-Wxr",
        "Model (Proxy)", "+10% Noise", "+20% Noise"
    ]
    print(f"{headers[0]:<15} | {headers[1]:<12} | {headers[2]:<12} | {headers[3]:<12} | {headers[4]:<13} | {headers[5]:<13} | {headers[6]:<10} | {headers[7]:<10}")
    print("-" * 122)
    for r in [s_res, w_res]:
        print(
            f"{r['plant']:<15} | {r['persist']:<12.2f} | {r['yesterday']:<12.2f} | {r['physics']:<12.2f} | "
            f"{r['no_weather']:<13.2f} | {r['proxy']:<13.2f} | {r['noise_10']:<10.2f} | {r['noise_20']:<10.2f}"
        )
    print("-" * 122)

    print("\n--- Horizon Bucket MAE (kW): Model (Proxy Weather) vs No-Future-Weather Model ---")
    print(f"{'Bucket (Blocks Ahead)':<24} | {'Solar Model (Proxy)':<20} | {'Solar (No-Future-Wxr)':<22} | {'Wind Model (Proxy)':<20} | {'Wind (No-Future-Wxr)':<22}")
    print("-" * 116)
    for i in range(len(s_res["buckets"])):
        b_label, s_proxy, s_nf = s_res["buckets"][i]
        _, w_proxy, w_nf = w_res["buckets"][i]
        print(f"{b_label:<24} | {s_proxy:<20.2f} | {s_nf:<22.2f} | {w_proxy:<20.2f} | {w_nf:<22.2f}")
    print("-" * 116)


if __name__ == "__main__":
    s_res = evaluate_solar()
    w_res = evaluate_wind()
    print_honesty_report(s_res, w_res)
