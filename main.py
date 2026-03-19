from __future__ import annotations

import json
from datetime import date
from enum import Enum
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "app" / "static"
DATA_FILE = BASE_DIR / "app" / "data" / "conduits.json"


class RentalStatus(str, Enum):
    ALL = "all"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class TenantInfo(BaseModel):
    primary_tenant: str = Field(..., description="主要承租方")
    secondary_tenants: list[str] = Field(default_factory=list, description="其他承租方")
    contract_end: str = Field(..., description="合同到期日，ISO 日期或 '-' ")
    warning_level: str = Field(..., description="到期预警等级")


class ConduitRecord(BaseModel):
    id: str
    road_name: str
    coordinates: list[list[float]]
    total_cores: int = Field(..., gt=0)
    occupied_cores: int = Field(..., ge=0)
    tenant_info: TenantInfo


app = FastAPI(
    title="Lightweight Conduit Leasing Visualization",
    description="FastAPI + Leaflet demo for telecom conduit leasing asset visualization.",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def load_conduits() -> list[ConduitRecord]:
    raw_records = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return [ConduitRecord.model_validate(item) for item in raw_records]


def calculate_rental_rate(total_cores: int, occupied_cores: int) -> float:
    return round((occupied_cores / total_cores) * 100, 2) if total_cores else 0.0


def classify_rental_status(rental_rate: float) -> Literal["low", "medium", "high"]:
    if rental_rate < 50:
        return "low"
    if rental_rate <= 80:
        return "medium"
    return "high"


def parse_contract_end(contract_end: str) -> tuple[str | None, int | None]:
    if not contract_end or contract_end == "-":
        return None, None

    expiry_date = date.fromisoformat(contract_end)
    return expiry_date.isoformat(), (expiry_date - date.today()).days


def build_geojson_feature(conduit: ConduitRecord) -> dict:
    rental_rate = calculate_rental_rate(conduit.total_cores, conduit.occupied_cores)
    rental_status = classify_rental_status(rental_rate)
    contract_end, days_remaining = parse_contract_end(conduit.tenant_info.contract_end)
    available_cores = conduit.total_cores - conduit.occupied_cores

    return {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": conduit.coordinates,
        },
        "properties": {
            "id": conduit.id,
            "road_name": conduit.road_name,
            "total_cores": conduit.total_cores,
            "occupied_cores": conduit.occupied_cores,
            "available_cores": available_cores,
            "rental_rate": rental_rate,
            "rental_status": rental_status,
            "tenant_info": conduit.tenant_info.model_dump(),
            "primary_tenant": conduit.tenant_info.primary_tenant,
            "secondary_tenants": conduit.tenant_info.secondary_tenants,
            "contract_end": contract_end,
            "expiry_warning": conduit.tenant_info.warning_level,
            "days_remaining": days_remaining,
            "has_warning": days_remaining is not None and days_remaining <= 90,
        },
    }


def build_summary(features: list[dict]) -> dict:
    total_segments = len(features)
    total_cores = sum(feature["properties"]["total_cores"] for feature in features)
    occupied_cores = sum(feature["properties"]["occupied_cores"] for feature in features)
    average_rental_rate = round((occupied_cores / total_cores) * 100, 2) if total_cores else 0.0

    return {
        "total_segments": total_segments,
        "total_cores": total_cores,
        "occupied_cores": occupied_cores,
        "available_cores": total_cores - occupied_cores,
        "average_rental_rate": average_rental_rate,
        "warning_segments": sum(1 for feature in features if feature["properties"]["has_warning"]),
        "status_breakdown": {
            "low": sum(1 for feature in features if feature["properties"]["rental_status"] == "low"),
            "medium": sum(1 for feature in features if feature["properties"]["rental_status"] == "medium"),
            "high": sum(1 for feature in features if feature["properties"]["rental_status"] == "high"),
        },
    }


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/conduits")
def get_conduits(
    status: RentalStatus = Query(default=RentalStatus.ALL, description="按租赁状态筛选"),
    tenant: str | None = Query(default=None, description="按主要承租方关键字筛选"),
    warning_only: bool = Query(default=False, description="仅查看 90 天内到期预警段"),
) -> dict:
    features = [build_geojson_feature(item) for item in load_conduits()]

    if status != RentalStatus.ALL:
        features = [feature for feature in features if feature["properties"]["rental_status"] == status.value]

    if tenant:
        tenant_keyword = tenant.strip().lower()
        features = [
            feature
            for feature in features
            if tenant_keyword in feature["properties"]["primary_tenant"].lower()
        ]

    if warning_only:
        features = [feature for feature in features if feature["properties"]["has_warning"]]

    return {
        "type": "FeatureCollection",
        "name": "telecom_conduits",
        "filters": {
            "status": status.value,
            "tenant": tenant,
            "warning_only": warning_only,
        },
        "schema_example": {
            "id": "CD-001",
            "coordinates": [[116.3871, 39.9075], [116.3928, 39.9092]],
            "total_cores": 12,
            "occupied_cores": 4,
            "tenant_info": {
                "primary_tenant": "星联通信",
                "secondary_tenants": ["城域宽带"],
                "contract_end": "2026-09-30",
                "warning_level": "正常",
            },
        },
        "summary": build_summary(features),
        "features": features,
    }


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")
