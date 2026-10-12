# IAM roles for EKS. Each role is created only when no existing role is
# supplied, and carries only AWS-managed policies written for its purpose.

data "aws_partition" "current" {}

locals {
  create_cluster_role = var.existing_cluster_role_arn == null
  create_node_role    = var.existing_node_role_arn == null
  policy_prefix       = "arn:${data.aws_partition.current.partition}:iam::aws:policy"
}

# ---- Control plane role -------------------------------------------------------
# Lets the EKS service manage network interfaces and load balancers for the
# cluster. Only the EKS service can assume it.

data "aws_iam_policy_document" "cluster_trust" {
  statement {
    actions = ["sts:AssumeRole", "sts:TagSession"]

    principals {
      type        = "Service"
      identifiers = ["eks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cluster" {
  count = local.create_cluster_role ? 1 : 0

  name               = "${var.name}-eks-cluster"
  description        = "Assumed by the EKS control plane of ${var.name}"
  assume_role_policy = data.aws_iam_policy_document.cluster_trust.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "cluster" {
  count = local.create_cluster_role ? 1 : 0

  role       = aws_iam_role.cluster[0].name
  policy_arn = "${local.policy_prefix}/AmazonEKSClusterPolicy"
}

# ---- Worker node role ---------------------------------------------------------
# Lets a node join the cluster, configure pod networking, and pull images.
# It grants no access to application data. Only EC2 instances can assume it.

data "aws_iam_policy_document" "node_trust" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "node" {
  count = local.create_node_role ? 1 : 0

  name               = "${var.name}-eks-node"
  description        = "Assumed by the worker nodes of ${var.name}"
  assume_role_policy = data.aws_iam_policy_document.node_trust.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "node" {
  for_each = local.create_node_role ? toset([
    "AmazonEKSWorkerNodePolicy",
    "AmazonEKS_CNI_Policy",
    # Pull only. Nodes never push or delete images.
    "AmazonEC2ContainerRegistryPullOnly",
  ]) : toset([])

  role       = aws_iam_role.node[0].name
  policy_arn = "${local.policy_prefix}/${each.key}"
}
