package router

import (
	"database/sql"

	"github.com/gin-gonic/gin"
	"rent_manager/internal/handler"
	"rent_manager/internal/middleware"
)

func Register(r *gin.Engine, db *sql.DB, jwtSecret []byte) {
	h := handler.New(db, jwtSecret)

	// 公开路由
	r.POST("/api/auth/login", h.Login)

	// 需要登录的路由
	api := r.Group("/api", middleware.JWTAuth(jwtSecret))
	{
		api.POST("/auth/change-password", h.ChangePassword)

		// 总览
		api.GET("/dashboard", h.Dashboard)

		// 租客
		api.GET("/tenants", h.ListTenants)
		api.POST("/tenants", h.CreateTenant)
		api.PUT("/tenants/:id", h.UpdateTenant)
		api.DELETE("/tenants/:id", h.DeleteTenant)

		// 收租记录
		api.GET("/rent-records", h.ListRentRecords)
		api.POST("/rent-records", h.CreateRentRecord)
		api.PUT("/rent-records/:id", h.UpdateRentRecord)
		api.PUT("/rent-records/:id/collect", h.ToggleCollected)
		api.DELETE("/rent-records/:id", h.DeleteRentRecord)
	}
}
