# UrjaTwin: Single-Developer Development Plan (Task-wise)

Team CuraX | SIH 2026 Virtual Jury | Draft v1, 3 Nov 2026 | Developer: 1 (with Antigravity)

## 1. Reality check aur scope

Ek developer, ek din, aur poora system (sensor node, MQTT, twin, ML forecast, DSM, sandbox, dashboard, deploy) kaafi bada hai. Isliye plan 3 tiers mein hai. **Must** pehle karo, wahi demo ko bacha lega. Baaki tabhi jab time bache.

| Tier | Tasks | Approx time |
| --- | --- | --- |
| **Must** (demo ki jaan) | T0 to T8, T10, T11, T13 | 12-13 ghante |
| **Should** | T9 (sandbox UI), T12 (node health), T14 (deploy) | 3 ghante |
| **Could** | T15 (ESP32 Wokwi firmware), LSTM model | 2 ghante |

**Honest note:** Maine tumhara GitHub code nahi dekha (fetch nahi hua). Live link "CityAtmos" dikhata hai, jo is idea se match nahi karta. Isliye ye plan **naya repo, scratch se** maan ke bana hai. Agar purane repo ka koi hissa reuse karna ho (MQTT client, Mongo setup), to T0 mein dekh lena.

**Jo Must mein hai wo hai:** real-data par train kiya hua 15-min forecast, physics twin, DSM breach alert, soiling detection, MQTT se data flow (simulated node), aur dashboard. Sandbox ke 2 scenarios Must mein hain, baaki Should mein.

## 2. Simplified architecture

Slide par jo stack likha hai usse kuch cheezein simple ki hain taaki ek din mein ho sake. **Slide mein bhi wahi update karna**, warna jury pakad legi.

```
Simulator (replay.py, ya ESP32/Wokwi)
   |  MQTT publish (JSON, har block)
   v
Mosquitto broker  --->  FastAPI backend (single service)
                         |- MQTT subscriber -> MongoDB (time-series readings)
                         |- Physics twin  (PV + wind equations)
                         |- ML forecaster (LightGBM, 96 blocks ahead)
                         |- Twin sync loop (expected vs actual, soiling)
                         |- DSM engine (band check + revised schedule)
                         |- Sandbox (what-if scenarios)
                         v
                   REST API  --->  React dashboard (Vite)
```

**Slide vs plan:**

- Node.js/Express hata diya, **sirf FastAPI** (ML Python mein hai, ek hi backend). Slide mein "Node.js" ki jagah "FastAPI".
- EMQX ki jagah **Mosquitto** (halka). Slide: "MQTT broker (EMQX/Mosquitto)".
- TensorFlow CNN-LSTM ki jagah pehle **LightGBM + physics residual** (tez aur stable). LSTM sirf Could tier. Slide mein jo model actually use ho wahi likho.
- Data: **historical replay** ya simulated node. "Live sensor" mat bolna.

**Ports:** frontend 5173, backend 8000, MQTT 1883, MongoDB 27017.

**Disk tip (Windows):** repo aur Docker data D: drive par rakho, images slim rakho (python:3.11-slim, node:20-alpine), TensorFlow image avoid karo. Kabhi kabhi `docker system prune` chalao.

**Repo layout:**

```
urjatwin/
  docker-compose.yml  .env.example  README.md
  data/raw  data/processed
  plants/   solar_plant_1.yaml  wind_plant_1.yaml
  ml/       prepare_data.py train.py evaluate.py models/ results.md
  simulator/ replay.py
  firmware/  esp32_node.ino  (Could)
  backend/app/ main.py config.py mqtt_client.py storage.py
            twin/ physics.py sync.py calibrate.py
            forecast/ service.py
            dsm/ engine.py
            sandbox/ scenarios.py
            api/ routes_*.py
  frontend/  (Vite + React)
  docs/      DEMO_SCRIPT.md  QA_ANSWERS.md
```

## 3. Rules (single developer)

