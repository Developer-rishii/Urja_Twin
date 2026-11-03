"""Calibrate physics twin parameters (PR for solar, Cp for wind) and evaluate accuracy.

Strict ML & Physics Twin rules:
1. Time-based train/test split: first 75% of days for training, remaining 25% for test.
2. Calibration is performed ONLY on the TRAIN period. Test period is untouched.
3. Compute MAE and MAPE for both TRAIN and TEST periods.
   - For solar: compute daytime MAPE (irradiance > 0.05 kW/m2) to avoid dividing by zero at night.
   - For wind: compute active-generation MAPE (actual > 10 kW) to avoid zero-division issues.
"""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "backend"))

import yaml
import numpy as np
import pandas as pd

from app.twin.physics import calculate_solar_power, calculate_wind_power

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data" / "processed"
PLANTS_DIR = BASE_DIR / "plants"


def check_irradiance_unit(df_solar: pd.DataFrame):
    irr_max = float(df_solar["irradiance"].max())
    irr_min = float(df_solar["irradiance"].min())
    irr_mean = float(df_solar["irradiance"].mean())
    print("\n--- 1. IRRADIANCE UNIT CHECK ---")
    print(f"Observed raw irradiance min : {irr_min:.4f}")
    print(f"Observed raw irradiance max : {irr_max:.4f}")
    print(f"Observed raw irradiance mean: {irr_mean:.4f}")
    print(
        f"Unit State: 'kW/m2'. Max peak irradiance is ~{irr_max:.2f} kW/m2 "
        f"(1221.65 W/m2 at peak sunlight in India). Physics twin internally converts "
        f"G to W/m2 by multiplying by 1000.0, matching P_stc * (G / 1000)."
    )


def calibrate_solar():
    solar_csv = DATA_DIR / "solar.csv"
    solar = pd.read_csv(solar_csv)
    solar["dt"] = pd.to_datetime(solar["ts"])

    # First check unit
    check_irradiance_unit(solar)

    # Time-based split: first 75% of unique days
    days = solar["dt"].dt.date.unique()
    split_idx = int(len(days) * 0.75)
    split_date = days[split_idx]

    train_mask = solar["dt"].dt.date < split_date
    test_mask = solar["dt"].dt.date >= split_date

    train = solar[train_mask].copy()
    test = solar[test_mask].copy()

    # Fit PR on train daytime only (irradiance > 0.05 kW/m2)
    # Fix P_stc = 32000.0 kW (32 MW peak DC capacity), gamma = -0.004
    P_stc = 32000.0
    gamma = -0.004

    daytime_train = train["irradiance"] > 0.05
    # X = P_stc * (G_wm2 / 1000) * [1 + gamma * (T_cell - 25)]
    # Since irradiance is in kW/m2, G_wm2 / 1000.0 == irradiance
    X_train = P_stc * train["irradiance"] * (1.0 + gamma * (train["module_temp"] - 25.0))
    pr_fitted = float(
        np.sum(train.loc[daytime_train, "power_kw"] * X_train[daytime_train])
        / np.sum(X_train[daytime_train] ** 2)
    )

    # Predict using physics twin
    train["pred"] = calculate_solar_power(
        train["irradiance"],
        train["module_temp"],
        p_stc_kw=P_stc,
        gamma=gamma,
        pr=pr_fitted,
        l_soil=0.0,
        irradiance_is_kw_m2=True,
    )
    test["pred"] = calculate_solar_power(
        test["irradiance"],
        test["module_temp"],
        p_stc_kw=P_stc,
        gamma=gamma,
        pr=pr_fitted,
        l_soil=0.0,
        irradiance_is_kw_m2=True,
    )

    # Metrics
    # Overall MAE
    train_mae_all = float(np.mean(np.abs(train["power_kw"] - train["pred"])))
    test_mae_all = float(np.mean(np.abs(test["power_kw"] - test["pred"])))

    # Daytime MAE & MAPE (irradiance > 0.05 kW/m2)
    tr_day = train[train["irradiance"] > 0.05]
    te_day = test[test["irradiance"] > 0.05]

    train_day_mae = float(np.mean(np.abs(tr_day["power_kw"] - tr_day["pred"])))
    test_day_mae = float(np.mean(np.abs(te_day["power_kw"] - te_day["pred"])))

    train_day_mape = float(np.mean(np.abs((tr_day["power_kw"] - tr_day["pred"]) / tr_day["power_kw"])) * 100)
    test_day_mape = float(np.mean(np.abs((te_day["power_kw"] - te_day["pred"]) / te_day["power_kw"])) * 100)

    results = {
        "plant": "Solar Plant 1",
        "split_date": str(split_date),
        "train_days": int(split_idx),
        "test_days": int(len(days) - split_idx),
        "fitted_parameter": f"PR = {pr_fitted:.4f}",
        "train_mae_all": train_mae_all,
        "test_mae_all": test_mae_all,
        "train_day_mae": train_day_mae,
        "test_day_mae": test_day_mae,
        "train_day_mape": train_day_mape,
        "test_day_mape": test_day_mape,
    }
    return results


