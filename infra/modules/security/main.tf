# Security groups for traffic entering the cluster.
#
#   internet --80/443--> [ alb ] --8080/8000--> [ cluster: nodes and pods ]
#
# EKS creates and manages the cluster security group itself (node to node,
# node to control plane). This module adds the one path in from outside:
# through the load balancer, on the application ports only.

resource "aws_security_group" "alb" {
  name_prefix = "${var.name}-alb-"
  description = "Public load balancer of ${var.name}"
  vpc_id      = var.vpc_id

  tags = merge(var.tags, { Name = "${var.name}-alb" })

  lifecycle {
    create_before_destroy = true
  }
}

# A public website has to accept traffic from the internet. Port 80 exists
# only so the load balancer can redirect to HTTPS.
#trivy:ignore:AVD-AWS-0107
resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  for_each = toset(var.alb_ingress_cidrs)

  security_group_id = aws_security_group.alb.id
  description       = "HTTPS from ${each.key}"
  cidr_ipv4         = each.key
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

#trivy:ignore:AVD-AWS-0107
resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  for_each = toset(var.alb_ingress_cidrs)

  security_group_id = aws_security_group.alb.id
  description       = "HTTP from ${each.key}, redirected to HTTPS"
  cidr_ipv4         = each.key
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

# The load balancer may open connections only to the cluster, and only on the
# application ports. It has no general outbound access.
resource "aws_vpc_security_group_egress_rule" "alb_to_cluster" {
  for_each = toset([for port in var.app_ports : tostring(port)])

  security_group_id            = aws_security_group.alb.id
  description                  = "To pods on port ${each.key}"
  referenced_security_group_id = var.cluster_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = tonumber(each.key)
  to_port                      = tonumber(each.key)
}

# The matching rule on the cluster side: accept those ports from the load
# balancer's security group, and from nothing else outside the cluster.
resource "aws_vpc_security_group_ingress_rule" "cluster_from_alb" {
  for_each = toset([for port in var.app_ports : tostring(port)])

  security_group_id            = var.cluster_security_group_id
  description                  = "From the load balancer on port ${each.key}"
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = tonumber(each.key)
  to_port                      = tonumber(each.key)
}
