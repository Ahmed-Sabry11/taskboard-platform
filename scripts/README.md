# Scripts

| Script | Purpose |
|---|---|
| `smoke-test.ps1` | Checks a running stack end to end: health endpoints, a full CRUD cycle, validation, security headers, non-root users, network isolation. Works against Docker Compose and, with `-SkipComposeChecks`, against Kubernetes. |
| `check-repo-safety.ps1` | Confirms the Git hooks are enabled and that no credential, state, or local environment file is tracked. Run it after cloning and before the first push. |

Scripts are PowerShell because the team develops on Windows. Anything that must also run in CI is written as a workflow step instead.
