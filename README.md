# 在线考试简单小程序

这是一个可快速部署的在线考试 Demo，包含你需要的 3 个页面：

- **出题页面**：支持判断题/选择题，设置每题限时（10~30s）。
- **答题页面**：多位考生同时参与，题目按统一时间自动切换，保证同步刷新。
- **统计页面**：实时汇总考生信息、得分与排名。

## 快速开始

```bash
npm install
npm start
```

默认启动地址：`http://localhost:3000`

## 页面说明

- `http://localhost:3000/admin.html`：出题和开考。
- `http://localhost:3000/exam.html`：考生答题。
- `http://localhost:3000/stats.html`：成绩统计。

## 说明

- 当前版本为简洁演示，数据存储在内存中；重启服务后数据会清空。
- 如需正式上线，建议接入数据库（例如 MySQL/PostgreSQL/Redis）与鉴权系统。
