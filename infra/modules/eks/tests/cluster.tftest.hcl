# Mocked plan: no credentials needed, nothing created.  terraform test

mock_provider "aws" {}

variables {
  cluster_name        = "taskboard-test"
  kubernetes_version  = "1.36"
  cluster_role_arn    = "arn:aws:iam::123456789012:role/cluster"
  node_role_arn       = "arn:aws:iam::123456789012:role/node"
  subnet_ids          = ["subnet-aaaa1111", "subnet-bbbb2222"]
  public_access_cidrs = ["203.0.113.10/32"]
}

run "api_endpoint_is_restricted" {
  command = plan

  assert {
    condition     = aws_eks_cluster.this.vpc_config[0].endpoint_private_access == true
    error_message = "The private API endpoint must be enabled."
  }

  assert {
    condition     = aws_eks_cluster.this.vpc_config[0].public_access_cidrs == toset(["203.0.113.10/32"])
    error_message = "The public API endpoint must be limited to the supplied address ranges."
  }
}

run "secrets_are_encrypted_with_a_rotating_key" {
  command = plan

  assert {
    condition     = length(aws_kms_key.secrets) == 1 && aws_kms_key.secrets[0].enable_key_rotation == true
    error_message = "A rotating KMS key must be created for Secrets by default."
  }

  assert {
    condition     = aws_eks_cluster.this.encryption_config[0].resources == toset(["secrets"])
    error_message = "The cluster must encrypt Secrets."
  }
}

run "secrets_encryption_can_be_turned_off" {
  command = plan

  variables {
    enable_secrets_encryption = false
  }

  assert {
    condition     = length(aws_kms_key.secrets) == 0 && length(aws_eks_cluster.this.encryption_config) == 0
    error_message = "No key and no encryption block may exist when the option is off."
  }
}

run "access_is_managed_with_access_entries" {
  command = plan

  assert {
    condition     = aws_eks_cluster.this.access_config[0].authentication_mode == "API"
    error_message = "Cluster access must be managed through access entries, not the aws-auth ConfigMap."
  }

  assert {
    condition     = length(aws_eks_access_entry.admin) == 0
    error_message = "No extra administrators may exist unless requested."
  }
}

run "audit_logs_are_on_and_expire" {
  command = plan

  assert {
    condition     = contains(aws_eks_cluster.this.enabled_cluster_log_types, "audit")
    error_message = "Audit logging must be enabled."
  }

  assert {
    condition     = aws_cloudwatch_log_group.cluster.retention_in_days == 7
    error_message = "Control plane logs must have a retention period."
  }

  assert {
    condition     = aws_cloudwatch_log_group.cluster.name == "/aws/eks/taskboard-test/cluster"
    error_message = "The log group must use the name EKS writes to, or EKS creates its own without retention."
  }
}

run "nodes_use_the_given_role_and_sizes" {
  command = plan

  assert {
    condition     = aws_eks_node_group.default.node_role_arn == "arn:aws:iam::123456789012:role/node"
    error_message = "Nodes must use the supplied role."
  }

  assert {
    condition = (
      aws_eks_node_group.default.scaling_config[0].min_size == 2 &&
      aws_eks_node_group.default.scaling_config[0].max_size == 4
    )
    error_message = "Unexpected default node group size."
  }
}

run "extra_administrators_get_access_entries" {
  command = plan

  variables {
    admin_principal_arns = ["arn:aws:iam::123456789012:user/teammate"]
  }

  assert {
    condition     = length(aws_eks_access_entry.admin) == 1 && length(aws_eks_access_policy_association.admin) == 1
    error_message = "Each extra administrator needs an access entry and a policy association."
  }
}

run "rejects_an_invalid_address_range" {
  command = plan

  variables {
    public_access_cidrs = ["not-a-cidr"]
  }

  expect_failures = [var.public_access_cidrs]
}

run "rejects_an_unknown_capacity_type" {
  command = plan

  variables {
    node_capacity_type = "RESERVED"
  }

  expect_failures = [var.node_capacity_type]
}
