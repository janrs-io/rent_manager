package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// 从身份证号码计算年龄
func calcAge(idCard string) int {
	if len(idCard) != 18 {
		return 0
	}
	birthStr := idCard[6:14] // YYYYMMDD
	birth, err := time.Parse("20060102", birthStr)
	if err != nil {
		return 0
	}
	now := time.Now()
	age := now.Year() - birth.Year()
	if now.Month() < birth.Month() ||
		(now.Month() == birth.Month() && now.Day() < birth.Day()) {
		age--
	}
	return age
}

func (h *Handler) ListTenants(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT t.id, t.name, t.gender, t.phone, t.id_card, t.address, t.room_no,
		       t.rent_amount, t.deposit, t.move_in_date, t.status, t.created_at,
		       (SELECT MAX(r.paid_at) FROM rent_records r
		        JOIN tenants t2 ON t2.id = r.tenant_id
		        WHERE t2.room_no = t.room_no) AS last_paid_at,
		       (SELECT r.is_collected FROM rent_records r
		        JOIN tenants t2 ON t2.id = r.tenant_id
		        WHERE t2.room_no = t.room_no
		        ORDER BY r.paid_at DESC LIMIT 1) AS last_is_collected,
		       (SELECT r.renew_date FROM rent_records r
		        JOIN tenants t2 ON t2.id = r.tenant_id
		        WHERE t2.room_no = t.room_no
		        ORDER BY r.paid_at DESC LIMIT 1) AS last_renew_date
		FROM tenants t ORDER BY t.room_no ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var list []gin.H
	for rows.Next() {
		var id int
		var name, gender, roomNo, status, moveInDate, createdAt string
		var rentAmount, deposit float64
		var phone, idCard, address, lastPaidAt, lastRenewDate *string
		var lastIsCollected *int

		if err := rows.Scan(&id, &name, &gender, &phone, &idCard, &address,
			&roomNo, &rentAmount, &deposit, &moveInDate, &status, &createdAt, &lastPaidAt, &lastIsCollected, &lastRenewDate); err != nil {
			continue
		}

		age := 0
		if idCard != nil {
			age = calcAge(*idCard)
		}

		list = append(list, gin.H{
			"id":            id,
			"name":          name,
			"gender":        gender,
			"phone":         phone,
			"id_card":       idCard,
			"address":       address,
			"room_no":       roomNo,
			"rent_amount":   rentAmount,
			"deposit":       deposit,
			"move_in_date":  moveInDate,
			"status":        status,
			"created_at":    createdAt,
			"age":           age,
			"last_paid_at":      lastPaidAt,
			"last_is_collected": lastIsCollected,
			"last_renew_date":   lastRenewDate,
		})
	}
	if list == nil {
		list = []gin.H{}
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) CreateTenant(c *gin.Context) {
	var req struct {
		Name        string  `json:"name" binding:"required"`
		Gender      string  `json:"gender" binding:"required"`
		Phone       string  `json:"phone"`
		IDCard      string  `json:"id_card"`
		Address     string  `json:"address"`
		RoomNo      string  `json:"room_no" binding:"required"`
		RentAmount  float64 `json:"rent_amount" binding:"required"`
		Deposit     float64 `json:"deposit"`
		MoveInDate  string  `json:"move_in_date" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	res, err := h.db.Exec(`
		INSERT INTO tenants (name, gender, phone, id_card, address, room_no, rent_amount, deposit, move_in_date)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		req.Name, req.Gender, req.Phone, req.IDCard, req.Address,
		req.RoomNo, req.RentAmount, req.Deposit, req.MoveInDate,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	id, _ := res.LastInsertId()
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *Handler) UpdateTenant(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name       string  `json:"name" binding:"required"`
		Gender     string  `json:"gender" binding:"required"`
		Phone      string  `json:"phone"`
		IDCard     string  `json:"id_card"`
		Address    string  `json:"address"`
		RoomNo     string  `json:"room_no" binding:"required"`
		RentAmount float64 `json:"rent_amount" binding:"required"`
		Deposit    float64 `json:"deposit"`
		MoveInDate string  `json:"move_in_date" binding:"required"`
		Status     string  `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := h.db.Exec(`
		UPDATE tenants SET name=?, gender=?, phone=?, id_card=?, address=?,
		room_no=?, rent_amount=?, deposit=?, move_in_date=?, status=?
		WHERE id=?`,
		req.Name, req.Gender, req.Phone, req.IDCard, req.Address,
		req.RoomNo, req.RentAmount, req.Deposit, req.MoveInDate, req.Status, id,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) DeleteTenant(c *gin.Context) {
	id := c.Param("id")
	_, err := h.db.Exec(`DELETE FROM tenants WHERE id=?`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
