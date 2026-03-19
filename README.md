# 轻量级通信管网租赁可视化系统

这是一个基于 **Python FastAPI** 后端和 **Leaflet.js** 前端的轻量级通信管网租赁可视化系统雏形，可用于演示通信管道资产上图、租赁率着色、容量线宽映射，以及按租赁状态过滤查看。

## 功能特性

- 使用 **OpenStreetMap** 作为底图。
- 后端通过 `/api/conduits` 返回 **GeoJSON FeatureCollection**。
- 管道线段按租赁率动态着色：
  - `< 50%`：绿色
  - `50% - 80%`：黄色
  - `> 80%`：红色
- 线宽根据总孔数 `total_cores` 动态变化。
- 点击管段弹出 Popup，显示：
  - 路段名称
  - 管孔总数
  - 已租赁数量
  - 主要承租方
  - 到期预警
- 左侧边栏支持按租赁状态筛选。

## 项目结构

```text
.
├── app/
│   └── static/
│       ├── app.js
│       ├── index.html
│       └── styles.css
├── main.py
├── requirements.txt
├── Dockerfile
└── docker-compose.yml
```

## 模拟数据结构

后端内置了示例数据，核心 JSON 结构如下：

```json
{
  "id": "CD-001",
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

## 本地运行

### 1. 安装依赖

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. 启动服务

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 3. 访问系统

- 页面地址：`http://localhost:8000`
- 接口地址：`http://localhost:8000/api/conduits`
- API 文档：`http://localhost:8000/docs`

## Docker Compose 一键部署到 VPS

确保 VPS 已安装 **Docker** 与 **Docker Compose**（或新版 `docker compose` 插件）。

### 部署步骤

```bash
git clone <your-repo-url>
cd desktop-tutorial
docker compose up -d --build
```

服务启动后访问：

- `http://<你的VPS公网IP>:8000`

### 常用命令

```bash
docker compose ps
docker compose logs -f
docker compose down
```

## 接口说明

### `GET /api/conduits`

返回 GeoJSON 格式的通信管网数据，便于前端直接用 Leaflet 的 `L.geoJSON` 渲染。

返回结构示例：

```json
{
  "type": "FeatureCollection",
  "name": "telecom_conduits",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [[116.3871, 39.9075], [116.3928, 39.9092]]
      },
      "properties": {
        "id": "CD-001",
        "road_name": "科技大道西段",
        "total_cores": 12,
        "occupied_cores": 4,
        "rental_rate": 33.33,
        "rental_status": "low",
        "primary_tenant": "星联通信",
        "expiry_warning": "正常"
      }
    }
  ]
}
```

## 生产部署建议

当前版本是演示雏形，建议在正式上线前进一步完善：

- 将内置模拟数据替换为数据库（如 PostgreSQL/PostGIS）。
- 为租赁合同、预警规则、客户主体增加独立表结构。
- 在 Nginx 后面反向代理，并配置 HTTPS。
- 引入用户登录、角色权限、操作日志和审计机制。
- 如果需要更复杂空间分析，可升级到 GeoPandas / PostGIS 空间查询。
