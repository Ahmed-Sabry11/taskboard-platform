# GitHub Actions Workflows

**Status:** not started. This file describes the planned workflows (Milestone 2 onwards).

| Workflow | Trigger | Does |
|---|---|---|
| `pr.yml` | Pull request | Lint, tests, image build, vulnerability and secret scans, Terraform plan, manifest validation. Jobs run only for the directories that changed. |
| `release.yml` | Push to `main` | Builds images tagged with the commit SHA, scans them, pushes to ECR, then commits the new tag to `deploy/apps/taskboard/overlays/aws`. |
| `infra-up.yml` | Manual, with approval | `terraform apply` for the platform and bootstrap stacks. |
| `infra-down.yml` | Manual, with approval | Removes ArgoCD applications, then `terraform destroy`. |

## Rules

- **No AWS keys in GitHub secrets.** Workflows assume an IAM role through OIDC and receive short-lived credentials.
- **Least privilege.** Each workflow declares the `permissions` it needs and nothing more.
- **Pin actions** to a full commit SHA, not a moving tag.
- **CI never talks to the cluster.** It writes to Git, and ArgoCD deploys.
