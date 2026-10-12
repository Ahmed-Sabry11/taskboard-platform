# Contributing

How we work in this repository: one-time setup, branching, commit messages, pull requests, and the rules that keep secrets out of Git.

## One-time setup after cloning

```powershell
git config core.hooksPath .githooks
Copy-Item .env.example .env
Copy-Item deploy/apps/taskboard/overlays/local/secrets.env.example deploy/apps/taskboard/overlays/local/secrets.env
```

The first command turns on the repository's Git hooks. It is per clone, so every team member runs it once. Then set your own password in `.env` and `secrets.env`.

## Branching strategy

Trunk-based development with short-lived branches (GitHub Flow).

```
main      ●────●────────●────────●──────►   always deployable, protected
               \       / \      /
feat/...        ●──●──●   ●──●─●            one change, a few days at most
```

- **`main` is the single source of truth.** It always builds and passes tests. With GitOps this matters more than usual: ArgoCD deploys whatever `main` says, so a commit on `main` *is* a deployment.
- **No direct pushes to `main`.** Every change arrives through a pull request.
- **Branches are short-lived.** Open one per change, merge within a few days, delete it after merging. Long-running branches drift and cause conflicts.
- **No `develop` or release branches.** There is one environment on AWS, so extra branches would add process without adding safety.

### Branch names

`<type>/<short-description>`, lowercase, words joined with hyphens. The type is the same as the commit type.

| Example | Purpose |
|---|---|
| `feat/hpa-backend` | New capability |
| `fix/readyz-timeout` | Bug fix |
| `infra/vpc-module` | Terraform work |
| `ci/pr-pipeline` | Workflow changes |
| `docs/runbook-rollback` | Documentation only |

### Lifecycle of a change

```powershell
git switch main
git pull
git switch -c feat/short-description

# work, then commit in small steps
git add <files>
git commit -m "feat(backend): add due-date filter to task list"

git push -u origin feat/short-description
```

Open a pull request on GitHub, wait for the checks and a review, then **squash and merge**. Squashing gives `main` one commit per change, which keeps history readable and makes `git revert` a clean rollback.

After merging:

```powershell
git switch main
git pull
git branch -d feat/short-description
```

### Who else commits to `main`

The CI pipeline commits image tag updates under `deploy/apps/taskboard/overlays/aws` after each successful build. These commits use the `ci(deploy):` prefix and are the only automated writes to the repository.

### Milestone tags

Each completed milestone from the architecture document is tagged, so the state submitted for evaluation can always be reproduced:

```powershell
git tag -a m3-local-kubernetes -m "Milestone 3: application runs on a local cluster"
git push origin m3-local-kubernetes
```

## Commit conventions

[Conventional Commits](https://www.conventionalcommits.org). The `commit-msg` hook rejects messages that do not match.

```
<type>(<scope>): <summary>

<optional body: what changed and why, wrapped at 72 characters>

<optional footer: Refs #12, BREAKING CHANGE: ...>
```

| Type | Use for |
|---|---|
| `feat` | A new capability |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `test` | Adding or correcting tests |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `build` | Dockerfiles, dependencies, build tooling |
| `ci` | GitHub Actions workflows |
| `chore` | Maintenance that fits nothing above |
| `style` | Formatting only |
| `revert` | Reverting an earlier commit |

| Scope | Covers |
|---|---|
| `frontend` | `app/frontend` |
| `backend` | `app/backend` |
| `infra` | `infra` (Terraform) |
| `deploy` | `deploy` (Kubernetes manifests, ArgoCD) |
| `ci` | `.github/workflows` |
| `docs` | `docs`, README files |
| `repo` | Repository tooling: hooks, ignore rules, editor config |
| `deps` | Dependency updates |

Rules for the subject line:

- Imperative mood: "add", not "added" or "adds".
- Lowercase after the colon, no trailing period.
- 72 characters or fewer.
- Add `!` before the colon for a breaking change: `feat(backend)!: rename status values`.

Good examples:

```
feat(deploy): add horizontal pod autoscaler for backend
fix(backend): return 422 for task ids above the integer range
feat(infra): add vpc module with three subnet tiers
ci: fail pull requests on critical image vulnerabilities
docs: add rollback runbook
build(deps): update fastapi to 0.136
```

The scope is optional. Leave it out when the type already says it (`ci:`, `docs:`). Note that `infra` and `deploy` are scopes, not types: a Terraform change is `feat(infra):` or `fix(infra):`.

One logical change per commit. A commit that touches both Terraform and the application is usually two commits.

## Pull requests

- Keep them small. Under about 400 changed lines is reviewable; beyond that, split.
- The title follows the commit convention, because it becomes the squashed commit message.
- Fill in the template: what changed, why, and how it was tested.
- All checks must pass, and one team member must approve.
- For `infra/` changes, read the Terraform plan posted on the pull request before approving.

## Keeping secrets out of Git

Three layers protect the repository. None of them replaces care.

| Layer | What it does | Where |
|---|---|---|
| `.gitignore` | Keeps env files, Terraform state and variables, keys, and kubeconfigs untracked | `.gitignore` |
| `pre-commit` hook | Rejects commits containing forbidden file names or secret-looking content, including files forced in with `git add -f` | `.githooks/pre-commit` |
| Server-side scanning | Blocks pushes containing known credential formats, and scans every pull request | GitHub push protection, and Gitleaks in the CI pipeline |

Rules:

1. **Never commit** `.env`, `secrets.env`, `*.tfvars`, `*.tfstate`, private keys, kubeconfigs, or AWS credential files.
2. **Commit templates instead.** Files ending in `.example` hold variable names and placeholder values only.
3. **Terraform state lives in S3**, never on a laptop for long and never in Git. State contains generated passwords in plain text.
4. **No long-lived AWS keys anywhere.** GitHub Actions authenticates to AWS through OIDC. On your machine use `aws configure sso` or short-lived credentials.
5. **Do not bypass the hook** with `--no-verify`. If it flags something that is not a secret, end that line with a `secret-scan:allow` comment so the exception is visible in review.

Check whether Git would ignore a file, and which rule applies:

```powershell
git check-ignore -v .env
```

See exactly what a commit would include before making it:

```powershell
git status --short
git diff --cached --stat
```

### If a secret is committed anyway

Assume it is compromised from the moment it is pushed. Deleting the file in a later commit does not help, because the value stays in history.

1. **Rotate the secret immediately.** Revoke the key or change the password at its source. This is the step that actually fixes the problem.
2. Tell the team.
3. Remove it from history with `git filter-repo`, then force-push, and have everyone re-clone.
4. Check the provider's access logs for use of the leaked credential.

## Before opening a pull request

```powershell
docker compose up -d --build
.\scripts\smoke-test.ps1
docker compose --profile test run --rm --build backend-tests
docker compose --profile test run --rm --build frontend-tests
```

For changes under `deploy/`, also render the manifests:

```powershell
kubectl kustomize deploy/apps/taskboard/overlays/local
```
