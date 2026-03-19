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

## 在 VPS 上部署（Docker Compose）

下面给出一套适合 **Ubuntu 22.04 / 24.04 VPS** 的实际部署步骤。如果你的 VPS 是 Debian，命令基本也一致。

### 第 1 步：登录 VPS

```bash
ssh root@<你的VPS公网IP>
```

如果你不是 `root` 用户，也可以登录普通用户后再执行：

```bash
sudo -i
```

### 第 2 步：安装 Docker 和 Docker Compose 插件

```bash
apt update
apt install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo   "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu   $(. /etc/os-release && echo $VERSION_CODENAME) stable"   | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable docker
systemctl start docker
```

安装完成后可检查版本：

```bash
docker --version
docker compose version
```

### 第 3 步：开放服务器端口

如果你的 VPS 使用 `ufw` 防火墙，请放行 SSH 和应用端口：

```bash
ufw allow OpenSSH
ufw allow 8000/tcp
ufw enable
ufw status
```

如果你的云厂商还有“安全组”，也需要在控制台放通 **TCP 8000**。

### 第 4 步：拉取项目代码

```bash
cd /opt
git clone <your-repo-url> desktop-tutorial
cd /opt/desktop-tutorial
```

如果你已经有代码，只需要进入项目目录：

```bash
cd /opt/desktop-tutorial
```

### 第 5 步：启动服务

```bash
docker compose up -d --build
```

首次启动会自动：

- 构建 Python 镜像
- 安装 `FastAPI` / `uvicorn`
- 启动容器 `conduit-map`
- 将宿主机 `8000` 端口映射到容器 `8000`

### 第 6 步：检查部署状态

```bash
docker compose ps
docker compose logs -f conduit-map
```

如果你看到类似 `Uvicorn running on http://0.0.0.0:8000`，说明服务已正常启动。

也可以直接在 VPS 本机测试：

```bash
curl http://127.0.0.1:8000/api/health
curl http://127.0.0.1:8000/api/conduits
```

正常情况下会分别返回：

```json
{ "status": "ok" }
```

以及一份 GeoJSON `FeatureCollection` 数据。

### 第 7 步：浏览器访问

部署成功后可直接访问：

- 主页面：`http://<你的VPS公网IP>:8000`
- 健康检查：`http://<你的VPS公网IP>:8000/api/health`
- GeoJSON 接口：`http://<你的VPS公网IP>:8000/api/conduits`
- Swagger 文档：`http://<你的VPS公网IP>:8000/docs`

---

## 常用运维命令

### 查看运行状态

```bash
docker compose ps
```

### 查看实时日志

```bash
docker compose logs -f conduit-map
```

### 重启服务

```bash
docker compose restart conduit-map
```

### 更新代码后重新部署

```bash
cd /opt/desktop-tutorial
git pull
docker compose up -d --build
```

### 停止服务

```bash
docker compose down
```

### 停止并删除镜像缓存（可选）

```bash
docker compose down --rmi local
```

---

## 推荐的上线方式

### 方案 A：先直接暴露 8000 端口

适合测试和演示，最简单：

- 浏览器直接访问 `http://<你的VPS公网IP>:8000`
- 不需要额外安装 Nginx

### 方案 B：使用 Nginx 反向代理到 80 / 443 端口

适合正式环境，推荐后续这样做：

1. Nginx 对外提供 `80/443`
2. Nginx 将请求反向代理到 `127.0.0.1:8000`
3. 配合 Certbot 配置 HTTPS

一个最简 Nginx 反向代理示例：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如果你后续需要，我还可以继续帮你补：

- Nginx 配置文件
- HTTPS（Let's Encrypt）配置
- 域名部署方式
- Systemd + Docker 开机自启方案

## 生产环境建议

如果后续要从雏形演进成正式项目，建议继续完善：

1. 将 `app/data/conduits.json` 替换为 PostgreSQL/PostGIS。
2. 增加租赁合同表、承租客户表、资源占用历史表。
3. 接入认证鉴权与角色权限控制。
4. 在 Nginx 或 Traefik 后面做 HTTPS 反向代理。
5. 接入告警任务，用于自动识别即将到期的租赁合同。
