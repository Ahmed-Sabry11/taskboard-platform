output "region" {
  description = "AWS region of this stack."
  value       = var.region
}

output "cluster_name" {
  description = "Name of the EKS cluster."
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "URL of the Kubernetes API server."
  value       = module.eks.cluster_endpoint
}

output "kubernetes_version" {
  description = "Kubernetes version of the control plane."
  value       = module.eks.kubernetes_version
}

output "configure_kubectl" {
  description = "Command that adds this cluster to your kubeconfig."
  value       = "aws eks update-kubeconfig --region ${var.region} --name ${module.eks.cluster_name}"
}

output "vpc_id" {
  description = "ID of the VPC."
  value       = module.network.vpc_id
}

output "private_subnet_ids" {
  description = "Private subnets, where nodes and pods run."
  value       = module.network.private_subnet_ids
}

output "public_subnet_ids" {
  description = "Public subnets, where load balancers are placed."
  value       = module.network.public_subnet_ids
}

output "nat_public_ips" {
  description = "Addresses that outbound traffic from the cluster comes from."
  value       = module.network.nat_public_ips
}

output "alb_security_group_id" {
  description = "Security group for the public load balancer."
  value       = module.security.alb_security_group_id
}

output "pod_identity_roles" {
  description = "IAM roles bound to service accounts, or an empty map when disabled."
  value = var.enable_pod_identity_roles ? {
    "kube-system/ebs-csi-controller-sa"        = module.ebs_csi_identity[0].role_name
    "kube-system/aws-load-balancer-controller" = module.lb_controller_identity[0].role_name
  } : {}
}

output "iam_roles_created" {
  description = "Whether Terraform created the EKS roles or reused existing ones."
  value       = module.iam.roles_created
}
