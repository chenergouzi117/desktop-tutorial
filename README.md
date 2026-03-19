# 轻量级通信管网租赁可视化系统

这是一个基于 **Python FastAPI** 后端和 **Leaflet.js** 前端实现的轻量级通信管网资产可视化雏形，面向通信基础设施资产管理场景，用于演示：**管道上图、租赁率展示、合同管理、人井点位、孔位占用状态、数据上传与批量编辑**。

## 系统能力概览

- **地图底图**：使用 OpenStreetMap。
- **管道图层**：按租赁率动态着色，按总孔数映射线宽。
- **人井图层**：在地图上展示人井点位，点击后查看孔位占用状态。
- **合同信息**：点击管道可查看关联合同、承租方、孔位分配和到期状态。
- **资产维护**：提供专门的数据维护页面，支持：
  - 上传完整 JSON 文件覆盖当前资产数据
  - 在线批量修改 JSON 并保存
  - 下载当前系统中的完整资产 JSON 模板
- **部署方式**：支持本地运行、Docker Compose 和 VPS 一键脚本部署。

## 项目结构

```text
.
├── app/
│   ├── data/
│   │   └── network_assets.json   # 管道 + 合同 + 人井 + 孔位示例数据
│   └── static/
│       ├── admin.html            # 数据上传 / 批量编辑页面
│       ├── admin.js              # 数据维护逻辑
│       ├── app.js                # 地图交互逻辑
│       ├── index.html            # 地图页面
│       └── styles.css            # 样式文件
├── install_vps.sh                # VPS 一键安装脚本
├── main.py                       # FastAPI 入口
├── requirements.txt              # Python 依赖
├── Dockerfile                    # 镜像构建文件
└── docker-compose.yml            # Docker Compose 配置
```

## 现在如何上传管道数据？是否有专门界面？

有，已经增加了专门的**资产维护界面**：

- 地图首页右上角点击：`数据上传 / 批量修改`
- 或直接访问：`/manage`

这个页面支持两种简易方式：

### 方式 1：直接上传 JSON 文件

在 `/manage` 页面里选择一个 `.json` 文件，点击“上传并覆盖当前数据”，系统会调用后端接口：

- `POST /api/assets/upload`

适合一次性导入整批管道、合同、人井数据。

### 方式 2：批量修改当前 JSON

在 `/manage` 页面点击“加载当前数据”后，会把系统里的完整资产 JSON 加载到文本框里。你可以：

1. 直接修改 JSON
2. 点击“保存修改”
3. 系统调用 `PUT /api/assets/full` 保存

适合快速批量修改字段，比如：

- 新增管道
- 修改承租方
- 增删合同
- 调整孔位占用情况
- 增删人井

### 方式 3：下载当前模板再修改上传

在 `/manage` 页面点击“下载当前数据”，即可拿到当前系统的完整 JSON 模板，离线编辑后再重新上传。

---

## 需要上传什么格式的数据？

系统当前使用的完整资产 JSON 结构如下：

```json
{
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
          "leased_cores": [1, 2, 3],
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
      "total_cores": 12,
      "occupied_cores": 4,
      "control_status": "正常",
      "connected_conduit_ids": ["CD-001"],
      "cores": [
        {"index": 1, "status": "occupied", "tenant": "星联通信", "color": "#2563eb"},
        {"index": 2, "status": "available", "tenant": "", "color": "#cbd5e1"}
      ]
    }
  ]
}
```

### 字段说明

#### `conduits`

每条管道记录包含：

- `id`: 管道编号
- `road_name`: 路段名称
- `coordinates`: 管道路由坐标，格式为 `[longitude, latitude]`
- `total_cores`: 总孔数
- `occupied_cores`: 已占用孔数
- `tenant_info`: 主要承租信息
- `contracts`: 该管道对应的合同数组
- `manhole_ids`: 关联的人井编号

#### `contracts`

每份合同包含：

