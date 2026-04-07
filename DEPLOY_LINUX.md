# 租房管理系统 — Linux 部署文档

## 默认账号

| 项目 | 值 |
|------|----|
| 用户名 | `john` |
| 密码 | `123456` |

> 首次登录后建议修改密码。

---

## 环境要求

- Debian 10+ 或 Ubuntu 20.04+
- Nginx
- 已解析到服务器的域名
- （可选）SSL 证书，推荐使用 Let's Encrypt

---

## 一、本地编译 Linux 二进制

在 Windows 开发机上交叉编译：

```bash
set GOOS=linux
set GOARCH=amd64
go build -o rent_manager .
```

编译完成后得到 `rent_manager`（无后缀的 Linux 可执行文件）。

---

## 二、上传到服务器

```bash
scp rent_manager user@your-server-ip:/opt/rent_manager/
```

---

## 三、服务器初始化

```bash
# 创建目录
mkdir -p /opt/rent_manager

# 赋予可执行权限
chmod +x /opt/rent_manager/rent_manager
```

---

## 四、配置 systemd 服务（开机自启）

创建服务文件：

```bash
nano /etc/systemd/system/rent_manager.service
```

写入以下内容：

```ini
[Unit]
Description=Rent Manager
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/rent_manager
ExecStart=/opt/rent_manager/rent_manager
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启用并启动服务：

```bash
systemctl daemon-reload
systemctl enable rent_manager
systemctl start rent_manager

# 查看运行状态
systemctl status rent_manager
```

程序默认监听 `127.0.0.1:8080`。

---

## 五、配置 Nginx 反向代理

```bash
nano /etc/nginx/sites-available/rent_manager
```

写入以下内容（将 `your-domain.com` 替换为实际域名）：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
```

启用配置：

```bash
ln -s /etc/nginx/sites-available/rent_manager /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

访问 `http://your-domain.com` 即可打开系统。

---

## 六、配置 HTTPS（推荐）

使用 Certbot 自动申请 Let's Encrypt 证书：

```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d your-domain.com
```

Certbot 会自动修改 Nginx 配置并启用 HTTPS，证书每 90 天自动续期。

---

## 七、数据库文件

系统首次启动时会在 `WorkingDirectory`（即 `/opt/rent_manager/`）自动创建：

```
/opt/rent_manager/rent_manager.db
```

**请定期备份该文件，它包含所有租客和收租数据。**

备份示例：

```bash
cp /opt/rent_manager/rent_manager.db /backup/rent_manager_$(date +%Y%m%d).db
```

---

## 八、常用运维命令

```bash
# 查看服务状态
systemctl status rent_manager

# 重启服务（重启后所有登录会话失效，需重新登录）
systemctl restart rent_manager

# 查看实时日志
journalctl -u rent_manager -f

# 停止服务
systemctl stop rent_manager
```

---

## 注意事项

- 重启服务后，所有已登录的会话将**自动失效**，需重新登录（JWT Secret 在每次启动时随机生成）
- 数据库文件 `rent_manager.db` 不包含在二进制中，需单独备份
- 如需升级，停止服务 → 替换二进制文件 → 重启服务即可，数据库文件不受影响
