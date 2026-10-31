package handler

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

func (h *Handler) Dashboard(c *gin.Context) {
	year := c.Query("year")
	if year == "" {
		year = fmt.Sprintf("%d", time.Now().Year())
	}

	// 年度汇总
	var totalRent, totalElectricFee, totalWaterFee, totalElectricUsage, totalWaterUsage float64
	if err := h.db.QueryRow(`
		SELECT
			COALESCE(SUM(amount), 0),
			COALESCE(SUM(MAX(r.electric_end - r.electric_start, 0) * r.electric_price), 0),
			COALESCE(SUM(MAX(r.water_end - r.water_start, 0) * r.water_price), 0),
			COALESCE(SUM(MAX(r.electric_end - r.electric_start, 0)), 0),
			COALESCE(SUM(MAX(r.water_end - r.water_start, 0)), 0)
		FROM rent_records r
		WHERE strftime('%Y', r.paid_at) = ?
		  AND r.is_collected = 1
		  AND COALESCE(NULLIF(r.room_no, ''), '') <> ''
	`, year).Scan(&totalRent, &totalElectricFee, &totalWaterFee, &totalElectricUsage, &totalWaterUsage); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 按月明细
	rows, err := h.db.Query(`
		SELECT
			strftime('%m', r.paid_at) as month,
			COALESCE(SUM(r.amount), 0),
			COALESCE(SUM(MAX(r.electric_end - r.electric_start, 0) * r.electric_price), 0),
			COALESCE(SUM(MAX(r.water_end - r.water_start, 0) * r.water_price), 0),
			COALESCE(SUM(MAX(r.electric_end - r.electric_start, 0)), 0),
			COALESCE(SUM(MAX(r.water_end - r.water_start, 0)), 0)
		FROM rent_records r
		WHERE strftime('%Y', r.paid_at) = ?
		  AND r.is_collected = 1
		  AND COALESCE(NULLIF(r.room_no, ''), '') <> ''
		GROUP BY month
		ORDER BY month ASC
	`, year)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	// 初始化 12 个月的空数据
	monthly := make([]gin.H, 12)
	for i := 0; i < 12; i++ {
		monthly[i] = gin.H{
			"month":          fmt.Sprintf("%02d", i+1),
			"rent":           0,
			"electric_fee":   0,
			"water_fee":      0,
			"electric_usage": 0,
			"water_usage":    0,
		}
	}

	for rows.Next() {
		var month string
		var rent, electricFee, waterFee, electricUsage, waterUsage float64
		if err := rows.Scan(&month, &rent, &electricFee, &waterFee, &electricUsage, &waterUsage); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		idx := 0
		fmt.Sscanf(month, "%d", &idx)
		if idx >= 1 && idx <= 12 {
			monthly[idx-1] = gin.H{
				"month":          month,
				"rent":           rent,
				"electric_fee":   electricFee,
				"water_fee":      waterFee,
				"electric_usage": electricUsage,
				"water_usage":    waterUsage,
			}
		}
	}
	if err := rows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"year": year,
		"total": gin.H{
			"rent":           totalRent,
			"electric_fee":   totalElectricFee,
			"water_fee":      totalWaterFee,
			"electric_usage": totalElectricUsage,
			"water_usage":    totalWaterUsage,
		},
		"monthly": monthly,
	})
}
