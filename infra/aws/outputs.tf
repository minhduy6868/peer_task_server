output "api_url" {
  value       = "http://${aws_instance.api.public_ip}:3000"
  description = "Health: GET /health"
}

output "rds_endpoint" {
  value     = aws_db_instance.this.address
  sensitive = true
}

output "region" {
  value = var.aws_region
}
