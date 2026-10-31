package handler

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func isValidGender(gender string) bool {
	return gender == "male" || gender == "female" || gender == "unknown"
}

func isValidTenantStatus(status string) bool {
	return status == "active" || status == "inactive"
}

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
		        WHERE r.room_no = t.room_no) AS last_paid_at,
		       (SELECT r.is_collected FROM rent_records r
		        WHERE r.room_no = t.room_no
		        ORDER BY r.paid_at DESC, r.id DESC LIMIT 1) AS last_is_collected,
		       (SELECT r.renew_date FROM rent_records r
		        WHERE r.room_no = t.room_no
		        ORDER BY r.paid_at DESC, r.id DESC LIMIT 1) AS last_renew_date
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
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		age := 0
		if idCard != nil {
			age = calcAge(*idCard)
		}

		list = append(list, gin.H{
			"id":                id,
			"name":              name,
			"gender":            gender,
			"phone":             phone,
			"id_card":           idCard,
			"address":           address,
			"room_no":           roomNo,
			"rent_amount":       rentAmount,
			"deposit":           deposit,
			"move_in_date":      moveInDate,
			"status":            status,
			"created_at":        createdAt,
			"age":               age,
			"last_paid_at":      lastPaidAt,
			"last_is_collected": lastIsCollected,
			"last_renew_date":   lastRenewDate,
		})
	}
	if list == nil {
		list = []gin.H{}
	}
	if err := rows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, list)
}

func (h *Handler) CreateTenant(c *gin.Context) {
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
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !isValidGender(req.Gender) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "性别参数错误"})
		return
	}
	if req.RentAmount <= 0 || req.Deposit < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "租金必须大于0，押金不能为负数"})
		return
	}
	if !isValidDate(req.MoveInDate) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "入住日期格式错误"})
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
	if !isValidGender(req.Gender) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "性别参数错误"})
		return
	}
	if !isValidTenantStatus(req.Status) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "租客状态参数错误"})
		return
	}
	if req.RentAmount <= 0 || req.Deposit < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "租金必须大于0，押金不能为负数"})
		return
	}
	if !isValidDate(req.MoveInDate) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "入住日期格式错误"})
		return
	}

	res, err := h.db.Exec(`
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
	affected, err := res.RowsAffected()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "租客不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) DeleteTenant(c *gin.Context) {
	id := c.Param("id")

	var recordCount int
	if err := h.db.QueryRow(`
		SELECT COUNT(*)
		FROM rent_records r
		WHERE r.tenant_id = ?
		   OR r.room_no = (SELECT t.room_no FROM tenants t WHERE t.id = ?)
	`, id, id).Scan(&recordCount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if recordCount > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "该房间已有收租记录，请先删除相关收租记录或将租客改为已退租"})
		return
	}

	res, err := h.db.Exec(`DELETE FROM tenants WHERE id=?`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	affected, err := res.RowsAffected()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if affected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "租客不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
