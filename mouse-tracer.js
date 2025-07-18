// Enhanced Mouse Tracer with Scroll Fixes and Better Performance
class MouseTracer {
  constructor() {
    this.init();
    this.trails = [];
    this.maxTrails = 15;
    this.isActive = true;
    this.mouseX = 0;
    this.mouseY = 0;
    this.lastTrailTime = 0;
    this.trailInterval = 50; // ms between trails
    this.isScrolling = false;
    this.scrollTimeout = null;
    this.animationFrame = null;
    this.isVisible = true;
  }

  init() {
    // Create mouse tracer element
    this.tracerElement = document.createElement('div');
    this.tracerElement.className = 'mouse-tracer';
    this.tracerElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 9999;
      mix-blend-mode: screen;
      opacity: 1;
      transition: opacity 0.3s ease;
    `;

    // Create the glow effect element
    this.glowElement = document.createElement('div');
    this.glowElement.className = 'mouse-glow';
    this.glowElement.style.cssText = `
      position: absolute;
      width: 400px;
      height: 400px;
      border-radius: 50%;
      pointer-events: none;
      transform: translate(-50%, -50%);
      transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      opacity: 0.8;
      background: radial-gradient(
        circle,
        rgba(255, 107, 53, 0.15) 0%,
        rgba(255, 107, 53, 0.1) 20%,
        rgba(255, 107, 53, 0.05) 40%,
        transparent 70%
      );
    `;

    // Check for dark mode and adjust colors
    this.updateColors();

    this.tracerElement.appendChild(this.glowElement);
    document.body.appendChild(this.tracerElement);

    // Add event listeners
    this.bindEvents();
  }

  updateColors() {
    const isDark = document.documentElement.getAttribute('data-color-scheme') === 'dark' || 
                   window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (isDark) {
      this.glowElement.style.background = `radial-gradient(
        circle,
        rgba(0, 255, 127, 0.15) 0%,
        rgba(0, 255, 127, 0.1) 20%,
        rgba(0, 255, 127, 0.05) 40%,
        transparent 70%
      )`;
    } else {
      this.glowElement.style.background = `radial-gradient(
        circle,
        rgba(255, 107, 53, 0.15) 0%,
        rgba(255, 107, 53, 0.1) 20%,
        rgba(255, 107, 53, 0.05) 40%,
        transparent 70%
      )`;
    }
  }

  bindEvents() {
    // Mouse move handler with throttling
    document.addEventListener('mousemove', this.throttle((e) => {
      if (!this.isActive || !this.isVisible) return;

      this.mouseX = e.clientX;
      this.mouseY = e.clientY;

      // Update tracer position immediately
      this.updateTracerPosition();

      // Create trail with interval control
      const now = Date.now();
      if (now - this.lastTrailTime > this.trailInterval && !this.isScrolling) {
        this.createTrail(this.mouseX, this.mouseY);
        this.lastTrailTime = now;
      }
    }, 16)); // ~60fps

    // Enhanced click effect
    document.addEventListener('click', (e) => {
      if (!this.isActive || !this.isVisible) return;
      this.createClickEffect(e.clientX, e.clientY);
    });

    // Mouse enter/leave handlers
    document.addEventListener('mouseenter', () => {
      if (!this.isActive) return;
      this.isVisible = true;
      this.tracerElement.style.opacity = '1';
    });

    document.addEventListener('mouseleave', () => {
      this.isVisible = false;
      this.tracerElement.style.opacity = '0';
    });

    // Fixed scroll handling
    let isScrolling = false;
    document.addEventListener('scroll', () => {
      if (!isScrolling) {
        // Hide tracer when scrolling starts
        this.isScrolling = true;
        this.tracerElement.style.opacity = '0.3';
        
        // Clear existing trails during scroll
        this.clearTrails();
      }
      
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = setTimeout(() => {
        // Show tracer when scrolling ends
        this.isScrolling = false;
        if (this.isVisible) {
          this.tracerElement.style.opacity = '1';
        }
        isScrolling = false;
      }, 150);
      
      isScrolling = true;
    }, { passive: true });

    // Window resize handler
    window.addEventListener('resize', this.throttle(() => {
      this.updateTracerPosition();
    }, 100));

    // Theme change handler
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        setTimeout(() => this.updateColors(), 100);
      });
    }

    // Media query for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      this.updateColors();
    });
  }

  // Throttle function for performance
  throttle(func, limit) {
    let inThrottle;
    return function() {
      const args = arguments;
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    }
  }

  updateTracerPosition() {
    if (!this.glowElement) return;
    
    // Use transform for better performance
    this.glowElement.style.left = this.mouseX + 'px';
    this.glowElement.style.top = this.mouseY + 'px';
  }

  createTrail(x, y) {
    if (this.isScrolling) return;

    const trail = document.createElement('div');
    trail.className = 'mouse-trail';
    
    // Get current colors based on theme
    const isDark = document.documentElement.getAttribute('data-color-scheme') === 'dark' || 
                   window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    const colors = isDark ? [
      'rgba(0, 255, 127, 0.8)',
      'rgba(0, 230, 118, 0.8)',
      'rgba(0, 206, 209, 0.8)',
      'rgba(138, 43, 226, 0.8)'
    ] : [
      'rgba(255, 107, 53, 0.8)',
      'rgba(255, 165, 0, 0.8)',
      'rgba(138, 43, 226, 0.8)',
      'rgba(255, 105, 180, 0.8)'
    ];

    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    trail.style.cssText = `
      position: fixed;
      width: 4px;
      height: 4px;
      left: ${x}px;
      top: ${y}px;
      background: ${randomColor};
      border-radius: 50%;
      pointer-events: none;
      z-index: 9998;
      opacity: 0.8;
      box-shadow: 0 0 8px ${randomColor};
      animation: trail-fade 1s ease-out forwards;
      transform: translate(-50%, -50%);
    `;

    document.body.appendChild(trail);

    // Add to trails array for management
    this.trails.push(trail);

    // Remove trail after animation
    setTimeout(() => {
      if (trail.parentNode) {
        trail.parentNode.removeChild(trail);
      }
    }, 1000);

    // Limit number of trails
    if (this.trails.length > this.maxTrails) {
      const oldTrail = this.trails.shift();
      if (oldTrail && oldTrail.parentNode) {
        oldTrail.parentNode.removeChild(oldTrail);
      }
    }
  }

  createClickEffect(x, y) {
    if (this.isScrolling) return;

    const isDark = document.documentElement.getAttribute('data-color-scheme') === 'dark' || 
                   window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    const primaryColor = isDark ? 'rgba(0, 255, 127, 0.8)' : 'rgba(255, 107, 53, 0.8)';

    // Create multiple ripples for better effect
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const ripple = document.createElement('div');
        ripple.className = 'click-ripple';
        ripple.style.cssText = `
          position: fixed;
          left: ${x}px;
          top: ${y}px;
          width: 0;
          height: 0;
          background: ${primaryColor};
          border-radius: 50%;
          pointer-events: none;
          z-index: 9999;
          transform: translate(-50%, -50%);
          animation: click-ripple 0.8s ease-out forwards;
          opacity: ${0.8 - i * 0.2};
        `;

        document.body.appendChild(ripple);

        // Remove after animation
        setTimeout(() => {
          if (ripple.parentNode) {
            ripple.parentNode.removeChild(ripple);
          }
        }, 800);
      }, i * 100);
    }
  }

  clearTrails() {
    this.trails.forEach(trail => {
      if (trail && trail.parentNode) {
        trail.parentNode.removeChild(trail);
      }
    });
    this.trails = [];
  }

  // Method to toggle tracer
  toggle() {
    this.isActive = !this.isActive;
    if (this.isActive) {
      this.tracerElement.style.display = 'block';
      if (this.isVisible) {
        this.tracerElement.style.opacity = '1';
      }
    } else {
      this.tracerElement.style.display = 'none';
      this.clearTrails();
    }
  }

  // Method to destroy tracer
  destroy() {
    this.isActive = false;
    this.clearTrails();
    
    if (this.tracerElement && this.tracerElement.parentNode) {
      this.tracerElement.parentNode.removeChild(this.tracerElement);
    }
    
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }
    
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }
}

// Enhanced CSS animations
const enhancedTracerStyles = `
  @keyframes trail-fade {
    0% {
      opacity: 0.8;
      transform: translate(-50%, -50%) scale(1);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.2);
    }
  }