- Ek task = ek branch = ek commit group. Merge sirf tab jab "Done when" ka real output dekh lo.
- Ek time par ek task Antigravity ko do. Bada kaam ek saath mat do.
- AI ke "done" par bharosa nahi. Command chalao, output khud dekho, khaas kar ML numbers.
- **Data leakage rule:** forecast sirf wahi data use kare jo forecast issue karte waqt available ho (time t tak). Train/test **time-based** split.
- Secrets sirf `.env` mein, tracked file mein kabhi nahi. `.env.example` mein fake values.
- Har screen par data ka source label: "Historical replay" ya "Simulated node".
- Jo number measure nahi hua use slide ya bol mein mat use karo.
- Har 2 ghante mein ek working snapshot commit karo.

## 4. Task order aur clock plan

| Task | Naam | Tier | Time | Depends on |
| --- | --- | --- | --- | --- |
| T0 | Repo, Compose, skeleton | Must | 45 min | none |
| T1 | Data prep (solar + wind) | Must | 1 hr | T0 |
| T2 | Physics twin | Must | 1 hr 15 | T1 |
| T3 | ML forecasting + accuracy | Must | 2 hr 30 | T1, T2 |
| T4 | DSM engine | Must | 45 min | T3 (fixture se pehle bhi ho sakta hai) |
| T5 | Backend API + storage | Must | 1 hr 30 | T0, T4 |
| T6 | MQTT ingest + twin sync loop + soiling | Must | 1 hr 30 | T2, T5 |
| T7 | Simulator (replay + fault injection) | Must | 45 min | T1, T6 |
| T8 | Sandbox scenarios (backend) | Must | 1 hr | T2, T3, T4 |
| T9 | Frontend scaffold + API client | Must | 30 min | T5 |
| T10 | Hero dashboard | Must | 1 hr 30 | T9, T3, T4 |
| T11 | Alerts, Soiling, Twin view pages | Must | 1 hr 30 | T10, T6 |
| T12 | Sandbox UI + node health | Should | 1 hr | T8, T11 |
| T13 | Packaging, README, integration test | Must | 1 hr | all |
| T14 | Deploy + backup recording | Should | 1 hr | T13 |
| T15 | ESP32 Wokwi firmware, LSTM | Could | 1-2 hr | T7 |
| T16 | Demo script, slides update, Q&A | Must | 1 hr 15 | T13 |

**Cut rule:** Agar T3 tak 6 ghante se zyada lag gaye, to LSTM, T12, T14, T15 chhod do. Dashboard ko precomputed JSON se bhi chalaya ja sakta hai.

**Dependency tip:** T9 (frontend scaffold) T5 ke baad jaise hi mock API ready ho, T3 ke saath parallel chal sakta hai jab Antigravity ek task chala raha ho aur tum doosre ka output check kar rahe ho.

## 5. Tasks

### T0. Repo, Compose, skeleton (Must, 45 min)

**Branch:** `chore/setup`

**Files:** `docker-compose.yml`, `.env.example`, `.gitignore`, `backend/app/main.py`, `backend/Dockerfile`, `README.md`, folders as per layout.

**Steps:**

1. Naya repo banao (D: drive par). Purana repo reference ke liye alag rakho.
2. Folder layout banao (upar section 2).
3. `docker-compose.yml`: services `mosquitto` (eclipse-mosquitto), `mongo`, `backend` (FastAPI, slim image). Frontend abhi Vite dev server se chalega, Compose mein baad mein.
4. FastAPI mein sirf `GET /health` (return `{"status":"ok"}`).
5. `.env.example`: `MONGO_URL`, `MQTT_HOST`, `MQTT_PORT`, `DSM_TOLERANCE_PCT`, `FRONTEND_ORIGIN=http://localhost:5173`. CORS enable karo.
6. `.gitignore` mein `.env`, `data/raw`, `models/*.pkl` (ya model ko commit karne ka decision lo, demo ke liye small model commit karna theek hai).

**Done when:** `docker compose up --build` chalta hai aur `http://localhost:8000/health` 200 deta hai.

### T1. Data prep: solar aur wind (Must, 1 hr)

**Branch:** `feature/data-prep`

**Files:** `ml/prepare_data.py`, `data/raw/`, `data/processed/solar.csv`, `data/processed/wind.csv`, `ml/data_notes.md`.

