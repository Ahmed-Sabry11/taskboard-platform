# Infrastructure (Terraform)

Everything that exists in AWS is defined here. Nothing is created by hand in the console.

**Status:** not started. This file describes the planned layout (Milestone 4).

## Planned layout

```
infra/
├── modules/                 Reusable building blocks, no state of their own
│   ├── network/             VPC, subnets, NAT gateway, route tables
│   ├── eks/                 Cluster, node group, add-ons, access entries
│   ├── rds/                 PostgreSQL instance, subnet group, security group
│   ├── ecr/                 Image repositories and lifecycle rules
│   └── iam/                 GitHub OIDC role, pod identity roles
└── stacks/                  Deployable units, each with its own remote state
    ├── persistent/          State bucket, ECR, OIDC role, budget alarm
    ├── platform/            VPC, EKS, RDS
    └── bootstrap/           ArgoCD and the root Application
```

| Stack | Lifetime | Why it is separate |
|---|---|---|
| `persistent` | Created once, kept | Costs almost nothing. Holds the state bucket and image registry the others depend on. |
| `platform` | Created per work session, destroyed after | Holds everything expensive. |
| `bootstrap` | Follows `platform` | Its providers need a cluster that already exists. |

## Rules

- **State is remote.** Each stack stores its state in the S3 bucket created by `persistent`, encrypted and versioned. State files contain generated passwords in plain text and must never be committed.
- **No secrets in variables files.** Commit `terraform.tfvars.example` with placeholders. Real `*.tfvars` files are git-ignored.
- **Commit `.terraform.lock.hcl`.** It pins provider versions so every run uses the same ones.
- **Plan before apply.** Pull requests show the plan. Applying happens from a workflow that needs approval.

`.gitignore` and the pre-commit hook block `*.tfstate`, `*.tfvars`, `*.tfplan`, and the `.terraform/` directory.
