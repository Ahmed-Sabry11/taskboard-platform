terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Remote state. The bucket and region come from infra/backend.hcl:
  #   terraform init -backend-config=../../backend.hcl
  backend "s3" {
    key     = "persistent/terraform.tfstate"
    encrypt = true

    # Locking with a lock file in the same bucket: two people (or a person and
    # a pipeline) cannot change this stack at the same time.
    use_lockfile = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project    = var.project
      ManagedBy  = "terraform"
      Stack      = "persistent"
      Repository = var.github_repository
    }
  }
}