**Steps:**

1. Solar: Kaggle "Solar Power Generation Data" (India, 2 plants, 15-min generation + weather sensor: irradiation, ambient temp, module temp). Wind: Kaggle wind turbine SCADA dataset (wind speed, power; interval 10-min hoga). Pehle availability aur license check karo, dataset ka naam aur link `data_notes.md` mein likho.
2. Timestamps parse karo, **15-min grid par resample** (wind 10-min ko interpolate/resample karo aur note karo), missing values handle karo, night hours ko zero generation rakho.
3. Columns standardize karo: `ts, power_kw, irradiance, ambient_temp, module_temp, wind_speed, pressure` (jo jis dataset mein ho).
4. Output CSV `data/processed/` mein.
5. **Agar wind dataset nahi mila ya bahut time lag raha hai:** wind ke liye T2 ki physics equation se synthetic wind generation banao (wind speed ka Weibull distribution) aur **har jagah "synthetic" label** lagao. Solar real data ko hero rakho.

**Done when:** `solar.csv` mein kam se kam 3-4 hafte ka 15-min data hai, koi NaN gap bina note ke nahi, aur `data_notes.md` mein source aur date range likhi hai.

### T2. Physics twin (Must, 1 hr 15)

**Branch:** `feature/physics-twin`

**Files:** `backend/app/twin/physics.py`, `plants/solar_plant_1.yaml`, `plants/wind_plant_1.yaml`, `backend/tests/test_physics.py`.

**Steps:**

1. Solar PV (PDF ke formula se): `P_pv = P_stc * (G/1000) * [1 + gamma*(T_cell - 25)] * (1 - L_soil) * PR`. `gamma` approx -0.004 per degC (crystalline silicon, datasheet se verify karo). `T_cell` module temp se lo ya estimate karo.
2. Wind: `v_hub = v_s * (h_hub/h_s)**alpha`, `rho = p / (287.05 * T_kelvin)`, `P_wind = min(P_rated, 0.5 * rho * A * Cp * v_hub**3)` jab `v_cut_in <= v_hub <= v_cut_out`, warna 0.
3. Plant parameters YAML mein: capacity, `P_stc`, `gamma`, `PR`, rotor area, `Cp`, cut-in/rated/cut-out speeds, hub height, DSM tolerance.
4. **Calibration:** training data par `PR` (aur wind ke liye `Cp`) fit karo taaki physics output actual ke kareeb aaye. Calibrated values YAML mein save karo.
5. Unit tests: zero irradiance -> zero power, rated cap par wind power clip, soiling 0.1 par power 10 percent kam.

**Done when:** `pytest` pass hai aur physics output vs actual ka MAE/MAPE print hota hai (ye wahi "expected generation" hai jo twin use karega).

### T3. ML forecasting aur accuracy proof (Must, 2 hr 30)

**Branch:** `feature/ml-forecast`

**Files:** `ml/train.py`, `ml/evaluate.py`, `ml/models/`, `ml/results.md`, `backend/app/forecast/service.py`.

**Steps:**

1. **Horizon:** agle 96 blocks (24 ghante). Simple approach: ek model jo `horizon_step` ko feature maanta hai (ya 4-6 horizons: 1, 4, 16, 48, 96 ke alag models). Jo Antigravity jaldi aur sahi kare.
2. **Features (sirf issue time t tak available):** pichle blocks ka generation (lags 1, 2, 4, 96), rolling mean, hour-of-day aur day-of-year (sin/cos), current irradiance/temp, **physics expected power** (twin ka output). Future weather ke liye: replay mode mein dataset ka future weather "forecast proxy" maano aur ye **honestly note karo** (`results.md` mein), live mode mein weather API ka forecast aayega (future scope).
3. **Baseline 1:** persistence (pichle block jaisa). **Baseline 2:** same-time-yesterday (96 blocks pehle). Dono ka MAE nikalo.
4. **Model:** LightGBM (pehle). Optional: physics residual correction (target = actual minus physics expected). LSTM sirf Could tier.
5. **Time-based split:** pehle 70-80% din train, baaki test. Random split bilkul nahi. Antigravity se confirm karwao ki koi test row train mein nahi gayi.
6. **Metrics:** MAE, RMSE, aur % error, test set par, daytime aur overall dono. Table `ml/results.md` mein:
   - Persistence MAE | Yesterday MAE | Our MAE | Improvement %
