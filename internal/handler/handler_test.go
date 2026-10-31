package handler

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	dbpkg "rent_manager/internal/db"
)

func newTestHandler(t *testing.T) (*Handler, *sql.DB) {
	t.Helper()

	gin.SetMode(gin.TestMode)

	database, err := dbpkg.Init(filepath.Join(t.TempDir(), "rent_manager.db"))
	if err != nil {
		t.Fatalf("init db: %v", err)
	}
	t.Cleanup(func() {
		database.Close()
	})

	return New(database, []byte("test-secret")), database
}

func performJSONRequest(method, routePath, requestPath string, body string, handler gin.HandlerFunc) *httptest.ResponseRecorder {
	r := gin.New()
	r.Handle(method, routePath, handler)

	req := httptest.NewRequest(method, requestPath, bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func createTenant(t *testing.T, database *sql.DB, name, roomNo string, rent float64) int64 {
	t.Helper()

	res, err := database.Exec(`
		INSERT INTO tenants (name, gender, room_no, rent_amount, deposit, move_in_date, status)
		VALUES (?, 'unknown', ?, ?, 0, '2026-01-01', 'active')`,
		name, roomNo, rent,
	)
	if err != nil {
		t.Fatalf("insert tenant: %v", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		t.Fatalf("tenant id: %v", err)
	}
	return id
}

func createRentRecord(t *testing.T, database *sql.DB, tenantID int64, amount float64) int64 {
	t.Helper()

	var roomNo string
	if err := database.QueryRow(`SELECT room_no FROM tenants WHERE id = ?`, tenantID).Scan(&roomNo); err != nil {
		t.Fatalf("query tenant room: %v", err)
	}

	res, err := database.Exec(`
		INSERT INTO rent_records (tenant_id, room_no, amount, paid_at, electric_start, electric_end, electric_price, water_start, water_end, water_price, is_collected)
		VALUES (?, ?, ?, '2026-02-10', 10, 20, 1, 1, 3, 2, 1)`,
		tenantID, roomNo, amount,
	)
	if err != nil {
		t.Fatalf("insert rent record: %v", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		t.Fatalf("rent record id: %v", err)
	}
	return id
}

func TestDeleteTenantRejectsTenantWithRentRecords(t *testing.T) {
	h, database := newTestHandler(t)
	tenantID := createTenant(t, database, "张三", "101", 1200)
	createRentRecord(t, database, tenantID, 1200)

	w := performJSONRequest(http.MethodDelete, "/tenants/:id", fmt.Sprintf("/tenants/%d", tenantID), "", h.DeleteTenant)

	if w.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d: %s", w.Code, w.Body.String())
	}

	var count int
	if err := database.QueryRow(`SELECT COUNT(*) FROM tenants WHERE id = ?`, tenantID).Scan(&count); err != nil {
		t.Fatalf("count tenant: %v", err)
	}
	if count != 1 {
		t.Fatalf("tenant should not be deleted")
	}
}

func TestUpdateRentRecordUpdatesTenantID(t *testing.T) {
	h, database := newTestHandler(t)
	firstTenantID := createTenant(t, database, "张三", "101", 1200)
	secondTenantID := createTenant(t, database, "李四", "102", 1500)
	recordID := createRentRecord(t, database, firstTenantID, 1200)

	body := `{
		"tenant_id": ` + fmt.Sprintf("%d", secondTenantID) + `,
		"room_no": "102",
		"amount": 1500,
		"paid_at": "2026-03-10",
		"electric_start": 20,
		"electric_end": 30,
		"electric_price": 1,
		"water_start": 3,
		"water_end": 5,
		"water_price": 2,
		"broadband_fee": 0,
		"ev_charge_fee": 0,
		"is_collected": true,
		"renew_date": "2026-03-31",
		"note": ""
	}`
	w := performJSONRequest(http.MethodPut, "/records/:id", fmt.Sprintf("/records/%d", recordID), body, h.UpdateRentRecord)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var tenantID int64
	var roomNo string
	if err := database.QueryRow(`SELECT tenant_id, room_no FROM rent_records WHERE id = ?`, recordID).Scan(&tenantID, &roomNo); err != nil {
		t.Fatalf("query rent record: %v", err)
	}
	if tenantID != secondTenantID {
		t.Fatalf("tenant_id = %d, want %d", tenantID, secondTenantID)
	}
	if roomNo != "102" {
		t.Fatalf("room_no = %q, want 102", roomNo)
	}
}

func TestDashboardCountsOnlyCollectedRecordsAndClampsNegativeUsage(t *testing.T) {
	h, database := newTestHandler(t)
	tenantID := createTenant(t, database, "张三", "101", 1200)

	if _, err := database.Exec(`
		INSERT INTO rent_records (tenant_id, room_no, amount, paid_at, electric_start, electric_end, electric_price, water_start, water_end, water_price, is_collected)
		VALUES (?, '101', 1200, '2026-02-10', 50, 40, 1, 1, 3, 2, 1)`,
		tenantID,
	); err != nil {
		t.Fatalf("insert valid rent record: %v", err)
	}

	if _, err := database.Exec(`
		INSERT INTO rent_records (tenant_id, room_no, amount, paid_at, electric_start, electric_end, electric_price, water_start, water_end, water_price, is_collected)
		VALUES (?, '101', 5000, '2026-02-10', 1, 10, 1, 1, 10, 1, 0)`,
		tenantID,
	); err != nil {
		t.Fatalf("insert uncollected rent record: %v", err)
	}

	w := performJSONRequest(http.MethodGet, "/dashboard", "/dashboard?year=2026", "", h.Dashboard)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var response struct {
		Total struct {
			Rent          float64 `json:"rent"`
			ElectricFee   float64 `json:"electric_fee"`
			ElectricUsage float64 `json:"electric_usage"`
			WaterFee      float64 `json:"water_fee"`
			WaterUsage    float64 `json:"water_usage"`
		} `json:"total"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode dashboard response: %v", err)
	}

	if response.Total.Rent != 1200 {
		t.Fatalf("rent = %.2f, want 1200", response.Total.Rent)
	}
	if response.Total.ElectricFee != 0 || response.Total.ElectricUsage != 0 {
		t.Fatalf("electric fee/usage = %.2f/%.2f, want 0/0", response.Total.ElectricFee, response.Total.ElectricUsage)
	}
	if response.Total.WaterFee != 4 || response.Total.WaterUsage != 2 {
		t.Fatalf("water fee/usage = %.2f/%.2f, want 4/2", response.Total.WaterFee, response.Total.WaterUsage)
	}
}
