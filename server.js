// Enhanced Graph Visualizer Server with Socket.IO and AI Integration
const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');
require('dotenv').config();

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

const port = process.env.PORT || 3000;

// ========================
// MIDDLEWARE CONFIGURATION
// ========================

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Enhanced CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve static files with proper MIME types
app.use(express.static(path.join(__dirname), {
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    }
  }
}));

// ========================
// COLLABORATION DATA STRUCTURES
// ========================

// Room management
const rooms = new Map(); // roomId -> { users: Set, graphState: Object, metadata: Object }
const roomUsers = new Map(); // roomId -> Map(socketId -> userInfo)
const userRooms = new Map(); // socketId -> roomId
const roomActivity = new Map(); // roomId -> lastActivity timestamp

// Enhanced room cleanup interval
const ROOM_CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
const ROOM_INACTIVE_TIMEOUT = 60 * 60 * 1000; // 1 hour

// ========================
// HELPER FUNCTIONS
// ========================

/**
 * Generate a unique 6-character room ID
 */
function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Create a new collaboration room
 */
function createRoom(roomId) {
  const room = {
    id: roomId,
    users: new Set(),
    graphState: {
      nodes: [],
      edges: [],
      settings: {
        isDirected: false,
        isWeighted: false
      }
    },
    metadata: {
      createdAt: Date.now(),
      createdBy: null,
      version: 1
    }
  };
  
  rooms.set(roomId, room);
  roomUsers.set(roomId, new Map());
  roomActivity.set(roomId, Date.now());
  
  console.log(`🏠 Room ${roomId} created successfully`);
  return room;
}

/**
 * Join a user to a room
 */
function joinRoom(roomId, socketId, userInfo = {}) {
  if (!rooms.has(roomId)) {
    console.log(`❌ Room ${roomId} not found`);
    return null;
  }

  const room = rooms.get(roomId);
  const users = roomUsers.get(roomId);
  
  room.users.add(socketId);
  users.set(socketId, {
    id: socketId,
    joinedAt: Date.now(),
    ...userInfo
  });
  userRooms.set(socketId, roomId);
  roomActivity.set(roomId, Date.now());
  
  console.log(`🚪 User ${socketId} joined room ${roomId} (${room.users.size} users)`);
  return room;
}

/**
 * Remove a user from a room
 */
function leaveRoom(socketId) {
  const roomId = userRooms.get(socketId);
  if (!roomId) return null;

  const room = rooms.get(roomId);
  const users = roomUsers.get(roomId);
  
  if (room && users) {
    room.users.delete(socketId);
    users.delete(socketId);
    userRooms.delete(socketId);
    roomActivity.set(roomId, Date.now());
    
    // Clean up empty rooms
    if (room.users.size === 0) {
      rooms.delete(roomId);
      roomUsers.delete(roomId);
      roomActivity.delete(roomId);
      console.log(`🗑️ Cleaned up empty room: ${roomId}`);
    } else {
      console.log(`🚪 User ${socketId} left room ${roomId} (${room.users.size} users remaining)`);
    }
  }
  
  return roomId;
}

/**
 * Update room state based on graph actions
 */
