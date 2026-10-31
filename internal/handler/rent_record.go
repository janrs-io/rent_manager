package handler

import (
	"fmt"
	"math"
	"net/http"

	"github.com/gin-gonic/gin"
)

type rentRecordRequest struct {
	TenantID      int64   `json:"tenant_id"`
	RoomNo        string  `json:"room_no"`
	Amount        float64 `json:"amount"`
	PaidAt        string  `json:"paid_at"`
	ElectricStart float64 `json:"electric_start"`
	ElectricEnd   float64 `json:"electric_end"`
	ElectricPrice float64 `json:"electric_price"`
	WaterStart    float64 `json:"water_start"`
	WaterEnd      float64 `json:"water_end"`
	WaterPrice    float64 `json:"water_price"`
	BroadbandFee  float64 `json:"broadband_fee"`
	EvChargeFee   float64 `json:"ev_charge_fee"`
	IsCollected   bool    `json:"is_collected"`
	RenewDate     string  `json:"renew_date"`
	Note          string  `json:"note"`
}

func validateRentRecordRequest(req rentRecordRequest) string {
	if req.TenantID <= 0 {
		return "请选择房间"
	}
	if req.RoomNo == "" {
		return "房间号不能为空"
	}
	if req.Amount <= 0 {
		return "租金金额必须大于0"
	}
	if !isValidDate(req.PaidAt) {
		return "收租日期格式错误"
	}
	if !isValidOptionalDate(req.RenewDate) {
		return "续租日期格式错误"
	}
	if !allFiniteNonNegative(
		req.ElectricStart, req.ElectricEnd, req.ElectricPrice,
		req.WaterStart, req.WaterEnd, req.WaterPrice,
		req.BroadbandFee, req.EvChargeFee,
	) {
		return "费用和读数不能为负数"
	}
	if req.ElectricEnd < req.ElectricStart {
		return "电表结束读数不能小于起始读数"
	}
	if req.WaterEnd < req.WaterStart {
		return "水表结束读数不能小于起始读数"
	}
	return ""
}

func (h *Handler) validateRentRecordRoom(req rentRecordRequest, requireActive bool) (string, string, bool) {
	var tenantRoomNo, status string
	err := h.db.QueryRow(`SELECT room_no, status FROM tenants WHERE id = ?`, req.TenantID).Scan(&tenantRoomNo, &status)
	if err != nil {
		return "", "租客不存在", false
	}
	if requireActive && status != "active" {
		return "", "只能给在租房间新增收租记录", false
	}
	if req.RoomNo != tenantRoomNo {
		return "", "房间和租客不匹配", false
	}
	return tenantRoomNo, "", true
}

