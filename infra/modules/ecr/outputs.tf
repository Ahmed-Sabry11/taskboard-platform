output "repository_urls" {
  description = "Map of repository name to the URL used in image references."
  value       = { for name, repo in aws_ecr_repository.this : name => repo.repository_url }
}

output "repository_arns" {
  description = "Map of repository name to ARN."
  value       = { for name, repo in aws_ecr_repository.this : name => repo.arn }
}

output "registry_id" {
  description = "ID of the registry, which is the AWS account ID."
  value       = one(distinct([for repo in aws_ecr_repository.this : repo.registry_id]))
}
