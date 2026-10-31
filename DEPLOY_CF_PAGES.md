# 租房管理系统 · Cloudflare Pages + D1 上线部署指南

本项目已完成从 Go 单体到 **Cloudflare Pages (Hono 边缘函数) + Cloudflare D1 (无服务器 SQLite)** 的完整现代化重构。

- 前端静态目录：`./frontend`
- 边缘服务函数：`./functions/api/[[route]].ts` (Hono 框架)
- 数据库结构与完整数据：`./schema.sql` (包含完整的 10 间房、14 位在租租客、63 笔历史账单及管理员账号)

---

## 初始管理员账号与密码

| 项目 | 配置 |
| :--- | :--- |
| **登录账号** | 默认管理员账号 |
| **登录密码** | 初始管理员密码（见私有管理记录） |
| **加密方式** | `bcrypt` 加密哈希存储 |

---

## 快速部署流程（3 步完成上线）

### 第一步：在 Cloudflare 创建远程 D1 数据库

在项目根目录下运行（如果未登录 Cloudflare，会自动弹出浏览器授权登录）：

```bash
npx wrangler d1 create rent-manager-db
```

命令执行成功后，终端会输出类似如下的数据库配置信息：

```toml
[[d1_databases]]
binding = "DB"
database_name = "rent-manager-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

> **提示**：将终端中输出的 `database_id` 复制并替换到根目录 `wrangler.toml` 中的 `database_id` 处。

---

### 第二步：将现有完整业务数据导入远程 D1 数据库

运行以下命令，将 `schema.sql` 一键执行到远程 D1 数据库中：

```bash
npx wrangler d1 execute rent-manager-db --remote --file=./schema.sql
```

导入成功后，所有的房间、租客档案、63 笔历史收租账单和加密管理员账号便已在 Cloudflare 远程就绪（100% 无损迁移）。

---

### 第三步：部署上线到 Cloudflare Pages

你可以选择以下两种方式之一完成部署：

#### 方式 A：通过 Wrangler 命令行直接发布（推荐，最快）

```bash
npx wrangler pages deploy frontend --project-name rent-manager
```

首次运行后会自动创建名为 `rent-manager` 的 Pages 项目并输出访问网址（如 `https://rent-manager.pages.dev`）。

发布完成后，进入 **[Cloudflare 控制台](https://dash.cloudflare.com/)**：
1. 点击左侧菜单 **Workers & Pages** -> 选择 **rent-manager**；
2. 点击 **Settings (设置)** -> **Functions (函数)**；
3. 向下滚动找到 **D1 database bindings (D1 数据库绑定)** -> 点击 **Add binding (添加绑定)**；
4. 填写：
   - **Variable name (变量名)**: `DB`
   - **D1 database (数据库)**: 选择刚刚创建的 `rent-manager-db`
5. 点击 **Save (保存)**。

绑定完成后，重新部署或等待 10 秒刷新，线上系统即可完美运行！

---

#### 方式 B：通过 GitHub 仓库自动 CI/CD 部署

1. 将当前项目提交并推送（Push）到 GitHub 仓库；
2. 打开 **[Cloudflare 控制台](https://dash.cloudflare.com/)** -> **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**；
3. 选择你的仓库 `rent_manager`，配置构建参数：
   - **Framework preset**: `None`
   - **Build command**: (留空)
   - **Build output directory**: `frontend`
4. 点击 **Save and Deploy**；
5. 部署完成后，在项目 **Settings** -> **Functions** -> **D1 database bindings** 中绑定 `DB` -> `rent-manager-db`。

---

## 本地开发与预览命令

如果在本地需要再次启动测试：

```bash
# 运行本地边缘服务与数据库（端口 8788）
npm run dev

# 如果需要重置本地测试数据库
npm run db:init:local
```

---

## 核心业务与系统设计特性

1. **零冷启动延迟**：部署于 Cloudflare 全球边缘网络，毫秒级就近响应。
2. **免费额度充分**：Cloudflare D1 每日提供 500 万次读取与 10 万次写入，个人与小型物业管理终身免费无忧。
3. **数据安全无泄漏**：密码由 `bcrypt` 加密存储，API 接口全面由 HS256 JWT 中间件守护。
4. **回溯非 0 抄表算法**：水电读数自动向上追溯历史非 0 真实数据，规避了隔月抄表重置为 0 的失真问题。
5. **Twenty CRM 极简审美**：黑白冷静、克制高雅，宽屏双列录入与就地记账，无页面跳转阻断。
