// Enhanced backend server with Socket.IO for real-time collaboration
const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Server } = require('socket.io');
const http = require('http');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const port = process.env.PORT || 3000;

// --- Middleware ---
app.use(bodyParser.json());
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// --- Collaboration Data Structures ---
const rooms = new Map(); // roomId -> { users: Set, graphState: Object }
const roomUsers = new Map(); // roomId -> Map(socketId -> userInfo)
const userRooms = new Map(); // socketId -> roomId

// --- Helper Functions ---
function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function createRoom(roomId) {
    rooms.set(roomId, {
        users: new Set(),
        graphState: {
            nodes: [],
            edges: []
        },
        createdAt: Date.now()
    });
    roomUsers.set(roomId, new Map());
    return rooms.get(roomId);
}

function joinRoom(roomId, socketId, userInfo = {}) {
    if (!rooms.has(roomId)) {
        return null;
    }

    const room = rooms.get(roomId);
    const users = roomUsers.get(roomId);
    
    room.users.add(socketId);
    users.set(socketId, { ...userInfo, joinedAt: Date.now() });
    userRooms.set(socketId, roomId);
    
    return room;
}

function leaveRoom(socketId) {
    const roomId = userRooms.get(socketId);
    if (!roomId) return null;
    
    const room = rooms.get(roomId);
    const users = roomUsers.get(roomId);
    
    if (room && users) {
        room.users.delete(socketId);
        users.delete(socketId);
        userRooms.delete(socketId);
        
        // Clean up empty rooms
        if (room.users.size === 0) {
            rooms.delete(roomId);
            roomUsers.delete(roomId);
            console.log(`🗑️ Cleaned up empty room: ${roomId}`);
        }
    }
    
    return roomId;
}

function updateRoomState(roomId, action) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const { graphState } = room;
    
    switch (action.type) {
        case 'add-node':
            graphState.nodes.push({
                id: action.data.id,
                name: action.data.name,
                x: action.data.x,
                y: action.data.y
            });
            break;
        case 'delete-node':
            graphState.nodes = graphState.nodes.filter(n => n.id !== action.data.nodeId);
            graphState.edges = graphState.edges.filter(e => 
                e.from !== action.data.nodeId && e.to !== action.data.nodeId
            );
            break;
        case 'add-edge':
            graphState.edges.push({
                id: action.data.id,
                from: action.data.fromId,
                to: action.data.toId,
                weight: action.data.weight,
                edgeId: `${action.data.fromId}-${action.data.toId}`
            });
            break;
        case 'clear-graph':
            graphState.nodes = [];
            graphState.edges = [];
            break;
    }
}

// --- Socket.IO Real-time Collaboration ---
io.on('connection', (socket) => {
    console.log(`👤 User connected: ${socket.id}`);
    
    // Handle room creation
    socket.on('create-room', () => {
        try {
            let roomId;
            do {
                roomId = generateRoomId();
            } while (rooms.has(roomId));
            
            const room = createRoom(roomId);
            joinRoom(roomId, socket.id);
            socket.join(roomId);
            socket.roomId = roomId;
            
            socket.emit('room-created', {
                roomId: roomId,
                userCount: room.users.size
            });
            
            console.log(`🏠 Room created: ${roomId} by ${socket.id}`);
        } catch (error) {
            console.error('Error creating room:', error);
            socket.emit('room-error', { message: 'Failed to create room' });
        }
    });

    // Handle room joining
    socket.on('join-room', ({ roomId }) => {
        try {
            const room = joinRoom(roomId, socket.id);
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
                userCount: room.users.size
            });

            // Notify other users
            socket.to(roomId).emit('user-joined', {
                userCount: room.users.size
            });

            console.log(`🚪 User ${socket.id} joined room ${roomId}`);
        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('room-error', { message: 'Failed to join room' });
        }
    });

    // Handle leaving room
    socket.on('leave-room', () => {
        try {
            const roomId = leaveRoom(socket.id);
            if (roomId) {
                socket.leave(roomId);
                socket.roomId = null;
                
                const room = rooms.get(roomId);
                if (room) {
                    socket.to(roomId).emit('user-left', {
                        userCount: room.users.size
                    });
                }
                
                console.log(`🚪 User ${socket.id} left room ${roomId}`);
            }
        } catch (error) {
            console.error('Error leaving room:', error);
        }
    });

    // Handle graph actions
    socket.on('graph-action', (action) => {
        try {
            const roomId = socket.roomId;
            if (!roomId) {
                console.log('Graph action received but user not in room');
                return;
            }

            updateRoomState(roomId, action);
            socket.to(roomId).emit('graph-action', action);
            
            console.log(`🎯 Graph action in room ${roomId}: ${action.type}`);
        } catch (error) {
            console.error('Error handling graph action:', error);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        try {
            const roomId = leaveRoom(socket.id);
            if (roomId) {
                const room = rooms.get(roomId);
                if (room) {
                    socket.to(roomId).emit('user-left', {
                        userCount: room.users.size
                    });
                }
                console.log(`👤 User ${socket.id} disconnected from room ${roomId}`);
            } else {
                console.log(`👤 User ${socket.id} disconnected`);
            }
        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
    });
});

