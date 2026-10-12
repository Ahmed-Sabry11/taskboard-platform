# GitHub Actions Workflows

| Workflow | Trigger | State |
|---|---|---|
| `ci.yml` | Pull request, and push to `main` | In use |
| `release.yml` | Push to `main` | Planned (Milestone 5): build images tagged with the commit SHA, push to ECR, commit the new tag to `deploy/apps/taskboard/overlays/aws` |
| `infra-up.yml` | Manual, with approval | Planned (Milestone 4): `terraform apply` |
| `infra-down.yml` | Manual, with approval | Planned (Milestone 4): remove ArgoCD applications, then `terraform destroy` |

## ci.yml

| Job | Runs when these change | Checks |
|---|---|---|
| Secret scan | Always | Gitleaks over the full Git history |
| Backend lint and tests | `app/backend`, Compose files | Ruff, unit tests, integration tests against PostgreSQL |
| Frontend typecheck and tests | `app/frontend`, Compose files | TypeScript, unit and integration tests |
| Build, scan and smoke-test images | `app`, Compose files, smoke test | Production image build, Trivy scan for fixable HIGH and CRITICAL vulnerabilities, full stack start, `scripts/smoke-test.ps1` |
| Validate Dockerfiles and Kubernetes manifests | `deploy`, Dockerfiles | Trivy configuration scan, Kustomize render, schema validation with kubeconform |
| `ci-ok` | Always | Passes only if every job above passed or was skipped |

`ci-ok` is the one required status check on `main`. Requiring the individual jobs would leave a pull request stuck whenever a job is skipped because its files did not change.

The jobs use the same Docker Compose targets as local development, so a failure in CI can be reproduced with the commands in [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Rules

- **No AWS keys in GitHub secrets.** Workflows that need AWS assume an IAM role through OIDC and receive short-lived credentials.
- **Least privilege.** Each workflow declares the `permissions` it needs and nothing more. `ci.yml` has read-only access.
- **Pin actions** to a full commit SHA, with the version in a comment.
- **Pin tool versions.** Scanner images are referenced by exact version in the workflow's `env` block.
- **CI never talks to the cluster.** It writes to Git, and ArgoCD deploys.
