# Running TaskBoard on a Local Kubernetes Cluster

This guide deploys the Docker images to a local cluster created with **kind** (Kubernetes in Docker). Minikube equivalents are in section 11.

Commands are for Windows PowerShell, run from the repository root.

## What gets deployed

```
 your machine                      kind cluster "taskboard", namespace "taskboard"
 127.0.0.1:8090 ──► NodePort 30080 ──► Service frontend ──► 2 x frontend pod (NGINX)
                                                                   │ /api
                                                                   ▼
                                       Service backend  ──► 2 x backend pod (FastAPI)
                                                                   │
                                                                   ▼
                                       Service postgres ──► postgres-0 ──► PersistentVolumeClaim (1Gi)

                                       Job migrate (runs once, applies the schema)
```

| Kind | Name | Purpose |
|---|---|---|
| Namespace | `taskboard` | Isolation, and enforces the `restricted` Pod Security level |
| Deployment | `backend` | 2 replicas of the API |
| Deployment | `frontend` | 2 replicas of NGINX serving the UI |
| StatefulSet | `postgres` | 1 database pod with persistent storage (local only) |
| Job | `migrate` | Runs `alembic upgrade head` |
| Service | `backend`, `frontend`, `postgres` | Stable DNS names and load balancing |
| ConfigMap | `backend-config-<hash>` | Non-secret settings |
| Secret | `taskboard-db-credentials` | Database user and password, created with `kubectl` from a git-ignored file |

Files:

```
deploy/
├── local/
│   ├── kind-cluster.yaml            Cluster definition: 3 nodes, port 8090
│   └── debug-pod.yaml               Throwaway pod for network troubleshooting
└── apps/taskboard/
    ├── base/                        Same in every environment
    │   ├── kustomization.yaml       Lists resources, generates the ConfigMap
    │   ├── namespace.yaml
    │   ├── backend-deployment.yaml
    │   ├── backend-service.yaml
    │   ├── frontend-deployment.yaml
    │   ├── frontend-service.yaml
    │   └── migrate-job.yaml
    └── overlays/local/              Local-only additions and changes
        ├── kustomization.yaml       Image tags, DB_HOST
        ├── secrets.env.example      Template for credentials
        ├── postgres-statefulset.yaml
        ├── postgres-service.yaml
        └── frontend-service-nodeport.yaml
```

The manifests use Kustomize, which is built into `kubectl`. The `base` holds what never changes between environments. The AWS overlay, added later, will reuse it with ECR images, RDS, and an Ingress.

## 1. Install the tools

Docker Desktop must be running. Then:

```powershell
winget install Kubernetes.kind
winget install Kubernetes.kubectl
```

Open a new terminal and confirm:

```powershell
kind version
kubectl version --client
```

## 2. Create the cluster

```powershell
kind create cluster --config deploy/local/kind-cluster.yaml
kubectl cluster-info --context kind-taskboard
kubectl get nodes
```

Expected: three nodes (`taskboard-control-plane`, `taskboard-worker`, `taskboard-worker2`) in `Ready` state. Each node is a Docker container, visible in `docker ps`.

## 3. Build and load the images

A kind cluster cannot see the images in your local Docker. They must be copied into the nodes.

```powershell
docker compose build
kind load docker-image taskboard-backend:local taskboard-frontend:local --name taskboard
```

Confirm they arrived:

```powershell
docker exec taskboard-worker crictl images | Select-String taskboard
```

## 4. Provide the credentials

```powershell
Copy-Item deploy/apps/taskboard/overlays/local/secrets.env.example deploy/apps/taskboard/overlays/local/secrets.env
```

Open `secrets.env` and replace the placeholder password (letters and digits only). The file is git-ignored.

Create the namespace and, inside it, the Secret:

```powershell
kubectl apply -f deploy/apps/taskboard/base/namespace.yaml
kubectl -n taskboard create secret generic taskboard-db-credentials --from-env-file=deploy/apps/taskboard/overlays/local/secrets.env
```

The Secret is the one resource that is not defined in the manifests. Everything else can be built from Git, which is what allows ArgoCD to deploy it, and no credential is ever stored in a YAML file.

