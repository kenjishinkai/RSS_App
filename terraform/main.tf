resource "postgresql_role" "app" {
  name     = var.app_user
  login    = true
  password = var.app_password
}

resource "postgresql_database" "app" {
  name              = var.app_db_name
  owner             = postgresql_role.app.name
  connection_limit  = -1
  allow_connections = true
}

resource "postgresql_grant" "app_schema" {
  database    = postgresql_database.app.name
  role        = postgresql_role.app.name
  schema      = "public"
  object_type = "schema"
  privileges  = ["USAGE", "CREATE"]
}

resource "postgresql_grant" "app_tables" {
  database    = postgresql_database.app.name
  role        = postgresql_role.app.name
  schema      = "public"
  object_type = "table"
  privileges  = ["SELECT", "INSERT", "UPDATE", "DELETE", "REFERENCES", "TRIGGER"]

  depends_on = [postgresql_grant.app_schema]
}

resource "postgresql_grant" "app_sequences" {
  database    = postgresql_database.app.name
  role        = postgresql_role.app.name
  schema      = "public"
  object_type = "sequence"
  privileges  = ["USAGE", "SELECT", "UPDATE"]

  depends_on = [postgresql_grant.app_schema]
}

# 自動テスト専用 DB（本番用 newsdesk とは分離）
resource "postgresql_database" "test" {
  name              = var.app_test_db_name
  owner             = postgresql_role.app.name
  connection_limit  = -1
  allow_connections = true
}

resource "postgresql_grant" "test_schema" {
  database    = postgresql_database.test.name
  role        = postgresql_role.app.name
  schema      = "public"
  object_type = "schema"
  privileges  = ["USAGE", "CREATE"]
}

resource "postgresql_grant" "test_tables" {
  database    = postgresql_database.test.name
  role        = postgresql_role.app.name
  schema      = "public"
  object_type = "table"
  privileges  = ["SELECT", "INSERT", "UPDATE", "DELETE", "REFERENCES", "TRIGGER"]

  depends_on = [postgresql_grant.test_schema]
}

resource "postgresql_grant" "test_sequences" {
  database    = postgresql_database.test.name
  role        = postgresql_role.app.name
  schema      = "public"
  object_type = "sequence"
  privileges  = ["USAGE", "SELECT", "UPDATE"]

  depends_on = [postgresql_grant.test_schema]
}
