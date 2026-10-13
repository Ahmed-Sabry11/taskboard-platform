# Evaluation Results

Every acceptance criterion from section 14 of [architecture.md](../architecture.md), with what was measured, where, and whether the target was met.

Measurements were taken on 12 and 13 October 2026. "EKS" means the cluster in `eu-north-1`: Kubernetes 1.36, two `m7i-flex.large` nodes in two Availability Zones, reached through the public load balancer from a laptop in Egypt. "Local" means the kind cluster on that laptop.

## Summary

| Result | Count | Criteria |
|---|---|---|
| Met | 21 | A2, A3, B1, B2, B3, B4, C4, C5, C6, D1, D2, D4, D5, E1, E2, F1, F2, F3, F4, G2, G3 |
| Partly met | 4 | A1, C1, C3, G1 |
| Not met | 1 | F5 |
| Not measured | 3 | C2, D3, E3 |
| **Total** | **29** | |

Four of the eight that are not fully met share one cause: the AWS account used for the project forbids the identity provider that lets a pipeline reach AWS without stored keys. One is the missing domain name. Three were simply not carried out.

## Infrastructure as Code

| ID | Criterion | Target | Measured | Result |
|---|---|---|---|---|
| A1 | Environment built from an empty account state | One workflow run, 25 minutes or less, zero console actions | About 17 minutes from `terraform apply` to the application answering on its public address: 12 for the infrastructure, 1 to install ArgoCD, 2.5 for ArgoCD to deploy everything, 1 for the load balancer. Zero console actions. Run as commands from a laptop, not as one workflow. | Partly met |
| A2 | No drift after apply | `terraform plan` reports zero changes | "No changes", exit code 0, after the apply in each of the two sessions | Met |
| A3 | Clean tear-down | Zero billable project resources remain | After each destroy: 0 clusters, instances, NAT gateways, Elastic IPs, load balancers, volumes, network interfaces, VPCs, log groups, and IAM roles. The image registry and state bucket are kept on purpose. | Met |

A1 is partly met because the AWS account in use forbids the OIDC identity provider that a GitHub workflow needs to reach AWS without stored keys. The time and "no console" parts of the target were met.

## Continuous Integration

| ID | Criterion | Target | Measured | Result |
|---|---|---|---|---|
| B1 | Pull request pipeline duration | 10 minutes or less | 17 successful runs: median 103 seconds, longest 131 seconds | Met |
| B2 | Broken code cannot merge | Blocked | `ci-ok` is a required check. A pull request was held back when its secret scan failed, and merged only after the fix. | Met |
| B3 | Vulnerable image cannot ship | Pipeline fails on a fixable CRITICAL finding | The scan, run before the pipeline was switched on, exited non-zero on both images: 41 HIGH and CRITICAL findings in the frontend image, 4 HIGH in the backend. Both were fixed. The same command, with the same exit-code setting, is the pipeline step. | Met |
| B4 | No static cloud credentials | Zero AWS keys in GitHub | The repository has no secrets configured. No IAM user or access key exists in the account. | Met |

## Continuous Delivery and GitOps

| ID | Criterion | Target | Measured | Result |
|---|---|---|---|---|
| C1 | Merge-to-production lead time | 10 minutes or less | A manifest change reached the cluster 19 seconds after the push (local, with a manual refresh; up to 3 minutes more without). A new image additionally needs `push-images.ps1` run by hand, about 2 minutes. | Partly met |
| C2 | Improvement over manual deployment | At least 70% shorter | Not measured. No timed manual baseline was taken. | Not measured |
| C3 | Manual steps per deployment | Zero | Zero for a configuration change. One for a new application version: running the image push script. | Partly met |
| C4 | Drift correction | Reverted within 3 minutes | Manual scale reverted in 1.5 seconds (EKS). Deleted Service recreated in 4 seconds (local). Changed annotation restored in 0.6 seconds (local). | Met |
| C5 | Rollback | `git revert` restores within 10 minutes | 18 seconds from push to the previous state (local) | Met |
| C6 | Zero-downtime rollout | Under 0.1% failed requests | 0 failed of 305 (EKS). 0 of 245, 0 of 250, 0 of 248 (local). | Met |

C1 and C3 are partly met for the same reason as A1: without the OIDC role, the pipeline cannot push images, so that one step is a script.

## Scaling

| ID | Criterion | Target | Measured on EKS | Measured locally | Result |
|---|---|---|---|---|---|
| D1 | Pod scale-out | 2 to at least 6 replicas within 3 minutes | 6 replicas at 109 seconds, 10 at 164 seconds | 7 at 88 seconds, 10 at 120 seconds | Met |
| D2 | Service quality under peak | p95 under 500 ms, errors under 1% | p95 171 ms, 0 failed of 63,108 | p95 301 ms, 0 failed of 81,936 | Met |
| D3 | Node scale-out | New node within 5 minutes of pods going Pending | Not measured. The account allows two nodes, so there is no third to add, and no node autoscaler was installed. | | Not measured |
| D4 | Scale-in | Back to minimum within 10 minutes | 266 seconds after the load ended | 276 seconds | Met |
| D5 | Correctness under load | No lost writes | 0. Every task created during the test could be read back. | 0 | Met |