function updateRoomState(roomId, action) {
  const room = rooms.get(roomId);
  if (!room) return false;

  const { graphState } = room;
  room.metadata.version++;
  roomActivity.set(roomId, Date.now());

  try {
    switch (action.type) {
      case 'add-node':
        // Check if node already exists
        const existingNode = graphState.nodes.find(n => n.id === action.data.id);
        if (!existingNode) {
          graphState.nodes.push({
            id: action.data.id,
            name: action.data.name,
            x: action.data.x,
            y: action.data.y,
            timestamp: Date.now()
          });
        }
        break;

      case 'delete-node':
        graphState.nodes = graphState.nodes.filter(n => n.id !== action.data.nodeId);
        graphState.edges = graphState.edges.filter(e => 
          e.from !== action.data.nodeId && e.to !== action.data.nodeId
        );
        break;

      case 'add-edge':
        // Check if edge already exists
        const edgeExists = graphState.edges.some(e => 
          (e.from === action.data.fromId && e.to === action.data.toId) ||
          (!graphState.settings.isDirected && e.from === action.data.toId && e.to === action.data.fromId)
        );
        
        if (!edgeExists) {
          graphState.edges.push({
            id: action.data.id,
            from: action.data.fromId,
            to: action.data.toId,
            weight: action.data.weight || 1,
            edgeId: `${action.data.fromId}-${action.data.toId}`,
            timestamp: Date.now()
          });
        }
        break;

      case 'clear-graph':
        graphState.nodes = [];
        graphState.edges = [];
        break;

      case 'update-settings':
        graphState.settings = { ...graphState.settings, ...action.data };
        break;

      case 'rename-node':
        const nodeToRename = graphState.nodes.find(n => n.id === action.data.nodeId);
        if (nodeToRename) {
          nodeToRename.name = action.data.newName;
        }
        break;

      default:
        console.warn(`Unknown action type: ${action.type}`);
        return false;
    }
    
    console.log(`📊 Room ${roomId} state updated: ${action.type}`);
    return true;
  } catch (error) {
    console.error(`Error updating room ${roomId} state:`, error);
    return false;
  }
}

/**
 * Clean up inactive rooms
 */
function cleanupInactiveRooms() {
  const now = Date.now();
  const roomsToDelete = [];

  for (const [roomId, lastActivity] of roomActivity) {
    if (now - lastActivity > ROOM_INACTIVE_TIMEOUT) {
      roomsToDelete.push(roomId);
    }
  }

  roomsToDelete.forEach(roomId => {
    const room = rooms.get(roomId);
    if (room && room.users.size === 0) {
      rooms.delete(roomId);
      roomUsers.delete(roomId);
      roomActivity.delete(roomId);
      console.log(`🗑️ Cleaned up inactive room: ${roomId}`);
    }
  });

  if (roomsToDelete.length > 0) {
    console.log(`🧹 Cleaned up ${roomsToDelete.length} inactive rooms`);
  }
}

// Set up periodic cleanup
setInterval(cleanupInactiveRooms, ROOM_CLEANUP_INTERVAL);

// ========================
// SOCKET.IO REAL-TIME COLLABORATION
// ========================