7. Model file save karo. `forecast/service.py` mein `forecast(plant_id, issue_time) -> list of 96 blocks` function banao jo sirf `issue_time` tak ka data use kare.
8. Wind ke liye same pipeline, agar real wind data hai. Warna sirf solar ka accuracy claim karo.

**Done when:** `results.md` mein measured table hai, split time-based confirm hai, aur `forecast()` ek test date par 96 blocks return karta hai. **Jo improvement aaye wahi bolna, chhota ho to bhi.**

### T4. DSM engine (Must, 45 min)

**Branch:** `feature/dsm-engine`

**Files:** `backend/app/dsm/engine.py`, `backend/tests/test_dsm.py`, `.env.example` (`DSM_TOLERANCE_PCT`).

**Steps:**

1. **Pehle CERC ki latest DSM regulation se exact band verify karo** (tolerance %, kis reference capacity par). Number `config` mein rakho, hardcode nahi. Verify hone tak default 10 percent maano aur UI par "configurable" likho.
2. `check(forecast, schedule, capacity, tol)`: har block ke liye `deviation_pct = (forecast - schedule) / capacity * 100`. `abs(deviation) > tol` to breach.
3. Output: breach blocks ki list, severity (kitna bahar), total breach count, aur **estimated penalty exposure** sirf tab dikhao jab tumhare paas verified rate ho. Warna "relative exposure" ya blocks count dikhao, rupaya nahi.
4. `revise(forecast, schedule, tol)`: schedule ko forecast ki taraf shift karo taaki tolerance ke andar aaye, aur ye "suggested revised schedule" return karo.
5. Default schedule: forecast ka ek **stale ya coarse version** (jaise 3-hour average) taaki demo mein breach dikhe. Ye assumption `docs/` mein likho.
6. Tests: bina breach, ek breach, missing data skip.

**Done when:** test pass hai aur ek sample day par breach blocks aur revised schedule print hota hai.

### T5. Backend API aur storage (Must, 1 hr 30)

**Branch:** `feature/backend-api`

**Files:** `backend/app/storage.py`, `backend/app/api/routes_*.py`, `backend/app/main.py`.

**Steps:**

1. MongoDB collections: `readings` (plant\_id, ts, fields), `forecasts`, `alerts`, `twin_state`.
2. Endpoints:
   - `GET /plants` (list, solar aur wind)
   - `GET /plants/{id}/state` (latest reading, expected, actual, soiling estimate, node status)
   - `GET /plants/{id}/forecast` (96 blocks)
   - `GET /plants/{id}/actual` (recent blocks)
   - `GET /plants/{id}/schedule`
   - `GET /plants/{id}/dsm` (breach blocks + revised schedule)
   - `GET /plants/{id}/accuracy` (results.md ke numbers JSON mein)
   - `GET /plants/{id}/alerts`
3. Sab endpoints ek `source` field return karein: `"historical_replay"` ya `"simulated_node"`.
4. Error handling: data nahi hai to empty list aur clear message, 500 nahi.
5. Basic tests (`pytest`) har endpoint ke liye.

**Done when:** Swagger (`/docs`) se har endpoint sahi JSON deta hai, aur `pytest` pass hai.

### T6. MQTT ingest, twin sync loop, soiling (Must, 1 hr 30)

**Branch:** `feature/twin-sync`

**Files:** `backend/app/mqtt_client.py`, `backend/app/twin/sync.py`, `backend/app/twin/calibrate.py`.

**Steps:**

