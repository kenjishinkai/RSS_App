output "app_db_name" {
  description = "作成したアプリ用データベース名"
  value       = postgresql_database.app.name
}

output "app_test_db_name" {
  description = "自動テスト用データベース名"
  value       = postgresql_database.test.name
}

output "app_user" {
  description = "作成したアプリ用ロール名"
  value       = postgresql_role.app.name
}

output "database_url_template" {
  description = "Alembic 用 DATABASE_URL のひな形（*** をパスワードに置換）"
  value       = "postgresql+psycopg://${var.app_user}:***@${var.pg_host}:${var.pg_port}/${var.app_db_name}"
}
