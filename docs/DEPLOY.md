# Deploy PeerTask server (Docker + Kubernetes)

`dev` = môi trường phát triển. `main` = bản sẵn sàng lên server (CI gắn tag `latest`).

Image: `ghcr.io/minhduy6868/peer_task_server`.

## Local (Docker Compose)

```bash
docker compose up --build
curl http://localhost:3000/health
```

Postgres: `postgresql://peertask:peertask@localhost:5432/peertask`. Đổi `JWT_SECRET` trước khi public.

## CI/CD (GitHub Actions)

| Workflow | Khi nào | Việc |
| --- | --- | --- |
| `.github/workflows/ci.yml` | PR / push `dev` + `main` | `npm test` + build Docker (không push) |
| `.github/workflows/cd.yml` | push `dev` / `main` / tag `v*` | Build + push GHCR (`dev`, `latest`, sha, tag) |

Deploy Kubernetes **không** chạy tự động. Trong Actions → **cd** → Run workflow, bật `deploy`, cần secret:

| Secret | Giá trị |
| --- | --- |
| `KUBE_CONFIG` | kubeconfig đã encode base64 |

Tạo: `base64 -w0 ~/.kube/config` (Linux) hoặc `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\.kube\config"))` (PowerShell).

Package GHCR phải **public** hoặc cluster có `imagePullSecret`.

## Kubernetes (VPS / k3s / kubeadm)

1. Sửa host trong `k8s/ingress.yaml` (`api.peertask.example.com`).
2. Tạo secret (không commit `secret.yaml`):

```bash
kubectl apply -f k8s/namespace.yaml
kubectl -n peertask create secret generic peertask-api \
  --from-literal=DATABASE_URL='postgresql://peertask:STRONG_PASSWORD@postgres:5432/peertask' \
  --from-literal=JWT_SECRET='at-least-32-random-chars' \
  --from-literal=POSTGRES_PASSWORD='STRONG_PASSWORD' \
  --from-literal=ADMIN_SECRET=''
```

3. Apply:

```bash
kubectl apply -k k8s
kubectl -n peertask set image deployment/peertask-api \
  api=ghcr.io/minhduy6868/peer_task_server:latest
```

4. Ingress controller (nginx) phải có sẵn. Trỏ DNS về LoadBalancer / NodePort.

Health: `GET /health`. Socket.IO dùng cùng cổng 3000 — replica **= 1** vì room nằm in-memory. Ingress đã bật sticky session + timeout dài cho WebSocket.

### Production thật

- Postgres managed (RDS, Cloud SQL, Supabase) thay StatefulSet trong cluster.
- TLS trên Ingress (`cert-manager`).
- Không scale API ngang hàng cho đến khi signaling dùng Redis adapter.

## Client

Flutter đọc URL theo `ConfigService` (Hive → Firebase REST → `assets/config.json`). Trỏ tới `https://api.peertask.example.com` — **không** có prefix `/api`.