func (h *Handler) ListRentRecords(c *gin.Context) {
	year := c.Query("year")
	month := c.Query("month")

	where := ""
	var args []interface{}

	if year != "" && month != "" {
		where = "WHERE strftime('%Y', r.paid_at) = ? AND strftime('%m', r.paid_at) = ?"
		args = append(args, year, fmt.Sprintf("%02s", month))
	} else if year != "" {
		where = "WHERE strftime('%Y', r.paid_at) = ?"
		args = append(args, year)
	}

	rows, err := h.db.Query(`
		WITH records AS (
			SELECT r.*,
			       COALESCE(NULLIF(r.room_no, ''), t.room_no) AS effective_room_no,
			       t.name AS fallback_tenant_name
			FROM rent_records r
			LEFT JOIN tenants t ON t.id = r.tenant_id
		)
		SELECT r.id, r.tenant_id,
		       COALESCE(
		         (SELECT GROUP_CONCAT(t.name, '、') FROM tenants t
		          WHERE t.room_no = r.effective_room_no AND t.status = 'active'),
		         (SELECT GROUP_CONCAT(t.name, '、') FROM tenants t
		          WHERE t.room_no = r.effective_room_no),
		         r.fallback_tenant_name,
		         ''
		       ) AS tenant_names,
		       COALESCE(r.effective_room_no, '') AS room_no,
		       r.amount, r.paid_at,
		       r.electric_start, r.electric_end, r.electric_price,
		       r.water_start, r.water_end, r.water_price,
		       r.broadband_fee, r.ev_charge_fee,
		       r.is_collected, r.renew_date, r.note, r.created_at
		FROM records r
		`+where+`
		ORDER BY r.effective_room_no ASC, r.paid_at DESC
	`, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var list []gin.H
	for rows.Next() {
		var id, tenantID int
		var tenantName, roomNo, paidAt, createdAt string
		var amount, electricStart, electricEnd, electricPrice float64
		var waterStart, waterEnd, waterPrice float64
		var broadbandFee, evChargeFee float64
		var isCollected int
		var renewDate, note *string

		err := rows.Scan(&id, &tenantID, &tenantName, &roomNo,
			&amount, &paidAt,
			&electricStart, &electricEnd, &electricPrice,
			&waterStart, &waterEnd, &waterPrice,
			&broadbandFee, &evChargeFee,
			&isCollected, &renewDate, &note, &createdAt,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		electricUsage := math.Max(0, electricEnd-electricStart)
		waterUsage := math.Max(0, waterEnd-waterStart)
		electricFee := electricUsage * electricPrice
		waterFee := waterUsage * waterPrice
		total := amount + electricFee + waterFee + broadbandFee + evChargeFee

		list = append(list, gin.H{
			"id":             id,
			"tenant_id":      tenantID,
			"tenant_name":    tenantName,
			"room_no":        roomNo,
			"amount":         amount,
			"paid_at":        paidAt,
			"electric_start": electricStart,
			"electric_end":   electricEnd,
			"electric_price": electricPrice,
			"electric_usage": electricUsage,
			"electric_fee":   electricFee,
			"water_start":    waterStart,
			"water_end":      waterEnd,
			"water_price":    waterPrice,
			"water_usage":    waterUsage,
			"water_fee":      waterFee,
			"broadband_fee":  broadbandFee,
			"ev_charge_fee":  evChargeFee,
			"total":          total,
			"is_collected":   isCollected == 1,
			"renew_date":     renewDate,
			"note":           note,
			"created_at":     createdAt,
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

func (h *Handler) CreateRentRecord(c *gin.Context) {
	var req rentRecordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if msg := validateRentRecordRequest(req); msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	roomNo, msg, ok := h.validateRentRecordRoom(req, true)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	var renewDate *string
	if req.RenewDate != "" {
		renewDate = &req.RenewDate
	}
	isCollected := 0
	if req.IsCollected {
		isCollected = 1
	}

	res, err := h.db.Exec(`
		INSERT INTO rent_records
		(tenant_id, room_no, amount, paid_at, electric_start, electric_end, electric_price,
		 water_start, water_end, water_price, broadband_fee, ev_charge_fee,
		 is_collected, renew_date, note)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		req.TenantID, roomNo, req.Amount, req.PaidAt,
		req.ElectricStart, req.ElectricEnd, req.ElectricPrice,
		req.WaterStart, req.WaterEnd, req.WaterPrice,
		req.BroadbandFee, req.EvChargeFee,
		isCollected, renewDate, req.Note,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	id, _ := res.LastInsertId()
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *Handler) UpdateRentRecord(c *gin.Context) {
	id := c.Param("id")
	var req rentRecordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if msg := validateRentRecordRequest(req); msg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}
	roomNo, msg, ok := h.validateRentRecordRoom(req, false)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": msg})
		return
	}

	var renewDate *string
	if req.RenewDate != "" {
		renewDate = &req.RenewDate
	}
	isCollected := 0
	if req.IsCollected {
		isCollected = 1
	}

	res, err := h.db.Exec(`
		UPDATE rent_records SET
		tenant_id=?, room_no=?, amount=?, paid_at=?, electric_start=?, electric_end=?, electric_price=?,
		water_start=?, water_end=?, water_price=?, broadband_fee=?, ev_charge_fee=?,
		is_collected=?, renew_date=?, note=?
		WHERE id=?`,
		req.TenantID, roomNo, req.Amount, req.PaidAt,
		req.ElectricStart, req.ElectricEnd, req.ElectricPrice,
		req.WaterStart, req.WaterEnd, req.WaterPrice,
		req.BroadbandFee, req.EvChargeFee,
		isCollected, renewDate, req.Note, id,
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
		c.JSON(http.StatusNotFound, gin.H{"error": "收租记录不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) ToggleCollected(c *gin.Context) {
	id := c.Param("id")
	res, err := h.db.Exec(`
		UPDATE rent_records SET is_collected = CASE WHEN is_collected=1 THEN 0 ELSE 1 END
		WHERE id=?`, id)
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
		c.JSON(http.StatusNotFound, gin.H{"error": "收租记录不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) DeleteRentRecord(c *gin.Context) {
	id := c.Param("id")
	res, err := h.db.Exec(`DELETE FROM rent_records WHERE id=?`, id)
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
		c.JSON(http.StatusNotFound, gin.H{"error": "收租记录不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
