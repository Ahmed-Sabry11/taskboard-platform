# Everything expensive: network, cluster, nodes. Created for a work session
# and destroyed afterwards. See docs/infrastructure.md for costs.

data "aws_availability_zones" "available" {
  state = "available"

  # Regular zones only, not Local Zones or Wavelength.
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

locals {
  name         = "${var.project}-${var.environment}"
  cluster_name = local.name

  # As many zones as there are subnet ranges.
  availability_zones = slice(
    data.aws_availability_zones.available.names, 0, length(var.private_subnet_cidrs)
  )
}

module "network" {
  source = "../../modules/network"

  name                 = local.name
  cluster_name         = local.cluster_name
  vpc_cidr             = var.vpc_cidr
  availability_zones   = local.availability_zones
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  single_nat_gateway   = var.single_nat_gateway
}

module "iam" {
  source = "../../modules/iam"

  name                      = local.name
  existing_cluster_role_arn = var.existing_cluster_role_arn
  existing_node_role_arn    = var.existing_node_role_arn
}

module "eks" {
  source = "../../modules/eks"

  cluster_name       = local.cluster_name
  kubernetes_version = var.kubernetes_version
  cluster_role_arn   = module.iam.cluster_role_arn
  node_role_arn      = module.iam.node_role_arn

  # Nodes and the control plane's network interfaces live in private subnets.
  subnet_ids = module.network.private_subnet_ids

  public_access_cidrs       = var.cluster_endpoint_public_access_cidrs
  admin_principal_arns      = var.admin_principal_arns
  enable_secrets_encryption = var.enable_secrets_encryption

  node_instance_types = var.node_instance_types
  node_desired_size   = var.node_desired_size
  node_min_size       = var.node_min_size
  node_max_size       = var.node_max_size
}

module "security" {
  source = "../../modules/security"

  name                      = local.name
  vpc_id                    = module.network.vpc_id
  cluster_security_group_id = module.eks.cluster_security_group_id
}
