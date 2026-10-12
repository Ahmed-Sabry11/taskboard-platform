# ---- Control plane logs -------------------------------------------------------
# Created here, before the cluster, so the retention period is ours. If EKS
# created the group itself, the logs would be kept, and billed, forever.

resource "aws_cloudwatch_log_group" "cluster" {
  name              = "/aws/eks/${var.cluster_name}/cluster"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# ---- Encryption key for Kubernetes Secrets ------------------------------------
# Secrets are stored in the cluster's database. With this key they are
# encrypted before they are written, with a key that belongs to this account
# and can be audited and revoked.

resource "aws_kms_key" "secrets" {
  count = var.enable_secrets_encryption ? 1 : 0

  description             = "Encrypts Kubernetes Secrets of the ${var.cluster_name} EKS cluster"
  enable_key_rotation     = true
  deletion_window_in_days = 7

  tags = var.tags
}

resource "aws_kms_alias" "secrets" {
  count = var.enable_secrets_encryption ? 1 : 0

  name          = "alias/${var.cluster_name}-eks-secrets"
  target_key_id = aws_kms_key.secrets[0].key_id
}

# ---- Cluster ------------------------------------------------------------------

# The public API endpoint is needed to operate the cluster from a laptop, as
# there is no VPN into the VPC. It is limited to the address ranges in
# public_access_cidrs, and every request still needs valid IAM credentials.
#trivy:ignore:AVD-AWS-0040
resource "aws_eks_cluster" "this" {
  name     = var.cluster_name
  role_arn = var.cluster_role_arn
  version  = var.kubernetes_version

  enabled_cluster_log_types = var.enabled_log_types

  # Networking add-ons are installed as managed add-ons below, so that their
  # versions and settings are in code.
  bootstrap_self_managed_addons = false

  vpc_config {
    subnet_ids              = var.subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = var.endpoint_public_access
    public_access_cidrs     = var.endpoint_public_access ? var.public_access_cidrs : null
  }

  # Access is granted through EKS access entries, managed in code below,
  # instead of the aws-auth ConfigMap inside the cluster.
  access_config {
    authentication_mode                         = "API"
    bootstrap_cluster_creator_admin_permissions = true
  }

  dynamic "encryption_config" {
    for_each = var.enable_secrets_encryption ? [1] : []

    content {
      resources = ["secrets"]

      provider {
        key_arn = aws_kms_key.secrets[0].arn
      }
    }
  }

  tags = var.tags

  depends_on = [aws_cloudwatch_log_group.cluster]
}

# ---- Additional administrators ------------------------------------------------

resource "aws_eks_access_entry" "admin" {
  for_each = toset(var.admin_principal_arns)

  cluster_name  = aws_eks_cluster.this.name
  principal_arn = each.key
  type          = "STANDARD"

  tags = var.tags
}

resource "aws_eks_access_policy_association" "admin" {
  for_each = aws_eks_access_entry.admin

  cluster_name  = aws_eks_cluster.this.name
  principal_arn = each.value.principal_arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }
}

# ---- Networking add-ons, needed before any node can become Ready --------------

resource "aws_eks_addon" "vpc_cni" {
  cluster_name = aws_eks_cluster.this.name
  addon_name   = "vpc-cni"

  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  configuration_values = jsonencode({
    # Lets Kubernetes NetworkPolicy objects be enforced.
    enableNetworkPolicy = "true"
    env = {
      # Hands each node blocks of 16 addresses instead of single ones. Without
      # it a t3.medium can run only 17 pods, which the platform add-ons alone
      # would use up.
      ENABLE_PREFIX_DELEGATION = "true"
      WARM_PREFIX_TARGET       = "1"
    }
  })

  tags = var.tags
}

resource "aws_eks_addon" "kube_proxy" {
  cluster_name = aws_eks_cluster.this.name
  addon_name   = "kube-proxy"

  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  tags = var.tags
}

# ---- Worker nodes -------------------------------------------------------------

resource "aws_eks_node_group" "default" {
  cluster_name    = aws_eks_cluster.this.name
  node_group_name = "default"
  node_role_arn   = var.node_role_arn
  subnet_ids      = var.subnet_ids

  ami_type       = "AL2023_x86_64_STANDARD"
  instance_types = var.node_instance_types
  capacity_type  = var.node_capacity_type
  disk_size      = var.node_disk_size_gb

  scaling_config {
    desired_size = var.node_desired_size
    min_size     = var.node_min_size
    max_size     = var.node_max_size
  }

  # Replace one node at a time during upgrades.
  update_config {
    max_unavailable = 1
  }

  tags = var.tags

  lifecycle {
    # The cluster autoscaler changes the node count at run time. Terraform
    # must not reset it on the next apply.
    ignore_changes = [scaling_config[0].desired_size]
  }

  depends_on = [
    aws_eks_addon.vpc_cni,
    aws_eks_addon.kube_proxy,
  ]
}

# ---- Add-ons that run on the nodes --------------------------------------------

# CoreDNS runs as ordinary pods, so it can only become healthy once nodes exist.
resource "aws_eks_addon" "coredns" {
  cluster_name = aws_eks_cluster.this.name
  addon_name   = "coredns"

  resolve_conflicts_on_create = "OVERWRITE"
  resolve_conflicts_on_update = "OVERWRITE"

  tags = var.tags

  depends_on = [aws_eks_node_group.default]
}
