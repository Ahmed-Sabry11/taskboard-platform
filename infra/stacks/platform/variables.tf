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

variable "environment" {
  description = "Environment name, used in resource names and tags."
  type        = string
  default     = "dev"
}

# ---- Network ------------------------------------------------------------------

variable "vpc_cidr" {
  description = "IPv4 range of the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Ranges for the public subnets, one per Availability Zone."
  type        = list(string)
  default     = ["10.0.0.0/24", "10.0.1.0/24"]
}

variable "private_subnet_cidrs" {
  description = "Ranges for the private subnets, one per Availability Zone. Large, because every pod takes an address."
  type        = list(string)
  default     = ["10.0.16.0/20", "10.0.32.0/20"]
}

variable "single_nat_gateway" {
  description = "One NAT gateway instead of one per Availability Zone. Saves about 33 USD a month per extra gateway, at the price of zone redundancy for outbound traffic."
  type        = bool
  default     = true
}

# ---- Cluster ------------------------------------------------------------------

variable "kubernetes_version" {
  description = "Kubernetes minor version. Check what the region offers with: aws eks describe-cluster-versions"
  type        = string
  default     = "1.36"
}

variable "cluster_endpoint_public_access_cidrs" {
  description = "IPv4 ranges allowed to reach the Kubernetes API. Set it to your own public address as a /32. No default on purpose."
  type        = list(string)

  validation {
    condition     = length(var.cluster_endpoint_public_access_cidrs) > 0
    error_message = "Provide at least one CIDR, for example [\"203.0.113.10/32\"]. Find your address with: (Invoke-RestMethod https://checkip.amazonaws.com).Trim()"
  }
}

variable "enable_secrets_encryption" {
  description = "Encrypt Kubernetes Secrets with a KMS key owned by this account (about 1 USD a month)."
  type        = bool
  default     = true
}

variable "admin_principal_arns" {
  description = "Extra IAM users or roles to grant cluster administrator access. The identity running Terraform is always an administrator."
  type        = list(string)
  default     = []
}

variable "node_instance_types" {
  description = "EC2 instance types for worker nodes."
  type        = list(string)
  default     = ["t3.medium"]
}

variable "node_desired_size" {
  description = "Number of worker nodes at creation."
  type        = number
  default     = 2
}

variable "node_min_size" {
  description = "Minimum number of worker nodes."
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Maximum number of worker nodes."
  type        = number
  default     = 4
}

# ---- IAM ----------------------------------------------------------------------

variable "existing_cluster_role_arn" {
  description = "Existing IAM role for the control plane. Null creates a least-privilege role. In AWS Academy Learner Lab set it to arn:aws:iam::<ACCOUNT_ID>:role/LabRole."
  type        = string
  default     = null
}

variable "existing_node_role_arn" {
  description = "Existing IAM role for worker nodes. Null creates a least-privilege role. In AWS Academy Learner Lab set it to arn:aws:iam::<ACCOUNT_ID>:role/LabRole."
  type        = string
  default     = null
}
