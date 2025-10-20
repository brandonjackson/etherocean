class RadioController {
    constructor() {
        console.log('RadioController constructor called');
        
        // Initialize UI and Audio systems
        this.ui = new RadioUI();
        this.audio = new RadioAudio();
        
        // Connect UI changes to audio system
        this.ui.setDialChangeCallback((dialPosition) => {
            this.audio.onDialPositionChange(dialPosition);
        });
        
        // Set up initialization callback
        this.audio.setInitializationCallback(() => {
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
        const loadingBar = document.getElementById('loadingBar');
        const loadingText = document.getElementById('loadingText');
        const startBtn = document.getElementById('startBtn');
        
        if (loadingBar) loadingBar.style.display = 'block';
        if (loadingText) loadingText.style.display = 'block';
        if (startBtn) startBtn.style.display = 'none';
        
        // Start progress animation
        this.updateLoadingProgress(0);
    }
    
    updateLoadingProgress(percent) {
        const progress = document.getElementById('loadingProgress');
        if (progress) {
            progress.style.width = percent + '%';
        }
    }
    
    showStartButton() {
        // Hide loading bar
        const loadingBar = document.getElementById('loadingBar');
        const loadingText = document.getElementById('loadingText');
        if (loadingBar) loadingBar.style.display = 'none';
        if (loadingText) loadingText.style.display = 'none';
        
        // Show start button
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.style.display = 'block';
            // Add visible class to trigger fade-in
            startBtn.classList.add('visible');
            console.log('Start button faded in');
        }
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

// Initialize the radio when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.radioController = new RadioController();
});

// Handle page visibility changes to pause/resume audio
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Page is hidden, could pause audio here if needed
    } else {
        // Page is visible again
    }
}); 