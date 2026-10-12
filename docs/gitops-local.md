# GitOps on the Local Cluster with ArgoCD

ArgoCD runs inside the cluster, watches this repository, and makes the cluster match what is in Git. After the one-time setup below, nobody runs `kubectl apply` for the application again: a change is deployed by merging it to `main`.

Prerequisites: the kind cluster exists, the images are loaded, and the namespace and Secret are created. That is sections 1 to 4 of [kubernetes-local.md](kubernetes-local.md).

Commands are for Windows PowerShell, run from the repository root.

## How it fits together

```
 GitHub repository (main)
   │
   │  ArgoCD pulls. Nothing outside the cluster pushes into it.
   ▼
 ┌─ namespace argocd ───────────────────────────────────────────────┐
 │  Application "root"       watches deploy/argocd/apps/local       │
 │      └─ creates ─► AppProject "taskboard"                        │
 │                    Application "taskboard"                       │
 │                        watches deploy/apps/taskboard/overlays/local
 └──────────────────────────────────────┬───────────────────────────┘
                                        │ applies and keeps in sync
                                        ▼
 ┌─ namespace taskboard ────────────────────────────────────────────┐
 │  ConfigMap, Services, postgres, migrate Job, backend, frontend   │
 └──────────────────────────────────────────────────────────────────┘
```

| File | Purpose |
|---|---|
| `deploy/argocd/install/` | Installs ArgoCD, pinned to an exact version |
| `deploy/argocd/root/local.yaml` | The root application. The only Application applied by hand. |
| `deploy/argocd/apps/local/project.yaml` | Limits what the application may deploy, and where |
| `deploy/argocd/apps/local/taskboard.yaml` | The TaskBoard application: which path in Git, which namespace, how to sync |

This is the **app of apps** pattern. The root application's only job is to create the other Applications from Git. Adding a new application later (monitoring, for example) means adding one file under `deploy/argocd/apps/local`.

## 1. Install ArgoCD

```powershell
kubectl apply -k deploy/argocd/install --server-side
kubectl -n argocd wait --for=condition=Available deployment --all --timeout=420s
kubectl -n argocd rollout status statefulset/argocd-application-controller
```

`--server-side` is required: some of ArgoCD's resource definitions are too large for a normal apply. The first run downloads the ArgoCD images and can take a few minutes.

## 2. Hand the cluster over to Git

```powershell
kubectl apply -f deploy/argocd/root/local.yaml
```

This is the last `kubectl apply`. Watch ArgoCD create the application and deploy it:

```powershell
kubectl -n argocd get applications -w
```

Both applications should reach `Synced` and `Healthy`. Then check the result:

```powershell
kubectl -n taskboard get pods
.\scripts\smoke-test.ps1 -FrontendUrl http://127.0.0.1:8090 -BackendUrl http://127.0.0.1:8090 -SkipComposeChecks
```

## 3. Open the ArgoCD web interface

ArgoCD is not exposed outside the cluster. Reach it through a port-forward, left running in its own terminal:

```powershell
kubectl -n argocd port-forward service/argocd-server 8443:443
```

Open https://127.0.0.1:8443 and accept the browser's warning about the self-signed certificate. The user is `admin`. Print the generated password with:

```powershell
[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String((kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}')))
```

## 4. Inspect from the command line

```powershell
kubectl -n argocd get applications
kubectl -n argocd get application taskboard -o jsonpath='{.status.sync.status} {.status.health.status} {.status.sync.revision}'
kubectl -n argocd describe application taskboard
kubectl -n argocd logs deployment/argocd-repo-server --tail=50
kubectl -n argocd logs statefulset/argocd-application-controller --tail=50
```

| Status | Meaning |
|---|---|
| `Synced` | The cluster matches Git |
| `OutOfSync` | The cluster differs from Git. With automated sync this lasts only seconds. |
| `Healthy` | Every resource is running and ready |
| `Progressing` | A rollout is under way |
| `Degraded` | Something failed, for example a pod is crash-looping |

ArgoCD checks Git for new commits about every three minutes. To make it look immediately:

```powershell
kubectl -n argocd annotate application taskboard argocd.argoproj.io/refresh=normal --overwrite
```

## 5. Demonstrations

### Drift is corrected

