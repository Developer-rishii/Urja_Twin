# UrjaTwin: Live Digital Twin & DSM Compliance Decision Support for Renewable Plants

[![UrjaTwin Architecture](https://img.shields.io/badge/Architecture-FastAPI%20%7C%20Mosquitto%20%7C%20MongoDB%20%7C%20React%20Vite-0284C7.svg)](#architecture)
[![SIH 2026](https://img.shields.io/badge/SIH-2026%20Virtual%20Jury%20Demo-10B981.svg)](#quick-start-demo-guide)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**UrjaTwin** is a high-fidelity digital twin and decision-support system built for solar PV and wind turbine power plant operators. It ingests 15-minute sensor SCADA streams via MQTT, simulates continuous physics-informed expected power generation, predicts 96-step (24-hour ahead) dispatch profiles via LightGBM, evaluates Deviation Settlement Mechanism (DSM) tolerance breaches, detects panel soiling, and enables safe what-if sandbox trials.

---

## Architecture Overview

```
                      +--------------------------------------+
                      |  Simulator (simulator/replay.py)     |
                      |  - Replays Indian Solar & SCADA Wind |
                      |  - Injects: cloud, dust, wind_drop   |
                      +------------------+-------------------+
                                         |  MQTT (1883)
                                         v
                      +--------------------------------------+
                      |  Eclipse Mosquitto MQTT Broker       |
                      |  Topic: urjatwin/{plant_id}/telemetry|
                      +------------------+-------------------+
                                         |
                                         v
  +-------------------------------------------------------------------------+
  |                        FastAPI Backend Engine (8000)                    |
  |  - MQTT Async Subscriber -> Ingests & Validates Telemetry Packets       |
  |  - Physics Twin Engine (PV STC / Aerodynamic Wind Equations)            |
  |  - ML Forecaster (LightGBM Direct Multi-Step, 96 Blocks Ahead)          |
  |  - Twin Sync Loop (Real-time Gap % & Soiling Detection)                 |
  |  - DSM Compliance Engine (CERC Tolerance Band Checking & Schedule Shift)|
  |  - Sandbox Engine (Detached In-Memory What-If Simulation on Twin Clones)|
  +--------------------+-------------------------------+--------------------+
                       |                               |
        MongoDB (27017)|                               | REST API (JSON)
                       v                               v
            +--------------------+       +----------------------------------+
            |  MongoDB Storage   |       | React Dashboard (Vite + TS, 5173)|
            |  - readings        |       | - 15-min DSM Shaded Zone Chart   |
            |  - forecasts       |       | - Live Alerts & Soiling Badges   |
            |  - alerts          |       | - Physics Model & Sync View      |
            |  - twin_state      |       | - Sandbox What-If Simulator      |
            +--------------------+       +----------------------------------+
```

---

## Service Ports Table

| Service | Port | Protocol | Purpose / URL |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | `5173` | HTTP | React + TypeScript Dashboard: [http://localhost:5173](http://localhost:5173) |
| **Backend REST API** | `8000` | HTTP | FastAPI Endpoints & Swagger Docs: [http://localhost:8000/docs](http://localhost:8000/docs) |
| **MQTT Broker** | `1883` | TCP | Eclipse Mosquitto Telemetry Broker (`localhost:1883`) |
| **MongoDB** | `27017` | TCP | Telemetry, Twin State, Alerts & Forecasts Database |

---

## Quick Start Demo Guide

### 1. Prerequisites
- Docker & Docker Compose (`v2+`)
- Python 3.11+ (for simulator replay)
- Node.js 20+ (optional if running locally outside container)

### 2. Launch Docker Stack
Clone the repository and spin up the complete containerized stack:
```bash
git clone https://github.com/Developer-rishii/Urja_Twin.git
cd Urja_Twin/urjatwin

# Spin up Mosquitto, MongoDB, FastAPI Backend, and React Frontend
docker compose up -d --build
```
Verify all 4 services are healthy and running:
```bash
docker compose ps
```

### 3. Open Web Dashboard
Navigate to [http://localhost:5173](http://localhost:5173) on any browser.

---

## Interactive Fault Injection & Scenarios Guide

Open a terminal to stream real 15-minute telemetry into the digital twin using the replay simulator:

### Scenario 1: Normal Operation Replay
Stream normal solar generation from Kaggle telemetry:
```bash
python simulator/replay.py --plant solar_plant_1 --date 2020-06-10 --delay 0.1
```
*Expected Result:*
- Dashboard chart updates in real-time.
- Twin gap tracks closely within the $\pm 10\%$ band.
- Node status shows `ACTIVE STREAM`.

### Scenario 2: Cloud Event (DSM Breach Injection)
Inject sudden 60% irradiance attenuation during peak midday hours:
```bash
python simulator/replay.py --plant solar_plant_1 --date 2020-06-10 --inject cloud --delay 0.1
```
*Expected Result:*
- Actual power plummets while schedule expects peak midday power.
- **Red DSM Breach Dots** trigger on the main hero chart.
- Navigating to **Alerts & DSM** surfaces `dsm_breach` alerts and displays the **Suggested Revised Schedule** that mitigates exposure.

### Scenario 3: Dust & Soiling Event
Inject persistent soiling degradation:
```bash
python simulator/replay.py --plant solar_plant_1 --date 2020-06-11 --inject dust --delay 0.1
```
*Expected Result:*
- Rolling actual/expected power ratio drops below 0.93.
- Amber **Panel Soiling Badge** triggers (`WASH RECOMMENDED`).
- Quantifies estimated loss (e.g., $43.4\%$) and calculated cleaning recovery gain ($+11,500\text{ kW}$).

### Scenario 4: Edge Sensor Node Offline
Simulate field telemetry drop:
```bash
python simulator/replay.py --plant solar_plant_1 --date 2020-06-10 --inject node_offline --delay 0.1
```
*Expected Result:*
- Telemetry halts; Node status turns red (`OFFLINE`).
- Warning banner triggers on the **Sandbox** and **Twin** pages.

### Scenario 5: What-If Sandbox Simulation
Navigate to [http://localhost:5173/sandbox](http://localhost:5173/sandbox):
1. Select **Add Battery Storage (BESS Mitigation)**.
2. Drag the slider to **20 MWh**.
3. Click **Run on Twin**.
*Expected Result:*
- BESS charges during surplus hours and discharges during undergeneration.
- DSM breaches reduce from 22 blocks down to 1 block ($142.6\%$ relative exposure reduction).
- Twin state copy guarantee badge certifies zero corruption of production database state.

---

## Test Suite Execution
Run the automated test suite covering physics equations, data leakage checks, DSM boundaries, REST endpoints, and sandbox isolation:
```bash
docker compose exec backend pytest
```
*Expected output:* `30 passed in ~2.5s`.

---

## Transparency & Jury Honesty Statement
- Telemetry streams are derived from verified open-access historical datasets (Kaggle India Solar Power Generation & SCADA Wind Turbine).
- Every UI view explicitly carries a `Data Source: Simulated Node (Replay)` tag.
- 96-block forecasting accuracy benchmarks in `ml/results.md` are evaluated using strict **chronological time-based test splits** (zero random shuffling and zero target leakage).

---

## License
MIT License. Developed by Team CuraX for the Smart India Hackathon (SIH 2026).
