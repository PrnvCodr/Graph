class GraphVisualizer {
    constructor() {
        this.canvas = document.getElementById('graphCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.nodes = new Map();
        this.edges = new Map();
        this.nodeCounter = 0;
        this.edgeCounter = 0;

        // UI state
        this.mode = 'normal'; // normal, adding-node, adding-edge
        this.selectedNodes = [];
        this.draggedNode = null;
        this.isDragging = false;
        this.lastMousePos = { x: 0, y: 0 };

        // Algorithm state
        this.currentAlgorithm = null;
        this.algorithmSteps = [];
        this.currentStep = 0;
        this.isPlaying = false;
        this.animationSpeed = 500;
        this.animationTimer = null;

        // Colors from the design - FIXED: Added missing edge path color
        this.colors = {
            node: {
                default: '#E5EAF5',
                visiting: '#FFF685',
                visited: '#59CE8F',
                current: '#FF1D58',
                path: '#8458B3'
            },
            edge: {
                default: '#A28089',
                active: '#00DDFF',
                mst: '#59CE8F',
                path: '#8458B3'  // FIXED: Added missing path color
            }
        };

        this.initializeCanvas();
        this.bindEvents();
        this.updateUI();
    }

    initializeCanvas() {
        const resizeCanvas = () => {
            const container = this.canvas.parentElement;
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
            this.redraw();
        };

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
    }

    bindEvents() {
        // Canvas events
        this.canvas.addEventListener('click', this.handleCanvasClick.bind(this));
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('contextmenu', this.handleRightClick.bind(this));
        this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));

        // UI events
        document.getElementById('addNodeBtn').addEventListener('click', () => this.toggleMode('adding-node'));
        document.getElementById('addEdgeBtn').addEventListener('click', () => this.toggleMode('adding-edge'));
        document.getElementById('addNodeManual').addEventListener('click', this.addNodeManual.bind(this));
        document.getElementById('addEdgeManual').addEventListener('click', this.addEdgeManual.bind(this));
        document.getElementById('runAlgorithmBtn').addEventListener('click', this.runAlgorithm.bind(this));
        document.getElementById('playPauseBtn').addEventListener('click', this.togglePlayPause.bind(this));
        document.getElementById('stepBtn').addEventListener('click', this.stepForward.bind(this));
        document.getElementById('resetBtn').addEventListener('click', this.resetAlgorithm.bind(this));
        document.getElementById('clearGraphBtn').addEventListener('click', this.clearGraph.bind(this));
        document.getElementById('speedSlider').addEventListener('input', this.updateSpeed.bind(this));
        document.getElementById('graphType').addEventListener('change', this.updateUI.bind(this));
        document.getElementById('weightedGraph').addEventListener('change', this.updateUI.bind(this));

        // Context menu events
        document.getElementById('contextAddNode').addEventListener('click', this.contextAddNode.bind(this));
        document.getElementById('contextConnectNode').addEventListener('click', this.contextConnectNode.bind(this));
        document.getElementById('contextRenameNode').addEventListener('click', this.contextRenameNode.bind(this));
        document.getElementById('contextDeleteNode').addEventListener('click', this.contextDeleteNode.bind(this));

        // Hide context menu on click outside
        document.addEventListener('click', this.hideContextMenu.bind(this));

        // ESC key to cancel modes
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.setMode('normal');
            }
        });
    }

    toggleMode(newMode) {
        if (this.mode === newMode) {
            this.setMode('normal');
        } else {
            this.setMode(newMode);
        }
    }

    setMode(newMode) {
        this.mode = newMode;
        this.selectedNodes = [];
        this.updateCursor();
        this.updateUI();
        this.updateModeButtons();
        this.redraw();

        // Show status message
        const messages = {
            'normal': 'Normal mode - drag nodes or right-click for options',
            'adding-node': 'Node adding mode - click on canvas to add nodes (ESC to cancel)',
            'adding-edge': 'Edge adding mode - click two nodes to connect them (ESC to cancel)'
        };

        this.showStatus(messages[newMode] || 'Unknown mode', 'info');
    }

    updateModeButtons() {
        const addNodeBtn = document.getElementById('addNodeBtn');
        const addEdgeBtn = document.getElementById('addEdgeBtn');

        // Reset button styles
        addNodeBtn.classList.remove('btn--primary', 'btn--secondary', 'btn--outline');
        addEdgeBtn.classList.remove('btn--primary', 'btn--secondary', 'btn--outline');

        // FIXED: Corrected button style logic
        if (this.mode === 'adding-node') {
            addNodeBtn.classList.add('btn--secondary');
            addEdgeBtn.classList.add('btn--outline');
        } else if (this.mode === 'adding-edge') {
            addNodeBtn.classList.add('btn--outline');
            addEdgeBtn.classList.add('btn--secondary');
        } else {
            addNodeBtn.classList.add('btn--primary');
            addEdgeBtn.classList.add('btn--primary');
        }
    }

    updateCursor() {
        const cursors = {
            'normal': 'default',
            'adding-node': 'crosshair',
            'adding-edge': 'pointer'
        };
        this.canvas.style.cursor = cursors[this.mode] || 'default';
    }

    handleCanvasClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const clickedNode = this.getNodeAt(x, y);

        if (this.mode === 'adding-node' && !clickedNode) {
            this.addNode(x, y);
            // Don't change mode - stay in adding-node mode
        } else if (this.mode === 'adding-edge') {
            if (clickedNode) {
                this.handleEdgeCreation(clickedNode);
            }
        } else if (clickedNode && this.mode === 'normal') {
            this.selectNode(clickedNode);
        }
    }

    handleMouseDown(event) {
        if (this.mode !== 'normal') return;

        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const node = this.getNodeAt(x, y);

        if (node) {
            this.draggedNode = node;
            this.isDragging = true;
            this.lastMousePos = { x, y };
            this.canvas.style.cursor = 'grabbing';
        }
    }

    handleMouseMove(event) {
        if (this.isDragging && this.draggedNode) {
            const rect = this.canvas.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;

            const dx = x - this.lastMousePos.x;
            const dy = y - this.lastMousePos.y;

            this.draggedNode.x += dx;
            this.draggedNode.y += dy;

            // Keep node within canvas bounds
            this.draggedNode.x = Math.max(this.draggedNode.radius, Math.min(this.canvas.width - this.draggedNode.radius, this.draggedNode.x));
            this.draggedNode.y = Math.max(this.draggedNode.radius, Math.min(this.canvas.height - this.draggedNode.radius, this.draggedNode.y));

            this.lastMousePos = { x, y };
            this.redraw();
        }
    }

    handleMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            this.draggedNode = null;
            this.updateCursor();
        }
    }

    handleRightClick(event) {
        event.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const node = this.getNodeAt(x, y);

        this.showContextMenu(event.clientX, event.clientY, node);
    }

    handleDoubleClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const node = this.getNodeAt(x, y);

        if (node) {
            this.renameNode(node);
        }
    }

    addNode(x, y, name = null) {
        const nodeName = name || `N${this.nodeCounter}`;
        const node = {
            id: this.nodeCounter++,
            name: nodeName,
            x: x,
            y: y,
            radius: 25,
            color: this.colors.node.default,
            state: 'default'
        };

        this.nodes.set(node.id, node);
        this.updateNodeSelect();
        this.updateUI();
        this.redraw();
        this.showStatus(`Node ${nodeName} added`, 'success');
        return node;
    }

    addNodeManual() {
        const nameInput = document.getElementById('nodeNameInput');
        const name = nameInput.value.trim();

        if (!name) {
            this.showStatus('Please enter a node name', 'error');
            return;
        }

        // Check if name already exists
        const existingNode = Array.from(this.nodes.values()).find(n => n.name === name);
        if (existingNode) {
            this.showStatus('Node name already exists', 'error');
            return;
        }

        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const offset = Math.random() * 100 - 50;

        this.addNode(centerX + offset, centerY + offset, name);
        nameInput.value = '';
    }

    addEdge(fromNode, toNode, weight = 1) {
        const edgeId = `${fromNode.id}-${toNode.id}`;
        const reverseEdgeId = `${toNode.id}-${fromNode.id}`;

        // Check if edge already exists
        if (this.edges.has(edgeId) || (!this.isDirected() && this.edges.has(reverseEdgeId))) {
            this.showStatus('Edge already exists', 'error');
            return;
        }

        const edge = {
            id: this.edgeCounter++,
            from: fromNode.id,
            to: toNode.id,
            weight: weight,
            color: this.colors.edge.default,
            state: 'default'
        };

        this.edges.set(edgeId, edge);
        this.updateUI();
        this.redraw();
        this.showStatus(`Edge ${fromNode.name} → ${toNode.name} added`, 'success');
        return edge;
    }

    addEdgeManual() {
        const fromInput = document.getElementById('fromNodeInput');
        const toInput = document.getElementById('toNodeInput');
        const weightInput = document.getElementById('edgeWeightInput');

        const fromName = fromInput.value.trim();
        const toName = toInput.value.trim();
        const weight = parseInt(weightInput.value) || 1;

        if (!fromName || !toName) {
            this.showStatus('Please enter both node names', 'error');
            return;
        }

        const fromNode = Array.from(this.nodes.values()).find(n => n.name === fromName);
        const toNode = Array.from(this.nodes.values()).find(n => n.name === toName);

        if (!fromNode || !toNode) {
            this.showStatus('One or both nodes not found', 'error');
            return;
        }

        this.addEdge(fromNode, toNode, weight);
        fromInput.value = '';
        toInput.value = '';
        weightInput.value = '';
    }

    handleEdgeCreation(node) {
        if (this.selectedNodes.length === 0) {
            this.selectedNodes.push(node);
            node.state = 'current';
            this.showStatus(`Selected ${node.name} - now select target node`, 'info');
        } else if (this.selectedNodes.length === 1) {
            const fromNode = this.selectedNodes[0];
            if (fromNode.id !== node.id) {
                let weight = 1;
                if (this.isWeighted()) {
                    const weightStr = prompt('Enter edge weight:', '1');
                    if (weightStr === null) {
                        // User cancelled
                        fromNode.state = 'default';
                        this.selectedNodes = [];
                        this.redraw();
                        return;
                    }
                    weight = parseInt(weightStr) || 1;
                }

                this.addEdge(fromNode, node, weight);
            } else {
                this.showStatus('Cannot connect node to itself', 'error');
            }

            fromNode.state = 'default';
            this.selectedNodes = [];
        }

        this.redraw();
    }

    getNodeAt(x, y) {
        for (let node of this.nodes.values()) {
            const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2);
            if (distance <= node.radius) {
                return node;
            }
        }
        return null;
    }

    selectNode(node) {
        // Reset all nodes to default state (except algorithm states)
        for (let n of this.nodes.values()) {
            if (n.state !== 'visited' && n.state !== 'visiting') {
                n.state = 'default';
                n.color = this.colors.node.default;
            }
        }

        node.state = 'current';
        node.color = this.colors.node.current;
        this.redraw();
    }

    // FIXED: Improved context menu positioning
    showContextMenu(x, y, node) {
        const menu = document.getElementById('contextMenu');
        
        // Show/hide appropriate items
        document.getElementById('contextAddNode').style.display = node ? 'none' : 'block';
        document.getElementById('contextConnectNode').style.display = node ? 'block' : 'none';
        document.getElementById('contextRenameNode').style.display = node ? 'block' : 'none';
        document.getElementById('contextDeleteNode').style.display = node ? 'block' : 'none';

        // FIXED: Ensure menu doesn't go off-screen
        const menuRect = menu.getBoundingClientRect();
        const maxX = window.innerWidth - menuRect.width;
        const maxY = window.innerHeight - menuRect.height;

        menu.style.left = Math.min(x, maxX) + 'px';
        menu.style.top = Math.min(y, maxY) + 'px';
        menu.style.display = 'block';

        this.contextMenuNode = node;
        this.contextMenuPos = { 
            x: x - this.canvas.getBoundingClientRect().left, 
            y: y - this.canvas.getBoundingClientRect().top 
        };
    }

    hideContextMenu() {
        document.getElementById('contextMenu').style.display = 'none';
    }

    contextAddNode() {
        this.addNode(this.contextMenuPos.x, this.contextMenuPos.y);
        this.hideContextMenu();
    }

    contextConnectNode() {
        if (this.contextMenuNode) {
            this.setMode('adding-edge');
            this.selectedNodes = [this.contextMenuNode];
            this.contextMenuNode.state = 'current';
            this.contextMenuNode.color = this.colors.node.current;
            this.redraw();
        }
        this.hideContextMenu();
    }

    contextRenameNode() {
        if (this.contextMenuNode) {
            this.renameNode(this.contextMenuNode);
        }
        this.hideContextMenu();
    }

    contextDeleteNode() {
        if (this.contextMenuNode) {
            this.deleteNode(this.contextMenuNode);
        }
        this.hideContextMenu();
    }

    renameNode(node) {
        const newName = prompt('Enter new node name:', node.name);
        if (newName && newName.trim()) {
            // Check if name already exists
            const existingNode = Array.from(this.nodes.values()).find(n => n.name === newName.trim() && n.id !== node.id);
            if (existingNode) {
                this.showStatus('Node name already exists', 'error');
                return;
            }

            node.name = newName.trim();
            this.updateNodeSelect();
            this.redraw();
            this.showStatus(`Node renamed to ${node.name}`, 'success');
        }
    }

    deleteNode(node) {
        // Delete all edges connected to this node
        const edgesToDelete = [];
        for (let [edgeId, edge] of this.edges) {
            if (edge.from === node.id || edge.to === node.id) {
                edgesToDelete.push(edgeId);
            }
        }

        edgesToDelete.forEach(edgeId => this.edges.delete(edgeId));
        this.nodes.delete(node.id);
        this.updateNodeSelect();
        this.updateUI();
        this.redraw();
        this.showStatus(`Node ${node.name} deleted`, 'success');
    }

    clearGraph() {
        if (this.nodes.size === 0) {
            this.showStatus('Graph is already empty', 'info');
            return;
        }

        this.nodes.clear();
        this.edges.clear();
        this.resetAlgorithm();
        this.setMode('normal');
        this.updateNodeSelect();
        this.updateUI();
        this.redraw();
        this.showStatus('Graph cleared', 'success');
    }

    isDirected() {
        return document.getElementById('graphType').value === 'directed';
    }

    isWeighted() {
        return document.getElementById('weightedGraph').checked;
    }

    // FIXED: Corrected dropdown initialization
    updateNodeSelect() {
        const select = document.getElementById('startNodeSelect');
        select.innerHTML = '<option value="">Select start node</option>'; // FIXED: Added proper option element

        for (let node of this.nodes.values()) {
            const option = document.createElement('option');
            option.value = node.id;
            option.textContent = node.name;
            select.appendChild(option);
        }
    }

    updateUI() {
        document.getElementById('nodeCount').textContent = this.nodes.size;
        document.getElementById('edgeCount').textContent = this.edges.size;
        document.getElementById('currentMode').textContent = this.mode.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());

        // Update edge weight input visibility
        const weightInput = document.getElementById('edgeWeightInput');
        weightInput.style.display = this.isWeighted() ? 'block' : 'none';
    }

    updateSpeed() {
        const slider = document.getElementById('speedSlider');
        this.animationSpeed = parseInt(slider.value);
        document.getElementById('speedLabel').textContent = this.animationSpeed + 'ms';
    }

    showStatus(message, type = 'info') {
        const statusElement = document.getElementById('algorithmStatus');
        statusElement.textContent = message;
        statusElement.className = 'algorithm-status ' + type;

        setTimeout(() => {
            if (statusElement.textContent === message) {
                statusElement.className = 'algorithm-status';
                statusElement.textContent = 'Ready to visualize algorithms';
            }
        }, 3000);
    }

    // Algorithm implementations
    runAlgorithm() {
        const algorithmSelect = document.getElementById('algorithmSelect');
        const startNodeSelect = document.getElementById('startNodeSelect');
        const algorithm = algorithmSelect.value;
        const startNodeId = parseInt(startNodeSelect.value);

        if (!algorithm) {
            this.showStatus('Please select an algorithm', 'error');
            return;
        }

        if (!startNodeId && ['BFS', 'DFS', 'Dijkstra', 'Prim'].includes(algorithm)) {
            this.showStatus('Please select a start node', 'error');
            return;
        }

        if (this.nodes.size === 0) {
            this.showStatus('Please add some nodes first', 'error');
            return;
        }

        // Check connectivity for algorithms that need it
        if (['Dijkstra', 'Kruskal', 'Prim'].includes(algorithm) && !this.isGraphConnected()) {
            this.showStatus('Graph must be connected for this algorithm', 'error');
            return;
        }

        this.resetAlgorithm();
        this.currentAlgorithm = algorithm;

        try {
            switch (algorithm) {
                case 'BFS':
                    this.algorithmSteps = this.bfs(startNodeId);
                    break;
                case 'DFS':
                    this.algorithmSteps = this.dfs(startNodeId);
                    break;
                case 'Dijkstra':
                    this.algorithmSteps = this.dijkstra(startNodeId);
                    break;
                case 'Kruskal':
                    this.algorithmSteps = this.kruskal();
                    break;
                case 'Prim':
                    this.algorithmSteps = this.prim(startNodeId);
                    break;
            }

            if (this.algorithmSteps.length > 0) {
                this.showStatus(`${algorithm} algorithm ready - ${this.algorithmSteps.length} steps`, 'success');
                this.startAnimation();
            } else {
                this.showStatus('Algorithm completed with no steps', 'warning');
            }
        } catch (error) {
            this.showStatus(`Algorithm error: ${error.message}`, 'error');
        }
    }

    isGraphConnected() {
        if (this.nodes.size <= 1) return true;

        const visited = new Set();
        const startNode = this.nodes.keys().next().value;
        const queue = [startNode];

        while (queue.length > 0) {
            const currentId = queue.shift();
            if (visited.has(currentId)) continue;

            visited.add(currentId);
            const neighbors = this.getNeighbors(currentId);
            for (let neighborId of neighbors) {
                if (!visited.has(neighborId)) {
                    queue.push(neighborId);
                }
            }
        }

        return visited.size === this.nodes.size;
    }

    bfs(startNodeId) {
        const steps = [];
        const visited = new Set();
        const queue = [startNodeId];

        steps.push({
            type: 'start',
            nodeId: startNodeId,
            message: `Starting BFS from ${this.nodes.get(startNodeId).name}`
        });

        while (queue.length > 0) {
            const currentId = queue.shift();
            if (visited.has(currentId)) continue;

            visited.add(currentId);
            steps.push({
                type: 'visit',
                nodeId: currentId,
                message: `Visiting ${this.nodes.get(currentId).name}`
            });

            // Get neighbors
            const neighbors = this.getNeighbors(currentId);
            for (let neighborId of neighbors) {
                if (!visited.has(neighborId) && !queue.includes(neighborId)) {
                    queue.push(neighborId);
                    steps.push({
                        type: 'discover',
                        nodeId: neighborId,
                        message: `Added ${this.nodes.get(neighborId).name} to queue`
                    });
                }
            }
        }

        return steps;
    }

    // FIXED: Added error handling for invalid start nodes
    dfs(startNodeId) {
        if (!this.nodes.has(startNodeId)) {
            throw new Error('Start node not found');
        }

        const steps = [];
        const visited = new Set();

        const dfsRecursive = (nodeId) => {
            visited.add(nodeId);
            steps.push({
                type: 'visit',
                nodeId: nodeId,
                message: `Visiting ${this.nodes.get(nodeId).name}`
            });

            const neighbors = this.getNeighbors(nodeId);
            for (let neighborId of neighbors) {
                if (!visited.has(neighborId)) {
                    steps.push({
                        type: 'discover',
                        nodeId: neighborId,
                        message: `Exploring ${this.nodes.get(neighborId).name}`
                    });
                    dfsRecursive(neighborId);
                }
            }
        };

        steps.push({
            type: 'start',
            nodeId: startNodeId,
            message: `Starting DFS from ${this.nodes.get(startNodeId).name}`
        });

        dfsRecursive(startNodeId);
        return steps;
    }

    dijkstra(startNodeId) {
        const steps = [];
        const distances = new Map();
        const previous = new Map();
        const unvisited = new Set();

        // Initialize distances
        for (let nodeId of this.nodes.keys()) {
            distances.set(nodeId, nodeId === startNodeId ? 0 : Infinity);
            unvisited.add(nodeId);
        }

        steps.push({
            type: 'start',
            nodeId: startNodeId,
            message: `Starting Dijkstra from ${this.nodes.get(startNodeId).name}`
        });

        while (unvisited.size > 0) {
            // Find node with minimum distance
            let currentId = null;
            let minDistance = Infinity;
            for (let nodeId of unvisited) {
                if (distances.get(nodeId) < minDistance) {
                    minDistance = distances.get(nodeId);
                    currentId = nodeId;
                }
            }

            if (currentId === null || minDistance === Infinity) break;

            unvisited.delete(currentId);
            steps.push({
                type: 'visit',
                nodeId: currentId,
                message: `Processing ${this.nodes.get(currentId).name} (distance: ${minDistance})`
            });

            // Update distances to neighbors
            const neighbors = this.getNeighbors(currentId);
            for (let neighborId of neighbors) {
                if (unvisited.has(neighborId)) {
                    const edge = this.getEdge(currentId, neighborId);
                    const newDistance = distances.get(currentId) + edge.weight;

                    if (newDistance < distances.get(neighborId)) {
                        distances.set(neighborId, newDistance);
                        previous.set(neighborId, currentId);
                        steps.push({
                            type: 'update',
                            nodeId: neighborId,
                            message: `Updated ${this.nodes.get(neighborId).name} distance to ${newDistance}`
                        });
                    }
                }
            }
        }

        return steps;
    }

    kruskal() {
        const steps = [];
        const edges = Array.from(this.edges.values()).sort((a, b) => a.weight - b.weight);
        const unionFind = new UnionFind(Array.from(this.nodes.keys()));

        steps.push({
            type: 'start',
            message: 'Starting Kruskal MST algorithm'
        });

        for (let edge of edges) {
            if (!unionFind.connected(edge.from, edge.to)) {
                unionFind.union(edge.from, edge.to);
                steps.push({
                    type: 'add-edge',
                    edgeId: `${edge.from}-${edge.to}`,
                    message: `Added edge ${this.nodes.get(edge.from).name} - ${this.nodes.get(edge.to).name} (weight: ${edge.weight})`
                });
            }
        }

        return steps;
    }

    prim(startNodeId) {
        const steps = [];
        const inMST = new Set([startNodeId]);
        const edges = [];

        steps.push({
            type: 'start',
            nodeId: startNodeId,
            message: `Starting Prim MST from ${this.nodes.get(startNodeId).name}`
        });

        // Add initial edges
        const neighbors = this.getNeighbors(startNodeId);
        for (let neighborId of neighbors) {
            const edge = this.getEdge(startNodeId, neighborId);
            edges.push(edge);
        }

        while (edges.length > 0 && inMST.size < this.nodes.size) {
            // Find minimum weight edge
            edges.sort((a, b) => a.weight - b.weight);
            const minEdge = edges.shift();
            const newNode = inMST.has(minEdge.from) ? minEdge.to : minEdge.from;

            if (!inMST.has(newNode)) {
                inMST.add(newNode);
                steps.push({
                    type: 'add-edge',
                    edgeId: `${minEdge.from}-${minEdge.to}`,
                    nodeId: newNode,
                    message: `Added ${this.nodes.get(newNode).name} to MST (weight: ${minEdge.weight})`
                });

                // Add new edges
                const newNeighbors = this.getNeighbors(newNode);
                for (let neighborId of newNeighbors) {
                    if (!inMST.has(neighborId)) {
                        const edge = this.getEdge(newNode, neighborId);
                        edges.push(edge);
                    }
                }
            }

            // Remove edges that are now internal to MST
            for (let i = edges.length - 1; i >= 0; i--) {
                const edge = edges[i];
                if (inMST.has(edge.from) && inMST.has(edge.to)) {
                    edges.splice(i, 1);
                }
            }
        }

        return steps;
    }

    getNeighbors(nodeId) {
        const neighbors = [];
        for (let edge of this.edges.values()) {
            if (edge.from === nodeId) {
                neighbors.push(edge.to);
            } else if (!this.isDirected() && edge.to === nodeId) {
                neighbors.push(edge.from);
            }
        }
        return neighbors;
    }

    // FIXED: Enhanced edge lookup for undirected graphs
    getEdge(fromId, toId) {
        const edgeId = `${fromId}-${toId}`;
        const reverseEdgeId = `${toId}-${fromId}`;
        
        let edge = this.edges.get(edgeId);
        if (!edge && !this.isDirected()) {
            edge = this.edges.get(reverseEdgeId);
        }
        return edge;
    }

    startAnimation() {
        this.isPlaying = true;
        this.currentStep = 0;
        this.updatePlayPauseButton();
        this.playNextStep();
    }

    playNextStep() {
        if (!this.isPlaying || this.currentStep >= this.algorithmSteps.length) {
            this.isPlaying = false;
            this.updatePlayPauseButton();
            this.showStatus('Algorithm visualization completed', 'success');
            return;
        }

        this.executeStep(this.algorithmSteps[this.currentStep]);
        this.currentStep++;

        this.animationTimer = setTimeout(() => {
            this.playNextStep();
        }, this.animationSpeed);
    }

    executeStep(step) {
        switch (step.type) {
            case 'start':
                if (step.nodeId) {
                    const node = this.nodes.get(step.nodeId);
                    node.state = 'current';
                    node.color = this.colors.node.current;
                }
                break;

            case 'visit':
                const visitNode = this.nodes.get(step.nodeId);
                visitNode.state = 'visited';
                visitNode.color = this.colors.node.visited;
                break;

            case 'discover':
                const discoverNode = this.nodes.get(step.nodeId);
                discoverNode.state = 'visiting';
                discoverNode.color = this.colors.node.visiting;
                break;

            case 'update':
                const updateNode = this.nodes.get(step.nodeId);
                updateNode.state = 'visiting';
                updateNode.color = this.colors.node.visiting;
                break;

            case 'add-edge':
                // FIXED: Enhanced edge handling for undirected graphs
                let edge = this.edges.get(step.edgeId);
                if (!edge && !this.isDirected()) {
                    // Try reverse direction for undirected graphs
                    const [from, to] = step.edgeId.split('-');
                    edge = this.edges.get(`${to}-${from}`);
                }
                if (edge) {
                    edge.state = 'mst';
                    edge.color = this.colors.edge.mst;
                }

                if (step.nodeId) {
                    const node = this.nodes.get(step.nodeId);
                    node.state = 'visited';
                    node.color = this.colors.node.visited;
                }
                break;
        }

        this.showStatus(step.message, 'info');
        this.redraw();
    }

    togglePlayPause() {
        if (this.algorithmSteps.length === 0) {
            this.showStatus('No algorithm to play', 'error');
            return;
        }

        this.isPlaying = !this.isPlaying;
        this.updatePlayPauseButton();

        if (this.isPlaying) {
            this.playNextStep();
        } else {
            clearTimeout(this.animationTimer);
        }
    }

    stepForward() {
        if (this.algorithmSteps.length === 0) {
            this.showStatus('No algorithm loaded', 'error');
            return;
        }

        if (this.currentStep < this.algorithmSteps.length) {
            this.isPlaying = false;
            clearTimeout(this.animationTimer);
            this.updatePlayPauseButton();
            this.executeStep(this.algorithmSteps[this.currentStep]);
            this.currentStep++;
        } else {
            this.showStatus('Algorithm visualization complete', 'info');
        }
    }

    resetAlgorithm() {
        this.isPlaying = false;
        this.currentStep = 0;
        this.algorithmSteps = [];
        clearTimeout(this.animationTimer);
        this.updatePlayPauseButton();

        // Reset all visual states
        for (let node of this.nodes.values()) {
            node.state = 'default';
            node.color = this.colors.node.default;
        }

        for (let edge of this.edges.values()) {
            edge.state = 'default';
            edge.color = this.colors.edge.default;
        }

        this.redraw();
        this.showStatus('Algorithm reset', 'info');
    }

    updatePlayPauseButton() {
        const button = document.getElementById('playPauseBtn');
        const icon = button.querySelector('.btn-icon');
        icon.textContent = this.isPlaying ? '⏸️' : '▶️';
    }

    redraw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.nodes.size === 0) {
            // Show hint when canvas is empty
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            this.ctx.font = '18px var(--font-family-base)';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('Click "Add Node" then click here to create nodes', this.canvas.width / 2, this.canvas.height / 2);
            return;
        }

        // Draw edges first
        for (let edge of this.edges.values()) {
            this.drawEdge(edge);
        }

        // Draw nodes on top
        for (let node of this.nodes.values()) {
            this.drawNode(node);
        }
    }

    drawNode(node) {
        const ctx = this.ctx;

        // Draw node circle with glow effect
        ctx.save();
        if (node.state === 'current' || node.state === 'visiting') {
            ctx.shadowColor = node.color;
            ctx.shadowBlur = 20;
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = node.color;
        ctx.fill();

        // Add border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();

        // Draw node label
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 14px var(--font-family-base)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.name, node.x, node.y);
    }

    drawEdge(edge) {
        const fromNode = this.nodes.get(edge.from);
        const toNode = this.nodes.get(edge.to);
        if (!fromNode || !toNode) return;

        const ctx = this.ctx;

        // Calculate edge endpoints (on circle boundary)
        const dx = toNode.x - fromNode.x;
        const dy = toNode.y - fromNode.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance === 0) return; // Avoid division by zero

        const fromX = fromNode.x + (dx / distance) * fromNode.radius;
        const fromY = fromNode.y + (dy / distance) * fromNode.radius;
        const toX = toNode.x - (dx / distance) * toNode.radius;
        const toY = toNode.y - (dy / distance) * toNode.radius;

        ctx.save();

        // Glow effect for active edges
        if (edge.state === 'mst' || edge.state === 'active') {
            ctx.shadowColor = edge.color;
            ctx.shadowBlur = 10;
        }

        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.strokeStyle = edge.color;
        ctx.lineWidth = edge.state === 'mst' ? 4 : 2;
        ctx.stroke();

        // Draw arrow for directed graphs
        if (this.isDirected()) {
            this.drawArrow(ctx, fromX, fromY, toX, toY, edge.color);
        }

        ctx.restore();

        // Draw weight if graph is weighted
        if (this.isWeighted()) {
            const midX = (fromX + toX) / 2;
            const midY = (fromY + toY) / 2;
            const text = edge.weight.toString();
            const metrics = ctx.measureText(text);
            const padding = 4;

            // Background for weight label
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(midX - metrics.width/2 - padding, midY - 8, metrics.width + padding*2, 16);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px var(--font-family-base)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, midX, midY);
        }
    }

    drawArrow(ctx, fromX, fromY, toX, toY, color) {
        const headLength = 15;
        const headAngle = Math.PI / 6;
        const angle = Math.atan2(toY - fromY, toX - fromX);

        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(
            toX - headLength * Math.cos(angle - headAngle),
            toY - headLength * Math.sin(angle - headAngle)
        );
        ctx.moveTo(toX, toY);
        ctx.lineTo(
            toX - headLength * Math.cos(angle + headAngle),
            toY - headLength * Math.sin(angle + headAngle)
        );
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

// Union-Find data structure for Kruskal's algorithm
class UnionFind {
    constructor(elements) {
        this.parent = new Map();
        this.rank = new Map();

        for (let element of elements) {
            this.parent.set(element, element);
            this.rank.set(element, 0);
        }
    }

    find(element) {
        if (this.parent.get(element) !== element) {
            this.parent.set(element, this.find(this.parent.get(element)));
        }
        return this.parent.get(element);
    }

    union(element1, element2) {
        const root1 = this.find(element1);
        const root2 = this.find(element2);

        if (root1 !== root2) {
            const rank1 = this.rank.get(root1);
            const rank2 = this.rank.get(root2);

            if (rank1 < rank2) {
                this.parent.set(root1, root2);
            } else if (rank1 > rank2) {
                this.parent.set(root2, root1);
            } else {
                this.parent.set(root2, root1);
                this.rank.set(root1, rank1 + 1);
            }
        }
    }

    connected(element1, element2) {
        return this.find(element1) === this.find(element2);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    window.graphVisualizer = new GraphVisualizer();
});
