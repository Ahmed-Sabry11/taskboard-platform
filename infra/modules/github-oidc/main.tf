# Lets GitHub Actions push images to ECR without any stored AWS key.
# A workflow presents a short-lived token signed by GitHub, and AWS exchanges
# it for temporary credentials, but only for the repository and refs named
# below.

data "aws_partition" "current" {}
data "aws_caller_identity" "current" {}

locals {
  oidc_host = "token.actions.githubusercontent.com"

  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : (
    "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/${local.oidc_host}"
  )
}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0

  url            = "https://${local.oidc_host}"
  client_id_list = ["sts.amazonaws.com"]

  tags = var.tags
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Exact repository and ref. Without this condition, any repository on
    # GitHub could assume the role.
    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:sub"
      values   = [for ref in var.allowed_refs : "repo:${var.github_repository}:ref:${ref}"]
    }
  }
}

resource "aws_iam_role" "this" {
  name                 = var.role_name
  description          = "Assumed by GitHub Actions in ${var.github_repository} to push images to ECR"
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  max_session_duration = 3600

  tags = var.tags
}

data "aws_iam_policy_document" "push" {
  # Logging in to ECR is an account-level call and cannot be scoped to a repository.
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  # Push and read, on the named repositories only. No delete, no policy changes.
  statement {
    sid = "EcrPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = var.ecr_repository_arns
  }
}

resource "aws_iam_role_policy" "push" {
  name   = "ecr-push"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.push.json
}
