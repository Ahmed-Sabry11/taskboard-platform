locals {
  zones = {
    for index, zone in var.availability_zones : zone => {
      public_cidr  = var.public_subnet_cidrs[index]
      private_cidr = var.private_subnet_cidrs[index]
    }
  }

  # Zones that get their own NAT gateway: the first one only, or all of them.
  nat_zones = var.single_nat_gateway ? [var.availability_zones[0]] : var.availability_zones
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(var.tags, { Name = var.name })
}

# The default security group allows all traffic between its members. Leaving
# it without rules means a resource that lands in it by accident can reach
# nothing.
resource "aws_default_security_group" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, { Name = "${var.name}-default-unused" })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, { Name = var.name })
}

# ---- Public subnets: load balancers and NAT gateways only --------------------

resource "aws_subnet" "public" {
  for_each = local.zones

  vpc_id            = aws_vpc.this.id
  availability_zone = each.key
  cidr_block        = each.value.public_cidr

  # Nothing here needs an automatic public address. Load balancers and NAT
  # gateways get theirs explicitly.
  map_public_ip_on_launch = false

  tags = merge(var.tags, {
    Name                                        = "${var.name}-public-${each.key}"
    Tier                                        = "public"
    "kubernetes.io/role/elb"                    = "1"
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, { Name = "${var.name}-public" })
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

# ---- NAT: outbound-only internet access for the private subnets ---------------

resource "aws_eip" "nat" {
  for_each = toset(local.nat_zones)

  domain = "vpc"

  tags = merge(var.tags, { Name = "${var.name}-nat-${each.key}" })

  depends_on = [aws_internet_gateway.this]
}

resource "aws_nat_gateway" "this" {
  for_each = toset(local.nat_zones)

  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = aws_subnet.public[each.key].id

  tags = merge(var.tags, { Name = "${var.name}-${each.key}" })

  depends_on = [aws_internet_gateway.this]
}

# ---- Private subnets: EKS nodes and pods --------------------------------------

resource "aws_subnet" "private" {
  for_each = local.zones

  vpc_id                  = aws_vpc.this.id
  availability_zone       = each.key
  cidr_block              = each.value.private_cidr
  map_public_ip_on_launch = false

  tags = merge(var.tags, {
    Name                                        = "${var.name}-private-${each.key}"
    Tier                                        = "private"
    "kubernetes.io/role/internal-elb"           = "1"
    "kubernetes.io/cluster/${var.cluster_name}" = "shared"
  })
}

# One route table per zone, so each private subnet can point at the NAT
# gateway in its own zone when single_nat_gateway is false.
resource "aws_route_table" "private" {
  for_each = local.zones

  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, { Name = "${var.name}-private-${each.key}" })
}

resource "aws_route" "private_nat" {
  for_each = local.zones

  route_table_id         = aws_route_table.private[each.key].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[var.single_nat_gateway ? local.nat_zones[0] : each.key].id
}

resource "aws_route_table_association" "private" {
  for_each = aws_subnet.private

  subnet_id      = each.value.id
  route_table_id = aws_route_table.private[each.key].id
}
