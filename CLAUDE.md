# CLAUDE.md — 租房管理系统项目说明

## 项目概述

租房管理系统（Rent Manager）是一个面向房东/物业的 Web 应用，用于管理租客信息、租金收取记录、水电费计算和年度收入统计。

- 后端：Go + Gin，编译为单一可执行文件
- 前端：原生 HTML/CSS/JS，通过 `embed.FS` 打包进 exe
- 数据库：SQLite（纯 Go 驱动，无 CGO 依赖）
- 服务地址：`http://localhost:8080`
- Windows 双击 exe 后自动打开浏览器

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | Gin v1.12.0 |
| 数据库驱动 | modernc.org/sqlite v1.48.1（纯 Go，无 CGO） |
| 认证 | JWT（golang-jwt/jwt v5），随机密钥，重启失效 |
| 密码哈希 | bcrypt（golang.org/x/crypto） |
| 前端 | 原生 HTML/CSS/Vanilla JS，无构建工具 |
| 图片导出 | html2canvas（前端库） |

---

## 目录结构

```
rent_manager/
├── main.go                      # 入口：初始化 JWT 密钥、DB、路由、嵌入前端、自动打开浏览器
├── go.mod / go.sum
├── rent_manager.exe             # 编译好的 Windows 可执行文件
├── rent_manager.db              # SQLite 数据库（运行时自动创建）
├── frontend/                    # 嵌入进 exe 的前端静态文件
│   ├── index.html               # 登录页
│   ├── dashboard.html           # 年度统计看板
│   ├── tenants.html             # 租客管理
│   ├── rent-records.html        # 收租记录
│   ├── css/style.css
│   └── js/
│       ├── api.js               # HTTP 封装、JWT 注入、登出
│       ├── login.js
│       ├── dashboard.js
│       ├── tenants.js
│       ├── rent-records.js
│       └── html2canvas.min.js
├── internal/
│   ├── db/db.go                 # 建表、WAL 模式、默认管理员 seed
│   ├── handler/                 # 各模块 HTTP 处理函数
│   │   ├── auth.go              # 登录、修改密码
│   │   ├── tenant.go            # 租客 CRUD
│   │   ├── rent_record.go       # 收租记录 CRUD
│   │   └── dashboard.go         # 年度统计
│   ├── middleware/auth.go       # JWT 鉴权中间件
│   ├── model/admin.go           # Admin 结构体
│   └── router/router.go         # 路由注册
├── TECH_STACK.md
├── DEPLOY_LINUX.md
└── build/windows/               # Windows 构建元数据（info.json、icon）
```

---

## 数据库 Schema

```sql
-- 管理员（默认账号 john / 123456）
CREATE TABLE admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,          -- bcrypt
    created_at DATETIME,
    updated_at DATETIME
);

-- 租客
CREATE TABLE tenants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    gender TEXT DEFAULT 'unknown',   -- male/female/unknown
    phone TEXT,
    id_card TEXT,                    -- 18位身份证，7-14位为生日
    address TEXT,
    room_no TEXT NOT NULL,
    rent_amount REAL NOT NULL,
    deposit REAL DEFAULT 0,
    move_in_date DATE NOT NULL,
    status TEXT DEFAULT 'active',    -- active/inactive
    created_at DATETIME
);

-- 收租记录
CREATE TABLE rent_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER REFERENCES tenants(id),
    amount REAL NOT NULL,
    paid_at DATE NOT NULL,
    electric_start REAL DEFAULT 0,
    electric_end REAL DEFAULT 0,
    electric_price REAL DEFAULT 0,
    water_start REAL DEFAULT 0,
    water_end REAL DEFAULT 0,
    water_price REAL DEFAULT 0,
    broadband_fee REAL DEFAULT 0,
    ev_charge_fee REAL DEFAULT 0,
    is_collected INTEGER DEFAULT 0,  -- 0=未收 1=已收
    renew_date DATE,
    note TEXT,
    created_at DATETIME
);
```

---

## API 路由

```
POST   /api/auth/login                 # 登录，返回 JWT token
POST   /api/auth/change-password       # 修改密码（需 Bearer token）

GET    /api/dashboard?year=YYYY        # 年度统计（月度明细）

GET    /api/tenants                    # 租客列表
POST   /api/tenants                    # 新增租客
PUT    /api/tenants/:id                # 修改租客
DELETE /api/tenants/:id                # 删除租客

GET    /api/rent-records?year=&month=  # 收租记录列表
POST   /api/rent-records               # 新增记录
PUT    /api/rent-records/:id           # 修改记录
PUT    /api/rent-records/:id/collect   # 切换收款状态
DELETE /api/rent-records/:id           # 删除记录
```

---

## 构建与运行

```bash
# 开发运行
go run main.go

# 编译 Windows exe
go build -o rent_manager.exe .

# 交叉编译 Linux 二进制
GOOS=linux GOARCH=amd64 go build -o rent_manager .
```

**Windows 运行**：直接双击 `rent_manager.exe`，自动打开 `http://localhost:8080`。
如双击无反应/窗口一闪而过，用以下方式诊断：

```cmd
# 在 cmd 中运行，窗口保持打开可看到错误
cd /d D:\rent_manager
rent_manager.exe
```

常见问题：
- 端口 8080 已被占用（`netstat -ano | findstr 8080`）
- 数据库文件权限问题

---

## 关键设计决策

1. **单文件部署**：`embed.FS` 将前端全部打包进 exe，无需额外文件
2. **无 CGO**：使用 `modernc.org/sqlite` 避免需要 C 编译器，支持交叉编译
3. **随机 JWT 密钥**：每次启动重新生成，重启即使所有会话失效（安全设计）
4. **时区固定 UTC+8**：在 `init()` 中设置，数据库用 `datetime('now','localtime')`
5. **年龄计算**：从 18 位身份证号第 7-14 位（YYYYMMDD）在服务端计算
6. **按房间分组**：前端按 `room_no` 分组显示，同一房间多租客用分隔线
7. **自动续租日期**：根据付款日 + 入住日计算下次到期日

---

## Linux 部署（简要）

详见 `DEPLOY_LINUX.md`。核心步骤：

1. 编译 Linux 二进制并上传到 `/opt/rent_manager/`
2. 配置 systemd 服务（监听 `127.0.0.1:8080`）
3. Nginx 反向代理 + Let's Encrypt HTTPS
4. 定期备份 `rent_manager.db`
