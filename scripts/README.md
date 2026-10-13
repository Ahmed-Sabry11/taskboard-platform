# Scripts

| Script | Purpose |
|---|---|
| `smoke-test.ps1` | Checks a running stack end to end: health endpoints, a full CRUD cycle, validation, security headers, non-root users, network isolation. Works against Docker Compose and, with `-SkipComposeChecks`, against Kubernetes. |
| `rollout-availability-test.ps1` | Sends steady traffic while Kubernetes replaces every backend and frontend pod, and reports how many requests failed. Evidence for the zero-downtime acceptance criterion. |
| `push-images.ps1` | Builds both images, tags them with the current Git commit, and pushes them to ECR. Stands in for the release pipeline, which the AWS account's restrictions rule out. |
| `argocd-pause-sync.json` | Patch that turns off automatic sync on an ArgoCD Application, for experiments that ArgoCD would otherwise undo. Usage is in [docs/observability.md](../docs/observability.md). |
| `check-repo-safety.ps1` | Confirms the Git hooks are enabled and that no credential, state, or local environment file is tracked. Run it after cloning and before the first push. |

Scripts are PowerShell because the team develops on Windows. Anything that must also run in CI is written as a workflow step instead.
