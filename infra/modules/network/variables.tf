variable "name" {
  description = "Prefix for resource names, for example \"taskboard-dev\"."
  type        = string
}

variable "cluster_name" {
  description = "EKS cluster that will use these subnets. Used for the subnet tags that let Kubernetes place load balancers."
  type        = string
}

variable "vpc_cidr" {
  description = "IPv4 range of the VPC."
  type        = string

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr must be a valid IPv4 CIDR block, for example 10.0.0.0/16."
  }
}

variable "availability_zones" {
  description = "Availability Zones to spread subnets across. At least two, as EKS requires."
  type        = list(string)

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least two Availability Zones are required."
  }
}

variable "public_subnet_cidrs" {
  description = "One range per Availability Zone for the public subnets (load balancers and the NAT gateway)."
  type        = list(string)
}

variable "private_subnet_cidrs" {
  description = "One range per Availability Zone for the private subnets (EKS nodes and pods). Size them generously: every pod gets a VPC address."
  type        = list(string)
}

variable "single_nat_gateway" {
  description = "Use one NAT gateway for all private subnets. Cheaper, but outbound traffic depends on one Availability Zone. Set to false for one per zone."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags added to every resource in this module."
  type        = map(string)
  default     = {}
}
