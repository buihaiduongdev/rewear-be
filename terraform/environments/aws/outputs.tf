output "instance_id" {
  description = "EC2 Instance ID (dùng cho GitHub Secret EC2_INSTANCE_ID)"
  value       = aws_instance.rewear_server.id
}

output "public_ip" {
  description = "Public IP"
  value       = aws_instance.rewear_server.public_ip
}

output "ssh_command" {
  description = "SSH Command"
  value       = "ssh -i ~/.ssh/github_personal ubuntu@${aws_instance.rewear_server.public_ip}"
}

output "github_role_arn" {
  description = "IAM Role ARN for GitHub Actions (dùng cho GitHub Secret AWS_ROLE_ARN)"
  value       = aws_iam_role.github_actions_role.arn
}

output "ecr_repository_url" {
  description = "ECR Repository URL (dùng cho GitHub Secret ECR_REPOSITORY)"
  value       = aws_ecr_repository.rewear_be.repository_url
}
