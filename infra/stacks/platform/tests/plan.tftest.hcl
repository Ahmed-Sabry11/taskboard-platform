# Plans the whole stack against a mocked AWS provider. No credentials are
# needed and nothing is created. Run with:  terraform test
#
# Checks that the modules fit together and that the stack's inputs are
# validated. Each module has its own tests for what it creates.

mock_provider "aws" {
  override_data {
    target = data.aws_availability_zones.available
    values = {
      names = ["us-east-1a", "us-east-1b", "us-east-1c"]
    }
  }

  override_data {
    target = module.iam.data.aws_partition.current
    values = {
      partition = "aws"
    }
  }

  override_data {
    target = module.iam.data.aws_iam_policy_document.cluster_trust
    values = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }

  override_data {
    target = module.iam.data.aws_iam_policy_document.node_trust
    values = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  cluster_endpoint_public_access_cidrs = ["203.0.113.10/32"]
}

run "standard_account_plans_with_its_own_roles" {
  command = plan

  assert {
    condition     = output.iam_roles_created == { cluster = true, node = true }
    error_message = "A standard account must get its own cluster and node roles."
  }

  assert {
    condition     = output.cluster_name == "taskboard-dev"
    error_message = "The cluster name must be built from project and environment."
  }

  assert {
    condition     = output.configure_kubectl == "aws eks update-kubeconfig --region us-east-1 --name taskboard-dev"
    error_message = "The kubeconfig command must name the right region and cluster."
  }
}

run "learner_lab_plans_with_existing_roles" {
  command = plan

  variables {
    existing_cluster_role_arn = "arn:aws:iam::123456789012:role/LabRole"
    existing_node_role_arn    = "arn:aws:iam::123456789012:role/LabRole"
  }

  assert {
    condition     = output.iam_roles_created == { cluster = false, node = false }
    error_message = "No IAM role may be created when existing roles are supplied."
  }
}

run "api_endpoint_requires_an_address_range" {
  command = plan

  variables {
    cluster_endpoint_public_access_cidrs = []
  }

  expect_failures = [var.cluster_endpoint_public_access_cidrs]
}
