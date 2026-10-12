variable "role_name" {
  description = "Name of the IAM role that GitHub Actions assumes."
  type        = string
}

variable "github_repository" {
  description = "Repository allowed to assume the role, as \"owner/name\"."
  type        = string

  validation {
    condition     = can(regex("^[^/]+/[^/]+$", var.github_repository))
    error_message = "github_repository must look like \"owner/name\"."
  }
}

variable "allowed_refs" {
  description = "Git refs whose workflows may assume the role. Pull requests are excluded by default, so code from a fork can never obtain AWS credentials."
  type        = list(string)
  default     = ["refs/heads/main"]
}

variable "create_oidc_provider" {
  description = "Create the GitHub OIDC identity provider. An AWS account can hold only one, so set to false if it already exists."
  type        = bool
  default     = true
}

variable "ecr_repository_arns" {
  description = "ECR repositories the role may push images to."
  type        = list(string)
}

variable "tags" {
  description = "Tags added to every resource in this module."
  type        = map(string)
  default     = {}
}