  @keyframes click-ripple {
    0% {
      width: 0;
      height: 0;
      opacity: 0.8;
    }
    50% {
      width: 40px;
      height: 40px;
      opacity: 0.4;
    }
    100% {
      width: 80px;
      height: 80px;
      opacity: 0;
    }
  }

  .mouse-tracer {
    transition: opacity 0.3s ease !important;
  }

  .mouse-glow {
    animation: gentle-pulse 3s ease-in-out infinite alternate;
  }

  @keyframes gentle-pulse {
    0% { 
      transform: translate(-50%, -50%) scale(0.9);
      opacity: 0.6;
    }
    100% { 
      transform: translate(-50%, -50%) scale(1.1);
      opacity: 0.8;
    }
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .mouse-tracer,
    .mouse-glow,
    .mouse-trail,
    .click-ripple {
      animation: none !important;
      transition: none !important;
    }
  }
`;

// Add enhanced styles to document
const tracerStyleSheet = document.createElement('style');
tracerStyleSheet.textContent = enhancedTracerStyles;
document.head.appendChild(tracerStyleSheet);

// Initialize mouse tracer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const mouseTracer = new MouseTracer();
  
  // Make it globally available
  window.mouseTracer = mouseTracer;
  
  console.log('🐭 Enhanced Mouse Tracer initialized');
});
