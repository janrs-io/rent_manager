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
	h.db.QueryRow(`
		SELECT
			COALESCE(SUM(amount), 0),
			COALESCE(SUM((electric_end - electric_start) * electric_price), 0),
			COALESCE(SUM((water_end - water_start) * water_price), 0),
			COALESCE(SUM(electric_end - electric_start), 0),
			COALESCE(SUM(water_end - water_start), 0)
		FROM rent_records
		WHERE strftime('%Y', paid_at) = ?
	`, year).Scan(&totalRent, &totalElectricFee, &totalWaterFee, &totalElectricUsage, &totalWaterUsage)

	// 按月明细
	rows, err := h.db.Query(`
		SELECT
			strftime('%m', paid_at) as month,
			COALESCE(SUM(amount), 0),
			COALESCE(SUM((electric_end - electric_start) * electric_price), 0),
			COALESCE(SUM((water_end - water_start) * water_price), 0),
			COALESCE(SUM(electric_end - electric_start), 0),
			COALESCE(SUM(water_end - water_start), 0)
		FROM rent_records
		WHERE strftime('%Y', paid_at) = ?
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
			continue
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
