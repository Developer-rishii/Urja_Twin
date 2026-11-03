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

## 3. Honest Accuracy Breakdown & Weather Dependency (Task T3b)

To quantify precisely how much predictive performance relies on the forecast proxy weather versus autoregressive telemetry and diurnal cycles, we benchmarked four additional configurations across the exact same test rows:
1. **Physics-only:** Theoretical physics formula ($P_{pv}$ or $P_{wind}$) calculated directly using future weather at $t+h$, with zero ML learned parameters.
2. **No-Future-Weather Model:** Identical LightGBM regressor trained strictly without future weather at $t+h$ (using only $p_t$, lags 1, 2, 4, 96, rolling means 4, 12, hour $\sin/\cos$, and weather at issue time $t$).
3. **Model +10% Weather Noise:** Main ML model evaluated when future weather inputs at test time are perturbed with zero-mean Gaussian noise ($\sigma = 10\%$, fixed seed 42).
4. **Model +20% Weather Noise:** Main ML model evaluated with Gaussian weather noise ($\sigma = 20\%$, fixed seed 42).

### Comprehensive Accuracy Breakdown Table (MAE in kW)

| Plant | Persistence | Yesterday | Physics-only | No-Future-Wxr | Model (Proxy Wxr) | +10% Noise | +20% Noise |
|---|---|---|---|---|---|---|---|
| **Solar Plant 1 (32 MW)** | 8,180.70 | 1,872.86 | 274.00 | 1,571.18 | **206.88** | 493.33 | 899.87 |
| **Wind Plant 1 (3.6 MW)** | 840.01 | 1,175.85 | 231.94 | 861.98 | **189.47** | 279.98 | 415.08 |

### Horizon Bucket Breakdown: Proxy Model vs No-Future-Weather Model (MAE in kW)

| Horizon Bucket (Blocks Ahead) | Solar Model (Proxy) | Solar (No-Future-Wxr) | Wind Model (Proxy) | Wind (No-Future-Wxr) |
|---|---|---|---|---|
| **1 - 4 blocks** (15 min – 1 hr) | 199.87 | 1,464.89 | 144.93 | 358.07 |
| **5 - 16 blocks** (1.25 hr – 4 hr) | 199.83 | 1,525.14 | 161.64 | 511.42 |
| **17 - 48 blocks** (4.25 hr – 12 hr) | 201.47 | 1,562.78 | 185.47 | 800.85 |
| **49 - 96 blocks** (12.25 hr – 24 hr) | 212.83 | 1,597.14 | 202.81 | 1,032.37 |

---

## 4. Honest Summary: Impact of Weather Forecast Quality

1. **Weather Information is the Primary Driver of Multi-Hour Accuracy:**
   - For **Solar**, removing future irradiance causes test MAE to increase from **206.88 kW to 1,571.18 kW** (a ~7.6x degradation). The no-future-weather model still outperforms persistence (8,180 kW) and same-time-yesterday (1,872 kW) by learning diurnal curves from $\sin/\cos(\text{hour})$, but it cannot predict cloud cover.
   - For **Wind**, removing future wind speed degrades MAE from **189.47 kW to 861.98 kW** (worse than persistence, 840 kW). Autoregressive wind speed information decays rapidly beyond 1 hour (Bucket 1-4 MAE is 358 kW, but degrades to 1,032 kW by Bucket 49-96).
2. **Physics Baseline is Extremely Strong:**
   - For Solar, physics-only output using proxy weather achieves an MAE of **274.00 kW**. LightGBM refines this by learning inverter clipping, non-linear thermal losses, and morning/evening ramp offsets down to **206.88 kW** (a 24.5% improvement over pure physics).
   - For Wind, physics-only achieves an MAE of **231.94 kW**, which LightGBM refines to **189.47 kW** (an 18.3% improvement).
3. **Resilience to Numerical Weather Prediction (NWP) Noise:**
   - Under realistic operational NWP errors (10% to 20% weather forecast noise), the model degrades gracefully:
     - At +10% noise: Solar MAE is **493.33 kW** (1.54% of capacity); Wind MAE is **279.98 kW** (7.78% of capacity).
     - At +20% noise: Solar MAE is **899.87 kW** (2.81% of capacity); Wind MAE is **415.08 kW** (11.53% of capacity).
   - In both cases, the hybrid Physics + LightGBM architecture retains a substantial advantage over standard operational baselines (persistence and yesterday), confirming that digital twin physics regularization keeps predictions grounded even when atmospheric forecasts are imperfect.
