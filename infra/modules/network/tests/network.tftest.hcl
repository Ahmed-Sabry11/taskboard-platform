# Mocked plan: no credentials needed, nothing created.  terraform test

mock_provider "aws" {}

variables {
  name                 = "taskboard-test"
  cluster_name         = "taskboard-test"
  vpc_cidr             = "10.0.0.0/16"
  availability_zones   = ["us-east-1a", "us-east-1b"]
  public_subnet_cidrs  = ["10.0.0.0/24", "10.0.1.0/24"]
  private_subnet_cidrs = ["10.0.16.0/20", "10.0.32.0/20"]
}

run "two_zones_with_one_nat_gateway" {
  command = plan

  assert {
    condition     = length(aws_subnet.public) == 2 && length(aws_subnet.private) == 2
    error_message = "Expected one public and one private subnet per zone."
  }

  assert {
    condition     = length(aws_nat_gateway.this) == 1 && length(aws_eip.nat) == 1
    error_message = "Expected a single NAT gateway and address by default."
  }

  assert {
    condition     = length(aws_route_table.private) == 2
    error_message = "Each private subnet must have its own route table."
  }
}

run "nothing_gets_a_public_address_automatically" {
  command = plan

  assert {
    condition     = alltrue([for subnet in aws_subnet.public : subnet.map_public_ip_on_launch == false])
    error_message = "Public subnets must not hand out public addresses automatically."
  }

  assert {
    condition     = alltrue([for subnet in aws_subnet.private : subnet.map_public_ip_on_launch == false])
    error_message = "Private subnets must never hand out public addresses."
  }
}

run "subnets_are_tagged_for_kubernetes_load_balancers" {
  command = plan

  assert {
    condition     = alltrue([for subnet in aws_subnet.public : subnet.tags["kubernetes.io/role/elb"] == "1"])
    error_message = "Public subnets must be tagged for internet-facing load balancers."
  }

  assert {
    condition     = alltrue([for subnet in aws_subnet.private : subnet.tags["kubernetes.io/role/internal-elb"] == "1"])
    error_message = "Private subnets must be tagged for internal load balancers."
  }
}

run "one_nat_gateway_per_zone_when_requested" {
  command = plan

  variables {
    single_nat_gateway = false
  }

  assert {
    condition     = length(aws_nat_gateway.this) == 2
    error_message = "Expected one NAT gateway per Availability Zone."
  }
}

run "rejects_a_single_zone" {
  command = plan

  variables {
    availability_zones   = ["us-east-1a"]
    public_subnet_cidrs  = ["10.0.0.0/24"]
    private_subnet_cidrs = ["10.0.16.0/20"]
  }

  expect_failures = [var.availability_zones]
}

run "rejects_an_invalid_vpc_range" {
  command = plan

  variables {
    vpc_cidr = "10.0.0.0/40"
  }

  expect_failures = [var.vpc_cidr]
}
