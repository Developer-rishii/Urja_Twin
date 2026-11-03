# UrjaTwin

Live digital twin for solar and wind power plants featuring 15-minute generation forecasting (96 blocks / 24h ahead) and DSM breach alerts.

## Ports

| Service | Port | Description |
|---|---|---|
| Frontend | 5173 | Vite React UI |
| Backend | 8000 | FastAPI REST & WebSocket Service |
| MQTT Broker | 1883 | Eclipse Mosquitto |
| MongoDB | 27017 | Timeseries & Plant Database |

## Run

```bash
docker compose up --build
```

