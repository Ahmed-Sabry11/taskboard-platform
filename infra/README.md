# Infrastructure (Terraform)

Everything that exists in AWS is defined here. Nothing is created by hand in the console.

**Status:** code complete, validated, and plan-tested against a mocked provider. Not yet applied to an AWS account.

Design, costs, and step-by-step commands are in [docs/infrastructure.md](../docs/infrastructure.md). Read its cost section before running `terraform apply`.

## Layout

```
infra/
├── backend.hcl.example      Where state is stored (copy to backend.hcl)
├── modules/                 Reusable building blocks, no state of their own
│   ├── network/             VPC, subnets, internet and NAT gateways, routes
│   ├── iam/                 Cluster and node roles, or reuse of existing ones
│   ├── github-oidc/         Keyless access for GitHub Actions
│   ├── ecr/                 Image repositories
│   ├── eks/                 Cluster, add-ons, node group, KMS key, logs
│   └── security/            Load balancer security group and rules
└── stacks/                  Deployable units, each with its own state
    ├── state-backend/       The S3 state bucket
    ├── persistent/          ECR and the GitHub Actions role
    └── platform/            Network and cluster
```

| Stack | Lifetime | Cost | Why it is separate |
|---|---|---|---|
| `state-backend` | Once per account | Negligible | The bucket must exist before any other stack can store state in it |
| `persistent` | Kept between sessions | About 0.10 USD a month | Images survive while the cluster is destroyed |
| `platform` | Created per work session, destroyed after | About 0.24 USD an hour | Holds everything expensive |

## Rules

- **State is remote and locked.** Each stack stores its state in S3, encrypted and versioned, with a lock file. State files contain generated secrets in plain text and must never be committed.
- **No secrets in variable files.** Commit `terraform.tfvars.example` with placeholders. Real `*.tfvars` and `backend.hcl` are git-ignored.
- **Commit `.terraform.lock.hcl`** in each stack. It pins provider versions so every run uses the same ones.
- **Plan, read, then apply.** Save the plan with `-out=tfplan` and apply that file, so what runs is exactly what was reviewed.
- **Modules do not configure providers or backends.** Only stacks do.

`.gitignore` and the pre-commit hook block `*.tfstate`, `*.tfvars`, `*.tfplan`, `backend.hcl`, and the `.terraform/` directory.

## Check your changes

```powershell
terraform fmt -recursive infra
terraform -chdir=infra/stacks/platform init -backend=false
terraform -chdir=infra/stacks/platform validate
terraform -chdir=infra/stacks/platform test
```

None of these contact AWS.
