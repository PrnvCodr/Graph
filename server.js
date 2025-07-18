// Enhanced Graph Visualizer Server with Socket.IO and AI Integration
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
  cors: { origin: "*", methods: ["GET","POST"], credentials: true },
  transports: ['websocket','polling']
});
const port = process.env.PORT || 3000;

//—— Middleware —————————————————————————————————————————————
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use((req,res,next) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials','true');
  if (req.method==='OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.static(path.join(__dirname), {
  setHeaders:(res,filePath)=>{
    if(filePath.endsWith('.css')) res.setHeader('Content-Type','text/css');
    if(filePath.endsWith('.js'))  res.setHeader('Content-Type','application/javascript');
    if(filePath.endsWith('.html'))res.setHeader('Content-Type','text/html');
  }
}));

//—— Collaboration Data Structures —————————————————————————————
const rooms = new Map();       // roomId -> { users:Set, graphState:Object, metadata:Object }
const roomUsers = new Map();   // roomId -> Map(socketId->userInfo)
const userRooms = new Map();   // socketId -> roomId
const roomActivity = new Map();// roomId -> lastActivity timestamp

const ROOM_CLEANUP_INTERVAL = 30*60*1000; // 30m
const ROOM_INACTIVE_TIMEOUT  = 60*60*1000; // 1h

//—— Helper Functions ————————————————————————————————————————
function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for(let i=0;i<6;i++) id += chars.charAt(Math.floor(Math.random()*chars.length));
  return id;
}
function createRoom(roomId) {
  const room = {
    id: roomId,
    users: new Set(),
    graphState: { nodes:[], edges:[], settings:{ isDirected:false, isWeighted:false }},
    metadata: { createdAt:Date.now(), createdBy:null, version:1 }
  };
  rooms.set(roomId, room);
  roomUsers.set(roomId, new Map());
  roomActivity.set(roomId, Date.now());
  console.log(`🏠 Room ${roomId} created`);
  return room;
}
function joinRoom(roomId,socketId,userInfo={}) {
  if(!rooms.has(roomId)) return null;
  const room = rooms.get(roomId);
  const users = roomUsers.get(roomId);
  room.users.add(socketId);
  users.set(socketId, { id:socketId, joinedAt:Date.now(), ...userInfo });
  userRooms.set(socketId, roomId);
  roomActivity.set(roomId, Date.now());
  console.log(`🚪 ${socketId} joined ${roomId}`);
  return room;
}
function leaveRoom(socketId) {
  const roomId = userRooms.get(socketId);
  if(!roomId) return null;
  const room = rooms.get(roomId), users = roomUsers.get(roomId);
  room.users.delete(socketId);
  users.delete(socketId);
  userRooms.delete(socketId);
  roomActivity.set(roomId, Date.now());
  if(room.users.size===0) {
    rooms.delete(roomId);
    roomUsers.delete(roomId);
    roomActivity.delete(roomId);
    console.log(`🗑️ Cleaned up empty room ${roomId}`);
  }
  return roomId;
}
function updateRoomState(roomId,action) {
  const room = rooms.get(roomId);
  if(!room) return false;
  const state = room.graphState;
  room.metadata.version++;
  roomActivity.set(roomId, Date.now());
  try {
    switch(action.type){
      case 'add-node':
        if(!state.nodes.find(n=>n.id===action.data.id)) {
          state.nodes.push({ ...action.data, timestamp:Date.now() });
        }
        break;
      case 'delete-node':
        state.nodes = state.nodes.filter(n=>n.id!==action.data.nodeId);
        state.edges = state.edges.filter(e=>e.from!==action.data.nodeId&&e.to!==action.data.nodeId);
        break;
      case 'add-edge':
        const exists = state.edges.some(e=>
          (e.from===action.data.fromId&&e.to===action.data.toId) ||
          (!state.settings.isDirected && e.from===action.data.toId&&e.to===action.data.fromId)
        );
        if(!exists) {
          state.edges.push({ ...action.data, edgeId:`${action.data.fromId}-${action.data.toId}`, timestamp:Date.now() });
        }
        break;
      case 'clear-graph':
        state.nodes=[], state.edges=[];
        break;
      case 'update-settings':
        state.settings = { ...state.settings, ...action.data };
        break;
      case 'rename-node':
        const node = state.nodes.find(n=>n.id===action.data.nodeId);
        if(node) node.name = action.data.newName;
        break;
      default:
        return false;
    }
    console.log(`📊 Room ${roomId} updated: ${action.type}`);
    return true;
  } catch(err){
    console.error(`Error updating ${roomId}:`,err);
    return false;
  }
}
function cleanupInactiveRooms(){
  const now = Date.now(), toDelete = [];
  for(const [rid,last] of roomActivity){
    if(now-last>ROOM_INACTIVE_TIMEOUT) toDelete.push(rid);
  }
  toDelete.forEach(rid=>{
    if(rooms.get(rid)?.users.size===0) {
      rooms.delete(rid);
      roomUsers.delete(rid);
      roomActivity.delete(rid);
      console.log(`🗑️ Removed inactive room ${rid}`);
    }
  });
}
setInterval(cleanupInactiveRooms, ROOM_CLEANUP_INTERVAL);

