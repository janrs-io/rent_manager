package handler

import (
	"math"
	"time"
)

func isValidDate(value string) bool {
	if value == "" {
		return false
	}
	_, err := time.ParseInLocation("2006-01-02", value, time.Local)
	return err == nil
}

func isValidOptionalDate(value string) bool {
	return value == "" || isValidDate(value)
}

func allFiniteNonNegative(values ...float64) bool {
	for _, value := range values {
		if value < 0 || math.IsNaN(value) || math.IsInf(value, 0) {
			return false
		}
	}
	return true
}