1. MQTT subscriber topic `urjatwin/{plant_id}/telemetry`. Message JSON: `{ts, irradiance, module_temp, ambient_temp, wind_speed, pressure, pm25, pm10, power_kw}`. Validate karo, timestamp lagao, Mongo mein save karo.
2. **Twin sync (har 15-min block par):** physics se `expected_power` nikalo, actual se compare karo, `gap_pct` store karo.
3. **Soiling detection:** din ke daytime blocks par `actual / expected` ka rolling ratio. Agar ratio lagatar threshold se kam (jaise 0.93 se neeche) aur PM2.5/PM10 high ho, to alert "soiling suspected". Estimated loss % aur "cleaning se gain" nikalo.
4. **Daily recalibration:** din ke end par `PR` (ya soiling factor) ko actual se re-fit karo, `twin_state` mein save karo, aur before/after error log karo (slide ka "daily feedback loop").
5. **Forecast refresh:** har sync par `forecast(plant, now)` dobara chalao aur DSM check update karo.
6. Alerts collection mein likho: type (`dsm_breach`, `soiling`, `node_offline`), time, message.

**Done when:** simulator ke bina bhi manual MQTT publish (mosquitto\_pub) karne par reading save hoti hai, `/state` mein expected vs actual dikhta hai, aur ek fake low-ratio sequence par soiling alert banta hai.

### T7. Simulator: replay aur fault injection (Must, 45 min)

**Branch:** `feature/simulator`

**Files:** `simulator/replay.py`, `simulator/Dockerfile` (optional), `docs/SCENARIOS.md`.

**Steps:**

1. Processed CSV se ek din replay karo aur har block MQTT par publish karo. **Speed setting** (jaise 1 block = 1-2 second) taaki demo mein ek din 3-4 minute mein chale.
2. Fault injection (REST ya command line `--inject`):
   - `cloud` (irradiance achanak 50-60 percent kam, 6-8 blocks)
   - `dust` (output ratio dheere dheere 8 percent tak girta hai)
   - `wind_drop` (wind speed girti hai)
   - `node_offline` (kuch blocks publish band)
3. Har scenario ke liye expected result `docs/SCENARIOS.md` mein: konsa alert kab banega.
4. Simulator clearly "Simulated node" label ke saath publish kare.

**Done when:** `cloud` inject karne par dashboard ke DSM breach blocks badhte hain, `dust` par soiling alert aata hai, aur `node_offline` par node-offline alert.

### T8. Sandbox scenarios, backend (Must, 1 hr)

**Branch:** `feature/sandbox`

**Files:** `backend/app/sandbox/scenarios.py`, `backend/tests/test_sandbox.py`.

**Steps:**

1. `POST /plants/{id}/simulate` body: `{scenario, params}`.
2. Scenarios (Must mein sirf pehle 2):
   - `clean_panels`: soiling factor 0 maan ke generation dobara compute, gain kWh aur % return.
   - `add_battery`: `capacity_mwh`, simple dispatch (forecast schedule se zyada ho to charge, kam ho to discharge), breach blocks pehle vs baad.
   - (Should) `add_capacity`: capacity percent badhao.
   - (Should) `monsoon_cloud`: irradiance multiplier 0.4 par 6 ghante.
3. **Twin ka original state kabhi modify nahi hona chahiye.** Sandbox ek copy par chale aur result alag return kare.
4. Output: `before` aur `after` series, breach count, ek line summary.
5. Battery model simple rakho (efficiency 90 percent, power limit) aur assumptions return mein likho.

**Done when:** `clean_panels` aur `add_battery` par breach blocks ya generation mein measurable farak aata hai aur twin state unchanged rehta hai (test se).

### T9. Frontend scaffold aur API client (Must, 30 min)

**Branch:** `feature/frontend-scaffold`

**Files:** `frontend/` (Vite + React), `frontend/src/api/client.ts`, routing.

**Steps:**

1. `npm create vite` (React + TypeScript), charts ke liye `recharts` ya `chart.js`, `axios`.
2. Routes: `/` (Dashboard), `/alerts`, `/twin`, `/sandbox`.
3. API client: har T5 endpoint ke liye ek function. Base URL `.env` se.
4. Common components: loading, empty, error state, "Data source" badge.
5. Layout: bada font, kam colors (red sirf breach ke liye), laptop screen-share par readable.

