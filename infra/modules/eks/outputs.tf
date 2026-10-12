output "cluster_name" {
  description = "Name of the EKS cluster."
  value       = aws_eks_cluster.this.name
}

output "cluster_arn" {
  description = "ARN of the EKS cluster."
  value       = aws_eks_cluster.this.arn
}

output "cluster_endpoint" {
  description = "URL of the Kubernetes API server."
  value       = aws_eks_cluster.this.endpoint
}

output "cluster_certificate_authority_data" {
  description = "Base64-encoded certificate used to verify the API server. Public information."
  value       = aws_eks_cluster.this.certificate_authority[0].data
}

output "cluster_security_group_id" {
  description = "Security group EKS attaches to the control plane, nodes, and pods."
  value       = aws_eks_cluster.this.vpc_config[0].cluster_security_group_id
}

output "oidc_issuer_url" {
  description = "OIDC issuer of the cluster, used when granting IAM roles to pods."
  value       = aws_eks_cluster.this.identity[0].oidc[0].issuer
}

output "secrets_kms_key_arn" {
  description = "KMS key that encrypts Kubernetes Secrets, or null when encryption with an account-owned key is off."
  value       = var.enable_secrets_encryption ? aws_kms_key.secrets[0].arn : null
}

output "kubernetes_version" {
  description = "Kubernetes version the control plane runs."
  value       = aws_eks_cluster.this.version
}

output "node_group_name" {
  description = "Name of the managed node group."
  value       = aws_eks_node_group.default.node_group_name
}
