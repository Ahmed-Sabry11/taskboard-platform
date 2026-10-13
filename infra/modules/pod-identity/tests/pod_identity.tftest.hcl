# Mocked plan: no credentials needed, nothing created.  terraform test

mock_provider "aws" {
  override_data {
    target = data.aws_caller_identity.current
    values = {
      account_id = "123456789012"
    }
  }

  override_data {
    target = data.aws_iam_policy_document.trust
    values = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

variables {
  cluster_name    = "taskboard-test"
  role_name       = "taskboard-test-example"
  namespace       = "kube-system"
  service_account = "example"
}

run "binds_the_role_to_exactly_one_service_account" {
  command = plan

  assert {
    condition = (
      aws_eks_pod_identity_association.this.cluster_name == "taskboard-test" &&
      aws_eks_pod_identity_association.this.namespace == "kube-system" &&
      aws_eks_pod_identity_association.this.service_account == "example"
    )
    error_message = "The association must name the cluster, namespace and service account it was given."
  }

  assert {
    condition     = length(aws_iam_role_policy_attachment.managed) == 0 && length(aws_iam_role_policy.inline) == 0
    error_message = "A role with no policies requested must have no permissions."
  }
}

run "attaches_only_the_requested_policies" {
  command = plan

  variables {
    managed_policy_arns = ["arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"]
    inline_policy_json  = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
  }

  assert {
    condition     = length(aws_iam_role_policy_attachment.managed) == 1 && length(aws_iam_role_policy.inline) == 1
    error_message = "Exactly the requested managed and inline policies must be attached."
  }
}