Change the cluster by hand. ArgoCD puts it back.

```powershell
kubectl -n taskboard scale deployment/backend --replicas=5
kubectl -n taskboard get deployment backend -w
```

```powershell
kubectl -n taskboard delete service backend
kubectl -n taskboard get service backend
```

### A Git change is deployed

Change a manifest on a branch, open a pull request, and merge it. For example, add this to `deploy/apps/taskboard/overlays/local/kustomization.yaml`:

```yaml
replicas:
  - name: frontend
    count: 3
```

After the merge, ArgoCD applies the change within its polling interval, or immediately after the refresh command above. No `kubectl apply` is involved.

### Rollback is a Git revert

```powershell
git revert <commit>
```

Merged through a pull request like any other change. ArgoCD returns the cluster to the previous state.

### Measured on this cluster

| Test | Result |
|---|---|
| First deployment from an empty namespace | Synced and Healthy in 90 seconds |
| Manual scale of the backend from 2 to 5 | Reverted in about 1 second |
| Manually deleted Service | Recreated in 4 seconds |
| Commit changing frontend replicas from 2 to 3 | Running 19 seconds after the push, with a manual refresh |
| `git revert` of that commit | Back to 2 replicas 18 seconds after the push |

Without the manual refresh, add up to three minutes of polling delay to the last two rows.

## How the deployment is ordered

ArgoCD applies resources in **sync waves**, lowest number first, and waits for each wave to be healthy before starting the next. The wave is set by an annotation on each resource.

| Wave | Resources | Why this position |
|---|---|---|
| -3 | Namespace | Everything else lives in it |
| -2 | ConfigMap | The database and the application read it |
| -1 | PostgreSQL StatefulSet and Service | Must be accepting connections before migrations run |
| 0 | Services, `migrate` Job | The Job is a sync hook: deleted and re-run on every sync |
| 1 | Backend and frontend Deployments | Roll out only after the schema is up to date |

If the migration fails, the sync stops at wave 0 and the running application is left untouched on the old version.

## How the Secret is handled

The database credentials are the one thing ArgoCD does not deploy, because they are not in Git. The Secret is created once with `kubectl` from the git-ignored `secrets.env`. ArgoCD only manages resources it created or that are defined in Git, so it leaves this Secret alone, even with pruning turned on.

On AWS the same Secret name will be filled by External Secrets from AWS Secrets Manager, and Git will hold only the reference.

## Security settings

| Setting | Effect |
|---|---|
| AppProject `sourceRepos` | The application can only be built from this repository |
| AppProject `destinations` | It can only deploy into the `taskboard` namespace |
| AppProject `clusterResourceWhitelist` | The only cluster-wide resource it may manage is the Namespace |
| No Ingress or NodePort for ArgoCD | The interface is reachable only through `kubectl port-forward` |
| Pull model | No system outside the cluster holds credentials for it. CI cannot deploy; it can only change Git. |
| Protected `main` | Every deployment is a reviewed pull request that passed CI |

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Application stays `OutOfSync` and nothing happens | ArgoCD has not polled yet | Run the refresh command in section 4 |
| Sync fails at the `migrate` hook | Migration error, or the database is not ready | `kubectl -n taskboard logs job/migrate` |
| Pods in `CreateContainerConfigError` | The Secret is missing | Create it as described in [kubernetes-local.md](kubernetes-local.md), section 4 |
| `ImagePullBackOff` | Images were not loaded into the cluster | `kind load docker-image taskboard-backend:local taskboard-frontend:local --name taskboard` |
| `ComparisonError` on the application | The overlay does not build | `kubectl kustomize deploy/apps/taskboard/overlays/local` shows the error |
| Application `taskboard` is missing | The root application has not synced | `kubectl -n argocd describe application root` |
| A change made with `kubectl` disappears | Working as designed: self-heal reverted it | Make the change in Git |
| `metadata.annotations: Too long` when installing ArgoCD | `--server-side` was left out | Repeat step 1 with the flag |

## Remove ArgoCD

```powershell
kubectl -n argocd delete application root taskboard
kubectl delete -k deploy/argocd/install
```

Deleting the Applications this way leaves the TaskBoard resources running. Deleting the cluster removes everything:

```powershell
kind delete cluster --name taskboard
```
