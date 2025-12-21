# PeerTask Server

Backend API và signaling server cho ứng dụng PeerTask - Collaborative Whiteboard & Task Management.

## 📋 Tính năng

- 🔐 Authentication & Authorization (JWT)
- 👥 Multi-workspace & Multi-board management
- 🎨 Real-time collaborative canvas (WebRTC + CRDT)
- ✅ Task management với assignees
- 🔄 Operation-based CRDT sync
- 📸 Avatar upload (Cloudinary)
- 📧 Email notifications (EmailJS)
- 🔌 WebSocket signaling (Socket.IO)

## 🚀 Quick Start

### Prerequisites

- Node.js >= 16.x
- PostgreSQL >= 13.x
- npm hoặc yarn

### Installation

```bash
# 1. Install dependencies
npm install

# 2. Copy và cấu hình environment file
cp .env.example .env
# Chỉnh sửa .env với thông tin database của bạn

# 3. Tạo database
createdb peertask
# Hoặc: psql -U postgres -c "CREATE DATABASE peertask;"

# 4. Run migration để tạo schema
npm run db:migrate

# 5. Start development server
npm run dev
```

Server sẽ chạy tại: `http://localhost:3000`

### Environment Variables

Cấu hình trong file `.env`:

```bash
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/peertask

# JWT Secrets (thay đổi cho production!)
JWT_SECRET=your-super-secret-jwt-key-at-least-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-key-at-least-32-chars

# Server
PORT=3000
NODE_ENV=development

# Optional - Email (EmailJS)
EMAILJS_PUBLIC_KEY=your_public_key
EMAILJS_PRIVATE_KEY=your_private_key
EMAILJS_SERVICE_ID=your_service_id
EMAILJS_TEMPLATE_ID=your_template_id

# Optional - Image Upload (Cloudinary)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Frontend URL (CORS)
CLIENT_URL=http://localhost:3001
```

## 📝 Scripts

```bash
# Development
npm run dev          # Start with auto-reload (nodemon)
npm start            # Start production server

# Database Management
npm run db:migrate   # Chạy migration tạo schema
npm run db:check     # Kiểm tra database connection & tables
npm run db:cleanup   # Dọn dẹp operations cũ
npm run db:reset     # ⚠️ Reset database (XÓA ALL DATA!)

# Testing
npm test             # Run tests
```

Xem chi tiết: [scripts/README.md](scripts/README.md)

## 🗄️ Database Schema

### Core Tables

- **users** - User accounts với avatar support
- **workspaces** - Top-level organization
- **workspace_members** - Member roles (owner/editor/viewer)
- **boards** - Collaborative boards trong workspace
- **board_members** - Board-level permissions
- **tasks** - Kanban tasks với multiple assignees
- **strokes** - Canvas drawing data
- **board_operations** - CRDT operation log

### Auth Tables

- **refresh_tokens** - JWT refresh tokens
- **password_reset_tokens** - Password recovery
- **workspace_invites** - Shareable invite links

Xem full schema: [src/db/migrate.js](src/db/migrate.js)

## API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login

### Workspaces
- `POST /workspaces` - Create workspace
- `GET /workspaces` - Get user's workspaces
- `POST /workspaces/:id/invite` - Invite user to workspace

### Boards
- `POST /boards` - Create board
- `GET /boards/workspace/:workspaceId` - Get workspace boards
- `GET /boards/:id` - Get board details

Xem full schema: [src/db/migrate.js](src/db/migrate.js)

## 🔌 API Endpoints

### Authentication
```
POST   /api/auth/register        - Đăng ký user mới
POST   /api/auth/login           - Đăng nhập
POST   /api/auth/refresh         - Refresh access token
POST   /api/auth/logout          - Đăng xuất
POST   /api/auth/forgot-password - Quên mật khẩu
POST   /api/auth/reset-password  - Reset mật khẩu
PUT    /api/auth/profile         - Cập nhật profile
POST   /api/auth/avatar          - Upload avatar
```

### Workspaces
```
POST   /api/workspaces           - Tạo workspace mới
GET    /api/workspaces           - Lấy danh sách workspaces
GET    /api/workspaces/:id       - Chi tiết workspace
PUT    /api/workspaces/:id       - Cập nhật workspace
DELETE /api/workspaces/:id       - Xóa workspace
POST   /api/workspaces/:id/invite - Tạo invite link
POST   /api/workspaces/join/:token - Join qua invite
```

### Workspace Members
```
GET    /api/workspaces/:id/members        - Danh sách members
POST   /api/workspaces/:id/members        - Thêm member
PUT    /api/workspaces/:id/members/:userId - Cập nhật role
DELETE /api/workspaces/:id/members/:userId - Xóa member
```

### Boards
```
POST   /api/boards                        - Tạo board mới
GET    /api/boards/workspace/:workspaceId - Boards của workspace
GET    /api/boards/:id                    - Chi tiết board
PUT    /api/boards/:id                    - Cập nhật board
DELETE /api/boards/:id                    - Xóa board
```

