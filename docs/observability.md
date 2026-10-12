# Observability: Prometheus and Grafana

How the platform is monitored on the local cluster: what is collected, where to look at it, which alerts exist, and how each part was verified.

Everything here is deployed by ArgoCD from Git. The one manual step is creating the Grafana login Secret.

Commands are for Windows PowerShell, run from the repository root.

## What runs

```
 backend pods ──/metrics──┐
 ArgoCD controller ───────┤
 kubelet, cAdvisor ───────┼──► Prometheus ──► Alertmanager
 kube-state-metrics ──────┤        │
 node-exporter (per node) ┘        └──► Grafana (dashboards)
```

| Component | Purpose |
|---|---|
| Prometheus | Collects metrics every 15 to 30 seconds, stores them for 3 days, evaluates alert rules |
| Alertmanager | Receives firing alerts. No receiver is configured, so alerts are shown but sent nowhere. |
| Grafana | Dashboards |
| kube-state-metrics | Turns Kubernetes object state into metrics: replica counts, pod restarts, deployment status |
| node-exporter | CPU, memory, and disk of each node |
| Prometheus Operator | Turns `ServiceMonitor` and `PrometheusRule` resources into Prometheus configuration |

All of it comes from the `kube-prometheus-stack` chart, version 92.3.0, in the `monitoring` namespace.

| File | Purpose |
|---|---|
| `deploy/argocd/apps/local/monitoring.yaml` | ArgoCD Application for the chart, with the pinned version |
| `deploy/monitoring/stack/values-local.yaml` | Chart settings for the local cluster |
| `deploy/argocd/apps/local/taskboard-monitoring.yaml` | ArgoCD Application for the definitions below |
| `deploy/monitoring/taskboard/backend-servicemonitor.yaml` | Tells Prometheus to scrape the backend |
| `deploy/monitoring/taskboard/argocd-servicemonitor.yaml` | Tells Prometheus to scrape ArgoCD |
| `deploy/monitoring/taskboard/backend-alerts.yaml` | Alert rules |
| `deploy/monitoring/taskboard/dashboards/taskboard.json` | The Grafana dashboard |
| `app/backend/app/metrics.py` | Exposes the backend's metrics |

The application's monitoring definitions are a separate ArgoCD Application from the application itself. TaskBoard therefore still deploys on a cluster with no monitoring stack.

## One-time setup

The chart's default Grafana password is public knowledge, so the login comes from a Secret that is created outside Git, before ArgoCD deploys the stack:

```powershell
kubectl create namespace monitoring
$password = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
kubectl -n monitoring create secret generic grafana-admin --from-literal=admin-user=admin --from-literal=admin-password=$password
```

After that, the root application deploys everything. On a new cluster follow [gitops-local.md](gitops-local.md); on an existing one, merging to `main` is enough.

```powershell
kubectl -n argocd get applications
kubectl -n monitoring get pods
```

Expected: applications `monitoring` and `taskboard-monitoring` are `Synced` and `Healthy`, and eight pods are `Running`. The first start downloads about 1 GB of images and takes several minutes.

## Open the interfaces

None of them is exposed outside the cluster. Each command keeps running in its own terminal.

| Interface | Command | Address |
|---|---|---|
| Grafana | `kubectl -n monitoring port-forward service/monitoring-grafana 3000:80` | http://127.0.0.1:3000 |
| Prometheus | `kubectl -n monitoring port-forward service/monitoring-kube-prometheus-prometheus 9090:9090` | http://127.0.0.1:9090 |
| Alertmanager | `kubectl -n monitoring port-forward service/monitoring-kube-prometheus-alertmanager 9093:9093` | http://127.0.0.1:9093 |

Grafana's user is `admin`. Print the password with:

```powershell
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String((kubectl -n monitoring get secret grafana-admin -o jsonpath='{.data.admin-password}')))
```

In Grafana, open **Dashboards** and choose **TaskBoard overview**. The chart also installs about 25 dashboards for the cluster itself (nodes, pods, namespaces).

In Prometheus, **Status > Target health** lists everything being scraped, and **Alerts** shows every rule and its state.

## What the backend reports

The backend serves Prometheus metrics at `/metrics`.

| Metric | Type | Labels | Meaning |
|---|---|---|---|
| `http_requests_total` | Counter | `handler`, `method`, `status` | Requests handled |
| `http_request_duration_highr_seconds` | Histogram | none | Response time, fine-grained. Used for percentiles. |
| `http_request_duration_seconds` | Histogram | `handler`, `method` | Response time per route, coarse buckets |
| `http_request_size_bytes`, `http_response_size_bytes` | Summary | `handler` | Payload sizes |
| `process_*`, `python_*` | Various | none | Memory, CPU, and garbage collection of the process |

Three design decisions:

- **`/metrics` is outside `/api`.** The frontend proxy and the load balancer forward only `/api`, so the metrics cannot be reached from outside the cluster. The smoke test checks this.
- **Routes, not URLs.** `handler` is the route template, `/api/tasks/{task_id}`. One time series per route, however many tasks exist. Requests to unknown URLs create no series.
- **Probes and scrapes are not counted.** `/api/healthz`, `/api/readyz`, and `/metrics` are called every few seconds by Kubernetes and Prometheus. Counting them would hide the real traffic.

## The dashboard

