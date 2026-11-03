# UrjaTwin ML 96-Block Generation Forecast Results

## 1. Datasets & Split Setup

- **Solar Dataset:** Solar Power Generation Data (Kaggle, Plant 1 India)
  - Train Period: `2020-05-15T00:00:00` to `2020-06-08T23:45:00` (25 days)
  - Test Period: `2020-06-09T00:00:00` to `2020-06-17T23:45:00` (9 days)
  - Split Date: `2020-06-09`
  - Nominal Capacity: $32{,}000\text{ kW}$ (32 MW)
  - Selected Variant: **Variant (b) Physics Residual** (Validation MAE: 358.09 kW vs 456.49 kW for direct)

- **Wind Dataset:** Wind Turbine SCADA Dataset (Kaggle, Turkey T1)
  - Train Period: `2018-01-01T00:00:00` to `2018-09-30T23:45:00` (273 days)
  - Test Period: `2018-10-01T00:00:00` to `2018-12-31T23:45:00` (92 days)
  - Split Date: `2018-10-01`
  - Rated Capacity: $3{,}600\text{ kW}$ (3.6 MW)
  - Selected Variant: **Variant (a) Direct Power** (Validation MAE: 103.94 kW vs 110.12 kW for residual)

> [!IMPORTANT]
> **Forecast Proxy Caveat (Honest Documentation)**:
> In replay mode and historical backtesting, future weather at target step $t+h$ (irradiance, ambient and module temperature for solar; wind speed for wind) is sourced from the dataset's recorded measurements and serves as an optimistic **forecast proxy**. In an operational production deployment, numerical weather prediction (NWP) or satellite irradiance feeds would provide these inputs. All autoregressive lag and rolling features (`p_t`, `lag_1`, `lag_2`, `lag_4`, `lag_96`, `rm_4`, `rm_12`) strictly use telemetry available at or before issue time $t$.

---

## 2. Test Set Evaluation: Model vs Baselines

Evaluated on the exact same test rows across all 96 horizon steps:
- **Persistence Baseline:** Power at issue time $t$ projected forward for all $h \in [1, 96]$.
- **Same-Time-Yesterday Baseline:** Actual power recorded exactly 96 blocks (24 hours) prior to the target time $t+h$.

| Plant & Scope | Persistence MAE (kW) | Yesterday MAE (kW) | Our Model MAE (kW) | Improvement vs Best Baseline (%) |
|---|---|---|---|---|
| **Solar Overall** | 8,180.70 | 1,872.86 | **206.88** | **88.95%** |
| **Solar Daytime** | 10,398.99 | 3,951.08 | **432.81** | **89.05%** |
| **Wind Overall** | 840.01 | 1,175.85 | **189.47** | **77.44%** |

### Additional Error Metrics on Test Set
- **Solar Overall:** RMSE = $474.40\text{ kW}$ | MAE = **0.65%** of plant capacity ($32\text{ MW}$)
- **Solar Daytime:** RMSE = $691.74\text{ kW}$ | MAE = **1.35%** of plant capacity ($32\text{ MW}$)
- **Wind Overall:** RMSE = $381.75\text{ kW}$ | MAE = **5.26%** of plant capacity ($3.6\text{ MW}$)

---

## 3. Horizon Bucket Breakdown (Model MAE)

| Horizon Bucket (Blocks Ahead) | Solar Model MAE (kW) | Solar MAE (% Capacity) | Wind Model MAE (kW) | Wind MAE (% Capacity) |
|---|---|---|---|---|
| **1 - 4 blocks** (15 min – 1 hr) | 199.87 | 0.62% | 144.93 | 4.03% |
| **5 - 16 blocks** (1.25 hr – 4 hr) | 199.83 | 0.62% | 161.64 | 4.49% |
| **17 - 48 blocks** (4.25 hr – 12 hr) | 201.47 | 0.63% | 185.47 | 5.15% |
| **49 - 96 blocks** (12.25 hr – 24 hr) | 212.83 | 0.67% | 202.81 | 5.63% |
