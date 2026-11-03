# UrjaTwin Dataset Notes

## 1. Solar Dataset (Hero Dataset)

- **Dataset Name:** Solar Power Generation Data
- **Source Platform:** Kaggle
- **Original Author:** Ani Kannal (`anikannal`)
- **Dataset URL:** [https://www.kaggle.com/datasets/anikannal/solar-power-generation-data](https://www.kaggle.com/datasets/anikannal/solar-power-generation-data)
- **License:** Data files © Original Authors (`copyright-authors` on Kaggle, publicly available for research/academic study).
- **Plant Selected:** Plant 1 (India)
- **Raw Files Used:**
  - `Plant_1_Generation_Data.csv`: Inverter-level power generation readings across 22 inverters.
  - `Plant_1_Weather_Sensor_Data.csv`: Weather sensor station readings (ambient temperature, module temperature, irradiation).
- **Date Range:** `2020-05-15 00:00:00` to `2020-06-17 23:45:00` (34 days = 3,264 15-minute blocks).
- **Preprocessing & Resampling:**
  - Aggregated AC power across all 22 inverters to compute plant-level total `power_kw`.
  - Merged with weather sensor readings on a strict, continuous 15-minute datetime grid (`freq='15min'`).
  - Night hours defined between 18:45 and 05:30 IST; generation and irradiation during night hours are strictly set to 0.0 kW and 0.0.
  - Missing daytime sensor readings linearly interpolated across time with backward/forward fill for boundary edges.
- **Processed Columns:**
  - `ts`: ISO 8601 timestamp string (`YYYY-MM-DDTHH:MM:SS`)
  - `power_kw`: Plant total AC power output in kilowatts
  - `irradiance`: Solar irradiation ($W/m^2$ equivalent index)
  - `ambient_temp`: Ambient air temperature in °C
  - `module_temp`: PV panel surface module temperature in °C

---

## 2. Wind Dataset

- **Dataset Name:** Wind Turbine Scada Dataset
- **Source Platform:** Kaggle
- **Original Author:** Berk Erisen (`berkeratatan`)
- **Dataset URL:** [https://www.kaggle.com/datasets/berkeratatan/wind-turbine-scada-dataset](https://www.kaggle.com/datasets/berkeratatan/wind-turbine-scada-dataset)
- **License:** Unknown / Copyright of author (publicly released on Kaggle for machine learning benchmark analysis).
- **Raw File Used:** `T1.csv` (SCADA system from a commercial wind turbine in Turkey, 2018).
- **Date Range:** `2018-01-01 00:00:00` to `2018-12-31 23:45:00` (365 days = 35,040 15-minute blocks).
- **Preprocessing & Resampling:**
  - Original SCADA telemetry was recorded at 10-minute intervals.
  - Resampled to a standardized 15-minute time grid using mean aggregation (`resample('15min').mean()`).
  - Missing blocks interpolated using time-based linear interpolation (`interpolate(method='time')`).
  - Clipped active power and wind speed at a minimum of 0.0.
- **Processed Columns:**
  - `ts`: ISO 8601 timestamp string (`YYYY-MM-DDTHH:MM:SS`)
  - `power_kw`: Active electrical power generated in kilowatts
  - `wind_speed`: Hub-height wind speed in meters per second ($m/s$)
