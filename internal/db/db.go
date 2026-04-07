package db

import (
	"database/sql"
	"fmt"
	"log"

	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

func Init(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败: %w", err)
	}
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("数据库连接失败: %w", err)
	}
	db.Exec("PRAGMA journal_mode=WAL")
	db.Exec("PRAGMA timezone='UTC+8'")

	if err := migrate(db); err != nil {
		return nil, fmt.Errorf("数据库迁移失败: %w", err)
	}

	seedAdmin(db)
	return db, nil
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS admins (
			id          INTEGER  PRIMARY KEY AUTOINCREMENT,
			username    TEXT     NOT NULL UNIQUE,
			password    TEXT     NOT NULL,
			created_at  DATETIME DEFAULT (datetime('now','localtime')),
			updated_at  DATETIME DEFAULT (datetime('now','localtime'))
		);

		CREATE TABLE IF NOT EXISTS tenants (
			id            INTEGER  PRIMARY KEY AUTOINCREMENT,
			name          TEXT     NOT NULL,
			gender        TEXT     NOT NULL DEFAULT 'unknown',
			phone         TEXT,
			id_card       TEXT,
			address       TEXT,
			room_no       TEXT     NOT NULL,
			rent_amount   REAL     NOT NULL,
			deposit       REAL     NOT NULL DEFAULT 0,
			move_in_date  DATE     NOT NULL,
			status        TEXT     NOT NULL DEFAULT 'active',
			created_at    DATETIME DEFAULT (datetime('now','localtime'))
		);

		CREATE TABLE IF NOT EXISTS rent_records (
			id                      INTEGER  PRIMARY KEY AUTOINCREMENT,
			tenant_id               INTEGER  NOT NULL REFERENCES tenants(id),
			amount                  REAL     NOT NULL,
			paid_at                 DATE     NOT NULL,
			electric_start          REAL     NOT NULL DEFAULT 0,
			electric_end            REAL     NOT NULL DEFAULT 0,
			electric_price          REAL     NOT NULL DEFAULT 0,
			water_start             REAL     NOT NULL DEFAULT 0,
			water_end               REAL     NOT NULL DEFAULT 0,
			water_price             REAL     NOT NULL DEFAULT 0,
			broadband_fee           REAL     NOT NULL DEFAULT 0,
			ev_charge_fee           REAL     NOT NULL DEFAULT 0,
			is_collected            INTEGER  NOT NULL DEFAULT 0,
			renew_date              DATE,
			note                    TEXT,
			created_at              DATETIME DEFAULT (datetime('now','localtime'))
		);
	`)
	return err
}

func seedAdmin(db *sql.DB) {
	var count int
	db.QueryRow(`SELECT COUNT(*) FROM admins`).Scan(&count)
	if count > 0 {
		return
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte("123456"), bcrypt.DefaultCost)
	if err != nil {
		log.Println("默认管理员创建失败:", err)
		return
	}

	db.Exec(`INSERT INTO admins (username, password) VALUES (?, ?)`, "john", string(hashed))
	log.Println("已创建默认管理员账号 john / 123456，请登录后及时修改密码")
}
