require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const refreshRoutes = require('./routes/refresh');
const workspaceRoutes = require('./routes/workspaces');
const workspaceMembersRoutes = require('./routes/workspace_members');
const boardRoutes = require('./routes/boards');
const boardMembersRoutes = require('./routes/board_members');
const taskRoutes = require('./routes/tasks');
const operationRoutes = require('./routes/operations');
const adminRoutes = require('./routes/admin');
const aiRoutes = require('./routes/ai');  // 🤖 AI Proxy for Ollama
// const migrationRoutes = require('./routes/migration'); // Commented out - not needed
const { setupSocketHandlers } = require('./sockets/signaling');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/auth', authRoutes);
app.use('/token', refreshRoutes);
app.use('/workspaces', workspaceRoutes);
app.use('/workspaces', workspaceMembersRoutes);
app.use('/boards', boardRoutes);
app.use('/boards', boardMembersRoutes);
app.use('/tasks', taskRoutes);
app.use('/operations', operationRoutes);
app.use('/admin', adminRoutes);
app.use('/ai', aiRoutes);  // 🤖 AI Proxy: /ai/generate, /ai/tags, /ai/health
// app.use('/migration', migrationRoutes); // Commented out - not needed

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Setup Socket.IO handlers
setupSocketHandlers(io);

const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`🚀 PeerTask server running on port ${PORT}`);
  console.log(`📡 Signaling server ready`);
});

module.exports = { app, io };
