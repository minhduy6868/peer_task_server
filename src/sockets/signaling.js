const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

// Store active rooms and peers
const rooms = new Map(); // roomId -> Set of socket IDs
const socketToRoom = new Map(); // socketId -> roomId
const socketToUser = new Map(); // socketId -> userId
const socketToUserInfo = new Map(); // socketId -> {userId, userName, avatar, isMuted}

// Store offline P2P rooms (room code -> room data)
const offlineRooms = new Map(); // roomCode -> {roomCode, users: Map(socketId -> userName)}

function setupSocketHandlers(io) {
  // Authentication middleware (skip for offline mode)
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    // Allow connection without token (offline mode)
    if (!token) {
      socket.isOfflineMode = true;
      console.log(`🔓 Offline mode connection: ${socket.id}`);
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userEmail = decoded.email;
      socket.isOfflineMode = false;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    if (socket.isOfflineMode) {
      console.log(`✅ Offline P2P client connected: ${socket.id}`);
      setupOfflineHandlers(socket, io);
    } else {
      console.log(`✅ Client connected: ${socket.id} (user: ${socket.userId})`);
      socketToUser.set(socket.id, socket.userId);
      setupOnlineHandlers(socket, io);
    }
  });
}

// Online mode handlers (authenticated)
function setupOnlineHandlers(socket, io) {

  // Join a room (board)
  socket.on('join_room', async (roomId) => {
    console.log(`📥 ${socket.id} joining room: ${roomId}`);

    // Leave previous room if any
    const previousRoom = socketToRoom.get(socket.id);
    if (previousRoom) {
      leaveRoom(socket, previousRoom);
    }

    // Query user info from database
    let userName = null;
    let avatar = null;
    try {
      const result = await pool.query(
        'SELECT name, avatar FROM users WHERE id = $1',
        [socket.userId]
      );
      if (result.rows.length > 0) {
        userName = result.rows[0].name;
        avatar = result.rows[0].avatar;
      }
    } catch (error) {
      console.error('Error fetching user info:', error);
    }

    // Store user info
    socketToUserInfo.set(socket.id, {
      userId: socket.userId,
      userName: userName || socket.userEmail || socket.userId,
      avatar: avatar,
      isMuted: false  // Default mic is not muted
    });

    // Join new room
    socket.join(roomId);
    socketToRoom.set(socket.id, roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(socket.id);

    // Get list of other peers in the room with full info
    const peers = Array.from(rooms.get(roomId))
      .filter(id => id !== socket.id)
      .map(id => {
        const userInfo = socketToUserInfo.get(id) || {};
        return {
          socketId: id,
          userId: socketToUser.get(id),
          userName: userInfo.userName,
          avatar: userInfo.avatar,
          isMuted: userInfo.isMuted || false
        };
      });

    // Send current peers to the new joiner
    socket.emit('room_joined', { roomId, peers });

    // Notify other peers about the new joiner with full info
    const userInfo = socketToUserInfo.get(socket.id) || {};
    socket.to(roomId).emit('peer_joined', {
      socketId: socket.id,
      userId: socket.userId,
      userName: userInfo.userName,
      avatar: userInfo.avatar,
      isMuted: userInfo.isMuted || false
    });

    console.log(`✅ ${socket.id} (${userInfo.userName}) joined room ${roomId}. Total peers: ${rooms.get(roomId).size}`);
  });

  // Relay WebRTC signaling messages
  socket.on('signal', ({ to, signal }) => {
    console.log(`📡 Relaying signal from ${socket.id} to ${to}`);
    io.to(to).emit('signal', {
      from: socket.id,
      signal
    });
  });

  // Update mic status
  socket.on('update_mic_status', ({ isMuted }) => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;

    // Update stored state
    const userInfo = socketToUserInfo.get(socket.id);
    if (userInfo) {
      userInfo.isMuted = isMuted;
      socketToUserInfo.set(socket.id, userInfo);
    }

    // Broadcast to all other peers in the room
    socket.to(roomId).emit('peer_mic_updated', {
      socketId: socket.id,
      isMuted: isMuted
    });

    console.log(`🎤 ${socket.id} mic status updated: ${isMuted ? 'muted' : 'unmuted'}`);
  });

  // Leave room
  socket.on('leave_room', () => {
    const roomId = socketToRoom.get(socket.id);
    if (roomId) {
      leaveRoom(socket, roomId);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
    
    const roomId = socketToRoom.get(socket.id);
    if (roomId) {
      leaveRoom(socket, roomId);
    }

    socketToUser.delete(socket.id);
    socketToRoom.delete(socket.id);
    socketToUserInfo.delete(socket.id);
  });
}

// Offline P2P mode handlers (no authentication)
function setupOfflineHandlers(socket, io) {
  // Create room
  socket.on('create_room', ({ roomCode, userName }) => {
    console.log(`🚪 Creating offline room: ${roomCode} by ${userName}`);
    
    if (!offlineRooms.has(roomCode)) {
      offlineRooms.set(roomCode, {
        roomCode,
        users: new Map()
      });
    }
    
    const room = offlineRooms.get(roomCode);
    room.users.set(socket.id, userName);
    socket.roomCode = roomCode;
    socket.userName = userName;
    socket.join(`offline_${roomCode}`);
    
    // Send empty peers list to creator
    socket.emit('peers_in_room', []);
    
    console.log(`✅ Offline room ${roomCode} created by ${userName}`);
  });
  
  // Join room
  socket.on('join_room', ({ roomCode, userName }) => {
    console.log(`🚪 ${userName} joining offline room: ${roomCode}`);
    
    if (!offlineRooms.has(roomCode)) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    const room = offlineRooms.get(roomCode);
    const existingPeers = Array.from(room.users.entries())
      .map(([socketId, userName]) => ({
        socketId,
        userName
      }));
    
    // Add to room
    room.users.set(socket.id, userName);
    socket.roomCode = roomCode;
    socket.userName = userName;
    socket.join(`offline_${roomCode}`);
    
    // Send existing peers to new joiner
    socket.emit('peers_in_room', existingPeers);
    
    // Notify existing peers
    socket.to(`offline_${roomCode}`).emit('peer_joined', {
      socketId: socket.id,
      userName
    });
    
    console.log(`✅ ${userName} joined offline room ${roomCode}. Total: ${room.users.size}`);
  });
  
  // Relay signals
  socket.on('signal', ({ to, signal, roomCode }) => {
    console.log(`📡 Offline signal from ${socket.id} to ${to}`);
    io.to(to).emit('signal', {
      from: socket.id,
      signal
    });
  });
  
  // Leave room
  socket.on('leave_room', (roomCode) => {
    if (offlineRooms.has(roomCode)) {
      const room = offlineRooms.get(roomCode);
      room.users.delete(socket.id);
      
      socket.to(`offline_${roomCode}`).emit('peer_left', {
        socketId: socket.id
      });
      
      // Clean up empty rooms
      if (room.users.size === 0) {
        offlineRooms.delete(roomCode);
        console.log(`🗑️ Deleted empty offline room: ${roomCode}`);
      }
    }
  });
  
  // Disconnect
  socket.on('disconnect', () => {
    console.log(`❌ Offline client disconnected: ${socket.id}`);
    
    if (socket.roomCode && offlineRooms.has(socket.roomCode)) {
      const room = offlineRooms.get(socket.roomCode);
      room.users.delete(socket.id);
      
      socket.to(`offline_${socket.roomCode}`).emit('peer_left', {
        socketId: socket.id
      });
      
      // Clean up empty rooms
      if (room.users.size === 0) {
        offlineRooms.delete(socket.roomCode);
        console.log(`🗑️ Deleted empty offline room: ${socket.roomCode}`);
      }
    }
  });
}

function leaveRoom(socket, roomId) {
  socket.leave(roomId);
    
    if (rooms.has(roomId)) {
      rooms.get(roomId).delete(socket.id);
      
      // Notify other peers
      socket.to(roomId).emit('peer_left', {
        socketId: socket.id,
        userId: socket.userId
      });

      // Clean up empty rooms
      if (rooms.get(roomId).size === 0) {
        rooms.delete(roomId);
      }
    }

    console.log(`👋 ${socket.id} left room ${roomId}`);
  }


module.exports = { setupSocketHandlers };
