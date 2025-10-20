// Radio Cabinet Effects
// Vintage radio cabinet simulation with tube saturation, cabinet resonance, and speaker distortion

// ===== CONFIGURATION VARIABLES =====
// Edit these values to adjust the vintage radio character

// Bandwidth Filters
let ENABLE_HIGHPASS = true;
const HIGHPASS_CUTOFF = 450; // Hz
let ENABLE_LOWPASS = true;
const LOWPASS_CUTOFF = 3000; // Hz

// Reverb Settings
let ENABLE_REVERB = true;
const REVERB_ROOM_SIZE = 0.5;
const REVERB_DECAY_TIME = 1.0; // seconds
const REVERB_DAMPING = 1.0;
const REVERB_MIX = 0.3;

// Tube Effects
let ENABLE_TUBE = true;
const TUBE_SATURATION = 80; // 0-100
const SPEAKER_DISTORTION = 20; // 0-50

// Cabinet Effects
let ENABLE_CABINET = true;
const CABINET_FREQUENCY = 70; // Hz (0-500)
const CABINET_GAIN = 30; // dB (0-50)
const CABINET_Q = 1.5; // 1-20

// ===== AUDIO PROCESSING CLASS =====

class RadioCabinet {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.nodes = {};
        this.isInitialized = false;
        this.currentInput = null;
        this.currentOutput = null;
    }

    // Create distortion curves
    makeTubeSaturationCurve(amount = 15) {
        const n = 44100;
        const curve = new Float32Array(n);
        const k = amount / 100; // Normalize to 0-1
        for (let i = 0; i < n; i++) {
            const x = i * 2 / n - 1;
            // Soft tube saturation curve
            curve[i] = Math.tanh(x * (1 + k * 3)) * (1 - k * 0.3);
        }
        return curve;
    }

    makeSpeakerDistortionCurve(amount = 8) {
        const n = 44100;
        const curve = new Float32Array(n);
        const k = amount / 50; // Normalize to 0-1
        for (let i = 0; i < n; i++) {
            const x = i * 2 / n - 1;
            // Speaker cone distortion (asymmetric)
            if (x > 0) {
                curve[i] = x * (1 - k * 0.2) + k * 0.1 * Math.sin(x * Math.PI);
            } else {
                curve[i] = x * (1 - k * 0.4) + k * 0.2 * Math.sin(-x * Math.PI);
            }
        }
        return curve;
    }

    makeImpulse(ctx, seconds = 2, decay = 2.5, damping = 0.3) {
        const rate = ctx.sampleRate;
        const len = seconds * rate;
        const buf = ctx.createBuffer(2, len, rate);
        for (let ch = 0; ch < 2; ch++) {
            const data = buf.getChannelData(ch);
            for (let i = 0; i < len; i++) {
                // Apply damping to high frequencies
                const dampedDecay = decay + (damping * 2);
                const envelope = Math.pow(1 - i / len, dampedDecay);
                data[i] = (Math.random() * 2 - 1) * envelope;
            }
        }
        return buf;
    }

    // Initialize all audio nodes
    initialize() {
        if (this.isInitialized) return;

        // Bandwidth Filters
        this.nodes.highpass = this.audioContext.createBiquadFilter();
        this.nodes.highpass.type = "highpass";
        this.nodes.highpass.frequency.value = HIGHPASS_CUTOFF;

        this.nodes.lowpass = this.audioContext.createBiquadFilter();
        this.nodes.lowpass.type = "lowpass";
        this.nodes.lowpass.frequency.value = LOWPASS_CUTOFF;

        // Reverb
        this.nodes.convolver = this.audioContext.createConvolver();
        this.nodes.convolver.buffer = this.makeImpulse(
            this.audioContext, 
            REVERB_DECAY_TIME, 
            2.3, 
            REVERB_DAMPING
        );

        this.nodes.reverbWet = this.audioContext.createGain();
        this.nodes.reverbWet.gain.value = REVERB_MIX;

        this.nodes.reverbDry = this.audioContext.createGain();
        this.nodes.reverbDry.gain.value = 1 - REVERB_MIX;

        // Tube Effects
        this.nodes.tubeSaturator = this.audioContext.createWaveShaper();
        this.nodes.tubeSaturator.curve = this.makeTubeSaturationCurve(TUBE_SATURATION);

        this.nodes.speakerDistortion = this.audioContext.createWaveShaper();
        this.nodes.speakerDistortion.curve = this.makeSpeakerDistortionCurve(SPEAKER_DISTORTION);

        // Cabinet Effects
        this.nodes.cabinetResonator = this.audioContext.createBiquadFilter();
        this.nodes.cabinetResonator.type = "peaking";
        this.nodes.cabinetResonator.frequency.value = CABINET_FREQUENCY;
        this.nodes.cabinetResonator.Q.value = CABINET_Q;
        this.nodes.cabinetResonator.gain.value = CABINET_GAIN;

        this.isInitialized = true;
    }

    // Connect audio through the cabinet effects
    connect(inputNode, outputNode) {
        console.log('Cabinet connect called with:', { 
            inputNode: !!inputNode, 
            outputNode: !!outputNode,
            isInitialized: this.isInitialized 
        });
        
        if (!this.isInitialized) {
            this.initialize();
        }

        // Store references for reconnection
        this.currentInput = inputNode;
        this.currentOutput = outputNode;

        let currentNode = inputNode;

        console.log('Applying cabinet effects:', {
            highpass: ENABLE_HIGHPASS,
            lowpass: ENABLE_LOWPASS,
            reverb: ENABLE_REVERB,
            tube: ENABLE_TUBE,
            cabinet: ENABLE_CABINET
        });

        // High-pass filter
        if (ENABLE_HIGHPASS) {
            console.log('Connecting high-pass filter');
            currentNode.connect(this.nodes.highpass);
            currentNode = this.nodes.highpass;
        }

        // Low-pass filter
        if (ENABLE_LOWPASS) {
            console.log('Connecting low-pass filter');
            currentNode.connect(this.nodes.lowpass);
            currentNode = this.nodes.lowpass;
        }

        // Reverb
        if (ENABLE_REVERB) {
            console.log('Connecting reverb');
            // Connect to both dry and wet paths
            currentNode.connect(this.nodes.reverbDry);
            currentNode.connect(this.nodes.convolver);
            this.nodes.convolver.connect(this.nodes.reverbWet);

            // Mix dry and wet
            const reverbMix = this.audioContext.createGain();
            this.nodes.reverbDry.connect(reverbMix);
            this.nodes.reverbWet.connect(reverbMix);
            currentNode = reverbMix;
        }

        // Tube Effects
        if (ENABLE_TUBE) {
            console.log('Connecting tube effects');
            currentNode.connect(this.nodes.tubeSaturator);
            currentNode = this.nodes.tubeSaturator;
        }

        // Speaker Distortion (always connected)
        console.log('Connecting speaker distortion');
        currentNode.connect(this.nodes.speakerDistortion);
        currentNode = this.nodes.speakerDistortion;

        // Cabinet Effects
        if (ENABLE_CABINET) {
            console.log('Connecting cabinet effects');
            currentNode.connect(this.nodes.cabinetResonator);
            currentNode = this.nodes.cabinetResonator;
        }

        // Connect to output
        console.log('Connecting to output');
        currentNode.connect(outputNode);
    }

    // Update parameters in real-time
    updateParameters() {
        if (!this.isInitialized) return;

        // Update tube saturation
        this.nodes.tubeSaturator.curve = this.makeTubeSaturationCurve(TUBE_SATURATION);

        // Update speaker distortion
        this.nodes.speakerDistortion.curve = this.makeSpeakerDistortionCurve(SPEAKER_DISTORTION);

        // Update cabinet parameters
        this.nodes.cabinetResonator.frequency.value = CABINET_FREQUENCY;
        this.nodes.cabinetResonator.Q.value = CABINET_Q;
        this.nodes.cabinetResonator.gain.value = CABINET_GAIN;

        // Update filter frequencies
        this.nodes.highpass.frequency.value = HIGHPASS_CUTOFF;
        this.nodes.lowpass.frequency.value = LOWPASS_CUTOFF;

        // Update reverb parameters
        this.nodes.reverbWet.gain.value = REVERB_MIX;
        this.nodes.reverbDry.gain.value = 1 - REVERB_MIX;
    }

    // Disconnect all nodes
    disconnect() {
        if (!this.isInitialized) return;

        Object.values(this.nodes).forEach(node => {
            if (node && typeof node.disconnect === 'function') {
                node.disconnect();
            }
        });
    }

    // Toggle methods for debug panel
    updateHighpassEnabled(enabled) {
        ENABLE_HIGHPASS = enabled;
        console.log('High-pass filter:', enabled ? 'enabled' : 'disabled');
        this.reconnect();
    }

    updateLowpassEnabled(enabled) {
        ENABLE_LOWPASS = enabled;
        console.log('Low-pass filter:', enabled ? 'enabled' : 'disabled');
        this.reconnect();
    }

    updateReverbEnabled(enabled) {
        ENABLE_REVERB = enabled;
        console.log('Reverb:', enabled ? 'enabled' : 'disabled');
        this.reconnect();
    }

    updateTubeEnabled(enabled) {
        ENABLE_TUBE = enabled;
        console.log('Tube effects:', enabled ? 'enabled' : 'disabled');
        this.reconnect();
    }

    updateCabinetEnabled(enabled) {
        ENABLE_CABINET = enabled;
        console.log('Cabinet effects:', enabled ? 'enabled' : 'disabled');
        this.reconnect();
    }

    // Reconnect audio with current settings
    reconnect() {
        if (!this.isInitialized || !this.currentInput || !this.currentOutput) return;
        
        // Disconnect current connections
        this.disconnect();
        
        // Reconnect with new settings
        this.connect(this.currentInput, this.currentOutput);
    }

    // Method to reconnect master bus (called from radio-audio.js)
    reconnectMasterBus(masterBus, destination) {
        if (!this.isInitialized) {
            this.initialize();
        }
        
        // Disconnect current connections
        this.disconnect();
        
        // Reconnect master bus through cabinet
        this.connect(masterBus, destination);
        console.log('Master bus reconnected through cabinet effects');
    }
}

// Export for use in main simulator
if (typeof module !== 'undefined' && module.exports) {
    module.exports = RadioCabinet;
} else if (typeof window !== 'undefined') {
    window.RadioCabinet = RadioCabinet;
}