From here there are two ways to deploy. Section 5 applies the manifests by hand. [gitops-local.md](gitops-local.md) lets ArgoCD do it from Git instead. Use one or the other.

## 5. Deploy

Preview exactly what will be applied, without changing anything:

```powershell
kubectl kustomize deploy/apps/taskboard/overlays/local
```

Apply it, then make `taskboard` the default namespace so later commands need no `-n` flag:

```powershell
kubectl apply -k deploy/apps/taskboard/overlays/local
kubectl config set-context --current --namespace=taskboard
```

Wait for each part in dependency order:

```powershell
kubectl rollout status statefulset/postgres --timeout=180s
kubectl wait --for=condition=complete job/migrate --timeout=180s
kubectl rollout status deployment/backend --timeout=180s
kubectl rollout status deployment/frontend --timeout=120s
```

On the first run the `migrate` Job may fail once or twice while PostgreSQL initialises. It retries on its own.

## 6. Verify

Open http://127.0.0.1:8090 and add, edit, complete, and delete a task.

Run the automated checks against the cluster:

```powershell
.\scripts\smoke-test.ps1 -FrontendUrl http://127.0.0.1:8090 -BackendUrl http://127.0.0.1:8090 -SkipComposeChecks
```

## 7. Inspect

```powershell
kubectl get all
kubectl get pods -o wide
kubectl get configmap,secret,pvc
kubectl describe deployment backend
kubectl describe pod -l app.kubernetes.io/name=backend
kubectl get events --sort-by=.lastTimestamp
```

`-o wide` shows which node each pod runs on. The two replicas of each service should be on different workers.

Expected pods:

| Pod | Ready | Status |
|---|---|---|
| `backend-...` (2) | 1/1 | Running |
| `frontend-...` (2) | 1/1 | Running |
| `postgres-0` | 1/1 | Running |
| `migrate-...` | 0/1 | Completed |

Check that the Secret exists without printing its values:

```powershell
kubectl describe secret taskboard-db-credentials
```

## 8. View logs

```powershell
kubectl logs deployment/backend
kubectl logs -l app.kubernetes.io/name=backend --prefix --tail=50
kubectl logs -l app.kubernetes.io/name=backend --prefix -f
kubectl logs deployment/backend -c wait-for-migrations
kubectl logs job/migrate
kubectl logs postgres-0
kubectl logs deployment/frontend
```

- `--prefix` labels each line with its pod, which shows requests being shared between replicas.
- `-c` selects a container. The backend pod has an init container, `wait-for-migrations`.
- After a crash, add `--previous` to read the logs of the container that died.

## 9. Test networking

**Services and their endpoints.** Each Service should list the IPs of its ready pods.

```powershell
kubectl get services
kubectl get endpointslices
```

**DNS.** Service names resolve inside the cluster.

```powershell
kubectl exec deployment/frontend -- nslookup backend.taskboard.svc.cluster.local
```

**Frontend to backend**, the path a browser request takes:

```powershell
kubectl exec deployment/frontend -- wget -qO- http://backend:8000/api/readyz
```

**Backend to database:**

```powershell
kubectl exec deployment/backend -- python -c "import socket; socket.create_connection(('postgres', 5432), 3); print('database reachable')"
```

**From your machine straight to the backend**, bypassing the frontend. Leave this running in one terminal:

```powershell
kubectl port-forward service/backend 8000:8000
```

