# Deploying to Amazon EKS

How the application gets from Git to a public address on AWS, what was measured there, and how to bring the environment up and take it down again.

The AWS infrastructure itself (VPC, cluster, roles) is described in [infrastructure.md](infrastructure.md). This document starts where that one ends: a running, empty cluster.

Commands are for Windows PowerShell, run from the repository root.

## What runs on EKS

```
 Internet
    │  HTTP 80
    ▼
 Application Load Balancer  (public subnets, created from the Ingress)
    │  /api ─► backend pods :8000        directly to pod addresses,
    │  /    ─► frontend pods :8080       only these two ports
    ▼
 EKS cluster, private subnets, two nodes in two Availability Zones
    backend x2, frontend x2, migrate Job
    postgres-0 ──► EBS gp3 volume (encrypted)

 ArgoCD (in the cluster) ◄── pulls ── GitHub: main
 ECR ◄── images pushed from a laptop, pulled by the nodes
```

| ArgoCD application | Source | Deploys |
|---|---|---|
| `root` | `deploy/argocd/apps/aws` | The applications below |
| `aws-load-balancer-controller` | Chart 3.6.0 from `aws.github.io/eks-charts` | The controller that turns an Ingress into a load balancer |
| `storage` | `deploy/platform/storage` | The default StorageClass: encrypted gp3 EBS volumes |
| `taskboard` | `deploy/apps/taskboard/overlays/aws` | The application |

### What differs from the local cluster

The base manifests are identical. The `aws` overlay changes only what must differ.

| | Local (kind) | AWS (EKS) |
|---|---|---|
| Images | Built locally, tag `local` | ECR, tagged with the Git commit SHA |
| Entry point | NodePort mapped to `127.0.0.1:8090` | Application Load Balancer |
| Database volume | Directory inside a node | Encrypted EBS volume |
| Pod shutdown delay | 5 seconds | 20 seconds, because an external load balancer takes longer to stop routing |
| Pod readiness | Kubernetes probes | Probes, plus a readiness gate: a pod is Ready only once the load balancer reports it healthy |

### How controllers get AWS permissions

Two controllers call AWS: the load balancer controller and the EBS storage driver. Each has its own IAM role, bound by Terraform to exactly one Kubernetes service account through EKS Pod Identity. Application pods have no AWS permissions at all.

Nothing in Git refers to a role, a key, or a credential. The load balancer controller finds the VPC by its `Name` tag, because the VPC is recreated for every work session and gets a new ID each time.

## Bring the environment up

Prerequisite: the `state-backend` and `persistent` stacks exist, and you are signed in (`aws login`). See [infrastructure.md](infrastructure.md).

### 1. Create the cluster

```powershell
terraform -chdir=infra/stacks/platform init "-backend-config=../../backend.hcl"
terraform -chdir=infra/stacks/platform plan -out=tfplan
terraform -chdir=infra/stacks/platform apply tfplan
aws eks update-kubeconfig --region eu-north-1 --name taskboard-dev --alias eks-taskboard
```

About 15 minutes. The last command adds a `kubectl` context named `eks-taskboard`. Every command below names that context explicitly, so nothing is applied to the local cluster by mistake.

### 2. Push images (only when application code changed)

```powershell
.\scripts\push-images.ps1 -Region eu-north-1
```

Builds both images, tags them with the current commit SHA, and pushes them. If it prints a new tag, set it in `deploy/apps/taskboard/overlays/aws/kustomization.yaml` and merge that change. Images already in the registry survive between sessions.

### 3. Install ArgoCD and hand over to Git

```powershell
kubectl --context eks-taskboard apply -k deploy/argocd/install --server-side
kubectl --context eks-taskboard -n argocd wait --for=condition=Available deployment --all --timeout=420s

kubectl --context eks-taskboard apply -f deploy/apps/taskboard/base/namespace.yaml
kubectl --context eks-taskboard -n taskboard create secret generic taskboard-db-credentials --from-env-file=deploy/apps/taskboard/overlays/local/secrets.env

kubectl --context eks-taskboard apply -f deploy/argocd/root/aws.yaml
```

