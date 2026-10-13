variable "cluster_name" {
  description = "EKS cluster whose pods receive the role."
  type        = string
}

variable "role_name" {
  description = "Name of the IAM role to create."
  type        = string
}

variable "namespace" {
  description = "Kubernetes namespace of the service account."
  type        = string
}

variable "service_account" {
  description = "Kubernetes service account that may use the role. Only pods running as this account, in this namespace, in this cluster, receive it."
  type        = string
}

variable "managed_policy_arns" {
  description = "AWS-managed policies to attach to the role."
  type        = list(string)
  default     = []
}

variable "inline_policy_json" {
  description = "A policy document to embed in the role, for permissions no managed policy covers. Null for none."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags added to every resource in this module."
  type        = map(string)
  default     = {}
}
