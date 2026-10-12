variable "region" {
  description = "AWS region."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project name, used in resource names and tags."
  type        = string
  default     = "taskboard"
}

variable "github_repository" {
  description = "GitHub repository of this project, as \"owner/name\"."
  type        = string
  default     = "Ahmed-Sabry11/taskboard-platform"
}

variable "enable_github_oidc" {
  description = "Create the IAM role that lets GitHub Actions push images without stored keys. Requires permission to create IAM roles and identity providers, which AWS Academy Learner Lab does not grant: set to false there."
  type        = bool
  default     = true
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub OIDC identity provider. Set to false if the account already has one."
  type        = bool
  default     = true
}

variable "ecr_force_delete" {
  description = "Allow deleting image repositories that still contain images."
  type        = bool
  default     = false
}
