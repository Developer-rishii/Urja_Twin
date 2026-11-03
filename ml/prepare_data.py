"""Data preparation script for UrjaTwin.

Reads raw solar and wind datasets, standardizes column formats, parses timestamps,
resamples/aligns to a strict 15-minute grid, handles missing values, sets night-time
solar generation to zero, and exports clean CSVs to data/processed/.
"""

import os
from pathlib import Path
import pandas as pd
import numpy as np


BASE_DIR = Path(__file__).resolve().parent.parent
RAW_DIR = BASE_DIR / "data" / "raw"
PROCESSED_DIR = BASE_DIR / "data" / "processed"


def prepare_solar():
    print("[1/2] Processing Solar dataset...")
    gen_path = RAW_DIR / "Plant_1_Generation_Data.csv"
    weather_path = RAW_DIR / "Plant_1_Weather_Sensor_Data.csv"

    if not gen_path.exists() or not weather_path.exists():
        raise FileNotFoundError(f"Missing solar raw files in {RAW_DIR}")

    # Read raw datasets
    df_gen = pd.read_csv(gen_path)
    df_weather = pd.read_csv(weather_path)

    # Parse timestamps
    df_gen["dt"] = pd.to_datetime(df_gen["DATE_TIME"], format="%d-%m-%Y %H:%M")
    df_weather["dt"] = pd.to_datetime(df_weather["DATE_TIME"])

    # Aggregate inverter-level generation to plant-level total AC power (kW)
    # AC_POWER in dataset is in kW
    df_gen_plant = (
        df_gen.groupby("dt")
        .agg(
            power_kw=("AC_POWER", "sum"),
            dc_power_kw=("DC_POWER", "sum"),
        )
        .reset_index()
    )

    # Weather sensor data (one sensor at plant level)
    df_weather_plant = (
        df_weather.groupby("dt")
        .agg(
            ambient_temp=("AMBIENT_TEMPERATURE", "mean"),
            module_temp=("MODULE_TEMPERATURE", "mean"),
            irradiance=("IRRADIATION", "mean"),
        )
        .reset_index()
    )

    # Create continuous, regular 15-minute grid covering the entire period
    start_dt = min(df_gen_plant["dt"].min(), df_weather_plant["dt"].min())
    end_dt = max(df_gen_plant["dt"].max(), df_weather_plant["dt"].max())
    full_grid = pd.date_range(start=start_dt, end=end_dt, freq="15min")
    df_solar = pd.DataFrame({"dt": full_grid})

    # Merge generation and weather
    df_solar = df_solar.merge(df_gen_plant, on="dt", how="left")
    df_solar = df_solar.merge(df_weather_plant, on="dt", how="left")

    # Define night hours: between 18:45 and 05:30 IST
    hour_float = df_solar["dt"].dt.hour + df_solar["dt"].dt.minute / 60.0
    is_night = (hour_float < 5.5) | (hour_float > 18.75)

    # Step: At night, solar irradiation and generation are strictly zero
    df_solar.loc[is_night, "power_kw"] = 0.0
    df_solar.loc[is_night, "dc_power_kw"] = 0.0
    df_solar.loc[is_night, "irradiance"] = 0.0

    # Handle daytime missing values with linear time interpolation
    df_solar["power_kw"] = df_solar["power_kw"].interpolate(method="linear").fillna(0.0)
    df_solar["dc_power_kw"] = df_solar["dc_power_kw"].interpolate(method="linear").fillna(0.0)
    df_solar["irradiance"] = df_solar["irradiance"].interpolate(method="linear").fillna(0.0)
    df_solar["ambient_temp"] = df_solar["ambient_temp"].interpolate(method="linear").bfill().ffill()
    df_solar["module_temp"] = df_solar["module_temp"].interpolate(method="linear").bfill().ffill()

    # Re-apply strict night zeros and lower clipping
    df_solar.loc[is_night, "power_kw"] = 0.0
    df_solar.loc[is_night, "dc_power_kw"] = 0.0
    df_solar.loc[is_night, "irradiance"] = 0.0
    df_solar["power_kw"] = df_solar["power_kw"].clip(lower=0.0)
    df_solar["dc_power_kw"] = df_solar["dc_power_kw"].clip(lower=0.0)
    df_solar["irradiance"] = df_solar["irradiance"].clip(lower=0.0)

    # Format timestamp as ISO 8601 string
    df_solar["ts"] = df_solar["dt"].dt.strftime("%Y-%m-%dT%H:%M:%S")

    # Standardize output columns
    cols = ["ts", "power_kw", "irradiance", "ambient_temp", "module_temp"]
    df_out = df_solar[cols].copy()

    out_path = PROCESSED_DIR / "solar.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df_out.to_csv(out_path, index=False)
    print(f"  Saved {len(df_out)} rows to {out_path}")
    return df_out


def prepare_wind():
    print("[2/2] Processing Wind dataset...")
    wind_path = RAW_DIR / "T1.csv"

    if not wind_path.exists():
        raise FileNotFoundError(f"Missing wind raw file {wind_path}")

    # Read raw 10-minute SCADA data
    df_wind_raw = pd.read_csv(wind_path)

    # Parse timestamps format: '01 01 2018 00:00'
    df_wind_raw["dt"] = pd.to_datetime(df_wind_raw["Date/Time"], format="%d %m %Y %H:%M")
    df_wind_raw = df_wind_raw.sort_values("dt").drop_duplicates("dt").set_index("dt")

    # Map raw columns to standard names
    # Raw columns: 'LV ActivePower (kW)', 'Wind Speed (m/s)', 'Theoretical_Power_Curve (KWh)'
    wind_speed_col = [c for c in df_wind_raw.columns if "Wind Speed" in c][0]
    power_col = [c for c in df_wind_raw.columns if "ActivePower" in c][0]

    df_subset = pd.DataFrame({
        "power_kw": df_wind_raw[power_col],
        "wind_speed": df_wind_raw[wind_speed_col],
    })

    # Resample 10-min SCADA to 15-min grid taking mean of measurements
    df_resampled = df_subset.resample("15min").mean()

    # Time-based linear interpolation for gaps
    df_interp = df_resampled.interpolate(method="time").bfill().ffill()

    # Physical clipping (active power >= 0)
    df_interp["power_kw"] = df_interp["power_kw"].clip(lower=0.0)
    df_interp["wind_speed"] = df_interp["wind_speed"].clip(lower=0.0)

    # Format timestamp
    df_interp = df_interp.reset_index()
    df_interp["ts"] = df_interp["dt"].dt.strftime("%Y-%m-%dT%H:%M:%S")

    cols = ["ts", "power_kw", "wind_speed"]
    df_out = df_interp[cols].copy()

    out_path = PROCESSED_DIR / "wind.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df_out.to_csv(out_path, index=False)
    print(f"  Saved {len(df_out)} rows to {out_path}")
    return df_out


if __name__ == "__main__":
    df_solar = prepare_solar()
    df_wind = prepare_wind()
    print("Done! Data preparation completed successfully.")