### Board Members
```
GET    /api/boards/:id/members        - Danh sách members
POST   /api/boards/:id/members        - Thêm member
PUT    /api/boards/:id/members/:userId - Cập nhật permission
DELETE /api/boards/:id/members/:userId - Xóa member
```

### Tasks
```
GET    /api/boards/:boardId/tasks    - Lấy tasks của board
POST   /api/boards/:boardId/tasks    - Tạo task mới
PUT    /api/tasks/:id                - Cập nhật task
DELETE /api/tasks/:id                - Xóa task
```

### Operations (CRDT Sync)
```
POST   /api/operations                - Push operations
GET    /api/operations/:boardId       - Pull operations
GET    /api/operations/:boardId/since/:timestamp - Sync từ timestamp
```

## 🔌 WebSocket Events

### Client → Server
```javascript
// Join board room
socket.emit('join_room', { boardId: 'uuid' });

// Leave room
socket.emit('leave_room', { boardId: 'uuid' });

// WebRTC signaling
socket.emit('signal', {
  to: 'peer-socket-id',
  signal: rtcSignalData
});

// Broadcast operation
socket.emit('operation', {
  boardId: 'uuid',
  operation: { /* CRDT operation */ }
});
```

### Server → Client
```javascript
// Room joined confirmation
socket.on('room_joined', ({ boardId, peers }) => {});

// New peer joined
socket.on('peer_joined', ({ peerId, userId }) => {});

// Peer left
socket.on('peer_left', ({ peerId }) => {});

// WebRTC signal
socket.on('signal', ({ from, signal }) => {});

// Operation broadcast
socket.on('operation', ({ operation, fromUserId }) => {});
```

## 🏗️ Project Structure

```
server/
├── src/
│   ├── index.js              # Entry point
│   ├── config/
│   │   └── cloudinary.js     # Cloudinary config
│   ├── db/
│   │   ├── migrate.js        # Database schema
│   │   └── pool.js           # PostgreSQL connection
│   ├── middleware/
│   │   ├── auth.js           # JWT verification
│   │   ├── errorHandler.js  # Global error handler
│   │   └── permissions.js   # Permission checks
│   ├── routes/
│   │   ├── auth.js           # Auth endpoints
│   │   ├── workspaces.js    # Workspace CRUD
│   │   ├── workspace_members.js
│   │   ├── boards.js         # Board CRUD
│   │   ├── board_members.js
│   │   ├── tasks.js          # Task management
│   │   ├── operations.js     # CRDT sync
│   │   └── admin.js          # Admin utilities
│   ├── services/
│   │   └── email.js          # Email service
│   └── sockets/
│       └── signaling.js      # WebSocket handlers
├── scripts/
│   ├── check_db.js           # DB health check
│   ├── cleanup_operations.js # Operations cleanup
│   └── reset_db.js           # Reset database
├── .env.example              # Environment template
├── package.json
└── README.md
```

## 📚 Deployment

Xem hướng dẫn chi tiết: **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)**

### Quick Deploy với PM2

```bash
# Install PM2
npm install -g pm2

# Start server
pm2 start src/index.js --name peertask-server

# Setup auto-start
pm2 startup
pm2 save

# Monitor
pm2 monit
```

### Docker

```bash
# Build image
docker build -t peertask-server .

# Run với docker-compose
docker-compose up -d

# Migrate database
docker-compose exec server npm run db:migrate
```

## 🔧 Troubleshooting

### Database Connection Error
```bash
# Kiểm tra PostgreSQL đang chạy
# Windows:
Get-Service postgresql*

# Linux:
sudo systemctl status postgresql

# Test connection
npm run db:check
```

### Port Already in Use
```bash
# Windows - Kill process on port 3000
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process

# Linux/Mac
lsof -ti:3000 | xargs kill
```

### Migration Fails
```bash
# Reset và chạy lại
npm run db:reset

# Hoặc manual
psql -U postgres
DROP DATABASE peertask;
CREATE DATABASE peertask;
\q
npm run db:migrate
```

## 📖 Documentation

- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Hướng dẫn deployment chi tiết
- [scripts/README.md](scripts/README.md) - Database utility scripts
- [P2P_LAN_SUMMARY.md](../P2P_LAN_SUMMARY.md) - P2P architecture
- [WINDOWS_BUILD_GUIDE.md](../WINDOWS_BUILD_GUIDE.md) - Windows build guide

## 🤝 Contributing

1. Fork the repo
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

## 📄 License

MIT License - see LICENSE file for details

---

**Made with ❤️ for collaborative teams**

- `peer_left` - Emitted when a peer leaves

## Architecture

The server handles:
1. User authentication (JWT)
2. Workspace and board management
3. WebRTC signaling (room management, peer discovery)

The server does NOT:
- Relay whiteboard operations (P2P via WebRTC DataChannel)
- Store board state (client-side only)
