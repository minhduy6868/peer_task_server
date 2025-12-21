# 🚀 PeerTask Server Deployment Guide

Hướng dẫn triển khai Database và Backend cho PeerTask

## 📋 Mục lục

1. [Yêu cầu hệ thống](#yêu-cầu-hệ-thống)
2. [Cài đặt PostgreSQL](#cài-đặt-postgresql)
3. [Cấu hình Database](#cấu-hình-database)
4. [Cài đặt Backend](#cài-đặt-backend)
5. [Deployment trên Production](#deployment-trên-production)
6. [Bảo trì và Quản lý](#bảo-trì-và-quản-lý)

---

## 🔧 Yêu cầu hệ thống

### Development
- Node.js >= 16.x
- PostgreSQL >= 13.x
- npm hoặc yarn
- Git

### Production (khuyên dùng)
- Ubuntu 20.04+ hoặc Windows Server
- PostgreSQL 14+
- Node.js 18 LTS
- PM2 (process manager)
- Nginx (reverse proxy)

---

## 💾 Cài đặt PostgreSQL

### Windows

1. **Download PostgreSQL:**
   - Truy cập: https://www.postgresql.org/download/windows/
   - Tải bản installer mới nhất (recommended: PostgreSQL 14+)

2. **Cài đặt:**
   ```powershell
   # Chạy installer và làm theo hướng dẫn
   # Chú ý: Ghi nhớ mật khẩu của user postgres
   ```

3. **Kiểm tra cài đặt:**
   ```powershell
   psql --version
   # Output: psql (PostgreSQL) 14.x
   ```

### Ubuntu/Linux

```bash
# Update package list
sudo apt update

# Cài đặt PostgreSQL
sudo apt install postgresql postgresql-contrib

# Khởi động service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Kiểm tra
sudo systemctl status postgresql
```

### macOS

```bash
# Sử dụng Homebrew
brew install postgresql@14

# Khởi động service
brew services start postgresql@14
```

---

## 🗄️ Cấu hình Database

### 1. Tạo Database và User

**Windows (PowerShell):**
```powershell
# Mở SQL Shell (psql) hoặc pgAdmin

# Kết nối với user postgres
psql -U postgres

# Trong psql console:
CREATE DATABASE peertask;
CREATE USER peertask_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE peertask TO peertask_user;
\q
```

**Linux/macOS:**
```bash
# Switch to postgres user
sudo -u postgres psql

# Trong psql console:
CREATE DATABASE peertask;
CREATE USER peertask_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE peertask TO peertask_user;
\q
```

### 2. Cấu hình biến môi trường

Tạo file `.env` trong thư mục `server/`:

```bash
# Database
DATABASE_URL=postgresql://peertask_user:your_secure_password@localhost:5432/peertask

# JWT
JWT_SECRET=your_super_secret_jwt_key_min_32_characters
JWT_REFRESH_SECRET=your_super_secret_refresh_key_min_32_characters

# Server
PORT=3000
NODE_ENV=development

# Email (EmailJS) - optional
EMAILJS_PUBLIC_KEY=your_emailjs_public_key
EMAILJS_PRIVATE_KEY=your_emailjs_private_key
EMAILJS_SERVICE_ID=your_service_id
EMAILJS_TEMPLATE_ID=your_template_id

# Cloudinary (Image Upload) - optional
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# CORS - Frontend URL
CLIENT_URL=http://localhost:3001
```

**Lưu ý bảo mật:**
- ⚠️ KHÔNG commit file `.env` lên Git
- Sử dụng mật khẩu mạnh (ít nhất 16 ký tự)
- Thay đổi JWT secrets trong production

### 3. Chạy Migration

```bash
# Di chuyển vào thư mục server
cd server

# Cài đặt dependencies
npm install

# Chạy migration để tạo schema
npm run db:migrate
```

Bạn sẽ thấy output:
```
🚀 Starting PeerTask database migration...
📊 Creating tables and indexes...
✅ Migration completed successfully!
📝 Database schema is ready for use.
```

### 4. Kiểm tra Database

```bash
# Kết nối vào database
psql -U peertask_user -d peertask

# Kiểm tra các bảng đã tạo
\dt

# Kiểm tra cấu trúc bảng users
\d users

# Output sẽ hiển thị:
#  id            | uuid
#  email         | varchar(255)
#  password_hash | varchar(255)
#  name          | varchar(255)
#  avatar        | text
#  created_at    | timestamp
#  updated_at    | timestamp

# Thoát
\q
```

---

## 🔌 Cài đặt Backend

### 1. Clone và Setup

```bash
# Clone repository (nếu chưa có)
git clone <your-repo-url>
cd peer_task/server

# Cài đặt dependencies
npm install

# Copy file môi trường mẫu
cp .env.example .env

# Chỉnh sửa .env với thông tin của bạn
# Windows: notepad .env
# Linux/Mac: nano .env
```

### 2. Chạy Development Server

```bash
# Development mode với auto-reload
npm run dev

# Hoặc production mode
npm start
```

Server sẽ chạy tại: `http://localhost:3000`

### 3. Test API

**Kiểm tra health check:**
```bash
curl http://localhost:3000/api/health

# Response:
# {"status":"ok","timestamp":"2025-12-21T..."}
```

**Test đăng ký user:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!",
    "name": "Test User"
  }'
```

---

## 🌐 Deployment trên Production

### Option 1: VPS/Cloud Server (Ubuntu)

#### 1. Chuẩn bị Server

```bash
# Update hệ thống
sudo apt update && sudo apt upgrade -y

# Cài đặt Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Cài đặt PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Cài đặt PM2
sudo npm install -g pm2

# Cài đặt Nginx
sudo apt install -y nginx
```

#### 2. Setup Database

```bash
# Tạo database user
sudo -u postgres psql
CREATE DATABASE peertask;
CREATE USER peertask_user WITH PASSWORD 'production_password';
GRANT ALL PRIVILEGES ON DATABASE peertask TO peertask_user;
\q

# Configure PostgreSQL to allow connections
sudo nano /etc/postgresql/14/main/pg_hba.conf
# Thêm dòng:
# local   peertask    peertask_user                   md5

# Restart PostgreSQL
sudo systemctl restart postgresql
```

#### 3. Deploy Application

```bash
# Clone code
cd /var/www
sudo git clone <your-repo-url> peertask
cd peertask/server

# Install dependencies
sudo npm install --production

# Setup .env cho production
sudo nano .env
# Cập nhật với thông tin production

# Run migration
sudo npm run db:migrate

# Setup PM2
sudo pm2 start src/index.js --name peertask-server
sudo pm2 startup
sudo pm2 save
```

#### 4. Cấu hình Nginx

```bash
sudo nano /etc/nginx/sites-available/peertask
```

Thêm nội dung:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/peertask /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 5. SSL với Let's Encrypt (Optional nhưng khuyên dùng)

```bash
# Cài đặt Certbot
sudo apt install -y certbot python3-certbot-nginx

# Lấy SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renew sẽ được cấu hình tự động
```

### Option 2: Heroku

```bash
# Cài đặt Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# Login
heroku login

# Tạo app
cd server
heroku create peertask-api

# Thêm PostgreSQL addon
heroku addons:create heroku-postgresql:hobby-dev

# Set environment variables
heroku config:set JWT_SECRET=your_secret
heroku config:set JWT_REFRESH_SECRET=your_refresh_secret
heroku config:set NODE_ENV=production

# Deploy
git push heroku main

# Run migration
heroku run npm run db:migrate

# Xem logs
heroku logs --tail
```

### Option 3: Docker

Tạo `Dockerfile` trong thư mục `server/`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

Tạo `docker-compose.yml` trong thư mục root:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_USER: peertask_user
      POSTGRES_PASSWORD: your_password
      POSTGRES_DB: peertask
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  server:
    build: ./server
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://peertask_user:your_password@postgres:5432/peertask
      JWT_SECRET: your_jwt_secret
      JWT_REFRESH_SECRET: your_refresh_secret
      NODE_ENV: production
    depends_on:
      - postgres
    restart: unless-stopped

volumes:
  postgres_data:
```

Chạy:
```bash
docker-compose up -d
docker-compose exec server npm run db:migrate
```

---

## 🛠️ Bảo trì và Quản lý

### Backup Database

```bash
# Backup toàn bộ database
pg_dump -U peertask_user peertask > backup_$(date +%Y%m%d).sql

# Restore
psql -U peertask_user peertask < backup_20251221.sql
```

### Utility Scripts

```bash
# Reset database (⚠️ XÓA TẤT CẢ DỮ LIỆU)
npm run db:reset

# Xóa operations cũ (cleanup CRDT)
npm run db:cleanup

# Kiểm tra database connection
npm run db:check
```

### Monitoring với PM2

```bash
# Xem status
pm2 status

# Xem logs
pm2 logs peertask-server

# Restart
pm2 restart peertask-server

# Monitor
pm2 monit
```

### Database Maintenance

```bash
# Kết nối vào database
psql -U peertask_user -d peertask

-- Xem số lượng operations
SELECT COUNT(*) FROM board_operations;

-- Xóa operations cũ hơn 30 ngày
DELETE FROM board_operations 
WHERE created_at < NOW() - INTERVAL '30 days';

-- Vacuum database
VACUUM ANALYZE;
```

---

## 📊 Troubleshooting

### Lỗi kết nối Database

```bash
# Kiểm tra PostgreSQL đang chạy
# Windows:
Get-Service postgresql*

# Linux:
sudo systemctl status postgresql

# Kiểm tra kết nối
psql -U peertask_user -d peertask -h localhost
```

### Port đã được sử dụng

```bash
# Windows - Kill process trên port 3000
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process

# Linux/Mac
lsof -ti:3000 | xargs kill
```

### Migration lỗi

```bash
# Xóa database và tạo lại (⚠️ MẤT DỮ LIỆU)
psql -U postgres
DROP DATABASE peertask;
CREATE DATABASE peertask;
GRANT ALL PRIVILEGES ON DATABASE peertask TO peertask_user;
\q

# Chạy lại migration
npm run db:migrate
```

---

## 🔐 Security Checklist

- [ ] Thay đổi mật khẩu database mặc định
- [ ] Sử dụng JWT secrets mạnh (>= 32 ký tự)
- [ ] Không commit file `.env`
- [ ] Enable HTTPS/SSL cho production
- [ ] Cấu hình CORS đúng (chỉ cho phép domain của bạn)
- [ ] Giới hạn rate limiting cho API
- [ ] Backup database định kỳ
- [ ] Update dependencies thường xuyên
- [ ] Sử dụng firewall (chỉ mở port cần thiết)
- [ ] Monitor logs và errors

---

## 📞 Hỗ trợ

Nếu gặp vấn đề:
1. Kiểm tra logs: `pm2 logs` hoặc console output
2. Kiểm tra file `.env` đã cấu hình đúng
3. Kiểm tra PostgreSQL connection
4. Xem phần Troubleshooting ở trên

---

**Chúc bạn deploy thành công! 🎉**
