output "ecr_repository_urls" {
  description = "Image repository URLs, used in the AWS overlay and by the release pipeline."
  value       = module.ecr.repository_urls
}

output "github_actions_role_arn" {
  description = "Role for GitHub Actions to assume, or null when OIDC is disabled."
  value       = var.enable_github_oidc ? module.github_oidc[0].role_arn : null
}
