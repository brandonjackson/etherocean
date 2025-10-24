// Default message to show when radio is started
const DEFAULT_MESSAGE = "Tune in using the dial below.";

class MessageSystem {
    constructor() {
        this.messageElement = null;
        this.displayMessageTimeout = null;
        this.isDisplayingMessage = false;
        this.originalColor = null;
    }

    initialize() {
        console.log('Initializing message system...');
        
        // Get the message element
        this.messageElement = document.getElementById('messageText');
        if (!this.messageElement) {
            console.error('Message element not found');
            return;
        }
        
        // Set default message
        this.messageElement.textContent = 'Loading...';
        console.log('Message system initialized');
    }


    _showMessage(text, color = null) {
        console.log(`_showMessage called with text: "${text}" and color: "${color}"`);
        
        if (!this.messageElement) {
            console.error('Message element not found');
            return;
        }

        // Clear any existing display message timeout
        if (this.displayMessageTimeout) {
            clearTimeout(this.displayMessageTimeout);
            this.displayMessageTimeout = null;
        }

        // Store original color if not already stored
        if (this.originalColor === null) {
            this.originalColor = this.messageElement.style.color || '';
        }

        // Set flag to indicate we're displaying a message
        this.isDisplayingMessage = true;

        // Display the message immediately
        this.messageElement.textContent = text;
        
        // Apply color if provided
        if (color) {
            this.messageElement.style.setProperty('color', color, 'important');
            console.log(`Message displayed: "${text}" with color: "${color}"`);
        } else {
            console.log(`Message displayed: "${text}" with default color`);
        }

        // Set timeout to clear the message after 10 seconds
        this.displayMessageTimeout = setTimeout(() => {
            console.log('Message timeout expired, clearing message');
            this.isDisplayingMessage = false;
            this.displayMessageTimeout = null;
            
            // Restore original color
            if (this.originalColor !== null) {
                this.messageElement.style.setProperty('color', this.originalColor, 'important');
                console.log('Restored original color:', this.originalColor);
            }
            
            // Clear the message
            this.messageElement.textContent = '';
        }, 10000);
        
        console.log('Message timeout set for 10 seconds, timeout ID:', this.displayMessageTimeout);
    }

    showDefaultMessage() {
        console.log('Showing default message for 10 seconds');
        this._showMessage(DEFAULT_MESSAGE);
    }

    displayMessage(text, color = null) {
        this._showMessage(text, color);
    }

    stopDisplayMessage() {
        if (this.displayMessageTimeout) {
            clearTimeout(this.displayMessageTimeout);
            this.displayMessageTimeout = null;
        }
        this.isDisplayingMessage = false;
    }

    destroy() {
        this.stopDisplayMessage();
        this.messageElement = null;
    }
}
