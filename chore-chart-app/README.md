# Family Chore Chart

A simple, self-contained chore-chart web app to help teenagers create and track household chores. No backend, no installation — just open `index.html` in any modern browser and go.

## Features

- **Family members** — add each kid with a name and a color.
- **Chores** — name, assignee, point value, scheduled days of the week, and optional notes.
- **Today view** — a quick checklist of what's due today. Tap/click the circle to mark done.
- **Weekly chart** — classic grid of chores × days of the week. Navigate past/future weeks.
- **Leaderboard** — points earned this week or all-time, with completion rate and a progress bar.
- **Day streaks** — consecutive days each member completed every scheduled chore.
- **Import / Export** — back up your data to JSON or restore it on another device.
- **Reset** — clear a week's completions or wipe everything.
- **Offline-first** — everything is stored in your browser's `localStorage`.

## Running it

Option 1 — just open the file:
```
open chore-chart-app/index.html
```

Option 2 — serve it locally (recommended if you later add features that require a server context):
```
cd chore-chart-app
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Running in a local Kubernetes cluster

The app ships with a `Dockerfile` (nginx serving the static files on port 8080)
and Kubernetes manifests under `k8s/` (Namespace, Deployment, Service, optional
Ingress, plus a Kustomization).

### 1. Build the image

```bash
cd chore-chart-app
docker build -t chore-chart:latest .
```

### 2. Make the image available to your cluster

Pick the section that matches your local tooling.

**kind**
```bash
kind load docker-image chore-chart:latest
# or, for a named cluster:
kind load docker-image chore-chart:latest --name my-cluster
```

**minikube**
```bash
minikube image load chore-chart:latest
# Alternative: build straight into minikube's daemon
# eval $(minikube docker-env) && docker build -t chore-chart:latest .
```

**Docker Desktop / Rancher Desktop / k3d**
- Docker Desktop Kubernetes uses your local Docker daemon directly — no load step needed.
- For k3d: `k3d image import chore-chart:latest -c <cluster-name>`

### 3. Deploy

```bash
kubectl apply -k k8s/
```

This creates the `chore-chart` namespace, a 2-replica Deployment, and a
ClusterIP Service. Check it came up:

```bash
kubectl -n chore-chart get pods,svc
kubectl -n chore-chart rollout status deploy/chore-chart
```

### 4. Open the app

Quickest option — port-forward:

```bash
kubectl -n chore-chart port-forward svc/chore-chart 8080:80
# then visit http://localhost:8080
```

Or via Ingress (requires an ingress controller, e.g. `ingress-nginx`):

```bash
# kind: https://kind.sigs.k8s.io/docs/user/ingress/
# minikube: minikube addons enable ingress

# Uncomment the ingress line in k8s/kustomization.yaml, then:
kubectl apply -k k8s/

# Visit http://chore-chart.localtest.me (resolves to 127.0.0.1)
```

### Tearing it down

```bash
kubectl delete -k k8s/
```

## Running on VMware VKS (vSphere Kubernetes Service)

The `k8s/vks/` folder is a Kustomize overlay tuned for a real multi-node VKS
cluster. It layers the following on top of the base manifests:

- **3 replicas** spread one-per-worker via `topologySpreadConstraints` and pod anti-affinity, so host maintenance or vMotion never takes the app fully offline.
- **Service type `LoadBalancer`** so NSX ALB (AVI) provisions a VIP automatically.
- **PodDisruptionBudget** keeping at least 2 pods available during node drains and cluster upgrades.
- **NetworkPolicy** default-deny ingress plus an explicit allow for port 8080 (Antrea, VKS's default CNI, enforces this).
- **Pod Security Admission `restricted`** labels on the namespace.

### 1. Log in to the VKS cluster

```bash
# Log in to the Supervisor and switch to your VKS cluster context
kubectl vsphere login \
  --server=<supervisor-endpoint> \
  --tanzu-kubernetes-cluster-name=<vks-cluster-name> \
  --tanzu-kubernetes-cluster-namespace=<vsphere-namespace>

