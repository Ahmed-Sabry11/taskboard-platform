output "alb_security_group_id" {
  description = "Security group for the public load balancer. Referenced by the Ingress in the AWS overlay."
  value       = aws_security_group.alb.id
}
