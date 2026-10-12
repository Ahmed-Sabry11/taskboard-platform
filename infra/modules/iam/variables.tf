variable "name" {
  description = "Prefix for role names, for example \"taskboard-dev\"."
  type        = string
}

variable "existing_cluster_role_arn" {
  description = "ARN of an existing IAM role for the EKS control plane. Leave null to create a least-privilege role. Set it in accounts that do not allow creating roles, such as AWS Academy Learner Lab (LabRole)."
  type        = string
  default     = null
}

variable "existing_node_role_arn" {
  description = "ARN of an existing IAM role for the worker nodes. Leave null to create a least-privilege role."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags added to every resource in this module."
  type        = map(string)
  default     = {}
}
