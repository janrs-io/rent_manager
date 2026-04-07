package main

import (
	"crypto/rand"
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"time"
	"unsafe"

	"github.com/getlantern/systray"
	"github.com/gin-gonic/gin"
	"golang.org/x/sys/windows"
	"rent_manager/internal/db"
	"rent_manager/internal/router"
)

//go:embed frontend
var frontendFS embed.FS

//go:embed build/windows/icon.ico
var iconData []byte

func init() {
	// 设置全局时区为 UTC+8
	loc := time.FixedZone("CST", 8*3600)
	time.Local = loc
}

// ensureSingleInstance 使用 Windows 命名互斥锁确保只有一个实例运行。
// 若已有实例在运行，则打开浏览器并退出当前进程。
func ensureSingleInstance() {
	name, _ := windows.UTF16PtrFromString("RentManagerSingleInstance")
	h, err := windows.CreateMutex(nil, false, name)
	if err == windows.ERROR_ALREADY_EXISTS {
		// 已有实例运行，打开浏览器后退出
		openBrowser()
		os.Exit(0)
	}
	if err != nil {
		// 创建互斥锁失败，忽略继续启动
		return
	}
	// 保持句柄不被 GC，进程退出时系统自动释放
	runtime.KeepAlive((*[1]unsafe.Pointer)(unsafe.Pointer(&h)))
}

func main() {
	if runtime.GOOS == "windows" {
		ensureSingleInstance()
	}

	// 启动时随机生成 JWT 密钥，重启即失效
	jwtSecret := make([]byte, 32)
	if _, err := rand.Read(jwtSecret); err != nil {
		log.Fatalf("生成 JWT 密钥失败: %v", err)
	}

	database, err := db.Init("rent_manager.db")
	if err != nil {
		log.Fatalf("数据库初始化失败: %v", err)
	}

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	router.Register(r, database, jwtSecret)

	sub, err := fs.Sub(frontendFS, "frontend")
	if err != nil {
		log.Fatalf("前端文件加载失败: %v", err)
	}
	r.NoRoute(gin.WrapH(http.FileServer(http.FS(sub))))

	// 后台启动 HTTP 服务
	go func() {
		log.Println("服务启动: http://localhost:8080")
		if err := r.Run(":8080"); err != nil {
			log.Fatalf("服务启动失败: %v", err)
		}
	}()

	if runtime.GOOS == "windows" {
		// Windows：显示系统托盘（必须在主 goroutine 运行）
		systray.Run(onReady, func() {
			database.Close()
			os.Exit(0)
		})
	} else {
		// 非 Windows：阻塞主 goroutine
		select {}
	}
}

func openBrowser() {
	exec.Command("cmd", "/c", "start", "http://localhost:8080").Start()
}

func onReady() {
	systray.SetIcon(iconData)
	systray.SetTooltip("租房管理系统 · 运行中 (localhost:8080)")

	mOpen := systray.AddMenuItem("打开管理系统", "在浏览器中打开")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("退出", "停止服务并退出")

	// 启动后自动打开浏览器
	go func() {
		time.Sleep(500 * time.Millisecond)
		openBrowser()
	}()

	// 处理菜单点击
	go func() {
		for {
			select {
			case <-mOpen.ClickedCh:
				openBrowser()
			case <-mQuit.ClickedCh:
				systray.Quit()
			}
		}
	}()
}
