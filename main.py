from __future__ import annotations

import json
from datetime import date
from enum import Enum
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ValidationError, model_validator

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "app" / "static"
DATA_FILE = BASE_DIR / "app" / "data" / "network_assets.json"


class RentalStatus(str, Enum):
    ALL = "all"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class CoreSlot(BaseModel):
    index: int = Field(..., ge=1)
    status: Literal["occupied", "available", "reserved"]
    tenant: str = ""
    color: str = "#cbd5e1"


class ContractRecord(BaseModel):
    contract_id: str
    lessee: str
    leased_cores: list[int] = Field(default_factory=list)
    start_date: str
    end_date: str
    status: str
    color: str = "#2563eb"


class TenantInfo(BaseModel):
    primary_tenant: str
    secondary_tenants: list[str] = Field(default_factory=list)
    contract_end: str
    warning_level: str


class ConduitRecord(BaseModel):
    id: str
    road_name: str
    coordinates: list[list[float]]
    total_cores: int = Field(..., gt=0)
    occupied_cores: int = Field(..., ge=0)
    tenant_info: TenantInfo
    contracts: list[ContractRecord] = Field(default_factory=list)
    manhole_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_occupied_cores(self) -> "ConduitRecord":
        if self.occupied_cores > self.total_cores:
            raise ValueError("occupied_cores 不能大于 total_cores")
        return self


class ManholeRecord(BaseModel):
    id: str
    name: str
    coordinates: list[float]
    total_cores: int = Field(..., gt=0)
    occupied_cores: int = Field(..., ge=0)
    control_status: str
    connected_conduit_ids: list[str] = Field(default_factory=list)
    cores: list[CoreSlot] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_manhole(self) -> "ManholeRecord":
        if self.occupied_cores > self.total_cores:
            raise ValueError("occupied_cores 不能大于 total_cores")
        if len(self.cores) != self.total_cores:
            raise ValueError("manhole cores 数量必须与 total_cores 一致")
        return self


class AssetPayload(BaseModel):
    conduits: list[ConduitRecord] = Field(default_factory=list)
    manholes: list[ManholeRecord] = Field(default_factory=list)


