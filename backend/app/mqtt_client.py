"""MQTT subscriber service for UrjaTwin telemetry ingest.

Subscribes to topic:
  urjatwin/{plant_id}/telemetry
Validates JSON payload, formats timestamps, runs twin sync loop,
detects soiling, and persists to MongoDB.
"""

import json
import logging
import threading
import time
from typing import Optional
import paho.mqtt.client as mqtt

from app.config import settings
from app.twin.sync import process_telemetry

logger = logging.getLogger("urjatwin.mqtt")

_CLIENT: Optional[mqtt.Client] = None
_RUNNING = False


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        logger.info(f"Connected to Mosquitto broker at {settings.MQTT_HOST}:{settings.MQTT_PORT}")
        # Subscribe to all plants telemetry
        topic = "urjatwin/+/telemetry"
        client.subscribe(topic)
        logger.info(f"Subscribed to topic pattern: {topic}")
    else:
        logger.error(f"Failed to connect to MQTT broker, return code {rc}")


def on_message(client, userdata, msg):
    try:
        topic_parts = msg.topic.split("/")
        # Topic pattern: urjatwin/{plant_id}/telemetry
        plant_id = topic_parts[1] if len(topic_parts) >= 3 else "solar_plant_1"

        payload_str = msg.payload.decode("utf-8")
        data = json.loads(payload_str)
        if "plant_id" not in data:
            data["plant_id"] = plant_id

        logger.info(f"Received telemetry for {plant_id}: ts={data.get('ts')}, power={data.get('power_kw')} kW")
        process_telemetry(data)
    except Exception as e:
        logger.error(f"Error processing MQTT message on {msg.topic}: {str(e)}")


def start_mqtt():
    """Start MQTT client in background thread."""
    global _CLIENT, _RUNNING
    if _RUNNING and _CLIENT is not None:
        return

    try:
        # Use CallbackAPIVersion.VERSION2 if supported by installed paho-mqtt
        try:
            client = mqtt.Client(
                mqtt.CallbackAPIVersion.VERSION2,
                client_id="urjatwin-backend-subscriber",
            )
        except Exception:
            client = mqtt.Client(client_id="urjatwin-backend-subscriber")

        client.on_connect = on_connect
        client.on_message = on_message

        # Reconnect resilience
        client.connect_async(settings.MQTT_HOST, settings.MQTT_PORT, keepalive=60)
        client.loop_start()

        _CLIENT = client
        _RUNNING = True
        logger.info("MQTT subscriber background loop started.")
    except Exception as e:
        logger.warning(f"Could not connect to MQTT broker ({settings.MQTT_HOST}:{settings.MQTT_PORT}): {str(e)}")


def stop_mqtt():
    global _CLIENT, _RUNNING
    if _CLIENT is not None and _RUNNING:
        try:
            _CLIENT.loop_stop()
            _CLIENT.disconnect()
        except Exception:
            pass
        _RUNNING = False
        _CLIENT = None