kubectl config use-context <vks-cluster-name>
kubectl get nodes   # should show 3 workers
```

### 2. Push the image to a registry the cluster can reach

VKS worker nodes can't see your laptop's Docker daemon, so the image has to
live in a registry. Harbor (bundled with VCF / Tanzu) is the typical choice:

```bash
REGISTRY=harbor.example.com/chore-chart
TAG=1.0.0

cd chore-chart-app
docker build -t $REGISTRY/chore-chart:$TAG .
docker push  $REGISTRY/chore-chart:$TAG
```

Docker Hub, ECR, GCR, or any OCI registry works too — just make sure your VKS
cluster has network access to it (and a pull secret if it's private; see the
"Private registry" note below).

### 3. Point the overlay at your image

Edit `k8s/vks/kustomization.yaml`:

```yaml
images:
  - name: chore-chart
    newName: harbor.example.com/chore-chart/chore-chart   # <-- your registry
    newTag: "1.0.0"                                         # <-- your tag
```

### 4. Deploy

```bash
kubectl apply -k k8s/vks/
kubectl -n chore-chart rollout status deploy/chore-chart
kubectl -n chore-chart get pods -o wide   # one pod per worker node
```

### 5. Get the LoadBalancer URL

```bash
kubectl -n chore-chart get svc chore-chart
# NAME          TYPE           CLUSTER-IP     EXTERNAL-IP     PORT(S)
# chore-chart   LoadBalancer   10.96.42.17    10.20.30.40    80:31234/TCP
```

Open `http://<EXTERNAL-IP>` in a browser. If `EXTERNAL-IP` stays `<pending>`,
confirm your VKS cluster has the NSX ALB integration enabled (or adjust
`patch-service.yaml` to `ClusterIP` + an Ingress instead).

### Private registry (Harbor) pull secret

If your registry requires authentication:

```bash
kubectl -n chore-chart create secret docker-registry harbor-creds \
  --docker-server=harbor.example.com \
  --docker-username=<user> \
  --docker-password=<password>
```

Then add to `k8s/vks/patch-deployment.yaml` under `spec.template.spec`:

```yaml
imagePullSecrets:
  - name: harbor-creds
```

### Tearing it down

```bash
kubectl delete -k k8s/vks/
```

### Notes

- The container runs as a non-root user with a read-only root filesystem, drops all capabilities, and requests only 10m CPU / 16Mi memory — safe to run on hardened local clusters.
- All chore/member data lives in each browser's `localStorage`, so there's nothing to persist at the cluster level; replicas are interchangeable.
- To change the image tag, edit `k8s/kustomization.yaml` under `images:` and re-apply.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup and tab layout |
| `style.css` | Theme (auto light/dark), layout, week grid, leaderboard styling |
| `app.js` | State management (localStorage), rendering, event handling |
| `Dockerfile` | Packages the static site with nginx on port 8080 |
| `nginx.conf` | nginx server config with gzip, caching, and a `/healthz` endpoint |
| `k8s/` | Base manifests — Namespace, Deployment, Service, optional Ingress, Kustomization |
| `k8s/vks/` | VMware VKS overlay — LoadBalancer, 3-way topology spread, PDB, NetworkPolicy, PSA |

## Data model

All data is persisted under the `chore-chart-v1` key in `localStorage`:

```json
{
  "members": [{ "id": "abc123", "name": "Alex", "color": "#6c9df8" }],
  "chores": [{
    "id": "xyz789",
    "name": "Take out the trash",
    "assigneeId": "abc123",
    "points": 5,
    "days": [1, 3, 5],
    "notes": "Rinse the bin on trash day"
  }],
  "completions": {
    "2026-04-15": { "xyz789": true }
  }
}
```

`days` uses JavaScript's day-of-week convention: `0 = Sunday … 6 = Saturday`.

## Tips for parents

- Use **Export Data** on the Manage tab weekly to keep a backup.
- Let each teen pick their own color — it's their avatar across every view.
- Points are flexible: treat 1 pt = $0.10, or stars, or screen-time minutes — whatever motivates.
- The streak card is a fun nudge: missing *any* scheduled chore for the day resets it.

Enjoy!
