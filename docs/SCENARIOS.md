# UrjaTwin Demo Scenarios & Fault Injection Guide

## Overview
The simulator (`simulator/replay.py`) streams real historical 15-minute telemetry blocks from `data/processed/solar.csv` or `data/processed/wind.csv` to the MQTT broker (`urjatwin/{plant_id}/telemetry`).

Every telemetry packet carries the label `"source": "simulated_node"`.

A configurable replay speed allows 1 block per second (or fractional seconds), enabling an entire 24-hour cycle (96 blocks) to execute in ~1.5 to 3 minutes for live jury demonstrations.

---

## Fault Injection Scenarios

### 1. `cloud` (Sudden Cloud Cover / Solar Ramp Down)
- **Mechanism:** Irradiance drops abruptly by 60% for 8 consecutive blocks during peak daylight hours.
- **Physics & ML Effect:** Actual generation plunges while the baseline day-ahead schedule expects high generation.
- **Expected Alert:** **`dsm_breach`** alert triggered immediately due to under-injection exceeding the 10% tolerance band. The suggested revised schedule shifts downward to prevent cumulative DSM exposure.

### 2. `dust` (Dust Accumulation & Soiling)
- **Mechanism:** Simulates dust deposition over 6-10 blocks: output power drops by 15-20% relative to clean physics expectation while environmental sensors report elevated particulate matter ($\text{PM}_{2.5} > 80\ \mu\text{g/m}^3, \text{PM}_{10} > 120\ \mu\text{g/m}^3$).
- **Physics & ML Effect:** The rolling ratio $\frac{\text{actual}}{\text{expected}}$ drops below 0.93.
- **Expected Alert:** **`soiling`** alert triggered ("Soiling suspected: performance ratio dropped..."). Calculates estimated loss % and cleaning gain (+kW) for automated maintenance scheduling.

### 3. `wind_drop` (Sudden Wind Lull)
- **Mechanism:** Wind speed drops abruptly to 1.5 m/s (below the 3.0 m/s cut-in threshold) for 8 consecutive blocks during a scheduled generation window.
- **Physics & ML Effect:** Turbine power drops to 0 kW while scheduled output is positive.
- **Expected Alert:** **`dsm_breach`** alert with high relative financial exposure and suggested revised schedule.

### 4. `node_offline` (IoT Gateway Failure / Telemetry Loss)
- **Mechanism:** Telemetry stream abruptly halts for 4+ blocks.
- **Backend Monitor Effect:** Heartbeat watchdog identifies that the latest reading age exceeds 30 minutes.
- **Expected Alert:** **`node_offline`** alert generated; node status in `/state` transitions from `"online"` to `"offline"`.

---

## Running the Simulator

### Normal Replay
```bash
python simulator/replay.py --plant solar_plant_1 --date 2020-06-10 --delay 0.5
```

### Injecting Fault Scenarios
```bash
# Inject sudden cloud cover
python simulator/replay.py --plant solar_plant_1 --date 2020-06-10 --inject cloud --delay 0.1

# Inject dust/soiling event
python simulator/replay.py --plant solar_plant_1 --date 2020-06-10 --inject dust --delay 0.1

# Inject sudden wind drop
python simulator/replay.py --plant wind_plant_1 --date 2018-10-15 --inject wind_drop --delay 0.1

# Inject node offline
python simulator/replay.py --plant solar_plant_1 --date 2020-06-10 --inject node_offline --delay 0.1
```
