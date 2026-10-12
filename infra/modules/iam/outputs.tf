output "cluster_role_arn" {
  description = "ARN of the role the EKS control plane uses (created here, or the existing one passed in)."
  value       = local.create_cluster_role ? aws_iam_role.cluster[0].arn : var.existing_cluster_role_arn

  # The cluster must not be created before the role can actually do its job.
  depends_on = [aws_iam_role_policy_attachment.cluster]
}

output "node_role_arn" {
  description = "ARN of the role the worker nodes use (created here, or the existing one passed in)."
  value       = local.create_node_role ? aws_iam_role.node[0].arn : var.existing_node_role_arn

  depends_on = [aws_iam_role_policy_attachment.node]
}

output "roles_created" {
  description = "Whether this module created the roles or reused existing ones."
  value = {
    cluster = local.create_cluster_role
    node    = local.create_node_role
  }
}