app = FastAPI(
    title="Lightweight Conduit Leasing Visualization",
    description="FastAPI + Leaflet demo for telecom conduit leasing and manhole asset visualization.",
    version="0.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def load_assets() -> AssetPayload:
    raw_records = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    return AssetPayload.model_validate(raw_records)



def save_assets(payload: AssetPayload) -> None:
    DATA_FILE.write_text(
        json.dumps(payload.model_dump(mode="json"), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )



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



def build_contract_summary(contracts: list[ContractRecord]) -> list[dict]:
    return [
        {
            "contract_id": item.contract_id,
            "lessee": item.lessee,
            "leased_cores": item.leased_cores,
            "start_date": item.start_date,
            "end_date": item.end_date,
            "status": item.status,
            "color": item.color,
        }
        for item in contracts
    ]



def build_conduit_feature(conduit: ConduitRecord) -> dict:
    rental_rate = calculate_rental_rate(conduit.total_cores, conduit.occupied_cores)
    rental_status = classify_rental_status(rental_rate)
    contract_end, days_remaining = parse_contract_end(conduit.tenant_info.contract_end)

    return {
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": conduit.coordinates},
        "properties": {
            "id": conduit.id,
            "asset_type": "conduit",
            "road_name": conduit.road_name,
            "total_cores": conduit.total_cores,
            "occupied_cores": conduit.occupied_cores,
            "available_cores": conduit.total_cores - conduit.occupied_cores,
            "rental_rate": rental_rate,
            "rental_status": rental_status,
            "tenant_info": conduit.tenant_info.model_dump(),
            "primary_tenant": conduit.tenant_info.primary_tenant,
            "secondary_tenants": conduit.tenant_info.secondary_tenants,
            "contract_end": contract_end,
            "expiry_warning": conduit.tenant_info.warning_level,
            "days_remaining": days_remaining,
            "has_warning": days_remaining is not None and days_remaining <= 90,
            "contracts": build_contract_summary(conduit.contracts),
            "manhole_ids": conduit.manhole_ids,
        },
    }



def build_manhole_feature(manhole: ManholeRecord) -> dict:
    occupancy_rate = calculate_rental_rate(manhole.total_cores, manhole.occupied_cores)
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": manhole.coordinates},
        "properties": {
            "id": manhole.id,
            "asset_type": "manhole",
            "name": manhole.name,
            "total_cores": manhole.total_cores,
            "occupied_cores": manhole.occupied_cores,
            "available_cores": manhole.total_cores - manhole.occupied_cores,
            "occupancy_rate": occupancy_rate,
            "control_status": manhole.control_status,
            "connected_conduit_ids": manhole.connected_conduit_ids,
            "cores": [item.model_dump() for item in manhole.cores],
        },
    }



def build_summary(conduit_features: list[dict], manhole_features: list[dict]) -> dict:
    total_cores = sum(feature["properties"]["total_cores"] for feature in conduit_features)
    occupied_cores = sum(feature["properties"]["occupied_cores"] for feature in conduit_features)
    return {
        "total_segments": len(conduit_features),
        "total_manholes": len(manhole_features),
        "total_cores": total_cores,
        "occupied_cores": occupied_cores,
        "available_cores": total_cores - occupied_cores,
        "average_rental_rate": round((occupied_cores / total_cores) * 100, 2) if total_cores else 0.0,
        "warning_segments": sum(1 for feature in conduit_features if feature["properties"]["has_warning"]),
        "status_breakdown": {
            "low": sum(1 for feature in conduit_features if feature["properties"]["rental_status"] == "low"),
            "medium": sum(1 for feature in conduit_features if feature["properties"]["rental_status"] == "medium"),
            "high": sum(1 for feature in conduit_features if feature["properties"]["rental_status"] == "high"),
        },
    }



def filter_conduit_features(features: list[dict], status: RentalStatus, tenant: str | None, warning_only: bool) -> list[dict]:
    filtered = features
    if status != RentalStatus.ALL:
        filtered = [item for item in filtered if item["properties"]["rental_status"] == status.value]
    if tenant:
        keyword = tenant.strip().lower()
        filtered = [item for item in filtered if keyword in item["properties"]["primary_tenant"].lower()]
    if warning_only:
        filtered = [item for item in filtered if item["properties"]["has_warning"]]
    return filtered


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/assets/full")
def get_full_assets() -> dict:
    return load_assets().model_dump(mode="json")


@app.put("/api/assets/full")
def update_full_assets(payload: AssetPayload) -> dict[str, str]:
    save_assets(payload)
    return {"message": "资产数据已保存"}


@app.post("/api/assets/upload")
async def upload_assets(file: UploadFile = File(...)) -> dict[str, str]:
    if not file.filename.lower().endswith(".json"):
        raise HTTPException(status_code=400, detail="只支持上传 JSON 文件")

    try:
        content = await file.read()
        payload = AssetPayload.model_validate(json.loads(content.decode("utf-8")))
    except (UnicodeDecodeError, json.JSONDecodeError, ValidationError) as exc:
        raise HTTPException(status_code=400, detail=f"文件格式不正确: {exc}") from exc

    save_assets(payload)
    return {"message": f"上传成功: {file.filename}"}


@app.get("/api/conduits")
def get_conduits(
    status: RentalStatus = Query(default=RentalStatus.ALL),
    tenant: str | None = Query(default=None),
    warning_only: bool = Query(default=False),
) -> dict:
    assets = load_assets()
    features = [build_conduit_feature(item) for item in assets.conduits]
    filtered = filter_conduit_features(features, status, tenant, warning_only)
    return {
        "type": "FeatureCollection",
        "name": "telecom_conduits",
        "filters": {"status": status.value, "tenant": tenant, "warning_only": warning_only},
        "features": filtered,
    }


@app.get("/api/manholes")
def get_manholes() -> dict:
    assets = load_assets()
    return {
        "type": "FeatureCollection",
        "name": "telecom_manholes",
        "features": [build_manhole_feature(item) for item in assets.manholes],
    }


@app.get("/api/map-data")
def get_map_data(
    status: RentalStatus = Query(default=RentalStatus.ALL),
    tenant: str | None = Query(default=None),
    warning_only: bool = Query(default=False),
) -> dict:
    assets = load_assets()
    conduit_features = [build_conduit_feature(item) for item in assets.conduits]
    filtered_conduits = filter_conduit_features(conduit_features, status, tenant, warning_only)
    visible_conduit_ids = {item["properties"]["id"] for item in filtered_conduits}
    manhole_features = [
        build_manhole_feature(item)
        for item in assets.manholes
        if visible_conduit_ids and any(conduit_id in visible_conduit_ids for conduit_id in item.connected_conduit_ids)
    ]
    return {
        "conduits": {"type": "FeatureCollection", "features": filtered_conduits},
        "manholes": {"type": "FeatureCollection", "features": manhole_features},
        "filters": {"status": status.value, "tenant": tenant, "warning_only": warning_only},
        "summary": build_summary(filtered_conduits, manhole_features),
        "schema_example": {
            "conduits": [
                {
                    "id": "CD-001",
                    "road_name": "科技大道西段",
                    "coordinates": [[116.3871, 39.9075], [116.3928, 39.9092]],
                    "total_cores": 12,
                    "occupied_cores": 4,
                    "tenant_info": {
                        "primary_tenant": "星联通信",
                        "secondary_tenants": ["城域宽带"],
                        "contract_end": "2026-09-30",
                        "warning_level": "正常"
                    },
                    "contracts": [
                        {
                            "contract_id": "HT-2026-001",
                            "lessee": "星联通信",
                            "leased_cores": [1],
                            "start_date": "2025-10-01",
                            "end_date": "2026-09-30",
                            "status": "履约中",
                            "color": "#2563eb"
                        }
                    ],
                    "manhole_ids": ["MH-001"]
                }
            ],
            "manholes": [
                {
                    "id": "MH-001",
                    "name": "科技大道 1# 人井",
                    "coordinates": [116.3895, 39.9082],
                    "total_cores": 2,
                    "occupied_cores": 1,
                    "control_status": "正常",
                    "connected_conduit_ids": ["CD-001"],
                    "cores": [
                        {"index": 1, "status": "occupied", "tenant": "星联通信", "color": "#2563eb"},
                        {"index": 2, "status": "available", "tenant": "", "color": "#cbd5e1"}
                    ]
                }
            ]
        },
    }


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/manage", include_in_schema=False)
def manage_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "admin.html")
