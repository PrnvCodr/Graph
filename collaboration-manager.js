/**
 * Collaboration Manager for Graph Visualizer
 * Handles real-time collaboration using Socket.IO
 */
class CollaborationManager {
    constructor(graphVisualizer) {
        this.graphVisualizer = graphVisualizer;
        this.socket = null;
        this.isInRoom = false;
        this.currentRoomId = null;
        this.connectedUsers = 0;
        this.isInitialized = false;
        this.originalMethods = {};
        
        this.bindUIEvents();
        this.initializeSocket();
        this.setupGraphEventInterception();
    }

    bindUIEvents() {
        const createRoomBtn = document.getElementById('create-room-btn');
        const joinRoomBtn = document.getElementById('join-room-btn');
        const leaveRoomBtn = document.getElementById('leave-room-btn');
        const copyRoomIdBtn = document.getElementById('copy-room-id');
        const roomIdInput = document.getElementById('room-id-input');

        if (createRoomBtn) {
            createRoomBtn.addEventListener('click', () => this.createRoom());
        }

        if (joinRoomBtn) {
            joinRoomBtn.addEventListener('click', () => {
                const roomId = roomIdInput.value.trim().toUpperCase();
                if (roomId) {
                    this.joinRoom(roomId);
                }
            });
        }

        if (leaveRoomBtn) {
            leaveRoomBtn.addEventListener('click', () => this.leaveRoom());
        }

        if (copyRoomIdBtn) {
            copyRoomIdBtn.addEventListener('click', () => this.copyRoomId());
        }

        if (roomIdInput) {
            roomIdInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.toUpperCase();
            });
            
            roomIdInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const roomId = e.target.value.trim().toUpperCase();
                    if (roomId) {
                        this.joinRoom(roomId);
                    }
                }
            });
        }
    }

    initializeSocket() {
        try {
            // Check if Socket.IO is available
            if (typeof io === 'undefined') {
                console.error('Socket.IO client not found. Make sure to include socket.io.js');
                this.updateConnectionStatus('offline', 'Socket.IO not available');
                return;
            }

            this.socket = io();
            this.bindSocketEvents();
            console.log('🔌 Socket.IO client initialized');
        } catch (error) {
            console.error('Failed to initialize Socket.IO:', error);
            this.updateConnectionStatus('offline', 'Connection failed');
        }
    }

    bindSocketEvents() {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            console.log('✅ Connected to collaboration server');
            this.updateConnectionStatus('connected', 'Connected');
        });

        this.socket.on('disconnect', () => {
            console.log('❌ Disconnected from collaboration server');
            this.updateConnectionStatus('disconnected', 'Disconnected');
            this.isInRoom = false;
            this.currentRoomId = null;
            this.updateRoomUI();
        });

        this.socket.on('room-created', (data) => {
            console.log('🏠 Room created:', data);
            this.isInRoom = true;
            this.currentRoomId = data.roomId;
            this.connectedUsers = data.userCount;
            this.updateRoomUI();
            this.showNotification('Room created successfully! Share the Room ID with others.', 'success');
        });

        this.socket.on('room-joined', (data) => {
            console.log('🚪 Joined room:', data);
            this.isInRoom = true;
            this.currentRoomId = data.roomId;
            this.connectedUsers = data.userCount;
            this.updateRoomUI();
            this.showNotification('Joined room successfully!', 'success');
        });

        this.socket.on('room-error', (data) => {
            console.error('Room error:', data);
            this.showNotification(data.message || 'Room operation failed', 'error');
        });

        this.socket.on('graph-sync', (graphState) => {
            console.log('📊 Syncing graph state:', graphState);
            this.syncGraphState(graphState);
        });

        this.socket.on('graph-action', (action) => {
            console.log('🎯 Received graph action:', action);
            this.handleRemoteGraphAction(action);
        });

        this.socket.on('user-joined', (data) => {
            this.connectedUsers = data.userCount;
            this.updateUserCount();
            this.showNotification(`A user joined the room (${data.userCount} users online)`, 'info');
        });

        this.socket.on('user-left', (data) => {
            this.connectedUsers = data.userCount;
            this.updateUserCount();
            this.showNotification(`A user left the room (${data.userCount} users online)`, 'info');
        });
    }

    setupGraphEventInterception() {
        if (!this.graphVisualizer) return;

        // Intercept graph modification methods
        const originalAddNode = this.graphVisualizer.addNode.bind(this.graphVisualizer);
        const originalAddEdge = this.graphVisualizer.addEdge.bind(this.graphVisualizer);
        const originalDeleteNode = this.graphVisualizer.deleteNode.bind(this.graphVisualizer);
        const originalClearGraph = this.graphVisualizer.clearGraph.bind(this.graphVisualizer);

        this.graphVisualizer.addNode = (x, y, name) => {
            const node = originalAddNode(x, y, name);
            if (node && this.isInRoom) {
                this.broadcastGraphAction({
                    type: 'add-node',
                    data: {
                        id: node.id,
                        name: node.name,
                        x: node.x,
                        y: node.y
                    }
                });
            }
            return node;
        };

        this.graphVisualizer.addEdge = (fromNode, toNode, weight) => {
            const edge = originalAddEdge(fromNode, toNode, weight);
            if (edge && this.isInRoom) {
                this.broadcastGraphAction({
                    type: 'add-edge',
                    data: {
                        id: edge.id,
                        fromId: fromNode.id,
                        toId: toNode.id,
                        weight: edge.weight
                    }
                });
            }
            return edge;
        };

        this.graphVisualizer.deleteNode = (node) => {
            if (this.isInRoom) {
                this.broadcastGraphAction({
                    type: 'delete-node',
                    data: {
                        nodeId: node.id
                    }
                });
            }
            return originalDeleteNode(node);
        };

        this.graphVisualizer.clearGraph = () => {
            if (this.isInRoom) {
                this.broadcastGraphAction({
                    type: 'clear-graph',
                    data: {}
                });
            }
            return originalClearGraph();
        };
    }

    createRoom() {
        if (!this.socket) {
            this.showNotification('Not connected to server', 'error');
            return;
        }

        if (this.isInRoom) {
            this.showNotification('Already in a room. Leave current room first.', 'warning');
            return;
        }

        this.socket.emit('create-room');
    }

    joinRoom(roomId) {
        if (!this.socket) {
            this.showNotification('Not connected to server', 'error');
            return;
        }

        if (!roomId || roomId.length !== 6) {
            this.showNotification('Please enter a valid 6-character room ID', 'error');
            return;
        }

        if (this.isInRoom) {
            this.showNotification('Already in a room. Leave current room first.', 'warning');
            return;
        }

        this.socket.emit('join-room', { roomId });
    }

    leaveRoom() {
        if (!this.socket || !this.isInRoom) {
            this.showNotification('Not in a room', 'warning');
            return;
        }

        this.socket.emit('leave-room');
        this.isInRoom = false;
        this.currentRoomId = null;
        this.connectedUsers = 0;
        this.updateRoomUI();
        this.showNotification('Left room', 'info');
    }

    copyRoomId() {
        if (!this.currentRoomId) {
            this.showNotification('No room ID to copy', 'warning');
            return;
        }

        navigator.clipboard.writeText(this.currentRoomId).then(() => {
            this.showNotification('Room ID copied to clipboard!', 'success');
        }).catch(() => {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = this.currentRoomId;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showNotification('Room ID copied to clipboard!', 'success');
        });
    }

    updateConnectionStatus(status, message) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.className = `status-indicator ${status}`;
            statusElement.textContent = message;
        }
    }

    updateUserCount() {
        const userCountElement = document.getElementById('user-count');
        if (userCountElement) {
            const text = this.connectedUsers === 1 ? 'user' : 'users';
            userCountElement.textContent = `${this.connectedUsers} ${text} online`;
        }
    }

    updateRoomUI() {
        const roomDetails = document.getElementById('room-details');
        const currentRoomId = document.getElementById('current-room-id');
        const roomIdInput = document.getElementById('room-id-input');

        if (this.isInRoom && this.currentRoomId) {
            if (roomDetails) roomDetails.style.display = 'block';
            if (currentRoomId) currentRoomId.textContent = this.currentRoomId;
            if (roomIdInput) roomIdInput.value = '';
        } else {
            if (roomDetails) roomDetails.style.display = 'none';
        }

        this.updateUserCount();
    }

    syncGraphState(graphState) {
        if (!this.graphVisualizer || !graphState) return;

        console.log('Syncing graph state:', graphState);

        try {
            // Temporarily disable broadcasting to prevent loops
            const tempInRoom = this.isInRoom;
            this.isInRoom = false;

            // Clear current graph
            this.graphVisualizer.nodes.clear();
            this.graphVisualizer.edges.clear();

            // Sync nodes
            if (graphState.nodes) {
                graphState.nodes.forEach(nodeData => {
                    const node = {
                        id: nodeData.id,
                        name: nodeData.name,
                        x: nodeData.x,
                        y: nodeData.y,
                        radius: 25,
                        color: this.graphVisualizer.colors.node.default,
                        state: 'default'
                    };
                    this.graphVisualizer.nodes.set(nodeData.id, node);
                });
            }

            // Sync edges
            if (graphState.edges) {
                graphState.edges.forEach(edgeData => {
                    const edge = {
                        id: edgeData.id,
                        from: edgeData.from,
                        to: edgeData.to,
                        weight: edgeData.weight,
                        color: this.graphVisualizer.colors.edge.default,
                        state: 'default'
                    };
                    this.graphVisualizer.edges.set(edgeData.edgeId, edge);
                });
            }

            // Restore broadcasting
            this.isInRoom = tempInRoom;

            // Update UI and redraw
            this.graphVisualizer.updateNodeSelect();
            this.graphVisualizer.updateUI();
            this.graphVisualizer.redraw();

            console.log('Graph state synchronized successfully');
        } catch (error) {
            console.error('Error syncing graph state:', error);
            this.showNotification('Error syncing graph state', 'error');
        }
    }

    handleRemoteGraphAction(action) {
        if (!this.graphVisualizer) return;

        try {
            // Temporarily disable broadcasting to prevent loops
            const tempInRoom = this.isInRoom;
            this.isInRoom = false;

            switch (action.type) {
                case 'add-node':
                    this.graphVisualizer.addNode(action.data.x, action.data.y, action.data.name);
                    break;
                case 'delete-node':
                    const nodeToDelete = this.graphVisualizer.nodes.get(action.data.nodeId);
                    if (nodeToDelete) {
                        this.graphVisualizer.deleteNode(nodeToDelete);
                    }
                    break;
                case 'add-edge':
                    const fromNode = this.graphVisualizer.nodes.get(action.data.fromId);
                    const toNode = this.graphVisualizer.nodes.get(action.data.toId);
                    if (fromNode && toNode) {
                        this.graphVisualizer.addEdge(fromNode, toNode, action.data.weight);
                    }
                    break;
                case 'clear-graph':
                    this.graphVisualizer.clearGraph();
                    break;
            }

            // Restore broadcasting
            this.isInRoom = tempInRoom;
        } catch (error) {
            console.error('Error handling remote graph action:', error);
            this.showNotification('Error handling remote action', 'error');
        }
    }

    broadcastGraphAction(action) {
        if (!this.socket || !this.isInRoom) return;
        
        console.log('Broadcasting graph action:', action);
        this.socket.emit('graph-action', action);
    }

    showNotification(message, type = 'info') {
        // Use the existing status system
        if (this.graphVisualizer && this.graphVisualizer.showStatus) {
            this.graphVisualizer.showStatus(message, type);
        } else {
            console.log(`${type.toUpperCase()}: ${message}`);
        }
    }
}

// Make it globally available
window.CollaborationManager = CollaborationManager;
