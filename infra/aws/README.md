# PeerTask trên AWS (giai đoạn 1)

Mình **không apply hộ được**: máy dev chưa cài AWS CLI / Terraform và không có key tài khoản của bạn. AWS tính tiền.

Stack giai đoạn 1 (đủ demo đồ án + cloud database):

- VPC + 2 subnet
- **RDS PostgreSQL** (không public; chỉ EC2 vào được)
- **EC2** chạy image `ghcr.io/minhduy6868/peer_task_server:latest`

EKS (nhiều node + HPA) làm giai đoạn 2 — đắt hơn (~73 USD/tháng control plane).

## Chi phí ước lượng (Singapore `ap-southeast-1`)

| Tài nguyên | Gợi ý | Ghi chú |
| --- | --- | --- |
| EC2 | t3.small | API + Docker |
| RDS | db.t3.micro | 20 GB |
| EKS | chưa tạo | Chỉ khi làm cluster |

Tắt bằng `terraform destroy` khi không demo.

## Việc bạn làm (một lần)

1. Tạo tài khoản AWS, bật MFA, tạo IAM user **Access key** (quyền admin lab hoặc `AmazonEC2FullAccess` + `AmazonRDSFullAccess` + `AmazonVPCFullAccess`).
2. Cài tool (PowerShell admin):

```powershell
winget install Amazon.AWSCLI Hashicorp.Terraform
```

3. Cấu hình (không dán key vào chat):

```powershell
aws configure
# region: ap-southeast-1
aws sts get-caller-identity
```

4. Deploy:

```powershell
cd server/infra/aws
terraform init
terraform plan
terraform apply
```

5. Kiểm tra:

```powershell
terraform output api_url
# mở <url>/health
```

Flutter: ghi URL đó vào `assets/config.json` / Hive — **không** thêm `/api`.

## Giai đoạn 2 (cluster)

Khi CLI chạy được, dựng EKS + 2 worker + trỏ cùng RDS. Không chuyển Postgres vào pod.
