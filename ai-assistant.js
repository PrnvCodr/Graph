/**
 * AI Assistant for Graph Visualizer
 * Connects to the existing HTML and provides interactive functionality.
 *
 * @version 2.0.0
 * @author Gemini
 * @description Corrected version that works with the existing HTML structure.
 */

// --- Main Initialization Function ---
// This is the only function that needs to be called to activate the assistant.
function initializeAIAssistant() {
    // Check if the main graph visualizer is available
    if (typeof window.graphVisualizer === 'undefined') {
        console.error("AI Assistant Error: graphVisualizer instance not found. Make sure app.js is loaded first.");
        return;
    }

    // The HTML is already in index.html, so we just initialize the class.
    const assistant = new AIAssistant();
    if (assistant.elements) { // Only initialize if elements were found
        assistant.init();
        console.log("🤖 AI Assistant Initialized");
    }
}


class AIAssistant {
    constructor() {
        // Select elements using the correct IDs from your index.html
        this.elements = {
            sidebar: document.getElementById('ai-sidebar'),
            toggleButton: document.getElementById('toggle-sidebar-btn'),
            floatingToggle: document.getElementById('floating-toggle-btn'),
            chatHistory: document.getElementById('chat-history'),
            input: document.getElementById('chat-input'),
            sendButton: document.getElementById('send-btn'),
            clearButton: document.getElementById('clear-chat-btn'),
        };

        // Validate that all elements were found to prevent runtime errors
        if (Object.values(this.elements).some(el => el === null)) {
            console.error("AI Assistant Error: One or more UI elements could not be found. Please check the IDs in your HTML file match the ones in this script.");
            this.elements = null; // Prevent further errors
            return;
        }

        this.isCollapsed = false; // Sidebar starts visible as per the HTML.
        this.chatHistory = []; // To store conversation context for the AI
    }

    init() {
        this.bindEvents();
        this.updateTheme(); // Sync with main app's theme on load

        // The welcome message is already in the HTML.
        // We'll grab it and add it to our internal history for AI context.
        const welcomeMessageElement = this.elements.chatHistory.querySelector('.gva-message-content p');
        if (welcomeMessageElement) {
            const welcomeText = welcomeMessageElement.textContent;
            this.chatHistory.push({ role: 'ai', parts: [{ text: welcomeText }] });
        }
    }

