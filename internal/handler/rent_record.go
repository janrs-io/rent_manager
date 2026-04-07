package handler

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) ListRentRecords(c *gin.Context) {
	year  := c.Query("year")
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
		SELECT r.id, r.tenant_id, t.name, t.room_no,
		       r.amount, r.paid_at,
		       r.electric_start, r.electric_end, r.electric_price,
		       r.water_start, r.water_end, r.water_price,
		       r.broadband_fee, r.ev_charge_fee,
		       r.is_collected, r.renew_date, r.note, r.created_at
		FROM rent_records r
		JOIN tenants t ON t.id = r.tenant_id
		`+where+`
		ORDER BY t.room_no ASC, r.paid_at DESC
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
			continue
		}

		electricFee := (electricEnd - electricStart) * electricPrice
		waterFee := (waterEnd - waterStart) * waterPrice
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
			"electric_usage": electricEnd - electricStart,
			"electric_fee":   electricFee,
			"water_start":    waterStart,
			"water_end":      waterEnd,
			"water_price":    waterPrice,
			"water_usage":    waterEnd - waterStart,
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
	c.JSON(http.StatusOK, list)
}

func (h *Handler) CreateRentRecord(c *gin.Context) {
	var req struct {
		TenantID      int64   `json:"tenant_id" binding:"required"`
		Amount        float64 `json:"amount" binding:"required"`
		PaidAt        string  `json:"paid_at" binding:"required"`
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
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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
		(tenant_id, amount, paid_at, electric_start, electric_end, electric_price,
		 water_start, water_end, water_price, broadband_fee, ev_charge_fee,
		 is_collected, renew_date, note)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		req.TenantID, req.Amount, req.PaidAt,
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
	var req struct {
		Amount        float64 `json:"amount" binding:"required"`
		PaidAt        string  `json:"paid_at" binding:"required"`
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
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
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

	_, err := h.db.Exec(`
		UPDATE rent_records SET
		amount=?, paid_at=?, electric_start=?, electric_end=?, electric_price=?,
		water_start=?, water_end=?, water_price=?, broadband_fee=?, ev_charge_fee=?,
		is_collected=?, renew_date=?, note=?
		WHERE id=?`,
		req.Amount, req.PaidAt,
		req.ElectricStart, req.ElectricEnd, req.ElectricPrice,
		req.WaterStart, req.WaterEnd, req.WaterPrice,
		req.BroadbandFee, req.EvChargeFee,
		isCollected, renewDate, req.Note, id,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) ToggleCollected(c *gin.Context) {
	id := c.Param("id")
	_, err := h.db.Exec(`
		UPDATE rent_records SET is_collected = CASE WHEN is_collected=1 THEN 0 ELSE 1 END
		WHERE id=?`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Handler) DeleteRentRecord(c *gin.Context) {
	id := c.Param("id")
	_, err := h.db.Exec(`DELETE FROM rent_records WHERE id=?`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
