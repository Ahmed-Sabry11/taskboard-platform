variable "cluster_name" {
  description = "Name of the EKS cluster."
  type        = string
}

variable "kubernetes_version" {
  description = "Kubernetes minor version, for example \"1.34\". Pinned so that upgrades are deliberate."
  type        = string
}

variable "cluster_role_arn" {
  description = "IAM role the control plane uses."
  type        = string
}

variable "node_role_arn" {
  description = "IAM role the worker nodes use."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnets for the control plane's network interfaces and for the worker nodes. At least two Availability Zones."
  type        = list(string)
}

# ---- API endpoint -------------------------------------------------------------

variable "endpoint_public_access" {
  description = "Expose the Kubernetes API on a public address. Needed to run kubectl from a laptop when there is no VPN into the VPC."
  type        = bool
  default     = true
}

variable "public_access_cidrs" {
  description = "IPv4 ranges allowed to reach the public API endpoint. Use your own address as a /32. There is deliberately no default."
  type        = list(string)

  validation {
    condition     = alltrue([for cidr in var.public_access_cidrs : can(cidrhost(cidr, 0))])
    error_message = "Every entry must be a valid IPv4 CIDR block, for example 203.0.113.10/32."
  }
}

variable "admin_principal_arns" {
  description = "IAM users or roles, besides the identity that creates the cluster, to be granted cluster administrator access."
  type        = list(string)
  default     = []
}

# ---- Encryption ---------------------------------------------------------------

variable "enable_secrets_encryption" {
  description = "Encrypt Kubernetes Secrets with a KMS key owned by this account. Costs about 1 USD a month for the key. It cannot be turned off again without recreating the cluster."
  type        = bool
  default     = true
}

# ---- Logging ------------------------------------------------------------------

variable "enabled_log_types" {
  description = "Control plane log types sent to CloudWatch. Audit and authenticator logs record who did what."
  type        = list(string)
  default     = ["api", "audit", "authenticator"]
}

variable "log_retention_days" {
  description = "Days to keep control plane logs. Short by default because log storage is billed."
  type        = number
  default     = 7
}

# ---- Worker nodes -------------------------------------------------------------

variable "node_instance_types" {
  description = "EC2 instance types for the node group."
  type        = list(string)
  default     = ["t3.medium"]
}

variable "node_capacity_type" {
  description = "ON_DEMAND or SPOT."
  type        = string
  default     = "ON_DEMAND"

  validation {
    condition     = contains(["ON_DEMAND", "SPOT"], var.node_capacity_type)
    error_message = "node_capacity_type must be ON_DEMAND or SPOT."
  }
}

variable "node_desired_size" {
  description = "Number of nodes at creation. Afterwards the cluster autoscaler owns this number."
  type        = number
  default     = 2
}

variable "node_min_size" {
  description = "Minimum number of nodes."
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Maximum number of nodes."
  type        = number
  default     = 4
}

variable "node_disk_size_gb" {
  description = "Root volume size of each node, in GiB."
  type        = number
  default     = 20
}

variable "tags" {
  description = "Tags added to every resource in this module."
  type        = map(string)
  default     = {}
}
