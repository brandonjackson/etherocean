// Message configuration - edit these messages here
const MESSAGES = [
    { text: "Tune in using the dial below.", duration: 60 },
    { text: "The whistling sound comes from interference between different stations.", duration: 60 },
    { text: "There were so many stations changing so frequently that radios had to have a generic 0 - 180 scale.", duration: 60 },
    { text: "The ether was unregulated—so official broadcasts were heard alongside amateurs.", duration: 60 }
];

class MessageSystem {
    constructor() {
        this.messages = MESSAGES;
        this.currentIndex = 0;
        this.interval = null;
        this.messageElement = null;
    }

    initialize() {
        console.log('Initializing message system...');
        
        // Get the message element
        this.messageElement = document.getElementById('messageText');
        if (!this.messageElement) {
            console.error('Message element not found');
            return;
        }
        
        if (this.messages.length > 0) {
            // Start with the first message
            this.showMessage(0);
            // Start the timer immediately for the first message
            this.startMessageTimer();
            console.log(`Message system initialized with ${this.messages.length} messages (timer started)`);
        } else {
            console.warn('No messages found, using fallback');
            this.messageElement.textContent = 'Tune in using the dial below';
        }
    }


    showMessage(index) {
        console.log(`showMessage called with index ${index}, messages.length: ${this.messages.length}`);
        
        if (this.messageElement) {
            if (index >= 0 && index < this.messages.length) {
                const message = this.messages[index];
                console.log(`Message object:`, message);
                console.log(`Message text: "${message.text}"`);
                
                if (message.text && message.text !== 'undefined') {
                    this.messageElement.textContent = message.text;
                } else {
                    console.log('Message text is undefined, showing fallback');
                    this.messageElement.textContent = 'Tune in using the dial below';
                }
                this.currentIndex = index;
            } else {
                console.log('Invalid index, showing fallback');
                this.messageElement.textContent = 'Tune in using the dial below';
            }
        } else {
            console.error('Message element not found in showMessage');
        }
    }

    startMessageTimer() {
        console.log('Starting message timer...');
        if (this.interval) {
            clearTimeout(this.interval);
        }
        
        // Schedule next message based on current message's duration
        const currentMessage = this.messages[this.currentIndex];
        const durationMs = (currentMessage.duration || 10) * 1000;
        console.log(`Message "${currentMessage.text}" will display for ${currentMessage.duration} seconds`);
        
        this.interval = setTimeout(() => {
            this.currentIndex = (this.currentIndex + 1) % this.messages.length;
            this.showMessage(this.currentIndex);
            // Continue the timer for the next message
            this.startMessageTimer();
        }, durationMs);
    }
    
    startRotation() {
        console.log('Starting message rotation...');
        // This method is called when overlay is hidden, but timer is already running
        // Just ensure the timer is active
        if (!this.interval) {
            this.startMessageTimer();
        }
    }
    
    startRotationWhenReady() {
        console.log('Message rotation will start when overlay is hidden');
        // This will be called when the overlay is hidden
        this.startRotation();
    }

    stopRotation() {
        if (this.interval) {
            clearTimeout(this.interval);
            this.interval = null;
        }
    }

    destroy() {
        this.stopRotation();
        this.messages = [];
        this.messageElement = null;
    }
}
