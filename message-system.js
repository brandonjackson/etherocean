// Message configuration - edit these messages here
const MESSAGES = [
    { text: "Tune in using the dial below.", duration: 20 },
    { text: "The whistling sound comes from interference between different stations.", duration: 20 },
    { text: "There were so many stations changing so frequently that radios had to have a generic 0 - 180 scale.", duration: 20 },
    { text: "The ether was unregulated—so official broadcasts were heard alongside amateurs.", duration: 20 }
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
            // Don't start rotation yet - wait for overlay to be hidden
            console.log(`Message system initialized with ${this.messages.length} messages (rotation paused until overlay hidden)`);
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

    startRotation() {
        console.log('Starting message rotation...');
        if (this.interval) {
            clearInterval(this.interval);
        }
        
        this.interval = setInterval(() => {
            this.currentIndex = (this.currentIndex + 1) % this.messages.length;
            this.showMessage(this.currentIndex);
        }, 10000); // 10 seconds
    }
    
    startRotationWhenReady() {
        console.log('Message rotation will start when overlay is hidden');
        // This will be called when the overlay is hidden
        this.startRotation();
    }

    stopRotation() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    destroy() {
        this.stopRotation();
        this.messages = [];
        this.messageElement = null;
    }
}
