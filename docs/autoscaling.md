# Auto-scaling and Resilience

How the platform reacts to load and to failures, and what was measured.

Commands are for Windows PowerShell, run from the repository root.

## What does the work

| Mechanism | Defined in | What it does |
|---|---|---|
| Horizontal Pod Autoscaler | `deploy/apps/taskboard/base/autoscaling.yaml` | Adds backend pods when average CPU passes 60% of the request, up to 10. Removes them when load falls. Never fewer than 2. |
| metrics-server | ArgoCD application locally, managed add-on on EKS | Supplies each pod's current CPU to the autoscaler |
| Topology spread | The Deployments | Places replicas on different nodes when they are scheduled |
| Descheduler | `deploy/argocd/apps/*/descheduler.yaml` | Every two minutes, moves a pod if replicas have ended up crowded on one node |
| Pod Disruption Budget | `deploy/apps/taskboard/base/disruption-budgets.yaml` | During a planned node drain, keeps at least one replica of each service running |
| Tolerations | The Deployments | Reschedules pods 30 seconds after their node stops responding, instead of the default 5 minutes |
| Readiness and `preStop` | The Deployments | No traffic to a pod that is not ready or is shutting down |

### Scaling settings

| | Backend | Frontend |
|---|---|---|
| Minimum, maximum | 2, 10 | 2, 4 |
| Target CPU | 60% of the 100m request | 70% of the 25m request |
| Scale up | Immediately. At most double, or +4 pods, every 15 seconds. | Kubernetes default |
| Scale down | After load has been low for 3 minutes. At most half the pods per minute. | After 3 minutes |

Scale-up is fast and scale-down is slow on purpose: adding pods late hurts users, and removing them early only to add them back wastes work.

### Why the Deployments have no replica count

The `replicas` field was removed from the manifests. ArgoCD makes the cluster match Git, so a fixed number in Git would undo every decision the autoscaler made. The autoscaler now owns the number, between its minimum and maximum.

## Run a load test

Requires Docker. k6 runs in a container, nothing is installed.

```powershell
.\scripts\scaling-test.ps1 -Scenario ramp
```

| Scenario | Shape | Shows |
|---|---|---|
| `baseline` | 5 users for 2 minutes | Normal latency, no scaling |
| `ramp` | Up to 50 users over 2 minutes, held for 3 | The autoscaler keeping up with growing load |
| `spike` | 5 users jumping to 60 in 10 seconds | What users see before new pods are ready |

Each simulated user lists tasks, creates one, reads it back, completes it, and deletes it. The script records the replica count and CPU every five seconds, keeps recording until the backend is back at its minimum, and prints a summary. Raw results go to `loadtest/results` (git-ignored).

Watch it live in Grafana, on the **TaskBoard overview** dashboard: the panel "Load, replicas and response time" shows all three on one timeline.

Against EKS, pass the load balancer's address and the cluster context:

```powershell
.\scripts\scaling-test.ps1 -Scenario ramp -Url http://<load-balancer-address> -Context eks-taskboard
```

## Measured on the local cluster

kind, two worker nodes, 13 October 2026. One laptop runs the cluster, the database, and the load generator, so absolute numbers are lower than on real infrastructure.

### Ramp scenario

| Measure | Result | Target |
|---|---|---|
| Requests sent | 81,936 at 256 per second | |
| Failed requests | 0 | under 1% |
| Response time, 95th percentile | 301 ms | under 500 ms |
| Response time, median | 8 ms | |
| Writes lost (created but not readable) | 0 | 0 |
| First scale-out | 57 s after the load started | |
| Backend replicas | 2 → 3 → 5 → 7 → 10 | at least 6 within 3 minutes |
| All 10 replicas ready | 120 s after the load started | |
| Back to 2 replicas | 276 s after the load ended | within 10 minutes |

The backend reached its maximum of 10 and CPU stayed above the target, which means this load is more than 10 pods can absorb at 60% CPU. The response time target was still met. On a larger cluster the maximum would be raised.

### Failure drills

A request every 200 ms through the public entry point during each drill.

| Drill | Failed requests | Recovery |
|---|---|---|
| One backend pod deleted | 0 of 225 (on EKS) | Replacement ready within seconds |
| Rollout of every pod | 0 of 245, 0 of 250 (local), 0 of 305 (EKS) | |
| Worker node stopped, both backend pods on it | 53 of 336 (15.8%), for 85 s | Full capacity after 88 s |
| Worker node stopped, pods spread across nodes | 15 of 424 (3.5%), for 44 s | Full capacity after 84 s |

### What the node drills showed

The first node drill found a defect. After the ramp test scaled the backend from 10 pods back to 2, both remaining pods were on the same node. Kubernetes spreads pods across nodes only at the moment it schedules them, and removing pods does not rebalance the rest. Stopping that node removed the whole backend.

The descheduler was added to fix this. It restored the spread within two minutes, and in the repeated drill the surviving replica kept serving. The failures that remain all fall in the first 44 seconds: the time Kubernetes takes to decide that a silent node is dead. Until then it still routes some requests to pods that no longer exist. That window is a property of the cluster's node monitoring and cannot be shortened from the application's manifests.

So the honest result for a sudden node loss is: degraded for under a minute, never fully down, and back at full capacity in under 90 seconds. The target of under 1% failed requests was not met for this drill.

## Measured on EKS

`eu-north-1`, two `m7i-flex.large` nodes in two Availability Zones, 13 October 2026. The load came from a laptop in Egypt through the public load balancer, so every request includes that network path.

### Ramp scenario

| Measure | Result | Target |
|---|---|---|
| Requests sent | 63,108 at 197 per second | |
| Failed requests | 0 | under 1% |
| Response time, 95th percentile | 171 ms | under 500 ms |
| Response time, median | 98 ms | |
| Writes lost | 0 | 0 |
| First scale-out | 80 s after the load started | |
| Backend replicas | 2 → 3 → 5 → 6 → 9 → 10 | at least 6 within 3 minutes |
| 6 replicas reached | 109 s | |
| All 10 replicas ready | 164 s | |
| Back to 2 replicas | 266 s after the load ended | within 10 minutes |

### Node failure

One EC2 instance was terminated while a request was sent every 200 ms. Replicas were spread across both nodes, and the terminated node held one backend and one frontend pod.

| Measure | Result |
|---|---|
| Failed requests | 3 of 528 (0.57%) |
| When they failed | Between 20 and 25 seconds after the termination |
| Two replicas of each service ready on the surviving node | 30 seconds |
| Replacement node created by AWS and Ready | about 3 minutes |

This meets the target of under 1% that the local cluster missed (3.5%). The load balancer runs its own health checks and stopped routing to the dead pods within seconds, where the local cluster had to wait about 40 seconds for Kubernetes to declare the node dead.

Screenshots of the dashboards during this session are in [evaluation/screenshots](evaluation/screenshots/), and the full results table is in [evaluation/results.md](evaluation/results.md).

## Known limitations

- **The database is a single pod.** If its node fails, the application is down until the pod is rescheduled, and on EKS its volume can only attach in the same Availability Zone. The drills deliberately stopped the other node. A managed database with a standby in a second zone removes this.
- **Node failures cost requests for about 40 seconds**, as measured above. A load balancer with its own health checks, as on AWS, stops routing to dead targets sooner than the cluster does.
- **CPU is an indirect signal** for an API that mostly waits on the database. Scaling on request rate would react more directly.
- **Node auto-scaling is not set up.** The AWS account in use allows two nodes at most, so there would be only one node to add.
- **Local numbers are not production numbers.** The load generator and the cluster share one laptop.
