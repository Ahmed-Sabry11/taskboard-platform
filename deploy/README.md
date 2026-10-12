# Deployment (Kubernetes and GitOps)

Everything that runs inside a cluster is defined here. On AWS, ArgoCD watches this directory and makes the cluster match it.

## Layout

```
deploy/
├── apps/taskboard/
│   ├── base/                Manifests shared by all environments
│   └── overlays/
│       ├── local/           kind: in-cluster PostgreSQL, NodePort access
│       └── aws/             EKS: ECR images, RDS, Ingress (planned, Milestone 5)
├── argocd/
│   ├── install/             ArgoCD itself, pinned version (local cluster)
│   ├── root/                Root application per environment, applied once by hand
│   └── apps/local/          Applications and projects that the root application creates
├── platform/                Cluster add-ons with pinned chart versions (planned, Milestone 5)
├── monitoring/
│   ├── stack/               Settings for the Prometheus and Grafana chart
│   └── taskboard/           What to scrape, alert rules, and the dashboard for TaskBoard
└── local/                   kind cluster definition and a debug pod
```

| Path | State |
|---|---|
| `apps/taskboard/base`, `overlays/local`, `local` | In use. See [docs/kubernetes-local.md](../docs/kubernetes-local.md). |
| `argocd` | In use on the local cluster. See [docs/gitops-local.md](../docs/gitops-local.md). |
| `monitoring` | In use on the local cluster. See [docs/observability.md](../docs/observability.md). |
| `overlays/aws`, `platform` | Not created yet |

## Rules

- **Git is the source of truth.** On AWS nobody runs `kubectl apply`. A change is deployed by merging it to `main`.
- **The base never names an environment.** Anything that differs between local and AWS belongs in an overlay.
- **No Secret manifests.** Locally the Secret is created with `kubectl` from the git-ignored `secrets.env`. On AWS it comes from AWS Secrets Manager through External Secrets. Git holds references only.
- **Image tags in `overlays/aws` are written by CI.** Do not edit them by hand.
- **Pin versions.** Third-party charts are referenced by exact version.

Render an overlay to see exactly what would be applied:

```powershell
kubectl kustomize deploy/apps/taskboard/overlays/local
```