    bindEvents() {
        // --- Event Listeners for UI interaction ---

        // Sidebar visibility toggles
        this.elements.toggleButton.addEventListener('click', () => this.toggleSidebar());
        this.elements.floatingToggle.addEventListener('click', () => this.toggleSidebar());

        // Chat functionality
        this.elements.sendButton.addEventListener('click', () => this.sendMessage());
        this.elements.clearButton.addEventListener('click', () => this.clearChat());

        // Handle 'Enter' key for sending message
        this.elements.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!this.elements.sendButton.disabled) {
                    this.sendMessage();
                }
            }
        });

        // Enable/disable send button based on input and auto-resize textarea
        this.elements.input.addEventListener('input', () => {
            this.elements.sendButton.disabled = this.elements.input.value.trim().length === 0;
            this.elements.input.style.height = 'auto';
            this.elements.input.style.height = `${this.elements.input.scrollHeight}px`;
        });

        // Listen for theme changes from the main app
        const mainThemeToggle = document.getElementById('themeToggle');
        if (mainThemeToggle) {
            mainThemeToggle.addEventListener('click', () => {
                // Use a small timeout to allow the main app's theme attribute to update first
                setTimeout(() => this.updateTheme(), 50);
            });
        }
    }

    toggleSidebar() {
        this.isCollapsed = !this.isCollapsed;
        // Use the CSS classes from ai-assistant.css to show/hide elements
        this.elements.sidebar.classList.toggle('gva-collapsed', this.isCollapsed);
        this.elements.floatingToggle.classList.toggle('gva-visible', this.isCollapsed);
    }

    updateTheme() {
        // This function syncs the assistant's theme with the main application
        const isDarkMode = document.documentElement.getAttribute('data-color-scheme') === 'dark';
        this.elements.sidebar.setAttribute('data-color-scheme', isDarkMode ? 'dark' : 'light');
    }

    // This function is called when the "Clear Chat" button is clicked
    resetWelcomeMessage() {
        this.elements.chatHistory.innerHTML = ''; // Clear the chat UI
        const welcomeText = "Hello! I'm your AI Assistant. How can I help you today?";
        this.addMessageToHistory('ai', welcomeText); // Add a new welcome message
    }

    clearChat() {
        this.chatHistory = []; // Reset internal history
        this.resetWelcomeMessage();
    }

    async sendMessage() {
        const userInput = this.elements.input.value.trim();
        if (!userInput) return;

        this.addMessageToHistory('user', userInput);
        this.elements.input.value = '';
        this.elements.input.style.height = 'auto'; // Reset textarea height
        this.elements.sendButton.disabled = true;
        this.elements.input.focus();

        this.showTypingIndicator(true);

        try {
            const graphData = this.getGraphData();
            const response = await fetch('/api/ask', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: userInput,
                    graph: graphData,
                    history: this.chatHistory,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `API Error: ${response.statusText}` }));
                throw new Error(errorData.error);
            }

            const result = await response.json();
            this.addMessageToHistory('ai', result.response);

        } catch (error) {
            console.error("Error fetching AI response:", error);
            this.addMessageToHistory('ai', `Sorry, I encountered an error. Please check the server connection and try again. Details: ${error.message}`);
        } finally {
            this.showTypingIndicator(false);
        }
    }

    addMessageToHistory(sender, text) {
        // Add message to internal history for context
        this.chatHistory.push({ role: sender, parts: [{ text }] });
        // Limit history size to avoid overly large API requests
        if (this.chatHistory.length > 10) {
            this.chatHistory.splice(0, 2); // Remove the oldest user/AI message pair
        }

        // Create and display the message element in the UI
        const messageElement = this.createMessageElement(sender, text);
        this.elements.chatHistory.appendChild(messageElement);
        this.elements.chatHistory.scrollTop = this.elements.chatHistory.scrollHeight;
    }

    createMessageElement(sender, text) {
        const messageWrapper = document.createElement('div');
        messageWrapper.className = `gva-chat-message gva-${sender}-message`;

        const avatar = document.createElement('div');
        avatar.className = 'gva-avatar';
        avatar.textContent = sender === 'ai' ? 'AI' : 'You'; // Simple, clear avatars

        const content = document.createElement('div');
        content.className = 'gva-message-content';
        
        // Basic markdown to HTML conversion for bold, code, and newlines
        let htmlText = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
        content.innerHTML = `<p>${htmlText}</p>`; // Wrap in <p> for consistent styling

        messageWrapper.appendChild(avatar);
        messageWrapper.appendChild(content);

        return messageWrapper;
    }

    showTypingIndicator(show) {
        const existingIndicator = this.elements.chatHistory.querySelector('.gva-typing-indicator');
        if (show) {
            if (existingIndicator) return; // Don't add more than one
            const indicator = document.createElement('div');
            indicator.className = 'gva-chat-message gva-ai-message gva-typing-indicator';
            indicator.innerHTML = `
                <div class="gva-avatar">AI</div>
                <div class="gva-message-content">
                    <span></span><span></span><span></span>
                </div>
            `;
            this.elements.chatHistory.appendChild(indicator);
            this.elements.chatHistory.scrollTop = this.elements.chatHistory.scrollHeight;
        } else {
            if (existingIndicator) {
                existingIndicator.remove();
            }
        }
    }

    getGraphData() {
        const gv = window.graphVisualizer;
        if (!gv) return null;

        // Collects data from the main graph visualizer to send to the AI
        const nodes = Array.from(gv.nodes.values()).map(n => ({ id: n.id, name: n.name }));
        const edges = Array.from(gv.edges.values()).map(e => ({
            from: gv.nodes.get(e.from)?.name,
            to: gv.nodes.get(e.to)?.name,
            weight: e.weight
        }));

        return {
            nodeCount: gv.nodes.size,
            edgeCount: gv.edges.size,
            isDirected: gv.isDirected(),
            isWeighted: gv.isWeighted(),
            nodes: nodes.map(n => n.name),
            edges: edges,
        };
    }
}

// --- Auto-Initialization ---
// This ensures the assistant is initialized after the page content is loaded.
document.addEventListener('DOMContentLoaded', () => {
    // A small delay to ensure the main app's global variables are fully ready
    setTimeout(initializeAIAssistant, 100);
});
