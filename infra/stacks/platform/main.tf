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

# ---- Cluster add-ons that call AWS ---------------------------------------------
# Each controller below gets its own IAM role, bound to its own service
# account. They are skipped where IAM roles cannot be created (AWS Academy
# Learner Lab), and the controllers then fall back to the node role.

# Hands IAM roles to pods. Required by the two associations below.
resource "aws_eks_addon" "pod_identity_agent" {
  count = var.enable_pod_identity_roles ? 1 : 0

  cluster_name = module.eks.cluster_name
  addon_name   = "eks-pod-identity-agent"

  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
}

# Creates and attaches EBS volumes for PersistentVolumeClaims.
module "ebs_csi_identity" {
  source = "../../modules/pod-identity"
  count  = var.enable_pod_identity_roles ? 1 : 0

  cluster_name        = module.eks.cluster_name
  role_name           = "${local.name}-ebs-csi"
  namespace           = "kube-system"
  service_account     = "ebs-csi-controller-sa"
  managed_policy_arns = ["arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"]
}

resource "aws_eks_addon" "ebs_csi" {
  count = var.enable_pod_identity_roles ? 1 : 0

  cluster_name = module.eks.cluster_name
  addon_name   = "aws-ebs-csi-driver"

  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  depends_on = [
    aws_eks_addon.pod_identity_agent,
    module.ebs_csi_identity,
  ]
}

# Turns Kubernetes Ingress objects into Application Load Balancers. The
# controller itself is installed by ArgoCD. Only its AWS permissions are
# defined here. The policy is the one published with the controller release.
module "lb_controller_identity" {
  source = "../../modules/pod-identity"
  count  = var.enable_pod_identity_roles ? 1 : 0

  cluster_name       = module.eks.cluster_name
  role_name          = "${local.name}-lb-controller"
  namespace          = "kube-system"
  service_account    = "aws-load-balancer-controller"
  inline_policy_json = file("${path.module}/policies/aws-load-balancer-controller.json")

  depends_on = [aws_eks_addon.pod_identity_agent]
}

# Serves pod CPU and memory to the Horizontal Pod Autoscaler and "kubectl top".
resource "aws_eks_addon" "metrics_server" {
  cluster_name = module.eks.cluster_name
  addon_name   = "metrics-server"

  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"
}

module "security" {
  source = "../../modules/security"

  name                      = local.name
  vpc_id                    = module.network.vpc_id
  cluster_security_group_id = module.eks.cluster_security_group_id
}