**Done when:** `npm run build` pass hai aur har route khulta hai.

### T10. Hero dashboard (Must, 1 hr 30)

**Branch:** `feature/dashboard`

**Files:** `frontend/src/pages/Dashboard.tsx` aur components.

**Steps:**

1. Plant selector (solar / wind).
2. **Main chart:** Forecast vs Actual vs Schedule, 15-min blocks, DSM band shaded zone, breach blocks red.
3. KPI cards: current output, expected output, gap %, breach blocks next 24h.
4. **Accuracy card:** `/accuracy` se "Persistence MAE vs Our MAE", dataset naam aur "time-based test" likho.
5. Data source badge aur "last sync" time.
6. Auto-refresh har kuch second (simulator speed ke hisaab se).

**Done when:** simulator chalane par chart badalta hai, `cloud` inject karne par red blocks aate hain.

### T11. Alerts, Soiling aur Twin view (Must, 1 hr 30)

**Branch:** `feature/alerts-twin`

**Files:** `frontend/src/pages/Alerts.tsx`, `frontend/src/pages/Twin.tsx`.

**Steps:**

1. **Alerts page:** list (type, time, message), "Agle N blocks breach" panel, **suggested revised schedule** (before/after chart ya table).
2. **Soiling badge:** estimated loss %, "cleaning se gain", PM2.5/PM10 trend.
3. **Twin view:** expected vs actual (physics vs real), gap %, last recalibration time aur before/after error, plant parameters. Ek simple "twin synced" indicator.
4. Recent telemetry table (last 10 readings, node status).

**Done when:** `dust` inject karne par soiling alert aur badge dikhte hain, aur twin page par expected vs actual gap dikhta hai.

### T12. Sandbox UI aur node health (Should, 1 hr)

**Branch:** `feature/sandbox-ui`

**Steps:**

1. Sandbox page: scenario dropdown (clean panels, add battery), slider (MWh), "Run on twin" button.
2. Before vs after chart, breach count, ek line summary, assumptions list.
3. Node health card: last seen, battery/solar status (simulated), node offline alert.
4. Loading aur error states.

**Done when:** battery 20 MWh par breach blocks kam hote dikhte hain aur real twin state nahi badalta.

### T13. Packaging, README, integration test (Must, 1 hr)

**Branch:** `feature/packaging`

**Steps:**

1. Frontend ko Compose mein add karo ya README mein `npm run dev` step likho.
2. Healthchecks, `restart: unless-stopped`, memory limits.
3. `README` "Run the demo": pehli baar setup, ports table, simulator command, fault inject commands.
4. Sab ek saath test karo: `docker compose up --build` -> simulator -> dashboard -> `cloud` -> `dust` -> sandbox.
5. Clean clone se run karke dekho (ya naye folder mein).
6. Seed data ya precomputed JSON **fallback** rakho: agar MQTT ya Mongo fail ho to bhi dashboard demo chal sake.
7. Git tag `demo-v1`.

**Done when:** README se koi bhi bina tumhare stack chala sakta hai.

### T14. Deploy aur backup recording (Should, 1 hr)

**Branch:** `feature/deploy`

**Steps:**

1. Frontend: Vercel. Backend: Render/Railway ya local ngrok. Free tier ki cold start ke liye demo se 10 minute pehle app ko "warm" karo.
2. Cloud par simulator na chale to precomputed replay mode ya preloaded data se hero screen chalao.
3. **Naya link** slides/PDF ke reference \[7\] mein daalo.
4. 5-minute **screen recording** (full demo) aur screenshots PDF backup.
5. Local copy bhi ready rakho. Internet fail hone par yahi bachayegi.

**Done when:** naya link doosre device par khulta hai aur recording save hai.

### T15. ESP32 Wokwi firmware aur LSTM (Could)

**Branch:** `feature/firmware-lstm`

**Steps:**

1. Wokwi project: ESP32 + simulated sensors, MQTT par same JSON format publish karo. Slide ke reference \[6\] se link.
2. Sirf tab LSTM try karo jab LightGBM ke numbers ho chuke hon. Same time-based split, same metrics. Behtar na ho to use mat karo, slide mein model wahi likho jo chala.

