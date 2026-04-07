package model

type Admin struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	Password  string `json:"-"` // 不输出到 JSON
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}
