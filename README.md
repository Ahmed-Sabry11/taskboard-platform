# TaskBoard Platform

Graduation project GPJ2617: **Design and Implementation of a Secure, Auto-Scaling Multi-Service Infrastructure Using GitOps and Kubernetes**.

The deliverable is the platform: infrastructure as code, a CI pipeline, GitOps delivery, auto-scaling, and observability. TaskBoard, a small task-management application, is the workload that the platform builds, deploys, scales, and recovers.

| Layer | Technology |
|---|---|
| Application | React, FastAPI, PostgreSQL |
| Containers | Docker, Docker Compose |
| Orchestration | Kubernetes (kind locally, Amazon EKS on AWS), Kustomize |
| Infrastructure as code | Terraform |
| Continuous integration | GitHub Actions |
| Continuous delivery | ArgoCD (GitOps) |
| Observability | Prometheus, Grafana |

## Status

| # | Milestone | State |
|---|---|---|
| M0 | Repository, conventions, safeguards | Done |
| M1 | Application with tests | Done |
| M2 | Containers and CI pipeline | Done |
| M3 | Local Kubernetes and GitOps with ArgoCD | Done |
| M4 | AWS infrastructure with Terraform | Done. Applied and verified in `eu-north-1` |
| M5 | GitOps on EKS | Done. Application served through a public load balancer, deployed by ArgoCD |
| M6 | Observability | Done on the local cluster |
| M7 | Auto-scaling and resilience | Done on the local cluster. Measurement on EKS pending |
| M8 | Hardening and evaluation | Not started |

Milestones are defined in [docs/architecture.md](docs/architecture.md).

## Quick start

Requires Docker Desktop. Commands are for Windows PowerShell, run from the repository root.

```powershell
git config core.hooksPath .githooks
Copy-Item .env.example .env
docker compose up -d --build
```

Set your own `POSTGRES_PASSWORD` in `.env` before the last command. Then open http://127.0.0.1:8080.

Check that everything works:

```powershell
.\scripts\smoke-test.ps1
docker compose --profile test run --rm --build backend-tests
docker compose --profile test run --rm --build frontend-tests
```

Stop with `docker compose down`. Add `-v` to also delete the database.

## Repository structure

```
taskboard-platform/
├── app/                          Application source
│   ├── backend/                  FastAPI service
│   │   ├── app/                  Source: routers, models, schemas, settings
│   │   ├── migrations/           Alembic database migrations
│   │   ├── tests/unit/           Tests that need no database
│   │   ├── tests/integration/    Tests against real PostgreSQL
│   │   └── Dockerfile
│   └── frontend/                 React single-page app
│       ├── src/                  Source, with *.test.ts(x) beside the code
│       ├── nginx/                Web server configuration
│       └── Dockerfile
│
├── infra/                        Terraform: everything that exists in AWS
│   ├── modules/                  Reusable building blocks (network, iam, github-oidc, ecr, eks, security)
│   └── stacks/                   Deployable units, each with its own state
│       ├── state-backend/        S3 bucket for Terraform state
│       ├── persistent/           ECR and the GitHub OIDC role
│       └── platform/             VPC and EKS (created and destroyed per session)
│
├── deploy/                       Kubernetes: everything that runs in a cluster
│   ├── apps/taskboard/
│   │   ├── base/                 Manifests shared by all environments
│   │   └── overlays/
│   │       ├── local/            kind: in-cluster PostgreSQL, NodePort
│   │       └── aws/              EKS: ECR images, RDS, Ingress
│   ├── argocd/                   GitOps: root application and child Applications
│   ├── platform/                 Cluster add-ons (load balancer controller, autoscaler)
│   ├── monitoring/               Prometheus stack, dashboards, alert rules
│   └── local/                    kind cluster definition, debug pod
│
├── .github/
│   ├── workflows/                CI pipelines
│   └── pull_request_template.md
├── .githooks/                    Git hooks: secret blocking, commit message format
├── scripts/                      Developer and operations scripts
├── loadtest/                     k6 load test scenarios
├── docker/                       Supporting files for local containers
├── docs/                         Architecture, guides, decision records, evaluation
│
├── docker-compose.yml            Local development stack
├── .env.example                  Template for local settings
├── CONTRIBUTING.md               Branching, commits, pull requests, secret handling
└── README.md
```

Directories for milestones that have not started contain a README describing what will go there.

The top-level split follows ownership:

| Directory | Changes when | Applied by |
|---|---|---|
| `app/` | Application behaviour changes | CI builds an image |
| `infra/` | AWS resources change | Terraform |
| `deploy/` | What runs in the cluster changes | ArgoCD |

Keeping these apart means each pipeline runs only for its own directory, and a reviewer can tell from the path what a change can affect.

## Documentation

| Document | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Full design: components, networking, security, CI/CD, GitOps, scaling, decision records, acceptance criteria |
| [docs/local-development.md](docs/local-development.md) | Docker Compose in depth: build, test, networking, volumes, configuration, API, troubleshooting |
| [docs/kubernetes-local.md](docs/kubernetes-local.md) | Deploying to a local kind cluster: inspect, logs, network tests, troubleshooting |
| [docs/gitops-local.md](docs/gitops-local.md) | ArgoCD on the local cluster: app of apps, sync order, drift correction, rollback |
| [docs/gitops-aws.md](docs/gitops-aws.md) | Deploying to EKS: load balancer, storage, bring-up and tear-down order, measurements |
| [docs/autoscaling.md](docs/autoscaling.md) | Autoscaler settings, load tests, failure drills, and measured results |
| [docs/observability.md](docs/observability.md) | Prometheus and Grafana: metrics, dashboard, alerts, and how each was verified |
| [docs/infrastructure.md](docs/infrastructure.md) | Terraform on AWS: architecture, prerequisites, cost estimate, billable resources, deploy and destroy steps |
| [.github/workflows/README.md](.github/workflows/README.md) | What the CI pipeline checks and when each job runs |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Branching strategy, commit conventions, pull requests, keeping secrets out of Git |

## Working in this repository

- `main` is protected and always deployable. Changes arrive through pull requests from short-lived branches.
- Commit messages follow Conventional Commits, for example `feat(backend): add due-date filter`.
- Credentials, Terraform state, and local environment files are never committed. `.gitignore` and a pre-commit hook enforce this.

Details are in [CONTRIBUTING.md](CONTRIBUTING.md).
