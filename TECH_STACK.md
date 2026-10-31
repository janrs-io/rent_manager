# 租房管理系统 — 技术栈总览

## 架构概览

本项目采用 **Cloudflare 全栈 Serverless 架构**：
- **托管平台**：Cloudflare Pages（全自动全球 CDN 加速 + Google SSL 证书）
- **自定义域名**：`https://rent.rakour.com`
- **后端**：Cloudflare Pages Functions（Hono v4 + TypeScript）
- **数据库**：Cloudflare D1（分布式 SQLite）
- **前端**：原生 HTML / CSS / Vanilla JavaScript（无框架、零构建、零依赖）

---

## 技术选型

### 后端 / 边缘函数 (Serverless)

| 技术 | 说明 |
|------|------|
| **Hono v4** | 轻量级、超快、边缘原生的 Web 框架 |
| **Cloudflare Pages Functions** | 无服务器边缘计算，毫秒级响应，0 运维成本 |
| **Cloudflare D1** | 云端分布式 SQLite 数据库，全球低延迟查询 |
| **jose** | 现代标准 JWT 加密库，HS256 鉴权 |
| **bcrypt-ts** | 纯 TypeScript 实现的 bcrypt 算法，密码哈希安全校验 |

### 前端 UI

| 技术 | 说明 |
|------|------|
| **原生 HTML5 / CSS3 / ES6+** | 零构建打包工具，浏览器直接执行，极速加载 |
| **Twenty CRM 设计系统** | 现代极简中性灰黑单色调（Monochrome/Calm 灰白高级质感） |
| **html2canvas** | 前端一键生成房租水电账单凭证图片并复制到剪贴板 |
| **Clipboard API** | 浏览器原生剪贴板交互 |

---

## 核心业务特性

1. **房间资产与租客分离**：独立支持多租客（主承租人与合租同住人关联归档）。
2. **智能水电表向上回溯**：若上次读数为 0，系统自动向上递归追溯到最近一次非 0 读数，并精准标注来源年月（如：来自 2026年7月）。
3. **退租结算流水归档**：租客搬出时自动计算押金退还与尾期水电费，历史账单永不丢失。
4. **性别标识与年龄计算**：根据租客身份证第 7-14 位自动精确计算周岁，姓名旁配以蓝粉性别图标。
5. **单页就地快捷记账**：在房态列表即可直接呼出 880px 双栏弹窗记账，无页面跳转。

---

## 目录结构

```
rent_manager/
├── frontend/                      # 静态资源（直接部署到 Pages）
│   ├── index.html                 # 登录页
│   ├── dashboard.html             # 年度看板
│   ├── rooms.html                 # 房间管理
│   ├── tenants.html               # 租客档案
│   ├── rent-records.html          # 收租流水
│   ├── favicon.ico / .svg / .png  # 网站图标
│   ├── css/style.css              # 全局 Twenty CRM 样式
│   └── js/
│       ├── api.js                 # HTTP 请求封装、JWT 注入
│       ├── login.js               # 登录逻辑
│       ├── dashboard.js           # 看板图表与统计
│       ├── rooms.js               # 房间管理与就地记账
│       ├── tenants.js             # 租客管理与退租结算
│       ├── rent-records.js        # 收租记账与账单图片生成
│       └── html2canvas.min.js     # 账单截图库
├── functions/                     # Cloudflare Pages Functions 接口
│   └── api/
│       └── [[route]].ts           # Hono 全量业务路由 (Auth, Dashboard, Rooms, Tenants, Bills)
├── wrangler.toml                  # Cloudflare Pages 与 D1 绑定配置
├── schema.sql                     # D1 数据库结构与种子数据
├── DEPLOY_CF_PAGES.md             # 部署与运维指南
└── package.json                   # 项目依赖与开发命令
```
