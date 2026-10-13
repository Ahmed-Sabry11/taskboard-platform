# Gives one Kubernetes service account one IAM role, through EKS Pod Identity.
#
# Without this, a controller that calls AWS would have to use the node's role,
# and then every pod on that node could use it too. With it, only the named
# service account gets the permissions, as short-lived credentials.
#
# Pod Identity is used rather than IAM Roles for Service Accounts because it
# needs no OIDC identity provider in the account.

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRole", "sts:TagSession"]

    principals {
      type        = "Service"
      identifiers = ["pods.eks.amazonaws.com"]
    }

    # Only clusters in this account may hand the role out.
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "this" {
  name               = var.role_name
  description        = "For service account ${var.namespace}/${var.service_account} in EKS cluster ${var.cluster_name}"
  assume_role_policy = data.aws_iam_policy_document.trust.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "managed" {
  for_each = toset(var.managed_policy_arns)

  role       = aws_iam_role.this.name
  policy_arn = each.key
}

resource "aws_iam_role_policy" "inline" {
  count = var.inline_policy_json == null ? 0 : 1

  name   = "permissions"
  role   = aws_iam_role.this.id
  policy = var.inline_policy_json
}

resource "aws_eks_pod_identity_association" "this" {
  cluster_name    = var.cluster_name
  namespace       = var.namespace
  service_account = var.service_account
  role_arn        = aws_iam_role.this.arn

  tags = var.tags

  # Credentials must not be issued before the role can do anything.
  depends_on = [
    aws_iam_role_policy_attachment.managed,
    aws_iam_role_policy.inline,
  ]
}
