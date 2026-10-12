output "vpc_id" {
  description = "ID of the VPC."
  value       = aws_vpc.this.id
}

output "vpc_cidr" {
  description = "IPv4 range of the VPC."
  value       = aws_vpc.this.cidr_block
}

output "public_subnet_ids" {
  description = "IDs of the public subnets, in Availability Zone order."
  value       = [for zone in var.availability_zones : aws_subnet.public[zone].id]
}

output "private_subnet_ids" {
  description = "IDs of the private subnets, in Availability Zone order."
  value       = [for zone in var.availability_zones : aws_subnet.private[zone].id]
}

output "nat_public_ips" {
  description = "Public addresses that outbound traffic from the private subnets appears to come from."
  value       = [for zone in local.nat_zones : aws_eip.nat[zone].public_ip]
}
