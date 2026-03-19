# 轻量级通信管网租赁可视化系统

这是一个基于 **Python FastAPI** 后端和 **Leaflet.js** 前端实现的“轻量级通信管网租赁可视化系统”雏形，面向通信基础设施资产管理场景，用于演示管道资源上图、租赁率可视化、到期预警和租赁状态筛选。

## 系统能力概览

- **地图底图**：使用 OpenStreetMap。
- **后端接口**：通过 `GET /api/conduits` 提供 GeoJSON 数据。
- **GIS 渲染**：道路管道以 `LineString` 方式展示。
- **租赁率着色**：
  - `< 50%`：绿色
  - `50% - 80%`：黄色
  - `> 80%`：红色
- **线宽表达容量**：总孔数 `total_cores` 越大，线条越粗。
- **点击弹窗信息**：展示路段名称、管孔总数、已租赁数量、主要承租方、合同到期日、到期预警与剩余天数。
- **侧边栏筛选**：支持按租赁状态、承租方关键字、到期预警过滤。
- **辅助视图**：侧边栏显示汇总统计和当前筛选结果列表。

## 技术栈

- **Backend**: FastAPI
- **Frontend**: Leaflet.js + Vanilla JavaScript
- **Basemap**: OpenStreetMap
- **Deployment**: Docker + Docker Compose

## 项目结构

```text
.
├── app/
│   ├── data/
│   │   └── conduits.json        # 模拟管网数据
│   └── static/
│       ├── app.js               # 前端交互逻辑
│       ├── index.html           # 页面结构
│       └── styles.css           # 页面样式
├── main.py                      # FastAPI 入口
├── requirements.txt             # Python 依赖
├── Dockerfile                   # 镜像构建文件
└── docker-compose.yml           # 一键部署配置
```

## 模拟数据结构

系统使用的核心 JSON 结构如下：

```json
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
  }
}
```

其中：

- `coordinates`：经纬度数组，格式为 `[longitude, latitude]`。
- `total_cores`：总孔数。
- `occupied_cores`：已租赁孔数。
- `tenant_info`：租赁客户和到期预警信息。

## 后端接口说明

### 1. `GET /api/health`

健康检查接口。

返回示例：

```json
{ "status": "ok" }
```

### 2. `GET /api/conduits`

返回 GeoJSON `FeatureCollection`，前端可直接通过 `L.geoJSON()` 渲染。

#### 查询参数

- `status`: `all | low | medium | high`
- `tenant`: 主要承租方关键字模糊匹配
- `warning_only`: 是否仅返回 90 天内到期预警段，`true / false`

#### 返回结构示例

```json
{
  "type": "FeatureCollection",
  "name": "telecom_conduits",
  "filters": {
    "status": "medium",
    "tenant": "华城",
    "warning_only": false
  },
  "summary": {
    "total_segments": 1,
    "total_cores": 24,
    "occupied_cores": 16,
    "available_cores": 8,
    "average_rental_rate": 66.67,
    "warning_segments": 1,
    "status_breakdown": {
      "low": 0,
      "medium": 1,
      "high": 0
    }
  },
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [[116.4016, 39.913], [116.4082, 39.9141]]
      },
      "properties": {
        "id": "CD-002",
        "road_name": "创新一路",
        "total_cores": 24,
        "occupied_cores": 16,
        "available_cores": 8,
        "rental_rate": 66.67,
        "rental_status": "medium",
        "primary_tenant": "华城光网",
        "expiry_warning": "90天内到期",
        "days_remaining": 57,
        "has_warning": true
      }
    }
  ]
}
```

## 本地运行

### 1. 安装依赖

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. 启动开发服务

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3. 打开页面

- 主页面：`http://localhost:8000`
- GeoJSON 接口：`http://localhost:8000/api/conduits`
- 健康检查：`http://localhost:8000/api/health`
- Swagger 文档：`http://localhost:8000/docs`

## Docker Compose 一键部署到 VPS

确认 VPS 已安装 Docker 与 Docker Compose 插件。

### 启动

```bash
git clone <your-repo-url>
cd desktop-tutorial
docker compose up -d --build
```

### 查看状态

```bash
docker compose ps
docker compose logs -f conduit-map
```

### 停止服务

```bash
docker compose down
```

### 访问地址

- `http://<你的VPS公网IP>:8000`

## 生产环境建议

如果后续要从雏形演进成正式项目，建议继续完善：

1. 将 `app/data/conduits.json` 替换为 PostgreSQL/PostGIS。
2. 增加租赁合同表、承租客户表、资源占用历史表。
3. 接入认证鉴权与角色权限控制。
4. 在 Nginx 或 Traefik 后面做 HTTPS 反向代理。
5. 接入告警任务，用于自动识别即将到期的租赁合同。
