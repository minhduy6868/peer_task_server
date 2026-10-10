# Deploy PeerTask server (Docker + Kubernetes)

`dev` = môi trường phát triển. `main` = bản sẵn sàng lên server (CI gắn tag `latest`).

Image: `ghcr.io/minhduy6868/peer_task_server`.

## AWS (IaaS + RDS)

Giai đoạn 1: Terraform trong [`infra/aws/`](../infra/aws/README.md) — EC2 chạy API, Postgres trên **RDS**. Cần AWS CLI trên máy bạn (`aws configure`); agent không giữ key và không `apply` hộ.

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
| `.github/workflows/cd.yml` | push `dev` / `main` / tag `v*` | Test, build + push GHCR (`dev`, `latest`, sha, tag). Push `main` recreates the API container on EC2 and rolls the K3s pod |

Push lên `main` kéo image theo commit và chạy lại container `peertask-api` trên EC2 (`docker run`, cổng 3000, env `/etc/peertask.env`). Unit systemd bị tắt. Cần:

| Secret / variable | Giá trị |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | Role GitHub OIDC được phép `ssm:SendCommand` |
| `PEERTASK_INSTANCE_ID` | Repository variable, instance id của API |

Push `main` rollout pod K3s. Có `KUBE_CONFIG` thì Actions gọi kubectl trực tiếp. Chưa có secret thì Actions gửi lệnh SSM tới EC2, nơi K3s đang chạy.

| Secret | Giá trị |
| --- | --- |
| `KUBE_CONFIG` | kubeconfig đã encode base64 |

Tạo: `base64 -w0 /etc/rancher/k3s/k3s.yaml` (trên node Ubuntu) hoặc `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\.kube\config"))` (PowerShell). Sửa `server:` trong kubeconfig thành IP public của VPS trước khi encode.

Package GHCR phải **public** hoặc cluster có `imagePullSecret`. Image trên K3s là tag commit (`github.sha`), `imagePullPolicy: Always`.

## K3s trên Ubuntu (RDS + Cloudflare Tunnel)

Một node. API **một** replica, strategy `Recreate`, vì room signaling nằm trong RAM. Postgres là **RDS**, không phải StatefulSet. `k8s/local/` chỉ dành cho cluster thử, không apply lên production.

1. Cài K3s trên Ubuntu:

```bash
curl -sfL https://get.k3s.io | sh -
sudo chmod 644 /etc/rancher/k3s/k3s.yaml
```

2. RDS: security group mở `5432` đúng IP public của VPS. `DATABASE_URL` dùng `sslmode=require`. Giữ nguyên `JWT_SECRET` đang chạy nếu muốn phiên đăng nhập còn hiệu lực.

3. Tạo secret trên cluster (không commit):

```bash
kubectl apply -f k8s/namespace.yaml
kubectl -n peertask create secret generic peertask-api \
  --from-literal=DATABASE_URL='postgresql://USER:PASSWORD@your-db.ap-southeast-1.rds.amazonaws.com:5432/peertask?sslmode=require' \
  --from-literal=JWT_SECRET='at-least-32-random-chars' \
  --from-literal=ADMIN_SECRET=''
```

4. Cloudflare Zero Trust → Tunnel (remotely managed). Public hostname `api.peertask.24now.space`, service:

```text
http://peertask-api.peertask.svc.cluster.local:3000
```

```bash
kubectl -n peertask create secret generic peertask-tunnel \
  --from-literal=TUNNEL_TOKEN='paste-the-tunnel-token'
```

Tunnel chuyển WebSocket. TLS dừng ở Cloudflare. Không mở cổng 3000 ra internet.

5. Apply và đợi pod API:

```bash
kubectl apply -k k8s
kubectl -n peertask rollout status deployment/peertask-api --timeout=180s
```

Entrypoint của image tự chạy migration trước `node src/index.js`. Health: `GET /health`. Socket.IO cùng cổng 3000, không có prefix `/api`.

6. Giữ một origin public. Khi `https://api.peertask.24now.space/health` trả `status: ok` và Socket.IO nối được, trỏ client và Worker Cloudflare sang hostname Tunnel. Sau đó tắt job SSM trên EC2.

CD trên `main` làm bước 5 với tag commit. Secret `peertask-api` và `peertask-tunnel` tạo một lần trên cluster. Thiếu `peertask-tunnel` thì `cloudflared` không sẵn sàng, pod API vẫn rollout.

## Client

Flutter đọc URL theo `ConfigService` (Hive → Firebase REST → `assets/config.json`). Trỏ tới `https://api.peertask.24now.space` — **không** có prefix `/api`.