The EKS figures include the network path from Egypt to Stockholm, which is why the median response time there (98 ms) is higher than locally (8 ms) while the 95th percentile is lower.

## Resilience

| ID | Criterion | Target | Measured | Result |
|---|---|---|---|---|
| E1 | Pod failure | Under 1% failed requests | 0 failed of 225 with one backend pod deleted under load (EKS) | Met |
| E2 | Node failure | Service stays available, capacity back within 5 minutes | One EC2 instance terminated under load (EKS): 3 failed of 528 (0.57%), all between seconds 20 and 25. Two replicas of each service ready on the surviving node after 30 seconds. Replacement node Ready after about 3 minutes. | Met |
| E3 | Availability over a 2-hour soak | 99.9% or better | Not measured. No external probe was set up and no soak test was run. | Not measured |

E2 was not met on the local cluster: 15 failed of 424 (3.5%) over 44 seconds. The difference is the load balancer. On AWS it runs its own health checks and stops routing to dead targets within seconds. The local cluster relies on Kubernetes noticing the dead node, which takes about 40 seconds.

The first local node drill failed outright (53 of 336 requests, 85 seconds with no backend) because a scale-down had left both backend pods on one node. That led to adding the descheduler. See [autoscaling.md](../autoscaling.md).

## Security

| ID | Criterion | Measured | Result |
|---|---|---|---|
| F1 | No secrets in Git | Gitleaks over the full history reports none, on every pull request | Met |
| F2 | Database unreachable from the internet and from the frontend | No public address anywhere in the private subnets. The frontend's connection to the database is blocked, on both clusters. | Met |
| F3 | Another namespace cannot reach the backend | Blocked, on both clusters | Met |
| F4 | Application pods non-root with read-only root filesystem | Enforced at admission by the `restricted` Pod Security level. UIDs 10001, 101, and 70 observed. | Met |
| F5 | HTTP redirects to HTTPS, TLS 1.2 or higher | The load balancer serves HTTP only. There is no domain name, and a certificate needs one. | Not met |

The network policy test passed 11 of 11 on both clusters. Details are in [security.md](../security.md).

## Observability

| ID | Criterion | Target | Measured | Result |
|---|---|---|---|---|
| G1 | Dashboards | Four, defined in Git, showing live data | One project dashboard with 14 panels, defined in Git, covering all four planned views (service, scaling, resources, delivery) in one place. About 25 cluster dashboards come with the monitoring chart. | Partly met |
| G2 | Alerting | Induced failure raises an alert within 2 minutes | `TaskboardBackendDown` fired 102 seconds after the backend was scaled to zero (local) | Met |
| G3 | Scaling is visible | One graph with request rate, replicas, and latency on a shared timeline | The dashboard panel "Load, replicas and response time". Captured on EKS during the load test. | Met |

## Evidence

Screenshots taken on EKS on 13 October 2026, in [screenshots/](screenshots/).

| File | Shows |
|---|---|
| `aws-app-with-tasks.png` | The application served from the load balancer's public address |
| `aws-grafana-autoscaling.png` | Backend replicas rising from 2 to 10 and returning to 2 |
| `aws-grafana-requests-by-pod.png` | Load shared across the backend pods as they appear |
| `aws-grafana-response-time.png` | Response time percentiles during the load test |
| `aws-grafana-overview.png` | Request rate, error rate, response time, and ready pods |
| `aws-argocd-applications.png` | All seven ArgoCD applications Synced and Healthy, tracking `main` |
| `aws-argocd-taskboard-tree-full.png` | Every resource of the application as ArgoCD sees it |
| `aws-argocd-taskboard-tree-workloads.png` | Deployments, pods, and the database with its volume |
| `aws-argocd-taskboard-tree-network-policies.png` | The Ingress and the seven network policies |
| `aws-console-eks-nodes.png` | Two nodes Ready. The younger one is the replacement created after the node failure drill. |
| `aws-console-load-balancer.png` | The Application Load Balancer: internet-facing, active, in two zones |
| `aws-console-ecr-backend.png`, `aws-console-ecr-frontend.png` | Images tagged with the Git commit they were built from |
| `aws-console-vpc-resource-map.png` | The VPC: public and private subnets in two zones, route tables, gateways |

The gap in the Grafana graphs at about 13:15 is the node failure drill: the pod that reports replica counts was on the terminated node and was rescheduled.

Raw load test output is written to `loadtest/results/`, which is not committed.

## What was not achieved, and why

| Item | Reason |
|---|---|
| HTTPS (F5) | No domain name |
| Fully automated release (A1, C1, C3) | The AWS free plan account forbids OIDC identity providers. The Terraform module for the role exists and is plan-tested. |
| Manual deployment baseline (C2) | Not done |
| Node auto-scaling (D3) | The account's quota allows two nodes |
| Soak test and external uptime probe (E3) | Not done |

## Cost of the evaluation

Two sessions on AWS, each ended with a destroy and a check that nothing billable remained.

| | |
|---|---|
| Credits at the start | 100.00 USD, later 120.00 after an activity bonus |
| Cost of the first session, about 1.5 hours | 0.56 USD |
| Cost of the second session, about 1.5 hours | Not yet shown by AWS when this was written. Expected to be similar. |
| Hourly rate while the environment exists | about 0.40 USD |
| Kept between sessions | Image registry and state bucket, about 0.10 USD a month |
