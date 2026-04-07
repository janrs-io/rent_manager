# 租房管理系统 — 技术栈总览

## 后端

| 技术 | 版本/说明 |
|------|-----------|
| **Go** | 主语言 |
| **Gin** | HTTP Web 框架（`github.com/gin-gonic/gin`） |
| **modernc.org/sqlite** | 纯 Go 实现的 SQLite 驱动，无需 CGO，支持交叉编译 |
| **golang-jwt/jwt/v5** | JWT 认证（`github.com/golang-jwt/jwt/v5`） |
| **golang.org/x/crypto/bcrypt** | 管理员密码哈希存储 |
| **embed.FS** | 标准库，将前端静态文件打包进单一可执行文件 |

## 前端

| 技术 | 说明 |
|------|------|
| **原生 HTML / CSS / JavaScript** | 无框架，无构建工具 |
| **html2canvas** | 将收租明细弹窗渲染为图片并复制到剪贴板 |
| **Clipboard API** | 浏览器原生 API，配合 html2canvas 实现复制图片 |

## 数据库

| 技术 | 说明 |
|------|------|
| **SQLite** | 单文件数据库（`rent_manager.db`） |
| **WAL 模式** | 开启 Write-Ahead Logging，提升并发读写性能 |

## 认证与安全

| 技术 | 说明 |
|------|------|
| **JWT（Bearer Token）** | 登录后颁发，有效期 7 天；服务重启即失效（随机 Secret） |
| **bcrypt** | 密码加密存储，验证时比对哈希值 |
| **随机 JWT Secret** | 每次启动时 `crypto/rand` 生成，重启后所有会话自动过期 |

## 部署

| 场景 | 方案 |
|------|------|
| **Windows 桌面** | 编译为单一 `.exe`，双击运行，自动打开浏览器（`http://localhost:8080`） |
| **Linux 服务器（Debian）** | 编译为 Linux 二进制，Nginx 反向代理，域名访问 |

## 项目结构

```
rent_manager/
├── main.go                        # 入口：JWT Secret 生成、DB 初始化、Gin 启动
├── frontend/                      # 前端静态文件（embed 打包）
│   ├── index.html                 # 登录页
│   ├── dashboard.html             # 总览页
│   ├── tenants.html               # 租客管理页
│   ├── rent-records.html          # 收租管理页
│   ├── css/style.css              # 全局样式
│   └── js/
│       ├── api.js                 # 请求封装、JWT 注入、登录态管理
│       ├── dashboard.js           # 总览页逻辑
│       ├── tenants.js             # 租客管理逻辑
│       └── rent-records.js        # 收租管理逻辑
└── internal/
    ├── db/db.go                   # 数据库初始化、建表、默认数据
    ├── handler/
    │   ├── auth.go                # 登录、修改密码
    │   ├── tenant.go              # 租客 CRUD、年龄计算
    │   ├── rent_record.go         # 收租记录 CRUD、费用计算
    │   └── dashboard.go           # 年度/月度统计
    ├── middleware/auth.go         # JWT 鉴权中间件
    └── router/router.go           # 路由注册
```

## 关键设计决策

- **单二进制部署**：`embed.FS` 将所有前端文件内嵌，无需额外部署静态资源
- **无 CGO**：使用 `modernc.org/sqlite` 代替 `mattn/go-sqlite3`，支持在 Windows 直接交叉编译到 Linux
- **时区**：`init()` 中固定设置 `time.Local = UTC+8`，数据库使用 `datetime('now','localtime')`
- **身份证年龄计算**：取 18 位身份证第 7-14 位（YYYYMMDD）解析生日，服务端计算后返回
- **房间分组**：前端按 `room_no` 分组，同一房间的租客合并为一行展示
