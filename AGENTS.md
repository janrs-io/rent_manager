# AGENTS.md — 租房管理系统项目说明

## 项目概述

租房管理系统（Rent Manager）是一个现代化的房东/物业房源管理 Web 应用，用于管理房源房间资产、租客档案、房租与水电费抄表计算、年度财务统计与退租结算。

- **云端部署平台**：Cloudflare Pages + Cloudflare D1（无服务器全栈架构）
- **线上域名**：`https://rent.rakour.com`
- **默认管理员账号**：`yjy86868@gmail.com`
- **技术选型**：
  - 后端：Cloudflare Pages Functions（Hono + TypeScript）
  - 数据库：Cloudflare D1（分布式云端 SQLite）
  - 前端：纯原生 HTML/CSS/Vanilla JavaScript（无任何打包构建工具）
  - 样式规范：Twenty CRM 高级灰单色调风格（Monochrome calm aesthetics）

---

## 目录结构

```
rent_manager/
├── frontend/                      # 静态文件（发布到 Cloudflare Pages）
│   ├── index.html                 # 登录页
│   ├── dashboard.html             # 年度统计看板
│   ├── rooms.html                 # 房间管理
│   ├── tenants.html               # 租客档案
│   ├── rent-records.html          # 收租记录
│   ├── favicon.ico / .svg / .png  # 网站图标
│   ├── css/style.css              # Twenty CRM 样式
│   └── js/
│       ├── api.js                 # 通用 API 请求库
│       ├── login.js
│       ├── dashboard.js
│       ├── rooms.js
│       ├── tenants.js
│       ├── rent-records.js
│       └── html2canvas.min.js
├── functions/
│   └── api/
│       └── [[route]].ts           # Hono 后端 API 全集
├── wrangler.toml                  # Cloudflare Pages & D1 数据库绑定
├── schema.sql                     # D1 建表与历史数据迁移脚本
├── DEPLOY_CF_PAGES.md             # 部署说明
└── package.json                   # 依赖与开发命令
```

---

## 数据库模型（Cloudflare D1）

```sql
-- 管理员
CREATE TABLE admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at DATETIME,
    updated_at DATETIME
);

-- 房间
CREATE TABLE rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_no TEXT NOT NULL UNIQUE,
    base_rent REAL NOT NULL,
    base_deposit REAL NOT NULL DEFAULT 0,
    electric_price REAL NOT NULL DEFAULT 1.0,
    water_price REAL NOT NULL DEFAULT 4.5,
    status TEXT NOT NULL DEFAULT 'occupied',
    note TEXT,
    created_at DATETIME
);

-- 租客
CREATE TABLE tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER REFERENCES rooms(id),
    room_no TEXT NOT NULL,
    name TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 1,
    gender TEXT DEFAULT 'unknown',
    phone TEXT,
    id_card TEXT,
    address TEXT,
    move_in_date DATE NOT NULL,
    move_out_date DATE,
    status TEXT DEFAULT 'active',
    created_at DATETIME
);

-- 收租记录
CREATE TABLE rent_bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_no TEXT UNIQUE,
    room_id INTEGER REFERENCES rooms(id),
    room_no TEXT NOT NULL,
    amount REAL NOT NULL,
    paid_at DATE NOT NULL,
    period_start DATE,
    period_end DATE,
    renew_date DATE,
    pay_method TEXT DEFAULT 'wechat',
    electric_start REAL DEFAULT 0,
    electric_end REAL DEFAULT 0,
    electric_price REAL DEFAULT 0,
    water_start REAL DEFAULT 0,
    water_end REAL DEFAULT 0,
    water_price REAL DEFAULT 0,
    broadband_fee REAL DEFAULT 0,
    ev_charge_fee REAL DEFAULT 0,
    is_collected INTEGER DEFAULT 0,
    note TEXT,
    created_at DATETIME
);

-- 退租归档
CREATE TABLE checkout_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER REFERENCES tenants(id),
    room_id INTEGER REFERENCES rooms(id),
    tenant_name TEXT NOT NULL,
    room_no TEXT NOT NULL,
    checkout_date DATE NOT NULL,
    refund_deposit REAL DEFAULT 0,
    deduct_fee REAL DEFAULT 0,
    actual_refund REAL DEFAULT 0,
    settle_note TEXT,
    created_at DATETIME
);
```

---

## 常用命令

```bash
# 本地预览开发
npm run dev

# 部署发布到 Cloudflare Pages
npm run deploy

# 执行 D1 远程 SQL
npx wrangler d1 execute rent-manager-db --remote --command="SELECT COUNT(*) FROM rooms;"
```