The Secret is created by hand because credentials are never in Git, exactly as on the local cluster.

### 4. Find the address and verify

```powershell
kubectl --context eks-taskboard -n argocd get applications
$url = "http://" + (kubectl --context eks-taskboard -n taskboard get ingress taskboard -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
$url
.\scripts\smoke-test.ps1 -FrontendUrl $url -BackendUrl $url -SkipComposeChecks
```

The load balancer needs two to three minutes after the Ingress appears before it answers.

## Deploy a new version

1. Merge the application change to `main`.
2. `.\scripts\push-images.ps1 -Region eu-north-1`
3. Put the printed tag in `deploy/apps/taskboard/overlays/aws/kustomization.yaml`, through a pull request.
4. ArgoCD notices the new commit and rolls it out: migration first, then the pods.

Rollback is `git revert` of the tag change.

Step 2 is manual because of an account restriction, explained under "Known limitations".

## Take the environment down

**Order matters.** The load balancer and the database volume were created by Kubernetes, not by Terraform. If the cluster is destroyed first, they are orphaned: they keep costing money, and the load balancer's network interfaces stop the VPC from being deleted.

```powershell
# 1. Stop ArgoCD from recreating what is about to be deleted.
kubectl --context eks-taskboard -n argocd delete application root taskboard

# 2. Delete what created AWS resources, and wait for AWS to finish.
kubectl --context eks-taskboard -n taskboard delete ingress taskboard
kubectl --context eks-taskboard -n taskboard delete statefulset postgres
kubectl --context eks-taskboard -n taskboard delete pvc --all
aws elbv2 describe-load-balancers --region eu-north-1 --query "LoadBalancers[].LoadBalancerName"
aws ec2 describe-volumes --region eu-north-1 --filters Name=status,Values=available --query "Volumes[].VolumeId"

# 3. Only when both lists are empty:
terraform -chdir=infra/stacks/platform destroy
```

Then run the leftover checks in [infrastructure.md](infrastructure.md), section 9.

## Measured on EKS

Region `eu-north-1`, two `m7i-flex.large` nodes, Kubernetes 1.36, 13 October 2026.

| Test | Result |
|---|---|
| ArgoCD: empty cluster to all applications Synced and Healthy | 136 seconds |
| Load balancer: Ingress created to first successful response | about 2.5 minutes |
| Smoke test through the public load balancer | 16 of 16 checks passed |
| Rollout of every backend and frontend pod under load | 0 failed of 305 requests |
| Manual scale of the backend from 2 to 5 | Reverted by ArgoCD in 1.5 seconds |
| One backend pod deleted under load | 0 failed of 225 requests |
| Pods spread | One backend and one frontend replica on each node, in different zones |
| Load balancer targets | All four pods registered by IP and healthy |
| `terraform plan` after apply | No changes |

## Known limitations

| Limitation | Cause | Effect |
|---|---|---|
| HTTP only, no TLS | No domain name, and a certificate needs one | Traffic to the load balancer is unencrypted. With a domain: an ACM certificate, a 443 listener, and a redirect from 80. |
| Images are pushed from a laptop | The AWS account's policy forbids creating an OIDC identity provider, which GitHub Actions needs to push without stored keys | The release step is a script instead of a pipeline. The Terraform module for the OIDC role exists and is tested, but is switched off. |
| Database in the cluster | Simpler and cheaper than RDS for a demo | One pod, no replicas, no backups. Data is deleted with the environment. |
| DB credentials created by hand | No secrets manager integration yet | One `kubectl` command per environment creation |
| At most two nodes | Account quota of 5 vCPUs | Node auto-scaling can only be shown from one node to two |
| AWS account ID is visible in Git | Image references must name the registry | Account IDs are not secret, but they are identifying |
