class RadioUI {
    constructor() {
        this.dialPosition = 90; // Start at center (90 degrees)
        this.draggingDial = false;
        this.onDialChange = null; // Callback for when dial changes
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Main dial mouse events
        const mainDial = document.getElementById('mainDial');
        mainDial.addEventListener('mousedown', (e) => this.startDialDrag(e));
        
        // Global mouse events for dial dragging
        document.addEventListener('mousemove', (e) => this.handleDialDrag(e));
        document.addEventListener('mouseup', () => this.stopDialDrag());
        
        // Arrow key events
        document.addEventListener('keydown', (e) => this.handleKeyPress(e));
        
        // Touch events for mobile (non-passive because we call preventDefault)
        mainDial.addEventListener('touchstart', (e) => this.startDialDrag(e), { passive: false });
        document.addEventListener('touchmove', (e) => this.handleTouchDrag(e), { passive: false });
        document.addEventListener('touchend', () => this.stopDialDrag(), { passive: true });
    }

    handleKeyPress(event) {
        switch(event.key) {
            case 'ArrowLeft':
                event.preventDefault();
                this.rotateDial(-0.5); // Rotate 0.5 degrees left
                break;
            case 'ArrowRight':
                event.preventDefault();
                this.rotateDial(0.5); // Rotate 0.5 degrees right
                break;
        }
    }

    startDialDrag(event) {
        event.preventDefault();
        this.draggingDial = true;
        this.dragStartX = event.type === 'mousedown' ? event.clientX : event.touches[0].clientX;
        this.dragStartPosition = this.dialPosition;
    }

    handleDialDrag(event) {
        if (!this.draggingDial) return;
        
        event.preventDefault();
        const currentX = event.type === 'mousemove' ? event.clientX : event.touches[0].clientX;
        const deltaX = currentX - this.dragStartX;
        const sensitivity = 0.15; // Reduced sensitivity for smoother movement
        
        const newPosition = this.dragStartPosition + (deltaX * sensitivity);
        this.rotateDial(newPosition - this.dialPosition);
    }

    handleTouchDrag(event) {
        if (!this.draggingDial) return;
        
        event.preventDefault();
        const currentX = event.touches[0].clientX;
        const deltaX = currentX - this.dragStartX;
        const sensitivity = 0.15; // Reduced sensitivity for smoother movement
        
        const newPosition = this.dragStartPosition + (deltaX * sensitivity);
        this.rotateDial(newPosition - this.dialPosition);
    }

    stopDialDrag() {
        this.draggingDial = false;
    }

    rotateDial(degrees) {
        this.dialPosition += degrees;
        
        // Keep dial position within 0-180 range
        if (this.dialPosition < 0) this.dialPosition = 0;
        if (this.dialPosition > 180) this.dialPosition = 180;
        
        // Update dial image rotation
        const mainDial = document.getElementById('mainDial');
        const rotation = this.dialPosition - 90; // Center at 90 degrees
        mainDial.style.transform = `rotate(${rotation}deg)`;
        
        // Notify audio system of dial change
        if (this.onDialChange) {
            this.onDialChange(this.dialPosition);
        }
    }

    getDialPosition() {
        return this.dialPosition;
    }

    setDialChangeCallback(callback) {
        this.onDialChange = callback;
    }
} 