// --- Room URL Routing ---
app.get('/room/:roomId', (req, res) => {
    const roomId = req.params.roomId.toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(roomId)) {
        return res.status(400).send('Invalid room ID format');
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- AI API Endpoint ---
let genAI, model;

if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: `You are a helpful AI assistant for a Graph Algorithm Visualizer. 
        Help users understand graph algorithms, explain concepts, and provide guidance on using the visualizer.
        Keep responses concise and educational.`
    });
} else {
    console.warn('⚠️ GEMINI_API_KEY not found. AI features will be disabled.');
}

app.post('/api/ask', async (req, res) => {
    try {
        if (!model) {
            return res.status(503).json({ error: 'AI service not available. Please configure GEMINI_API_KEY.' });
        }

        const { prompt, graph, history } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required.' });
        }

        // FIXED: Properly validate and format chat history
        let historyForChat = [];
        if (history && Array.isArray(history) && history.length > 0) {
            // Process history and fix format issues
            const processedHistory = history.slice(0, -1).map((msg, index) => {
                // Ensure proper role mapping
                let role = msg.role === 'ai' ? 'model' : 'user';
                
                // Ensure parts is properly formatted
                let parts = msg.parts;
                if (typeof parts === 'string') {
                    parts = [{ text: parts }];
                } else if (Array.isArray(parts) && parts.length > 0) {
                    if (typeof parts[0] === 'string') {
                        parts = parts.map(p => ({ text: p }));
                    }
                } else {
                    parts = [{ text: String(parts) }];
                }

                // Ensure first message is always from user
                if (index === 0 && role !== 'user') {
                    role = 'user';
                }

                return { role, parts };
            });

            // Validate alternating roles
            let validHistory = [];
            let expectedRole = 'user';
            
            for (let msg of processedHistory) {
                if (msg.role === expectedRole) {
                    validHistory.push(msg);
                    expectedRole = expectedRole === 'user' ? 'model' : 'user';
                } else if (validHistory.length === 0 && msg.role === 'user') {
                    // Allow starting with user even if expected role is different
                    validHistory.push(msg);
                    expectedRole = 'model';
                }
            }

            historyForChat = validHistory;
        }

        // Start chat with properly formatted history
        const chatConfig = {
            generationConfig: { 
                maxOutputTokens: 500,
                temperature: 0.7
            }
        };

        if (historyForChat.length > 0) {
            chatConfig.history = historyForChat;
        }

        const chat = model.startChat(chatConfig);

        // Create contextual prompt
        const contextualPrompt = `
Current Graph State:
- Type: ${graph?.isDirected ? 'Directed' : 'Undirected'}
- Nodes: ${graph?.nodes?.join(', ') || 'None'}
- Edges: ${graph?.edges?.map(e => `${e.from} -> ${e.to}`).join('; ') || 'None'}

User Question: "${prompt}"

Please provide a helpful response about graph algorithms or the visualizer.`;

        const result = await chat.sendMessage(contextualPrompt);
        res.json({ response: result.response.text() });
        
    } catch (error) {
        console.error('AI Error Details:', error);
        
        // Enhanced error handling
        if (error.message.includes('First content should be with role')) {
            return res.status(400).json({ 
                error: 'Chat history format error. Please try clearing the chat and starting over.' 
            });
        }
        
        if (error.message.includes('Content should have parts')) {
            return res.status(400).json({ 
                error: 'Invalid message format. Please try again.' 
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to get AI response. Please try again.',
            details: error.message 
        });
    }
});


// --- Health Check ---
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        rooms: rooms.size,
        totalUsers: Array.from(rooms.values()).reduce((acc, room) => acc + room.users.size, 0)
    });
});

// --- Start Server ---
server.listen(port, () => {
    console.log(`🚀 Graph Visualizer server running on port ${port}`);
    console.log(`🤝 Real-time collaboration enabled`);
    console.log(`🔗 Local: http://localhost:${port}`);
    if (process.env.GEMINI_API_KEY) {
        console.log(`🤖 AI Assistant enabled`);
    } else {
        console.log(`⚠️ AI Assistant disabled (no API key)`);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 Shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

module.exports = { app, server, io };
