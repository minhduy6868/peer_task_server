# 🎯 Hướng dẫn Deploy Database & Backend - PeerTask

## ✅ Đã hoàn thành

### 1. Cập nhật Migration Script
- ✅ Thêm cột `avatar` vào bảng users
- ✅ Thêm trigger tự động update `updated_at`
- ✅ Consolidate tất cả migrations vào 1 file duy nhất: [src/db/migrate.js](src/db/migrate.js)

### 2. Tạo Utility Scripts
Tất cả scripts được đặt trong thư mục [scripts/](scripts/):

- ✅ **check_db.js** - Kiểm tra database connection và schema
- ✅ **reset_db.js** - Reset database (development only)
- ✅ **cleanup_operations.js** - Dọn dẹp operations cũ

### 3. Cập nhật package.json
Thêm các npm scripts tiện ích:
```json
{
  "db:migrate": "node src/db/migrate.js",
  "db:check": "node scripts/check_db.js",
  "db:cleanup": "node scripts/cleanup_operations.js",
  "db:reset": "node scripts/reset_db.js"
}
```

### 4. Dọn dẹp Files thừa
Đã xóa các file duplicate:
- ❌ add_avatar_column.js
- ❌ setup_avatar_column.js
- ❌ run_migration.js
- ❌ check_db.js (old)
- ❌ clear_operations.js
- ❌ clear_all_operations.js
- ❌ cleanup_stroke_operations.js
- ❌ setup_avatar.sql
- ❌ clear_operations.sql
- ❌ clear_all_operations.sql
- ❌ cleanup_stroke_operations.sql
- ❌ migrations/add_avatar_column.sql
- ❌ migrations/run_this.sql

### 5. Tạo Documentation
- ✅ **DEPLOYMENT_GUIDE.md** - Hướng dẫn deploy chi tiết
- ✅ **scripts/README.md** - Hướng dẫn utility scripts
- ✅ Cập nhật **server/README.md** với API docs và quick start

---

## 🚀 Hướng dẫn Deploy - Quick Start

### Bước 1: Cài đặt PostgreSQL

**Windows:**
```powershell
# Download từ: https://www.postgresql.org/download/windows/
# Chạy installer và nhớ password của user postgres
```

**Ubuntu/Linux:**
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### Bước 2: Tạo Database

```bash
# Kết nối với PostgreSQL
psql -U postgres

# Tạo database và user
CREATE DATABASE peertask;
CREATE USER peertask_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE peertask TO peertask_user;
\q
```

### Bước 3: Cấu hình Backend

```bash
# Di chuyển vào thư mục server
cd server

# Install dependencies
npm install

# Tạo file .env
cp .env.example .env
```

Chỉnh sửa file `.env`:
```bash
DATABASE_URL=postgresql://peertask_user:your_secure_password@localhost:5432/peertask
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters
JWT_REFRESH_SECRET=your-refresh-secret-key-at-least-32-characters
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:3001
```

### Bước 4: Chạy Migration

```bash
# Tạo schema database
npm run db:migrate

# Kiểm tra database đã OK
npm run db:check
```

Output thành công:
```
🚀 Starting PeerTask database migration...
📊 Creating tables and indexes...
✅ Migration completed successfully!
```

### Bước 5: Start Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

Server sẽ chạy tại: **http://localhost:3000**

### Bước 6: Test API

```bash
# Health check
curl http://localhost:3000/api/health

# Test đăng ký
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!",
    "name": "Test User"
  }'
```

---

## 🌐 Deploy lên Production

### Option 1: VPS/Cloud Server

Xem chi tiết trong [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Mục "Deployment trên Production"

**Quick steps:**
```bash
# 1. Cài đặt môi trường
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs postgresql nginx
sudo npm install -g pm2

# 2. Clone và setup
cd /var/www
sudo git clone <your-repo> peertask
cd peertask/server
sudo npm install --production

# 3. Cấu hình .env cho production

# 4. Chạy migration
sudo npm run db:migrate

# 5. Start với PM2
sudo pm2 start src/index.js --name peertask-server
sudo pm2 startup
sudo pm2 save
```

### Option 2: Docker

```bash
# Sử dụng docker-compose
docker-compose up -d

# Chạy migration
docker-compose exec server npm run db:migrate
```

### Option 3: Heroku

```bash
heroku create peertask-api
heroku addons:create heroku-postgresql:hobby-dev
heroku config:set JWT_SECRET=your_secret
git push heroku main
heroku run npm run db:migrate
```

---

## 🛠️ Database Management

### Kiểm tra Database
```bash
npm run db:check
```

### Dọn dẹp Operations cũ
```bash
# Nên chạy hàng tuần
npm run db:cleanup
```

### Reset Database (Development only)
```bash
# ⚠️ XÓA TẤT CẢ DỮ LIỆU
npm run db:reset
```

### Backup Database
```bash
# Backup
pg_dump -U peertask_user peertask > backup_$(date +%Y%m%d).sql

# Restore
psql -U peertask_user peertask < backup_20251221.sql
```

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       Flutter Client                        │
│              (Windows / Web / iOS / Android)                │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ HTTP REST API + WebSocket
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                    Node.js Backend                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Express.js Server (Port 3000)                        │  │
│  │  - JWT Authentication                                 │  │
│  │  - REST API Endpoints                                │  │
│  │  - Socket.IO WebSocket                               │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Services & Middleware                                │  │
│  │  - Permission checks                                 │  │
│  │  - Email service (EmailJS)                           │  │
│  │  - Image upload (Cloudinary)                         │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ PostgreSQL Connection
                   │
┌──────────────────▼──────────────────────────────────────────┐
│                  PostgreSQL Database                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Tables:                                              │  │
│  │  - users (with avatar)                               │  │
│  │  - workspaces & workspace_members                    │  │
│  │  - boards & board_members                            │  │
│  │  - tasks & strokes                                   │  │
│  │  - board_operations (CRDT)                           │  │
│  │  - refresh_tokens, password_reset_tokens             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔐 Security Checklist

- [ ] Đổi mật khẩu database mặc định
- [ ] Sử dụng JWT secrets mạnh (>= 32 ký tự)
- [ ] Không commit file `.env` lên Git
- [ ] Enable SSL/HTTPS cho production
- [ ] Cấu hình CORS đúng domain
- [ ] Setup firewall (chỉ mở port cần thiết)
- [ ] Backup database định kỳ
- [ ] Update dependencies thường xuyên
- [ ] Monitor logs và errors

---

## 📚 Tài liệu tham khảo

1. **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Hướng dẫn deploy chi tiết đầy đủ
2. **[README.md](README.md)** - API documentation & project structure
3. **[scripts/README.md](scripts/README.md)** - Database utility scripts
4. **[.env.example](.env.example)** - Environment variables template

---

## 🎉 Tổng kết

Bạn đã có:
- ✅ Migration script hoàn chỉnh với avatar support
- ✅ Utility scripts để quản lý database
- ✅ Documentation đầy đủ cho deployment
- ✅ Cleaned up redundant files
- ✅ Ready to deploy!

**Next steps:**
1. Setup database theo hướng dẫn trên
2. Cấu hình file `.env`
3. Chạy `npm run db:migrate`
4. Start server với `npm run dev`
5. Test API endpoints
6. Deploy lên production khi sẵn sàng

**Chúc bạn deploy thành công! 🚀**
