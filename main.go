package main

import (
	"crypto/rand"
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os/exec"
	"runtime"
	"time"

	"github.com/gin-gonic/gin"
	"rent_manager/internal/db"
	"rent_manager/internal/router"
)

//go:embed frontend
var frontendFS embed.FS

func init() {
	// 设置全局时区为 UTC+8
	loc := time.FixedZone("CST", 8*3600)
	time.Local = loc
}

func main() {
	// 启动时随机生成 JWT 密钥，重启即失效
	jwtSecret := make([]byte, 32)
	if _, err := rand.Read(jwtSecret); err != nil {
		log.Fatalf("生成 JWT 密钥失败: %v", err)
	}

	database, err := db.Init("rent_manager.db")
	if err != nil {
		log.Fatalf("数据库初始化失败: %v", err)
	}
	defer database.Close()

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	router.Register(r, database, jwtSecret)

	sub, err := fs.Sub(frontendFS, "frontend")
	if err != nil {
		log.Fatalf("前端文件加载失败: %v", err)
	}
	r.NoRoute(gin.WrapH(http.FileServer(http.FS(sub))))

	// Windows 下自动打开浏览器
	if runtime.GOOS == "windows" {
		go func() {
			time.Sleep(500 * time.Millisecond)
			exec.Command("cmd", "/c", "start", "http://localhost:8080").Start()
		}()
	}

	log.Println("服务启动: http://localhost:8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatalf("服务启动失败: %v", err)
	}
}
