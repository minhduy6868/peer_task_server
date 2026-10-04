variable "aws_region" {
  type    = string
  default = "ap-southeast-1"
}

variable "project" {
  type    = string
  default = "peertask"
}

variable "instance_type" {
  type    = string
  default = "t3.small"
}

variable "db_instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "image" {
  type        = string
  default     = "ghcr.io/minhduy6868/peer_task_server:latest"
  description = "API container image"
}
