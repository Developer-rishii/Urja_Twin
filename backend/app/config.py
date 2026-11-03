from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    MONGO_URL: str
    MQTT_HOST: str
    MQTT_PORT: int
    DSM_TOLERANCE_PCT: float = 10.0
    FRONTEND_ORIGIN: str
    DATA_SOURCE_LABEL: str = "simulated_node"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