**Done when:** Wokwi node ya LSTM ke measured results hain, warna "future scope".

### T16. Demo script, slides update aur Q&A (Must, 1 hr 15)

**Branch:** `docs/demo`

**Files:** `docs/DEMO_SCRIPT.md`, `docs/QA_ANSWERS.md`, updated slides.

**Steps:**

1. Slides update: tech stack (FastAPI, Mosquitto, LightGBM), prototype screenshots (naye), reference \[7\] naya link, accuracy table.
2. Demo script 5 min (neeche section 7).
3. Q&A answers likho (section 7).
4. 2 full rehearsals, time note karo, ek dost se tough sawal puchwao.
5. Jury se 15 minute pehle: link test, hotspot ready, recording ready.

**Done when:** koi naya vyakti script se demo chala sakta hai.

## 6. Antigravity ko dene ka message

Har task se pehle ye paste karo, phir ek task paste karo:

> Work in this repo only on the task below. Create the branch named in the task. Change only the files the task names. Run the "Done when" check and show the real output, not a summary. Commit with a clear message and push the branch. Do not merge. For any ML task: use a time-based split, no random split, and no feature that is unavailable at forecast issue time. Print the real metrics. If anything fails or something contradicts the task, stop and tell me instead of guessing.

**Context line (har naye session mein):** "UrjaTwin: digital twin for solar/wind plants. Backend FastAPI, MongoDB, Mosquitto MQTT, React frontend. Hero feature: 15-minute forecast + DSM breach alert."

## 7. Demo scenarios, script aur Q&A

| # | Scenario | Trigger | Expected result |
| --- | --- | --- | --- |
| 1 | Normal day | replay start | forecast aur actual ke kareeb, koi ya kam breach |
| 2 | Cloud event | inject cloud | output girta hai, DSM breach blocks red, revised schedule |
| 3 | Dust/soiling | inject dust | expected vs actual gap badhta hai, soiling alert |
| 4 | Wind drop | inject wind\_drop | wind plant ka forecast vs actual gap |
| 5 | Sandbox | run battery/clean | before vs after breach count |

**5-minute script:**

1. (30 sec) Problem: 15-min schedule, DSM tight, galat forecast se penalty.
2. (45 sec) Dashboard: forecast vs actual vs schedule.
3. (60 sec) Cloud inject: breach blocks, alert, revised schedule.
4. (45 sec) Dust inject: soiling alert, cleaning gain.
5. (45 sec) Accuracy card: baseline vs hamara model.
6. (60 sec) Sandbox: battery lagao, breach kam.
7. (30 sec) Viability aur future scope.

**Pakke sawal:**

1. *Accuracy kitni hai?* Measured table dikhao, dataset aur time-based split batao.
2. *Data real hai?* Historical replay hai, node simulated hai, pilot future scope hai.
3. *Twin kaise hai, sirf dashboard nahi?* Physics model + sensor sync + daily recalibration + sandbox.
4. *Bade plants ke paas SCADA hai, kyun lenge?* Dust/PM2.5, sasta node, chhote/medium plants.
5. *DSM band kaise?* CERC regulation se verified, configurable.
6. *Subscription kyun?* DSM penalty bachat, par pilot data nahi hai to rupaya claim mat karo.

## 8. Final checklist

- [ ] Jury slot/link confirm
- [ ] Must tasks (T0 to T8, T9 to T11, T13, T16) done
- [ ] `ml/results.md` measured aur time-based split verified
- [ ] DSM tolerance CERC se verified
- [ ] Har screen par data source label
- [ ] Slides stack updated (FastAPI, Mosquitto, LightGBM)
- [ ] Naya link aur recording backup
- [ ] 2 mock runs
- [ ] Hotspot aur local copy ready

**Agar time kam pade:** T3 (accuracy) aur T10 (hero dashboard) kabhi mat kato. Pehle cut: T15, T14, T12. Phir T8 ka sandbox simple rakho.

Shubhkamnayein! Focused, honest aur crash-free demo hi sabse strong hota hai.
