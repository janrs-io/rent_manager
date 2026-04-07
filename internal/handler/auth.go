package handler

import (
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type Handler struct {
	db        *sql.DB
	jwtSecret []byte
}

func New(db *sql.DB, jwtSecret []byte) *Handler {
	return &Handler{db: db, jwtSecret: jwtSecret}
}

// Login POST /api/auth/login
func (h *Handler) Login(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "用户名和密码不能为空"})
		return
	}

	var id int64
	var hashedPassword string
	err := h.db.QueryRow(
		`SELECT id, password FROM admins WHERE username = ?`, req.Username,
	).Scan(&id, &hashedPassword)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "服务器错误"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "用户名或密码错误"})
		return
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"admin_id": id,
		"username": req.Username,
		"exp":      time.Now().Add(7 * 24 * time.Hour).Unix(), // 一周
	})
	tokenStr, err := token.SignedString(h.jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成 Token 失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":    tokenStr,
		"username": req.Username,
	})
}

// ChangePassword POST /api/auth/change-password
func (h *Handler) ChangePassword(c *gin.Context) {
	adminID := c.GetInt64("admin_id")
	var req struct {
		OldPassword string `json:"old_password" binding:"required"`
		NewPassword string `json:"new_password" binding:"required,min=6"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误，新密码不能少于6位"})
		return
	}

	var hashedPassword string
	err := h.db.QueryRow(`SELECT password FROM admins WHERE id = ?`, adminID).Scan(&hashedPassword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "服务器错误"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(req.OldPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "原密码错误"})
		return
	}

	newHashed, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "密码加密失败"})
		return
	}

	h.db.Exec(`UPDATE admins SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, newHashed, adminID)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
