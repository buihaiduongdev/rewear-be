variable "aws_region" {
  description = "AWS Region"
  type        = string
  default     = "ap-southeast-1"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t4g.micro"
}

variable "disk_size_gb" {
  description = "Root disk size in GB"
  type        = number
  default     = 20
}

variable "public_key_path" {
  description = "Path to SSH public key"
  type        = string
  default     = "~/.ssh/github_personal.pub"
}

variable "github_repo" {
  description = "GitHub repository for OIDC trust (owner/repo)"
  type        = string
  default     = "buihaiduongdev/rewear-be"
}
