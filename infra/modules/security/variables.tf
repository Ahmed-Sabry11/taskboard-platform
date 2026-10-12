variable "name" {
  description = "Prefix for resource names, for example \"taskboard-dev\"."
  type        = string
}

variable "vpc_id" {
  description = "VPC the security groups belong to."
  type        = string
}

variable "cluster_security_group_id" {
  description = "Security group that EKS attaches to the control plane and to every node and pod."
  type        = string
}

variable "alb_ingress_cidrs" {
  description = "IPv4 ranges allowed to reach the public load balancer."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "app_ports" {
  description = "Pod ports the load balancer forwards to."
  type        = list(number)
  default     = [8080, 8000]
}

variable "tags" {
  description = "Tags added to every resource in this module."
  type        = map(string)
  default     = {}
}
