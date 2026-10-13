# Security

Every security control in the project, by layer, with where it is defined and how it was verified. Controls that could not be demonstrated are listed at the end with the reason.

## Summary

| Layer | Main controls |
|---|---|
| Source code and repository | No secrets in Git, protected `main`, secret scanning on every push |
| Build | Vulnerability scan blocks images with fixable HIGH or CRITICAL findings |
| Container images | Non-root, no package manager or build tools, minimal contents |
| Kubernetes workloads | Restricted Pod Security, read-only filesystems, no capabilities, no API token |
| Network inside the cluster | Default deny, only the application's own paths are open |
| AWS network | Nodes in private subnets, one public entry point, security groups limited to two ports |
| AWS identity | Least-privilege roles, no long-lived keys, per-controller roles |
| Delivery | Pull-based GitOps: nothing outside the cluster holds credentials for it |
| Data | Secrets encrypted with KMS, encrypted volumes, encrypted and private Terraform state |

## 1. Repository and secrets

| Control | Where | Verified by |
|---|---|---|
| Credentials, state, and env files cannot be committed | `.gitignore`, `.githooks/pre-commit` | A forced `.env`, a fake AWS key, a private key header, and a password in a URL were each rejected |
| Full-history secret scan on every pull request | Gitleaks job in `.github/workflows/ci.yml` | It stopped a real pull request over a credential-shaped placeholder, which was then removed from history |
| Server-side push protection | GitHub secret scanning and push protection | Enabled on the repository |
| `main` cannot be pushed to directly, even by administrators | Branch protection, required check `ci-ok` | A direct push was rejected with "Changes must be made through a pull request" |
| Database password never in Git | Created with `kubectl` from a git-ignored file | Repository contains only `*.example` templates |
| Grafana does not use its well-known default password | `existingSecret` in `deploy/monitoring/stack/values-local.yaml` | Login with the chart default was refused (HTTP 401) |

## 2. Build and supply chain

| Control | Where | Verified by |
|---|---|---|
| Images scanned before use | Trivy in CI, failing on fixable HIGH or CRITICAL | First scan found 41 findings in the frontend image and 4 in the backend image. Both now scan clean. |
| Configuration scanned | Trivy on Dockerfiles, manifests, and Terraform | No HIGH or CRITICAL. Three exceptions are marked in the code with reasons. |
| Dependencies kept current | `.github/dependabot.yml`, Dependabot alerts | 4 alerts (2 critical, in test tooling) resolved by upgrading. `npm audit` reports 0. |
| Reproducible builds | `package-lock.json`, `.terraform.lock.hcl`, pinned chart and action versions | Actions are pinned to commit SHAs |
| Image tags cannot be overwritten | ECR immutable tags, images tagged with the Git commit | Verified on the repositories |

## 3. Containers and pods

| Control | Where | Verified by |
|---|---|---|
| No container runs as root | Dockerfiles, pod `securityContext` | UIDs observed in running pods: backend 10001, frontend 101, PostgreSQL 70 |
| Read-only root filesystem | All application and database pods | Writing to the filesystem inside the backend and database containers failed with "Read-only file system". The frontend has the same setting, not separately tested. |
| No Linux capabilities, no privilege escalation, default seccomp | Pod `securityContext` | Enforced at admission by the namespace's `restricted` Pod Security level |
| No Kubernetes API token in pods | `automountServiceAccountToken: false` | In every workload |
| Runtime image has no build tooling | Multi-stage builds, pip removed | Backend image has no pip. Frontend image has no Node.js. |
| CPU and memory limits on every container | Deployments, StatefulSet, Job | In every workload |

## 4. Network inside the cluster

Defined in `deploy/apps/taskboard/base/network-policies.yaml`. Everything is denied by default, then four paths are opened.

```
 visitors ──► frontend ──► backend ──► database
                              ▲
                         Prometheus
```

Verified with `scripts/network-policy-test.ps1`, 11 of 11 checks, on the local cluster and on EKS. The two clusters enforce policies with different network plugins, and the results were identical:

