"""UrjaTwin Telemetry Replay Simulator & Fault Injection Engine.

Streams processed 15-minute telemetry to Mosquitto MQTT:
  Topic: urjatwin/{plant_id}/telemetry
Payload schema:
  {
    "plant_id": str,
    "ts": str (ISO 8601),
    "power_kw": float,
    "irradiance": float,
    "module_temp": float,
    "ambient_temp": float,
    "wind_speed": float,
    "pressure": float,
    "pm25": float,
    "pm10": float,
    "source": "simulated_node"
  }

Supports fault injections:
  --inject cloud         : sudden 60% irradiance drop for 8 blocks (triggers DSM breach)
  --inject dust          : 20% power loss with high PM2.5/PM10 (triggers soiling alert)
  --inject wind_drop     : wind speed dropped below cut-in (triggers wind DSM breach)
  --inject node_offline  : stops publishing for 6 blocks and publishes node_offline alert
"""

import argparse
import json
import os
from pathlib import Path
import sys
import time
import pandas as pd
import paho.mqtt.client as mqtt

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data" / "processed"


def load_day_data(plant_id: str, date_str: str) -> pd.DataFrame:
    is_solar = "solar" in plant_id.lower()
    file_name = "solar.csv" if is_solar else "wind.csv"
    file_path = DATA_DIR / file_name

    if not file_path.exists():
        raise FileNotFoundError(f"Processed dataset not found: {file_path}")

    df = pd.read_csv(file_path)
    df["dt"] = pd.to_datetime(df["ts"])

    target_date = pd.to_datetime(date_str).date()
    day_df = df[df["dt"].dt.date == target_date].copy()

    if len(day_df) == 0:
        # Fallback to first available date in dataset
        first_date = df["dt"].dt.date.iloc[0]
        print(f"Warning: Date {date_str} not found. Defaulting to {first_date}")
        day_df = df[df["dt"].dt.date == first_date].copy()

    return day_df.sort_values("dt").reset_index(drop=True)


def run_replay(
    plant_id: str = "solar_plant_1",
    date_str: str = "2020-06-10",
    broker_host: str = "localhost",
    broker_port: int = 1883,
    delay: float = 0.5,
    inject: str = None,
    max_blocks: int = 96,
):
    print(f"--- UrjaTwin Replay Simulator ---")
    print(f"Plant ID         : {plant_id}")
    print(f"Date             : {date_str}")
    print(f"MQTT Broker      : {broker_host}:{broker_port}")
    print(f"Replay Speed     : {delay}s per 15-min block")
    print(f"Fault Injection  : {inject or 'none'}")

    day_df = load_day_data(plant_id, date_str)
    total_blocks = min(len(day_df), max_blocks)
    print(f"Replay Blocks    : {total_blocks} blocks")

    # Connect to Mosquitto
    try:
        client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"urjatwin-simulator-{plant_id}",
        )
    except Exception:
        client = mqtt.Client(client_id=f"urjatwin-simulator-{plant_id}")

    client.connect(broker_host, broker_port, keepalive=60)
    topic = f"urjatwin/{plant_id}/telemetry"

    # Injection ranges (apply fault during peak daytime or mid-run)
    fault_start = 28  # block 28 (~07:00 AM) or midday
    fault_end = 36    # 8 blocks long (2 hours)

    published_count = 0

    for idx in range(total_blocks):
        row = day_df.iloc[idx]
        ts = row["ts"]

        # Base values
        power_kw = float(row.get("power_kw", 0.0))
        irradiance = float(row.get("irradiance", 0.0))
        module_temp = float(row.get("module_temp", 25.0))
        ambient_temp = float(row.get("ambient_temp", 25.0))
        wind_speed = float(row.get("wind_speed", 0.0))
        pm25 = 20.0
        pm10 = 35.0

        # Apply Injections
        is_fault_block = (fault_start <= idx < fault_end)

        if inject == "cloud" and is_fault_block:
            # Sudden heavy cloud cover: 60% irradiance drop and 65% power drop
            irradiance = max(0.0, irradiance * 0.40)
            power_kw = max(0.0, power_kw * 0.35)

        elif inject == "dust" and is_fault_block:
            # Soiling: actual power 20% lower than expected, high PM levels
            power_kw = max(0.0, power_kw * 0.80)
            pm25 = 95.0
            pm10 = 145.0

        elif inject == "wind_drop" and is_fault_block:
            # Wind drop below cut-in
            wind_speed = 1.2
            power_kw = 0.0

        elif inject == "node_offline" and is_fault_block:
            print(f"  [Block {idx+1}/{total_blocks}] NODE OFFLINE simulated at {ts}. Skipping publish...")
            time.sleep(delay)
            continue

        payload = {
            "plant_id": plant_id,
            "ts": ts,
            "power_kw": round(power_kw, 2),
            "irradiance": round(irradiance, 4),
            "module_temp": round(module_temp, 2),
            "ambient_temp": round(ambient_temp, 2),
            "wind_speed": round(wind_speed, 2),
            "pressure": 1013.25,
            "pm25": pm25,
            "pm10": pm10,
            "source": "simulated_node",
        }

        client.publish(topic, json.dumps(payload))
        published_count += 1
        fault_tag = f" [INJECTED: {inject}]" if (inject and is_fault_block) else ""
        print(f"  [{published_count:02d}/{total_blocks}] {ts} -> {power_kw:,.1f} kW{fault_tag}")
        time.sleep(delay)

    client.disconnect()
    print(f"\nReplay finished: {published_count} blocks published to '{topic}'.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="UrjaTwin Telemetry Replayer & Fault Injector")
    parser.add_argument("--plant", default="solar_plant_1", help="Plant ID (solar_plant_1 or wind_plant_1)")
    parser.add_argument("--date", default="2020-06-10", help="Date to replay (YYYY-MM-DD)")
    parser.add_argument("--host", default="localhost", help="MQTT broker host")
    parser.add_argument("--port", type=int, default=1883, help="MQTT broker port")
    parser.add_argument("--delay", type=float, default=0.2, help="Delay between blocks in seconds")
    parser.add_argument("--inject", choices=["cloud", "dust", "wind_drop", "node_offline"], default=None, help="Fault scenario")
    parser.add_argument("--blocks", type=int, default=45, help="Number of blocks to replay")

    args = parser.parse_args()
    run_replay(
        plant_id=args.plant,
        date_str=args.date,
        broker_host=args.host,
        broker_port=args.port,
        delay=args.delay,
        inject=args.inject,
        max_blocks=args.blocks,
    )
