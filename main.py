from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(
    title="Lightweight Conduit Leasing Visualization",
    description="A lightweight FastAPI + Leaflet starter for telecom conduit leasing management.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "app" / "static"

SAMPLE_CONDUITS: list[dict[str, Any]] = [
    {
        "id": "CD-001",
        "road_name": "科技大道西段",
        "coordinates": [
            [116.3871, 39.9075],
            [116.3928, 39.9092],
            [116.3984, 39.9115],
        ],
        "total_cores": 12,
        "occupied_cores": 4,
        "tenant_info": {
            "primary_tenant": "星联通信",
            "secondary_tenants": ["城域宽带"],
            "contract_end": "2026-09-30",
            "warning_level": "正常",
        },
    },
    {
        "id": "CD-002",
        "road_name": "创新一路",
        "coordinates": [
            [116.4016, 39.913],
            [116.4082, 39.9141],
            [116.4148, 39.9156],
        ],
        "total_cores": 24,
        "occupied_cores": 16,
        "tenant_info": {
            "primary_tenant": "华城光网",
            "secondary_tenants": ["云桥数据", "捷讯科技"],
            "contract_end": "2026-05-15",
            "warning_level": "90天内到期",
        },
    },
    {
        "id": "CD-003",
        "road_name": "枢纽北路",
        "coordinates": [
            [116.3775, 39.9038],
            [116.3834, 39.9017],
            [116.3893, 39.8998],
        ],
        "total_cores": 18,
        "occupied_cores": 16,
        "tenant_info": {
            "primary_tenant": "国讯网络",
            "secondary_tenants": ["数联云", "铁塔服务"],
            "contract_end": "2026-04-10",
            "warning_level": "30天内重点预警",
        },
    },
    {
        "id": "CD-004",
        "road_name": "滨河支路",
        "coordinates": [
            [116.3958, 39.8995],
            [116.4007, 39.8969],
            [116.4061, 39.8943],
        ],
        "total_cores": 6,
        "occupied_cores": 2,
        "tenant_info": {
            "primary_tenant": "未出租",
            "secondary_tenants": [],
            "contract_end": "-",
            "warning_level": "可继续招商",
        },
    },
]


def calculate_rental_rate(total_cores: int, occupied_cores: int) -> float:
    if total_cores <= 0:
        return 0.0
    return round((occupied_cores / total_cores) * 100, 2)



def classify_rental_status(rental_rate: float) -> str:
    if rental_rate < 50:
        return "low"
    if rental_rate <= 80:
        return "medium"
    return "high"



def build_geojson_feature(conduit: dict[str, Any]) -> dict[str, Any]:
    rental_rate = calculate_rental_rate(conduit["total_cores"], conduit["occupied_cores"])
    contract_end = conduit["tenant_info"].get("contract_end")
    expiry_warning = conduit["tenant_info"].get("warning_level", "正常")

    if contract_end and contract_end not in {"", "-"}:
        expiry_date = date.fromisoformat(contract_end)
        days_remaining = (expiry_date - date.today()).days
    else:
        days_remaining = None

    return {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": conduit["coordinates"],
        },
        "properties": {
            "id": conduit["id"],
            "road_name": conduit["road_name"],
            "total_cores": conduit["total_cores"],
            "occupied_cores": conduit["occupied_cores"],
            "available_cores": conduit["total_cores"] - conduit["occupied_cores"],
            "rental_rate": rental_rate,
            "rental_status": classify_rental_status(rental_rate),
            "tenant_info": conduit["tenant_info"],
            "primary_tenant": conduit["tenant_info"].get("primary_tenant", "未填写"),
            "expiry_warning": expiry_warning,
            "days_remaining": days_remaining,
        },
    }


@app.get("/api/conduits")
def get_conduits() -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "name": "telecom_conduits",
        "features": [build_geojson_feature(item) for item in SAMPLE_CONDUITS],
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
    }


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")