io.on('connection', (socket) => {
  console.log(`👤 New connection: ${socket.id}`);

  // Enhanced room creation
  socket.on('create-room', (options = {}) => {
    try {
      let roomId;
      let attempts = 0;
      const maxAttempts = 10;

      do {
        roomId = generateRoomId();
        attempts++;
      } while (rooms.has(roomId) && attempts < maxAttempts);

      if (attempts >= maxAttempts) {
        socket.emit('room-error', { message: 'Failed to generate unique room ID' });
        return;
      }

      const room = createRoom(roomId);
      joinRoom(roomId, socket.id, options.userInfo);
      
      socket.join(roomId);
      socket.roomId = roomId;

      socket.emit('room-created', {
        roomId: roomId,
        userCount: room.users.size,
        graphState: room.graphState
      });

      console.log(`🏠 Room ${roomId} created by ${socket.id}`);
    } catch (error) {
      console.error('Error creating room:', error);
      socket.emit('room-error', { message: 'Failed to create room' });
    }
  });

  // Enhanced room joining
  socket.on('join-room', ({ roomId, userInfo = {} }) => {
    try {
      roomId = roomId.toUpperCase().trim();
      
      if (!/^[A-Z0-9]{6}$/.test(roomId)) {
        socket.emit('room-error', { message: 'Invalid room ID format' });
        return;
      }

      const room = joinRoom(roomId, socket.id, userInfo);
      if (!room) {
        socket.emit('room-error', { message: 'Room not found' });
        return;
      }

      socket.join(roomId);
      socket.roomId = roomId;

      // Send current graph state to new user
      socket.emit('graph-sync', room.graphState);
      
      socket.emit('room-joined', {
        roomId: roomId,
        userCount: room.users.size,
        graphState: room.graphState
      });

      // Notify other users
      socket.to(roomId).emit('user-joined', {
        userCount: room.users.size,
        userId: socket.id
      });

      console.log(`🚪 User ${socket.id} joined room ${roomId}`);
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('room-error', { message: 'Failed to join room' });
    }
  });

  // Enhanced room leaving
  socket.on('leave-room', () => {
    try {
      const roomId = leaveRoom(socket.id);
      if (roomId) {
        socket.leave(roomId);
        socket.roomId = null;
        
        const room = rooms.get(roomId);
        if (room) {
          socket.to(roomId).emit('user-left', {
            userCount: room.users.size,
            userId: socket.id
          });
        }
        
        socket.emit('room-left', { roomId });
        console.log(`🚪 User ${socket.id} left room ${roomId}`);
      }
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  });

  // Enhanced graph action handling
  socket.on('graph-action', (action) => {
    try {
      const roomId = socket.roomId;
      if (!roomId) {
        console.log(`Graph action received but user ${socket.id} not in room`);
        return;
      }

      const success = updateRoomState(roomId, action);
      if (success) {
        // Broadcast to all other users in the room
        socket.to(roomId).emit('graph-action', {
          ...action,
          userId: socket.id,
          timestamp: Date.now()
        });
        
        console.log(`🎯 Graph action broadcasted in room ${roomId}: ${action.type}`);
      }
    } catch (error) {
      console.error('Error handling graph action:', error);
    }
  });

  // Get room info
  socket.on('get-room-info', () => {
    const roomId = socket.roomId;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      const users = roomUsers.get(roomId);
      
      socket.emit('room-info', {
        roomId,
        userCount: room.users.size,
        users: Array.from(users.values()),
        graphState: room.graphState,
        metadata: room.metadata
      });
    }
  });

  // Enhanced disconnect handling
  socket.on('disconnect', (reason) => {
    try {
      const roomId = leaveRoom(socket.id);
      if (roomId) {
        const room = rooms.get(roomId);
        if (room) {
          socket.to(roomId).emit('user-left', {
            userCount: room.users.size,
            userId: socket.id
          });
        }
        console.log(`👤 User ${socket.id} disconnected from room ${roomId} (${reason})`);
      } else {
        console.log(`👤 User ${socket.id} disconnected (${reason})`);
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });

  // Heartbeat for connection monitoring
  socket.on('ping', () => {
    socket.emit('pong');
  });
});

// ========================
// AI ASSISTANT INTEGRATION
// ========================

let genAI, model;

if (process.env.GEMINI_API_KEY) {
  try {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: `You are a helpful AI assistant for a Graph Algorithm Visualizer application.

Your role is to:
1. Help users understand graph algorithms (BFS, DFS, Dijkstra, Kruskal, Prim)
2. Explain graph theory concepts clearly
3. Provide guidance on using the visualizer
4. Answer questions about graph data structures
5. Help with algorithm complexity analysis

Keep responses concise, educational, and friendly. Use examples when helpful.
Focus on practical understanding and visualization concepts.`
    });
    console.log('🤖 AI Assistant initialized successfully');
  } catch (error) {
    console.error('Failed to initialize AI:', error);
    model = null;
  }
} else {
  console.warn('⚠️ GEMINI_API_KEY not found. AI features will be disabled.');
}