- `contract_id`: 合同编号
- `lessee`: 承租方
- `leased_cores`: 该合同占用的孔位编号
- `start_date`: 开始日期
- `end_date`: 到期日期
- `status`: 合同状态
- `color`: 用于前端显示的颜色

#### `manholes`

每个人井包含：

- `id`: 人井编号
- `name`: 人井名称
- `coordinates`: 井位点坐标
- `total_cores`: 总孔数
- `occupied_cores`: 已占用孔数
- `control_status`: 管控状态
- `connected_conduit_ids`: 关联的管道编号
- `cores`: 每个孔的状态数组

#### `cores`

每个孔位对象包含：

- `index`: 孔位编号
- `status`: `occupied / available / reserved`
- `tenant`: 当前占用单位
- `color`: 前端展示颜色

---

## 地图上的新增能力

### 1. 管道点击后可查看合同信息

点击管道后，Popup 中会显示：

- 路段名称
- 管孔总数
- 已租赁数量
- 主要承租方
- 到期预警
- 关联合同列表
- 每份合同占用了哪些孔

### 2. 地图上新增人井点位

系统已支持在人井位置显示点位。

点击人井后，Popup 中会显示：

- 人井名称 / 编号
- 管控状态
- 总孔数
- 已占用孔数
- 空闲孔数
- 关联管道编号
- 每个孔位的状态格子

### 3. 孔位颜色与斜线表示占用

在人井弹窗中：

- **不同颜色**表示不同承租方或占用来源
- **斜线纹理**表示该孔已被占用
- 空闲孔使用浅色和虚线边框显示

---

## 后端接口说明

### 1. `GET /api/health`

健康检查接口。

### 2. `GET /api/map-data`

返回地图所需的全部可视化数据：

- `conduits` 管道 GeoJSON
- `manholes` 人井 GeoJSON
- `summary` 汇总统计

支持筛选参数：

- `status`: `all | low | medium | high`
- `tenant`: 按主要承租方关键字过滤
- `warning_only`: 是否只返回预警段

### 3. `GET /api/assets/full`

获取当前系统中的完整资产 JSON，用于批量编辑或下载模板。

### 4. `PUT /api/assets/full`

直接提交完整资产 JSON，覆盖保存当前数据。

### 5. `POST /api/assets/upload`

上传 `.json` 文件覆盖当前资产数据。

### 6. `GET /api/conduits`

仅返回管道 GeoJSON 图层。

### 7. `GET /api/manholes`

仅返回人井 GeoJSON 图层。

---

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

### 3. 访问地址

- 地图页面：`http://localhost:8000`
- 数据维护页面：`http://localhost:8000/manage`
- 完整资产 JSON：`http://localhost:8000/api/assets/full`
- 地图接口：`http://localhost:8000/api/map-data`
- Swagger 文档：`http://localhost:8000/docs`

---

## 在 VPS 上部署（Docker Compose）

项目根目录已提供一键安装脚本 `install_vps.sh`，适合 **Ubuntu 22.04 / 24.04 / Debian** 服务器使用。

### 推荐方式：直接执行一键安装脚本

```bash
cd /opt/desktop-tutorial
chmod +x install_vps.sh
sudo ./install_vps.sh
```

### 如果你是首次把项目拉到 VPS

```bash
ssh root@<你的VPS公网IP>
apt update && apt install -y git
cd /opt
git clone <your-repo-url> desktop-tutorial
cd /opt/desktop-tutorial
chmod +x install_vps.sh
sudo ./install_vps.sh
```

---

## 生产环境建议

如果后续要从雏形演进成正式项目，建议继续完善：

1. 将 JSON 文件替换为 PostgreSQL/PostGIS。
2. 为合同、客户、人井巡检、故障工单建立独立表结构。
3. 增加登录鉴权、操作审计和版本回滚。
4. 接入 Nginx / HTTPS / 域名访问。
5. 为上传和修改增加历史版本与导入校验报告。