**TaskBoard overview**, defined in Git and loaded automatically. Changing it means changing the JSON file through a pull request.

| Panel | Shows |
|---|---|
| Request rate | Requests per second right now |
| Error rate (5xx) | Share of requests that failed. Orange above 1%, red above 5%. |
| Response time, 95th percentile | Orange above 0.5 s, red above 1 s |
| Backend pods ready | Red at 0, orange at 1, green from 2 |
| Requests by status code | Traffic split by HTTP status |
| Response time | p50, p95, and p99 over time |
| Requests by route | Which endpoints receive traffic |
| Requests by backend pod | Load shared between replicas |
| Ready pods | Replicas per deployment |
| Load, replicas and response time | All three on one timeline: the view for demonstrating auto-scaling |
| CPU by pod, Memory by pod | Resource use against the configured limits |
| Container restarts | A rising line means a crashing container |
| ArgoCD sync status | Whether the cluster matches Git |

## Alerts

| Alert | Fires when | For | Severity |
|---|---|---|---|
| `TaskboardBackendDown` | No backend pod can be scraped | 30 s | critical |
| `TaskboardHighErrorRate` | More than 5% of requests return 5xx | 2 min | critical |
| `TaskboardDegraded` | ArgoCD reports the application Degraded or Missing | 5 min | critical |
| `TaskboardHighLatency` | p95 response time above 1 second | 5 min | warning |
| `TaskboardBackendReplicasUnavailable` | Fewer backend replicas available than desired | 5 min | warning |
| `TaskboardPodRestarting` | A container restarted more than twice in 15 minutes | 1 min | warning |
| `TaskboardNotInSyncWithGit` | ArgoCD sync status is not Synced | 10 min | warning |

The chart adds about 130 more rules for the cluster itself. One of them, `Watchdog`, fires permanently by design: it proves the alerting pipeline is alive.

## Verified on the local cluster

| Check | Result |
|---|---|
| Scrape targets | Both backend pods and the ArgoCD controller `up`. No target down. |
| Metrics from real traffic | Request rates by status (200 and 404) match the traffic that was sent |
| Load sharing | Both backend pods show a share of the requests |
| Probes excluded | No series for `/api/healthz`, `/api/readyz`, or `/metrics` |
| Alert rules | All 7 loaded and healthy |
| Dashboard | Loaded from Git as provisioned. All 18 panel queries return data when run through Grafana. |
| Grafana login | Anonymous access refused. The chart's default password refused. |
| Metrics not public | `/metrics` and `/api/metrics` through the frontend return no metrics |

### Alert timing

Measured by scaling the backend to zero, with ArgoCD's automatic sync paused for the test.

| `for` setting | Time from outage to firing |
|---|---|
| 1 minute (first version) | 130 seconds |
| 30 seconds (current) | 102 seconds |

About a minute of that is detection, before the `for` period even starts: pods terminate gracefully, Prometheus notices its targets are gone, and the rule is evaluated every 30 seconds. The alert appeared in Alertmanager, and cleared 57 seconds after recovery began.

### Repeat the alert test

```powershell
kubectl -n argocd patch application root --type merge --patch-file scripts/argocd-pause-sync.json
kubectl -n argocd patch application taskboard --type merge --patch-file scripts/argocd-pause-sync.json
kubectl -n taskboard scale deployment/backend --replicas=0
```

Watch the alert go from `pending` to `firing` in Prometheus under **Alerts**. Then hand control back to ArgoCD, which restores the replicas:

```powershell
kubectl apply -f deploy/argocd/root/local.yaml
```

The pause is needed because ArgoCD would otherwise undo the scale-down within a second.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Grafana pod stuck at `2/3` and restarting, one node at very high CPU | Memory limit too low. Grafana needs much more memory to start than to run. This happened here with a 256Mi limit. | The limit is now 1Gi with a longer liveness delay. If it recurs, raise `grafana.resources.limits.memory`. |
| Grafana pod in `CreateContainerConfigError` | The `grafana-admin` Secret is missing | Create it as in "One-time setup" |
| A backend target is missing in Prometheus | The ServiceMonitor does not match the Service | The Service needs the label `app.kubernetes.io/name: backend` and a port named `http` |
| Dashboard panels show "No data" | No traffic yet, or the time range is too short | Send some requests, and widen the range |
| `monitoring` application stays `Progressing` for long | Images still downloading, or a sync is waiting on a pod that cannot become healthy | `kubectl -n monitoring get pods`, then `kubectl -n monitoring describe pod <name>` |
| `taskboard-monitoring` fails with "no matches for kind ServiceMonitor" | The monitoring stack has not installed its resource types yet | It retries by itself. Check that `monitoring` is healthy. |
| `kubectl top` says "Metrics API not available" | `metrics-server` is not installed. It is a separate component from Prometheus. | Added with auto-scaling, which needs it |

## Known limitations

- Metrics are stored in the pod, not on a volume. Restarting the Prometheus pod loses history. Evidence for the report must be captured (screenshots or exported data) before the cluster is deleted.
- Alerts are not delivered anywhere. A receiver such as email or Slack would be configured in Alertmanager.
- There is no external probe yet, so uptime as seen from outside the cluster is not measured.
- Logs are not collected centrally. `kubectl logs` is the tool for now.
- Verified on the local cluster only. On EKS the same chart is used with different values: persistent storage, and control plane components that EKS does not expose stay disabled.
