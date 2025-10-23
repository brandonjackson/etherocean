class RadioController {
    constructor() {
        console.log('RadioController constructor called');
        
        // Initialize UI and Audio systems
        this.ui = new RadioUI();
        this.audio = new RadioAudio();
        this.messages = new MessageSystem();
        
        // Connect UI changes to audio system
        this.ui.setDialChangeCallback((dialPosition) => {
            this.audio.onDialPositionChange(dialPosition);
        });
        
        // Set up initialization callback
        this.audio.setInitializationCallback(() => {
            console.log('=== Audio initialization callback triggered ===');
            console.log('Audio context state:', this.audio.audioContext ? this.audio.audioContext.state : 'No audio context');
            console.log('Station tracks count:', this.audio.stationTracks ? this.audio.stationTracks.size : 'No station tracks');
            console.log('About to call showStartButton()');
            this.showStartButton();
        });
        
        // Set up progress callback
        this.audio.setProgressCallback((progress) => {
            this.updateLoadingProgress(progress);
        });
        
        // Show loading bar initially
        this.showLoadingBar();
        
        // Setup start button
        this.setupStartButton();
    }

    showLoadingBar() {
        const loadingIndicator = document.getElementById('loadingIndicator');
        const startBtn = document.getElementById('startBtn');
        
        if (loadingIndicator) {
            loadingIndicator.style.display = 'flex';
            loadingIndicator.classList.add('visible');
        }
        if (startBtn) {
            startBtn.style.display = 'none';
            startBtn.classList.remove('visible');
        }
        
        // Start with no circles active
        this.updateLoadingProgress(0);
    }
    
    updateLoadingProgress(percent) {
        // Determine how many circles should be active based on progress
        let activeCircles = 0;
        if (percent >= 25) activeCircles = 1;
        if (percent >= 50) activeCircles = 2;
        if (percent >= 75) activeCircles = 3;
        if (percent >= 100) activeCircles = 4;
        
        // Update each circle
        for (let i = 1; i <= 4; i++) {
            const circle = document.getElementById(`circle${i}`);
            if (circle) {
                if (i <= activeCircles) {
                    circle.classList.add('active');
                } else {
                    circle.classList.remove('active');
                }
            }
        }
    }
    
    showStartButton() {
        console.log('=== showStartButton() called ===');
        
        // Hide loading indicator instantly
        const loadingIndicator = document.getElementById('loadingIndicator');
        console.log('Loading indicator element:', loadingIndicator);
        if (loadingIndicator) {
            console.log('Hiding loading indicator');
            loadingIndicator.style.display = 'none';
        } else {
            console.error('Loading indicator element not found!');
        }
        
        // Show start button instantly
        const startBtn = document.getElementById('startBtn');
        console.log('Start button element:', startBtn);
        console.log('Start button current display:', startBtn ? startBtn.style.display : 'N/A');
        console.log('Start button current classes:', startBtn ? startBtn.className : 'N/A');
        
        if (startBtn) {
            console.log('Setting start button display to block');
            startBtn.style.display = 'block';
            console.log('Adding visible class to start button');
            startBtn.classList.add('visible');
            console.log('Start button classes after adding visible:', startBtn.className);
            console.log('Start button computed style display:', window.getComputedStyle(startBtn).display);
            console.log('Start button computed style opacity:', window.getComputedStyle(startBtn).opacity);
            console.log('Start button computed style visibility:', window.getComputedStyle(startBtn).visibility);
            console.log('Start button faded in');
        } else {
            console.error('Start button element not found!');
        }
        
        console.log('=== showStartButton() completed ===');
    }

    setupStartButton() {
        const startBtn = document.getElementById('startBtn');
        
        console.log('Setting up start button:', startBtn);
        
        if (!startBtn) {
            console.error('Start button not found!');
            return;
        }
        
        startBtn.addEventListener('click', () => {
            console.log('Start button clicked!');
            
            const isOn = this.audio.togglePower();
            console.log('Audio power state:', isOn);
            
            if (isOn) {
                // Update mixing for current dial position
                this.audio.onDialPositionChange(this.ui.getDialPosition());
            }
        });
        
        console.log('Start button event listener added');
    }
}

// Make whistle testing available globally for debugging
window.testWhistles = function() {
    if (window.radioController && window.radioController.audio) {
        window.radioController.audio.testWhistles();
    } else {
        console.log('Radio controller not ready yet');
    }
};

// Make whistle configuration available globally for tuning
window.setWhistleConfig = function(config) {
    if (window.radioController && window.radioController.audio) {
        const audio = window.radioController.audio;
        if (config.scale !== undefined) audio.setWhistleScale(config.scale);
        if (config.edgeWidth !== undefined) audio.setWhistleEdgeWidth(config.edgeWidth);
        if (config.maxGain !== undefined) audio.setWhistleMaxGain(config.maxGain);
        if (config.deadband !== undefined) audio.setWhistleCenterDeadband(config.deadband);
        if (config.rampMs !== undefined) audio.setWhistleRampMs(config.rampMs);
        if (config.maxSimultaneous !== undefined) audio.setWhistleMaxSimultaneous(config.maxSimultaneous);
        if (config.globalCeiling !== undefined) audio.setWhistleGlobalCeiling(config.globalCeiling);
        console.log('Whistle configuration updated');
    } else {
        console.log('Radio controller not ready yet');
    }
};

// Make debugging functions available globally
window.startAudioDebug = function() {
    if (window.radioController && window.radioController.audio) {
        window.radioController.audio.startDebugging();
    } else {
        console.log('Radio controller not ready yet');
    }
};

window.stopAudioDebug = function() {
    if (window.radioController && window.radioController.audio) {
        window.radioController.audio.stopDebugging();
    } else {
        console.log('Radio controller not ready yet');
    }
};

window.debugAudioOnce = function() {
    if (window.radioController && window.radioController.audio) {
        window.radioController.audio.debugAudioSystem();
    } else {
        console.log('Radio controller not ready yet');
    }
};

// Initialize the radio when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.radioController = new RadioController();
    
    // Initialize message system after DOM is ready
    if (window.radioController.messages) {
        console.log('Starting message system initialization...');
        window.radioController.messages.initialize();
    } else {
        console.error('Message system not found in radio controller');
    }
    
    // Fallback: Set a default message if nothing else works
    setTimeout(() => {
        const messageElement = document.getElementById('messageText');
        if (messageElement && messageElement.textContent === 'Loading...') {
            console.log('Setting fallback message');
            messageElement.textContent = 'Tune in using the dial below';
        }
    }, 2000);
    
    // Emergency fallback: Force show start button after 10 seconds
    setTimeout(() => {
        const startBtn = document.getElementById('startBtn');
        if (startBtn && startBtn.style.display === 'none') {
            console.log('=== EMERGENCY FALLBACK: Forcing start button to appear ===');
            console.log('Start button current state:', {
                display: startBtn.style.display,
                className: startBtn.className,
                computedDisplay: window.getComputedStyle(startBtn).display,
                computedOpacity: window.getComputedStyle(startBtn).opacity
            });
            window.radioController.showStartButton();
        }
    }, 10000);
});

// Handle page visibility changes to pause/resume audio
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden, could pause audio here if needed
    } else {
        // Page is visible again
    }
}); 