def calibrate_wind():
    wind_csv = DATA_DIR / "wind.csv"
    wind = pd.read_csv(wind_csv)
    wind["dt"] = pd.to_datetime(wind["ts"])

    days = wind["dt"].dt.date.unique()
    split_idx = int(len(days) * 0.75)
    split_date = days[split_idx]

    train_mask = wind["dt"].dt.date < split_date
    test_mask = wind["dt"].dt.date >= split_date

    train = wind[train_mask].copy()
    test = wind[test_mask].copy()

    # Turbine specs
    p_rated = 3600.0
    rotor_diameter = 114.0
    area = np.pi * ((rotor_diameter / 2.0) ** 2)
    rho = 1.225
    v_cut_in = 3.0
    v_cut_out = 25.0

    # Fit Cp on cubic power curve region in TRAIN period (3 <= v < 12 m/s)
    cubic_mask = (train["wind_speed"] >= v_cut_in) & (train["wind_speed"] < 12.0)
    coeff = 0.5 * rho * area * (train.loc[cubic_mask, "wind_speed"] ** 3) / 1000.0
    cp_fitted = float(
        np.sum(train.loc[cubic_mask, "power_kw"] * coeff)
        / np.sum(coeff ** 2)
    )

    train["pred"] = calculate_wind_power(
        train["wind_speed"],
        p_rated_kw=p_rated,
        rotor_area_m2=area,
        cp=cp_fitted,
        rho=rho,
        v_cut_in=v_cut_in,
        v_cut_out=v_cut_out,
    )
    test["pred"] = calculate_wind_power(
        test["wind_speed"],
        p_rated_kw=p_rated,
        rotor_area_m2=area,
        cp=cp_fitted,
        rho=rho,
        v_cut_in=v_cut_in,
        v_cut_out=v_cut_out,
    )

    # Metrics
    train_mae_all = float(np.mean(np.abs(train["power_kw"] - train["pred"])))
    test_mae_all = float(np.mean(np.abs(test["power_kw"] - test["pred"])))

    # Active generation MAPE (actual > 10 kW) to prevent zero division
    tr_active = train[train["power_kw"] > 10.0]
    te_active = test[test["power_kw"] > 10.0]

    train_active_mae = float(np.mean(np.abs(tr_active["power_kw"] - tr_active["pred"])))
    test_active_mae = float(np.mean(np.abs(te_active["power_kw"] - te_active["pred"])))

    train_active_mape = float(np.mean(np.abs((tr_active["power_kw"] - tr_active["pred"]) / tr_active["power_kw"])) * 100)
    test_active_mape = float(np.mean(np.abs((te_active["power_kw"] - te_active["pred"]) / te_active["power_kw"])) * 100)

    results = {
        "plant": "Wind Plant 1",
        "split_date": str(split_date),
        "train_days": int(split_idx),
        "test_days": int(len(days) - split_idx),
        "fitted_parameter": f"Cp = {cp_fitted:.4f}",
        "train_mae_all": train_mae_all,
        "test_mae_all": test_mae_all,
        "train_active_mae": train_active_mae,
        "test_active_mae": test_active_mae,
        "train_active_mape": train_active_mape,
        "test_active_mape": test_active_mape,
    }
    return results


def print_summary_table(solar_res, wind_res):
    print("\n--- 2. PHYSICS TWIN CALIBRATION AND EVALUATION METRICS ---")
    print(f"{'Plant':<15} | {'Period':<6} | {'Days':<5} | {'MAE Overall (kW)':<18} | {'MAE Active/Day (kW)':<20} | {'MAPE Active/Day (%)':<20}")
    print("-" * 92)
    # Solar
    print(f"{solar_res['plant']:<15} | {'TRAIN':<6} | {solar_res['train_days']:<5} | {solar_res['train_mae_all']:<18.2f} | {solar_res['train_day_mae']:<20.2f} | {solar_res['train_day_mape']:<20.2f}%")
    print(f"{solar_res['plant']:<15} | {'TEST':<6} | {solar_res['test_days']:<5} | {solar_res['test_mae_all']:<18.2f} | {solar_res['test_day_mae']:<20.2f} | {solar_res['test_day_mape']:<20.2f}%")
    print("-" * 92)
    # Wind
    print(f"{wind_res['plant']:<15} | {'TRAIN':<6} | {wind_res['train_days']:<5} | {wind_res['train_mae_all']:<18.2f} | {wind_res['train_active_mae']:<20.2f} | {wind_res['train_active_mape']:<20.2f}%")
    print(f"{wind_res['plant']:<15} | {'TEST':<6} | {wind_res['test_days']:<5} | {wind_res['test_mae_all']:<18.2f} | {wind_res['test_active_mae']:<20.2f} | {wind_res['test_active_mape']:<20.2f}%")
    print("-" * 92)
    print(f"Calibration Parameters (Fitted on TRAIN set only):")
    print(f"  Solar Plant 1: {solar_res['fitted_parameter']} (Split Date: {solar_res['split_date']})")
    print(f"  Wind Plant 1 : {wind_res['fitted_parameter']} (Split Date: {wind_res['split_date']})")


if __name__ == "__main__":
    solar_results = calibrate_solar()
    wind_results = calibrate_wind()
    print_summary_table(solar_results, wind_results)