| Connection | Result |
|---|---|
| frontend → backend | allowed |
| backend → database | allowed |
| any namespace → frontend (the public entry) | allowed |
| frontend → database | **blocked** |
| backend → frontend | blocked |
| database → backend | blocked |
| frontend, backend, database → internet | blocked |
| another namespace → backend | blocked |
| another namespace → database | blocked |

Before the policies existed, the same test showed the frontend could open a connection to the database.

Also checked after applying them: the smoke test still passes, Prometheus still scrapes both backend pods, and a full rollout under load lost no requests.

Other points:

- Backend metrics are served at `/metrics`, outside `/api`. The frontend proxy and the load balancer forward only `/api`, and the smoke test confirms the metrics are not reachable from outside.
- ArgoCD, Grafana, Prometheus, and Alertmanager have no public address. They are reached through `kubectl port-forward`.

## 5. AWS network and identity

Defined in `infra/`. Applied and verified in `eu-north-1`.

| Control | Verified by |
|---|---|
| Worker nodes in private subnets, with no public addresses | Node list showed private addresses only |
| One NAT gateway for outbound traffic, nothing inbound | Route tables |
| Load balancer accepts 80 and 443, and can reach only pod ports 8080 and 8000 | Security group rules, and the load balancer's targets were healthy using them |
| The VPC's default security group has no rules | `aws_default_security_group` |
| Kubernetes API reachable from one address only, and private inside the VPC | Cluster endpoint configuration read back after apply |
| Kubernetes Secrets encrypted with an account-owned KMS key with rotation | Cluster encryption configuration read back after apply |
| Control plane audit logs, kept 7 days | Enabled log types read back after apply |
| Node role can pull images but not push or delete | Attached policies: worker node, CNI, and `AmazonEC2ContainerRegistryPullOnly` |
| Each controller has its own role, usable by one service account | EKS Pod Identity associations for the storage driver and the load balancer controller |
| Pods cannot reach the instance metadata service | IMDSv2 required with a hop limit of 1 on the nodes |
| No IAM users and no long-lived access keys | None are created. Operators sign in through the browser for short-lived credentials. |
| Terraform state encrypted, versioned, private, TLS only, locked | Bucket configuration in `infra/stacks/state-backend` |
| Database volume encrypted | Default StorageClass sets `encrypted: "true"` |

## 6. Delivery

| Control | Effect |
|---|---|
| Pull-based GitOps | ArgoCD, inside the cluster, pulls from Git. The CI system has no credentials for the cluster and cannot deploy. |
| ArgoCD projects | The application can be built only from this repository and deployed only into its own namespace |
| Self-heal | A change made directly in the cluster is reverted within seconds |
| CI has read-only repository permissions and no cloud credentials | `permissions: contents: read` in the workflow |

## Acceptance criteria

From section 14 of [architecture.md](architecture.md).

| ID | Criterion | Result |
|---|---|---|
| F1 | No secrets in Git | Met. Gitleaks over the full history reports none. |
| F2 | Database unreachable from the internet and from the frontend pod | Met. Private subnets and no public address, and the frontend's connection attempt is blocked. |
| F3 | A pod in another namespace cannot reach the backend | Met. Blocked in the connectivity test. |
| F4 | All application pods run non-root with a read-only root filesystem | Met. Enforced at admission and observed in running pods. |
| F5 | HTTP redirects to HTTPS, TLS 1.2 or higher | **Not met.** There is no domain name, so no certificate. The load balancer serves HTTP. |
| B4 | No static cloud credentials in GitHub | Met. The repository has no AWS secrets. |

## Not demonstrated, and why

| Item | Reason | What it would take |
|---|---|---|
| HTTPS | No domain name | A domain, an ACM certificate, a 443 listener, and a redirect from 80 |
| CI pushing images through OIDC | The AWS account's policy forbids OIDC identity providers | A standard AWS account. The Terraform module exists and is plan-tested. |
| Secrets from a secrets manager | Database credentials are created with one `kubectl` command | External Secrets Operator with AWS Secrets Manager |
| Application authentication | Out of scope for the demo workload | The API is open to anyone who can reach it |
| VPC flow logs | Left off to save cost | One Terraform resource |
| Images pinned by digest | Pinned by tag | Dependabot's Docker updates can maintain digests |
