variable "pg_host" {
  type        = string
  description = "ローカル PostgreSQL のホスト"
  default     = "127.0.0.1"
}

variable "pg_port" {
  type        = number
  description = "ローカル PostgreSQL のポート"
  default     = 5432
}

variable "pg_admin_database" {
  type        = string
  description = "管理者接続時に使う既存データベース（通常は postgres）"
  default     = "postgres"
}

variable "pg_superuser" {
  type        = string
  description = "DB / ロール作成に使う管理者ユーザー"
  default     = "postgres"
}

variable "pg_superuser_password" {
  type        = string
  description = "管理者ユーザーのパスワード"
  sensitive   = true
}

variable "pg_sslmode" {
  type        = string
  description = "SSL モード（ローカルは disable が一般的）"
  default     = "disable"
}

variable "pg_provider_superuser" {
  type        = bool
  description = "プロバイダがスーパーユーザー権限で接続するか"
  default     = true
}

variable "app_db_name" {
  type        = string
  description = "アプリ用データベース名"
  default     = "newsdesk"
}

variable "app_test_db_name" {
  type        = string
  description = "自動テスト用データベース名（アプリ用とは別）"
  default     = "newsdesk_test"
}

variable "app_user" {
  type        = string
  description = "アプリ用ロール名"
  default     = "newsdesk"
}

variable "app_password" {
  type        = string
  description = "アプリ用ロールのパスワード"
  sensitive   = true
}
