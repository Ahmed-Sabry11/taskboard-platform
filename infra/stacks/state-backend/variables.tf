variable "region" {
  description = "AWS region for the state bucket. Use the same region as the other stacks."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project name, used in the bucket name and tags."
  type        = string
  default     = "taskboard"
}

variable "force_destroy" {
  description = "Allow Terraform to delete the bucket even though it still holds state files. Set to true only when removing the project from the account for good."
  type        = bool
  default     = false
}
