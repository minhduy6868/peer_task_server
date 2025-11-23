const jwt = require('jsonwebtoken');

// Store active rooms and peers
const rooms = new Map(); // roomId -> Set of socket IDs
const socketToRoom = new Map(); // socketId -> roomId
const socketToUser = new Map(); // socketId -> userId

function setupSocketHandlers(io) {
  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userEmail = decoded.email;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id} (user: ${socket.userId})`);
    socketToUser.set(socket.id, socket.userId);

    // Join a room (board)
    socket.on('join_room', (roomId) => {
      console.log(`📥 ${socket.id} joining room: ${roomId}`);

      // Leave previous room if any
      const previousRoom = socketToRoom.get(socket.id);
      if (previousRoom) {
        leaveRoom(socket, previousRoom);
      }

      // Join new room
      socket.join(roomId);
      socketToRoom.set(socket.id, roomId);

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }
      rooms.get(roomId).add(socket.id);

      // Get list of other peers in the room
      const peers = Array.from(rooms.get(roomId))
        .filter(id => id !== socket.id)
        .map(id => ({
          socketId: id,
          userId: socketToUser.get(id)
        }));

      // Send current peers to the new joiner
      socket.emit('room_joined', { roomId, peers });

      // Notify other peers about the new joiner
      socket.to(roomId).emit('peer_joined', {
        socketId: socket.id,
        userId: socket.userId
      });

      console.log(`✅ ${socket.id} joined room ${roomId}. Total peers: ${rooms.get(roomId).size}`);
    });

    // Relay WebRTC signaling messages
    socket.on('signal', ({ to, signal }) => {
      console.log(`📡 Relaying signal from ${socket.id} to ${to}`);
      io.to(to).emit('signal', {
        from: socket.id,
        signal
      });
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
    });
  });

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
}

module.exports = { setupSocketHandlers };
