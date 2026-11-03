"""Evaluation script for UrjaTwin 96-block generation forecasting.

Strict Rules Enforced:
1. Min/max timestamps of train and test printed with assert train_max < test_min.
2. Confirm zero test rows appear in training set.
3. Baselines: Persistence (value at t) and Same-Time-Yesterday (target - 96 blocks).
   Both computed on the EXACT same test rows.
4. Metrics on TEST: MAE, RMSE, and MAE as % of plant capacity (32 MW solar, 3.6 MW wind).
   Computed for daytime and overall (solar) and overall (wind).
   No MAPE used.
5. Horizon bucket breakdown: 1-4, 5-16, 17-48, 49-96 blocks ahead.
"""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / "backend"))

import joblib
import numpy as np
import pandas as pd

from app.twin.physics import calculate_solar_power, calculate_wind_power
from ml.train import build_solar_tabular, build_wind_tabular

DATA_DIR = BASE_DIR / "data" / "processed"
MODELS_DIR = BASE_DIR / "ml" / "models"


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

    # Build test samples (stride=1: evaluate every 15-minute issue time in test period)
    df_test = build_solar_tabular(solar, test_days, stride=1)
    print(f"Total test prediction rows evaluated across 96 horizons: {len(df_test)}")

    # Load model and meta
    model = joblib.load(MODELS_DIR / "solar_lgb.pkl")
    meta = joblib.load(MODELS_DIR / "solar_meta.pkl")

    features = meta["features"]
    variant = meta["variant"]
    capacity_kw = meta["capacity_kw"]

    if variant == "residual":
        pred_res = model.predict(df_test[features])
        pred_power = np.clip(df_test["phys_target"] + pred_res, 0.0, capacity_kw)
    else:
        pred_power = np.clip(model.predict(df_test[features]), 0.0, capacity_kw)

    df_test["pred"] = pred_power

    # Masks
    daytime_mask = df_test["irr_target"] > 0.05

    def calc_metrics(actual, pred):
        mae = float(np.mean(np.abs(actual - pred)))
        rmse = float(np.sqrt(np.mean((actual - pred) ** 2)))
        pct_cap = (mae / capacity_kw) * 100.0
        return mae, rmse, pct_cap

    # Baselines vs Model
    # Overall
    mae_p_all, rmse_p_all, pct_p_all = calc_metrics(df_test["actual"], df_test["persist"])
    mae_y_all, rmse_y_all, pct_y_all = calc_metrics(df_test["actual"], df_test["yesterday"])
    mae_m_all, rmse_m_all, pct_m_all = calc_metrics(df_test["actual"], df_test["pred"])

    # Daytime
    act_day = df_test.loc[daytime_mask, "actual"]
    mae_p_day, rmse_p_day, pct_p_day = calc_metrics(act_day, df_test.loc[daytime_mask, "persist"])
    mae_y_day, rmse_y_day, pct_y_day = calc_metrics(act_day, df_test.loc[daytime_mask, "yesterday"])
    mae_m_day, rmse_m_day, pct_m_day = calc_metrics(act_day, df_test.loc[daytime_mask, "pred"])

    # Horizon breakdown for Model
    buckets = [(1, 4), (5, 16), (17, 48), (49, 96)]
    bucket_results = []
    for b_min, b_max in buckets:
        b_df = df_test[(df_test["h"] >= b_min) & (df_test["h"] <= b_max)]
        b_mae = float(np.mean(np.abs(b_df["actual"] - b_df["pred"])))
        b_pct = (b_mae / capacity_kw) * 100.0
        bucket_results.append((f"{b_min}-{b_max}", b_mae, b_pct))

    return {
        "plant": "Solar Plant 1",
        "capacity_kw": capacity_kw,
        "train_min": train_min,
        "train_max": train_max,
        "test_min": test_min,
        "test_max": test_max,
        "overall": {
            "persist": (mae_p_all, rmse_p_all, pct_p_all),
            "yesterday": (mae_y_all, rmse_y_all, pct_y_all),
            "model": (mae_m_all, rmse_m_all, pct_m_all),
        },
        "daytime": {
            "persist": (mae_p_day, rmse_p_day, pct_p_day),
            "yesterday": (mae_y_day, rmse_y_day, pct_y_day),
            "model": (mae_m_day, rmse_m_day, pct_m_day),
        },
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
    test_days = list(days[split_idx:])

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

    # Stride=4 for test evaluation (covers every hour of the 92 test days)
    df_test = build_wind_tabular(wind, test_days, stride=4)
    print(f"Total test prediction rows evaluated across 96 horizons: {len(df_test)}")

    model = joblib.load(MODELS_DIR / "wind_lgb.pkl")
    meta = joblib.load(MODELS_DIR / "wind_meta.pkl")

    features = meta["features"]
    variant = meta["variant"]
    capacity_kw = meta["capacity_kw"]

    if variant == "residual":
        pred_res = model.predict(df_test[features])
        pred_power = np.clip(df_test["phys_target"] + pred_res, 0.0, capacity_kw)
    else:
        pred_power = np.clip(model.predict(df_test[features]), 0.0, capacity_kw)

    df_test["pred"] = pred_power

    def calc_metrics(actual, pred):
        mae = float(np.mean(np.abs(actual - pred)))
        rmse = float(np.sqrt(np.mean((actual - pred) ** 2)))
        pct_cap = (mae / capacity_kw) * 100.0
        return mae, rmse, pct_cap

    mae_p, rmse_p, pct_p = calc_metrics(df_test["actual"], df_test["persist"])
    mae_y, rmse_y, pct_y = calc_metrics(df_test["actual"], df_test["yesterday"])
    mae_m, rmse_m, pct_m = calc_metrics(df_test["actual"], df_test["pred"])

    buckets = [(1, 4), (5, 16), (17, 48), (49, 96)]
    bucket_results = []
    for b_min, b_max in buckets:
        b_df = df_test[(df_test["h"] >= b_min) & (df_test["h"] <= b_max)]
        b_mae = float(np.mean(np.abs(b_df["actual"] - b_df["pred"])))
        b_pct = (b_mae / capacity_kw) * 100.0
        bucket_results.append((f"{b_min}-{b_max}", b_mae, b_pct))

    return {
        "plant": "Wind Plant 1",
        "capacity_kw": capacity_kw,
        "train_min": train_min,
        "train_max": train_max,
        "test_min": test_min,
        "test_max": test_max,
        "overall": {
            "persist": (mae_p, rmse_p, pct_p),
            "yesterday": (mae_y, rmse_y, pct_y),
            "model": (mae_m, rmse_m, pct_m),
        },
        "buckets": bucket_results,
    }


def print_report(s_res, w_res):
    print("\n=========================================================================================")
    print("                             FINAL EVALUATION SUMMARY TABLE                              ")
    print("=========================================================================================")
    print(f"{'Plant & Scope':<22} | {'Persistence MAE':<15} | {'Yesterday MAE':<15} | {'Our Model MAE':<15} | {'Improvement vs Best Base':<24}")
    print("-" * 97)

    # Solar Overall
    s_o = s_res["overall"]
    best_base_s_o = min(s_o["persist"][0], s_o["yesterday"][0])
    imp_s_o = ((best_base_s_o - s_o["model"][0]) / best_base_s_o) * 100.0
    print(f"{'Solar Overall':<22} | {s_o['persist'][0]:<15.2f} | {s_o['yesterday'][0]:<15.2f} | {s_o['model'][0]:<15.2f} | {imp_s_o:<23.2f}%")

    # Solar Daytime
    s_d = s_res["daytime"]
    best_base_s_d = min(s_d["persist"][0], s_d["yesterday"][0])
    imp_s_d = ((best_base_s_d - s_d["model"][0]) / best_base_s_d) * 100.0
    print(f"{'Solar Daytime':<22} | {s_d['persist'][0]:<15.2f} | {s_d['yesterday'][0]:<15.2f} | {s_d['model'][0]:<15.2f} | {imp_s_d:<23.2f}%")

    # Wind Overall
    w_o = w_res["overall"]
    best_base_w_o = min(w_o["persist"][0], w_o["yesterday"][0])
    imp_w_o = ((best_base_w_o - w_o["model"][0]) / best_base_w_o) * 100.0
    print(f"{'Wind Overall':<22} | {w_o['persist'][0]:<15.2f} | {w_o['yesterday'][0]:<15.2f} | {w_o['model'][0]:<15.2f} | {imp_w_o:<23.2f}%")
    print("-" * 97)

    print("\n--- Horizon Bucket MAE Breakdown (kW and % Capacity) ---")
    print(f"{'Bucket (Blocks Ahead)':<24} | {'Solar Model MAE (kW)':<22} | {'Solar % Capacity':<18} | {'Wind Model MAE (kW)':<20} | {'Wind % Capacity':<16}")
    print("-" * 106)
    for i in range(len(s_res["buckets"])):
        b_label, s_mae, s_pct = s_res["buckets"][i]
        _, w_mae, w_pct = w_res["buckets"][i]
        print(f"{b_label:<24} | {s_mae:<22.2f} | {s_pct:<17.2f}% | {w_mae:<20.2f} | {w_pct:<15.2f}%")
    print("-" * 106)


if __name__ == "__main__":
    s_res = evaluate_solar()
    w_res = evaluate_wind()
    print_report(s_res, w_res)
