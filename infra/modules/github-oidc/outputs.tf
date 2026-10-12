output "role_arn" {
  description = "ARN of the role for GitHub Actions. Not a secret: it is useless without a token signed by GitHub for the allowed repository."
  value       = aws_iam_role.this.arn
}

output "oidc_provider_arn" {
  description = "ARN of the GitHub OIDC identity provider."
  value       = local.oidc_provider_arn
}
