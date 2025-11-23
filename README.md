# PeerTask Server

Node.js signaling server for PeerTask collaborative whiteboard.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Edit `.env` with your database credentials

4. Run migrations:
```bash
npm run db:migrate
```

5. Start server:
```bash
npm run dev
```

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

### WebSocket Events (Socket.IO)
- `join_room` - Join a board room
- `leave_room` - Leave current room
- `signal` - Relay WebRTC signaling
- `room_joined` - Emitted when successfully joined
- `peer_joined` - Emitted when another peer joins
- `peer_left` - Emitted when a peer leaves

## Architecture

The server handles:
1. User authentication (JWT)
2. Workspace and board management
3. WebRTC signaling (room management, peer discovery)

The server does NOT:
- Relay whiteboard operations (P2P via WebRTC DataChannel)
- Store board state (client-side only)
