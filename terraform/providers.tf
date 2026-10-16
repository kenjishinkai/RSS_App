terraform {
  required_version = ">= 1.5.0"

  required_providers {
    postgresql = {
      source  = "cyrilgdn/postgresql"
      version = "~> 1.25"
    }
  }
}

provider "postgresql" {
  host            = var.pg_host
  port            = var.pg_port
  database        = var.pg_admin_database
  username        = var.pg_superuser
  password        = var.pg_superuser_password
  sslmode         = var.pg_sslmode
  connect_timeout = 15
  superuser       = var.pg_provider_superuser
}
