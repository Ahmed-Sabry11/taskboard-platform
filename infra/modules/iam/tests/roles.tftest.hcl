# Mocked plan: no credentials needed, nothing created.  terraform test

mock_provider "aws" {
  override_data {
    target = data.aws_partition.current
    values = {
      partition = "aws"
    }
  }

  override_data {
    target = data.aws_iam_policy_document.cluster_trust
    values = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  override_data {
    target = data.aws_iam_policy_document.node_trust
    values = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  name = "taskboard-test"
}

run "creates_both_roles_by_default" {
  command = plan

  assert {
    condition     = length(aws_iam_role.cluster) == 1 && length(aws_iam_role.node) == 1
    error_message = "Both roles must be created when none are supplied."
  }

  assert {
    condition     = aws_iam_role_policy_attachment.cluster[0].policy_arn == "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
    error_message = "The cluster role must carry only AmazonEKSClusterPolicy."
  }

  assert {
    condition = toset([for attachment in aws_iam_role_policy_attachment.node : attachment.policy_arn]) == toset([
      "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
      "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
      "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly",
    ])
    error_message = "The node role must carry exactly the three node policies, with pull-only registry access."
  }
}

run "reuses_existing_roles" {
  command = plan

  variables {
    existing_cluster_role_arn = "arn:aws:iam::123456789012:role/LabRole"
    existing_node_role_arn    = "arn:aws:iam::123456789012:role/LabRole"
  }

  assert {
    condition     = length(aws_iam_role.cluster) == 0 && length(aws_iam_role.node) == 0
    error_message = "No role may be created when existing roles are supplied."
  }

  assert {
    condition     = length(aws_iam_role_policy_attachment.cluster) == 0 && length(aws_iam_role_policy_attachment.node) == 0
    error_message = "No policy may be attached when existing roles are supplied."
  }

  assert {
    condition     = output.cluster_role_arn == "arn:aws:iam::123456789012:role/LabRole" && output.node_role_arn == "arn:aws:iam::123456789012:role/LabRole"
    error_message = "The outputs must pass the supplied roles through."
  }
}

run "roles_can_be_mixed" {
  command = plan

  variables {
    existing_node_role_arn = "arn:aws:iam::123456789012:role/LabRole"
  }

  assert {
    condition     = length(aws_iam_role.cluster) == 1 && length(aws_iam_role.node) == 0
    error_message = "Only the missing role may be created."
  }
}
