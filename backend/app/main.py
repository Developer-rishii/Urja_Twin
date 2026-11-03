from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.storage import init_indexes
from app.api.routes_plants import router as plants_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize MongoDB collection indexes
    init_indexes()
    yield


app = FastAPI(
    title="UrjaTwin API",
    description="Live Digital Twin & DSM Decision Support for Renewable Power Plants",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN, "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount plants endpoints
app.include_router(plants_router)


@app.get("/health")
def health():
    return {"status": "ok"}