and in another:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/healthz
```

**Load balancing across replicas.** Send some requests, then see which pods handled them:

```powershell
1..10 | ForEach-Object { Invoke-RestMethod http://127.0.0.1:8090/api/tasks | Out-Null }
kubectl logs -l app.kubernetes.io/name=backend --prefix --tail=200 | Select-String "GET /api/tasks"
```

**A shell inside the cluster** for anything else:

```powershell
kubectl apply -f deploy/local/debug-pod.yaml
kubectl exec -it debug -- sh
kubectl delete pod debug
```

How traffic is exposed:

| Service | Type | Reachable from |
|---|---|---|
| `frontend` | NodePort 30080 | Your machine at `127.0.0.1:8090`, through the kind port mapping |
| `backend` | ClusterIP | Inside the cluster only |
| `postgres` | ClusterIP (headless) | Inside the cluster only |

Unlike the Docker Compose setup, nothing here stops the frontend pods from connecting to the database. NetworkPolicies that enforce that rule are part of the security hardening milestone.

## 10. Demonstrate Kubernetes behaviour

**Self-healing.** Delete a backend pod and watch a replacement appear. The application stays available because the other replica keeps serving.

```powershell
kubectl delete pod -l app.kubernetes.io/name=backend --wait=false
kubectl get pods -w
```

**Database persistence.** Create a task in the browser, delete the database pod, and check the task is still there once `postgres-0` is back.

```powershell
kubectl delete pod postgres-0
kubectl rollout status statefulset/postgres
```

**Readiness.** Stop the database and watch the backend pods go to `0/1` Ready without restarting. Then bring it back.

```powershell
kubectl scale statefulset/postgres --replicas=0
kubectl get pods -w
kubectl scale statefulset/postgres --replicas=1
```

**Scaling by hand.** Automatic scaling comes in a later milestone.

```powershell
kubectl scale deployment/backend --replicas=4
kubectl get pods -l app.kubernetes.io/name=backend -o wide
```

**Deploying a code change:**

```powershell
docker compose build
kind load docker-image taskboard-backend:local taskboard-frontend:local --name taskboard
kubectl delete job migrate --ignore-not-found
kubectl apply -k deploy/apps/taskboard/overlays/local
kubectl rollout restart deployment/backend deployment/frontend
kubectl rollout status deployment/backend
```

The Job is deleted first because a Job cannot be modified once created. The restart is needed because the image tag `local` did not change, so Kubernetes sees no difference on its own. With the CI pipeline every build gets a unique tag and neither step is necessary.

## 11. Minikube instead of kind

| Step | kind | minikube |
|---|---|---|
| Create | `kind create cluster --config deploy/local/kind-cluster.yaml` | `minikube start --nodes 3 -p taskboard` |
| Load images | `kind load docker-image <image> --name taskboard` | `minikube image load <image> -p taskboard` |
| Open the app | http://127.0.0.1:8090 | `minikube service frontend -n taskboard -p taskboard` |
| Delete | `kind delete cluster --name taskboard` | `minikube delete -p taskboard` |

The manifests and every `kubectl` command are the same.

## 12. How it is configured

### Configuration and secrets

| Setting | Source | How it reaches the container |
|---|---|---|
| `APP_ENV`, `LOG_LEVEL`, `DB_POOL_SIZE`, `DB_PORT`, `DB_NAME` | ConfigMap, defined in `base/kustomization.yaml` | Environment variables |
| `DB_HOST` | ConfigMap, added by the overlay | Environment variable |
| `POSTGRES_USER`, `POSTGRES_PASSWORD` | Secret, created from `secrets.env` in section 4 | Environment variables |
| `DATABASE_URL` | Assembled by Kubernetes from the values above | Environment variable |

- The ConfigMap name ends in a hash of its content. Changing a value creates a new ConfigMap and rolls the pods, so running pods never hold stale settings.
- A Kubernetes Secret is base64-encoded, not encrypted. Anyone who can read Secrets in the namespace can read the password. That is acceptable on a laptop. On AWS the value will come from AWS Secrets Manager.

### Resources

| Container | CPU request | CPU limit | Memory request | Memory limit |
|---|---|---|---|---|
| backend | 100m | 500m | 128Mi | 256Mi |
| frontend | 25m | 200m | 32Mi | 96Mi |
| postgres | 100m | 500m | 128Mi | 512Mi |
| migrate, wait-for-migrations | 50m | 250m | 96Mi | 192Mi |

A request is what the scheduler reserves on a node. A limit is a ceiling: exceeding the CPU limit slows the container down, and exceeding the memory limit kills it (`OOMKilled`). These are starting values, to be tuned from measurements once monitoring is in place.

### Probes

| Container | Startup | Liveness | Readiness |
|---|---|---|---|
| backend | `GET /api/healthz`, up to 60s | `GET /api/healthz` | `GET /api/readyz` |
| frontend | none | `GET /healthz` | `GET /healthz` |
| postgres | `pg_isready`, up to 120s | `pg_isready` | `pg_isready` |

- A failed **liveness** probe restarts the container.
- A failed **readiness** probe removes the pod from its Service, without restarting it.
- The backend's liveness probe deliberately ignores the database. If it did not, a database outage would restart every healthy API pod.

### Persistence

The StatefulSet's `volumeClaimTemplates` creates a PersistentVolumeClaim named `data-postgres-0`. The cluster's default StorageClass provisions a volume for it, which on kind is a directory inside a worker node's container.

| Event | Data |
|---|---|
| `postgres-0` deleted or restarted | Kept |
| StatefulSet deleted | Kept, because the claim remains |
| Namespace deleted, or `kubectl delete -k` | Deleted |
| Cluster deleted | Deleted |

This is enough for local testing and nothing more: there are no backups and no replication. On AWS the database is RDS.

### Security settings

Every pod runs as a non-root user with no privilege escalation, no Linux capabilities, the default seccomp profile, and no Kubernetes API token. The backend and frontend also have read-only root filesystems. The namespace enforces the `restricted` Pod Security Standard, so a pod that breaks these rules is rejected.

## 13. Troubleshooting

Start with these three commands. Between them they explain almost every failure.

```powershell
kubectl get pods
kubectl describe pod <pod-name>
kubectl get events --sort-by=.lastTimestamp
```

| Symptom | Likely cause | What to do |
|---|---|---|
| Pods stuck in `CreateContainerConfigError`, message `secret "taskboard-db-credentials" not found` | The Secret was not created, or was deleted with the namespace | Do section 4 |
| `ErrImagePull` or `ImagePullBackOff` on backend or frontend | Image was not loaded into the cluster | Repeat section 3, then `kubectl rollout restart deployment/backend deployment/frontend` |
| Backend pod stuck at `Init:0/1` | Schema not migrated yet | `kubectl logs job/migrate`, then `kubectl logs deployment/backend -c wait-for-migrations` |
| `migrate` pods in `Error` | Database not ready yet (retries by itself), or wrong credentials | `kubectl logs job/migrate` |
| `password authentication failed` | Password in `secrets.env` changed after the database was first created | `kubectl delete statefulset postgres`, `kubectl delete pvc data-postgres-0`, then redeploy. This erases the data. |
| `CrashLoopBackOff` | Container starts and exits | `kubectl logs <pod> --previous` |
| `CreateContainerConfigError` | A ConfigMap or Secret key the pod needs is missing | `kubectl describe pod <pod>` names the key |
| Pod `Running` but `0/1` Ready | Readiness probe failing | `kubectl describe pod <pod>` shows the probe result under Events |
| Pod `Pending` | Not enough CPU or memory on the nodes, or the volume claim is unbound | `kubectl describe pod <pod>`, `kubectl get pvc` |
| `OOMKilled` under Last State | Memory limit too low | Raise the limit in the Deployment |
| `forbidden: violates PodSecurity "restricted"` | A pod spec lacks the required security settings | The message lists the missing fields |
| `field is immutable` when applying the Job | Job already exists | `kubectl delete job migrate`, then apply again |
| Browser cannot open `127.0.0.1:8090` | Cluster was created without the config file, or the port is in use | `docker ps` should show `127.0.0.1:8090->30080/tcp` on the control-plane container. Otherwise recreate the cluster. |
| `kubectl` talks to the wrong cluster | Another context is selected | `kubectl config use-context kind-taskboard` |

## 14. Clean up

Remove the application and its data, keeping the cluster:

```powershell
kubectl delete -k deploy/apps/taskboard/overlays/local
```

Remove the cluster entirely:

```powershell
kind delete cluster --name taskboard
```

Confirm nothing is left:

```powershell
kind get clusters
docker ps -a --filter "name=taskboard"
```

## Not included yet

| Item | Arrives with |
|---|---|
| Unique image tags pushed by CI | Release pipeline (needs a registry) |
| Horizontal Pod Autoscaler, PodDisruptionBudgets | Scaling milestone |
| NetworkPolicies | Security hardening milestone |
| Prometheus and Grafana | Observability milestone |
| Ingress with TLS, RDS, External Secrets | AWS overlay |