// Enhanced AI endpoint
app.post('/api/ask', async (req, res) => {
  try {
    if (!model) {
      return res.status(503).json({ 
        error: 'AI service not available. Please configure GEMINI_API_KEY.' 
      });
    }

    const { prompt, graph, history } = req.body;
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Valid prompt is required.' });
    }

    // Enhanced history processing
    let historyForChat = [];
    if (history && Array.isArray(history) && history.length > 0) {
      historyForChat = history.slice(0, -1).map((msg, index) => {
        let role = msg.role === 'ai' ? 'model' : 'user';
        let parts = msg.parts;
        
        if (typeof parts === 'string') {
          parts = [{ text: parts }];
        } else if (Array.isArray(parts)) {
          parts = parts.map(p => typeof p === 'string' ? { text: p } : p);
        } else {
          parts = [{ text: String(parts) }];
        }
        
        return { role, parts };
      }).filter(msg => msg.parts[0].text.trim().length > 0);
      
      // Ensure alternating roles
      let validHistory = [];
      let expectedRole = 'user';
      
      for (let msg of historyForChat) {
        if (msg.role === expectedRole) {
          validHistory.push(msg);
          expectedRole = expectedRole === 'user' ? 'model' : 'user';
        }
      }
      
      historyForChat = validHistory;
    }

    // Enhanced contextual prompt
    const contextualPrompt = `
Current Graph Context:
${graph ? `
- Graph Type: ${graph.isDirected ? 'Directed' : 'Undirected'}
- Node Count: ${graph.nodes ? graph.nodes.length : 0}
- Edge Count: ${graph.edges ? graph.edges.length : 0}
- Nodes: ${graph.nodes ? graph.nodes.join(', ') : 'None'}
- Edges: ${graph.edges ? graph.edges.map(e => `${e.from} → ${e.to}${e.weight ? ` (weight: ${e.weight})` : ''}`).join(', ') : 'None'}
` : '- No graph data available'}

User Question: "${prompt}"

Please provide a helpful, educational response about graph algorithms or the visualizer.`;

    // Start chat with proper configuration
    const chatConfig = {
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
        topK: 40,
        topP: 0.9,
      }
    };

    if (historyForChat.length > 0) {
      chatConfig.history = historyForChat;
    }

    const chat = model.startChat(chatConfig);
    const result = await chat.sendMessage(contextualPrompt);
    
    res.json({ 
      response: result.response.text(),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('AI Error:', error);
    
    // Enhanced error handling
    let errorMessage = 'Failed to get AI response. Please try again.';
    
    if (error.message.includes('API key')) {
      errorMessage = 'Invalid API key. Please check your configuration.';
    } else if (error.message.includes('quota')) {
      errorMessage = 'API quota exceeded. Please try again later.';
    } else if (error.message.includes('safety')) {
      errorMessage = 'Content blocked by safety filters. Please rephrase your question.';
    }
    
    res.status(500).json({
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ========================
// ROOM URL ROUTING
// ========================

app.get('/room/:roomId', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  
  if (!/^[A-Z0-9]{6}$/.test(roomId)) {
    return res.status(400).send('Invalid room ID format');
  }
  
  // Serve the main app with room parameter
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ========================
// API ENDPOINTS
// ========================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    rooms: rooms.size,
    totalUsers: Array.from(rooms.values()).reduce((acc, room) => acc + room.users.size, 0),
    ai: !!model
  });
});

// Room statistics
app.get('/api/stats', (req, res) => {
  const stats = {
    totalRooms: rooms.size,
    totalUsers: Array.from(rooms.values()).reduce((acc, room) => acc + room.users.size, 0),
    roomDetails: Array.from(rooms.entries()).map(([id, room]) => ({
      id,
      userCount: room.users.size,
      nodeCount: room.graphState.nodes.length,
      edgeCount: room.graphState.edges.length,
      createdAt: room.metadata.createdAt,
      version: room.metadata.version
    }))
  };
  
  res.json(stats);
});

// Serve main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ========================
// ERROR HANDLING
// ========================

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Handle 404s
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ========================
// SERVER STARTUP
// ========================

server.listen(port, () => {
  console.log('🚀 ===============================');
  console.log(`🚀 Graph Visualizer Server Started`);
  console.log('🚀 ===============================');
  console.log(`🔗 Local: http://localhost:${port}`);
  console.log(`🤝 Real-time collaboration: ${rooms.size} rooms active`);
  console.log(`🤖 AI Assistant: ${model ? 'Enabled' : 'Disabled'}`);
  console.log(`📊 Socket.IO: Ready for connections`);
  console.log('🚀 ===============================');
});

// ========================
// GRACEFUL SHUTDOWN
// ========================

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown(signal) {
  console.log(`\n👋 Received ${signal}. Shutting down gracefully...`);
  
  // Close Socket.IO connections
  io.close(() => {
    console.log('🔌 Socket.IO connections closed');
  });
  
  // Close HTTP server
  server.close(() => {
    console.log('🛑 HTTP server closed');
    console.log('✅ Shutdown complete');
    process.exit(0);
  });
  
  // Force close after timeout
  setTimeout(() => {
    console.log('⏰ Forcing shutdown...');
    process.exit(1);
  }, 10000);
}

// Export for testing
module.exports = { app, server, io };