//—— Socket.IO Real-time Collaboration —————————————————————————
io.on('connection', socket => {
  console.log(`👤 Connected: ${socket.id}`);

  socket.on('create-room', (opts={})=>{
    let roomId, attempts=0;
    do { roomId = generateRoomId(); attempts++; }
    while(rooms.has(roomId) && attempts<10);
    if(attempts>=10) return socket.emit('room-error',{message:'ID gen failed'});
    const room = createRoom(roomId);
    joinRoom(roomId,socket.id,opts.userInfo);
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('room-created',{ roomId, userCount:room.users.size, graphState:room.graphState });
  });

  socket.on('join-room', ({roomId,userInfo={}})=>{
    roomId = roomId.toUpperCase().trim();
    if(!/^[A-Z0-9]{6}$/.test(roomId)) {
      return socket.emit('room-error',{message:'Invalid ID'});
    }
    const room = joinRoom(roomId,socket.id,userInfo);
    if(!room) return socket.emit('room-error',{message:'Not found'});
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('graph-sync',room.graphState);
    socket.emit('room-joined',{ roomId, userCount:room.users.size, graphState:room.graphState });
    socket.to(roomId).emit('user-joined',{ userCount:room.users.size, userId:socket.id });
  });

  socket.on('leave-room', ()=>{
    const rid = leaveRoom(socket.id);
    if(rid){
      socket.leave(rid);
      socket.roomId=null;
      const room = rooms.get(rid);
      if(room) socket.to(rid).emit('user-left',{ userCount:room.users.size, userId:socket.id });
      socket.emit('room-left',{roomId:rid});
    }
  });

  socket.on('graph-action', action=>{
    const rid = socket.roomId;
    if(!rid) return console.log('No room for action');
    if(updateRoomState(rid,action)){
      socket.to(rid).emit('graph-action', {...action, userId:socket.id, timestamp:Date.now() });
    }
  });

  socket.on('get-room-info', ()=>{
    const rid = socket.roomId;
    if(rid && rooms.has(rid)){
      const room = rooms.get(rid), users = roomUsers.get(rid);
      socket.emit('room-info',{
        roomId: rid,
        userCount: room.users.size,
        users: Array.from(users.values()),
        graphState: room.graphState,
        metadata: room.metadata
      });
    }
  });

  socket.on('disconnect', reason=>{
    const rid = leaveRoom(socket.id);
    if(rid){
      const room = rooms.get(rid);
      if(room) socket.to(rid).emit('user-left',{ userCount:room.users.size, userId:socket.id });
      console.log(`👤 Disconnected ${socket.id} from ${rid} (${reason})`);
    } else {
      console.log(`👤 Disconnected: ${socket.id} (${reason})`);
    }
  });

  socket.on('ping', ()=> socket.emit('pong'));
});

//—— AI Assistant Integration —————————————————————————————————————
let genAI, model;
if(process.env.GEMINI_API_KEY){
  try {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({
      model:"gemini-1.5-flash",
      systemInstruction: `You are a helpful AI assistant for a Graph Visualizer.`
    });
    console.log('🤖 AI Initialized');
  } catch(e){
    console.error('AI init failed:',e);
    model = null;
  }
} else {
  console.warn('⚠️ GEMINI_API_KEY missing, AI disabled');
}

app.post('/api/ask', async (req,res)=>{
  if(!model) return res.status(503).json({error:'AI unavailable'});
  const {prompt,graph,history} = req.body;
  if(!prompt) return res.status(400).json({error:'Prompt required'});
  // Build history array...
  const chat = model.startChat({generationConfig:{maxOutputTokens:1000,temperature:0.7}});
  const contextual = `
Graph: ${graph?.nodes?.length||0} nodes, ${graph?.edges?.length||0} edges
Q: "${prompt}"
`;
  try {
    const result = await chat.sendMessage(contextual);
    res.json({response: result.response.text(), timestamp:new Date().toISOString()});
  } catch(err){
    console.error('AI error:', err);
    res.status(500).json({error:'AI failed', details:err.message});
  }
});

//—— Routes & Health —————————————————————————————————————————
app.get('/room/:roomId', (req,res)=>{
  const rid = req.params.roomId.toUpperCase();
  if(!/^[A-Z0-9]{6}$/.test(rid)) return res.status(400).send('Invalid room');
  res.sendFile(path.join(__dirname,'index.html'));
});

app.get('/api/stats',(req,res)=>{
  res.json({
    totalRooms:rooms.size,
    totalUsers:Array.from(rooms.values()).reduce((a,r)=>a+r.users.size,0)
  });
});

app.get('/health',(req,res)=> res.json({
  status:'healthy', timestamp:new Date(), rooms:rooms.size,
  totalUsers:Array.from(rooms.values()).reduce((a,r)=>a+r.users.size,0),
  ai:!!model
}));

app.get('/', (req,res)=> res.sendFile(path.join(__dirname,'index.html')));

//—— Error Handling ———————————————————————————————————————
app.use((err,req,res,next)=>{
  console.error('Server error:',err);
  res.status(500).json({error:'Internal server error'});
});
app.use((req,res)=> res.status(404).json({error:'Not found'}));

//—— Server Startup & Shutdown ——————————————————————————————
server.listen(port, ()=>{
  console.log(`🚀 Listening on http://localhost:${port}`);
  console.log(`🤝 Socket.IO ready, rooms: ${rooms.size}, AI: ${model?'on':'off'}`);
});
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
process.on('SIGINT', ()=>server.close(()=>process.exit(0)));
