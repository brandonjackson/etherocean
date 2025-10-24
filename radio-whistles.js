class RadioWhistles {
    constructor(audioContext, masterBus) {
        this.audioContext = audioContext;
        this.masterBus = masterBus;
        
        // Whistle Configuration
        this.whistlesEnabled = true;             // master toggle
        this.whistleScaleHzPerUnit = 1000;        // K: Hz per dial unit of offset
        this.whistleEdgeWidth = 2.0;             // σ_edge (narrower than station σ)
        this.whistleMaxGain = 0.03;              // peak gain when at "edge"
        this.whistleCenterDeadband = 1.0;       // region around center with no whistle
        this.whistleRampMs = 60;                 // gain & frequency ramp time in ms
        this.whistleMaxSimultaneous = 3;         // limit for performance
        this.whistleGlobalCeiling = 0.15;        // sum of whistles gain is capped
        this.whistleMaxSafeFreq = 8000;         // maximum frequency to prevent clamping warnings
        
        // Whistle structures
        this.whistleBus = null;                  // GainNode (sum of all whistle tones)
        this.whistleLimiter = null;              // optional DynamicsCompressorNode
        this.whistleOscillators = new Map();     // stationId -> { osc, gainNode }
        
        this.initialize();
    }

    initialize() {
        if (!this.audioContext) return;
        
        // Create whistle bus (sum of all whistle tones)
        this.whistleBus = this.audioContext.createGain();
        this.whistleBus.gain.value = 1.0; // Fixed gain, apply ceiling at per-station level
        
        // Create optional limiter for the whistle bus
        this.whistleLimiter = this.audioContext.createDynamicsCompressor();
        this.whistleLimiter.threshold.value = -20;
        this.whistleLimiter.knee.value = 25;
        this.whistleLimiter.ratio.value = 4;
        this.whistleLimiter.attack.value = 0.003;
        this.whistleLimiter.release.value = 0.25;
        
        // Connect whistle bus through limiter to master bus
        this.whistleBus.connect(this.whistleLimiter);
        if (this.masterBus) {
            this.whistleLimiter.connect(this.masterBus);
        }
        
        console.log('Whistle system initialized');
    }

    startWhistleOscillators(stations) {
        if (!this.whistlesEnabled || !this.whistleBus) return;
        
        // Create oscillators for all stations
        for (const station of stations) {
            this._ensureWhistleForStation(station.id);
        }
        
        console.log('Whistle oscillators started');
    }

    stopWhistleOscillators() {
        if (!this.whistleBus) return;
        
        // Ramp all whistle gains to 0
        for (const [stationId, whistle] of this.whistleOscillators) {
            if (whistle.gainNode) {
                whistle.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            }
        }
        
        console.log('Whistle oscillators stopped');
    }

    _ensureWhistleForStation(stationId) {
        if (this.whistleOscillators.has(stationId)) return;
        
        if (!this.audioContext || !this.whistleBus) return;
        
        // Create oscillator for this station
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.value = 0;
        gainNode.gain.value = 0;
        
        // Connect oscillator -> gain -> whistle bus
        oscillator.connect(gainNode);
        gainNode.connect(this.whistleBus);
        
        // Start the oscillator
        oscillator.start();
        
        // Store the whistle components
        this.whistleOscillators.set(stationId, {
            osc: oscillator,
            gainNode: gainNode
        });
        
        console.debug(`Whistle oscillator created for station: ${stationId}`);
    }

    teardown() {
        if (!this.whistleOscillators) return;
        
        // Stop and disconnect all whistle oscillators
        for (const [stationId, whistle] of this.whistleOscillators) {
            if (whistle.osc) {
                whistle.osc.stop();
                whistle.osc.disconnect();
            }
            if (whistle.gainNode) {
                whistle.gainNode.disconnect();
            }
        }
        
        this.whistleOscillators.clear();
        
        if (this.whistleBus) {
            this.whistleBus.disconnect();
        }
        if (this.whistleLimiter) {
            this.whistleLimiter.disconnect();
        }
        
        console.log('Whistle system torn down');
    }

    updateWhistlesForDial(dialPosition, stations, isPoweredOn) {
        if (!this.whistlesEnabled || !this.whistleBus || !isPoweredOn) return;
        
        const currentTime = this.audioContext.currentTime;
        const rampTime = this.whistleRampMs / 1000;
        
        // Calculate maximum safe frequency to prevent clamping warnings
        const maxSafeFreq = this.whistleMaxSafeFreq;
        const maxSafeOffset = maxSafeFreq / this.whistleScaleHzPerUnit;
        
        // Calculate whistle parameters for each station
        const stationWhistles = [];
        
        for (const station of stations) {
            const offset = Math.abs(dialPosition - station.position);
            
            // Skip if within deadband (no whistle on-center)
            if (offset < this.whistleCenterDeadband) {
                stationWhistles.push({
                    stationId: station.id,
                    frequency: 0,
                    gain: 0,
                    offset: offset
                });
                continue;
            }
            
            // Calculate whistle frequency based on offset, with automatic scaling
            let frequency = offset * this.whistleScaleHzPerUnit;
            
            // If frequency would be too high, scale it down proportionally
            if (frequency > maxSafeFreq) {
                const scaleFactor = maxSafeFreq / frequency;
                frequency = maxSafeFreq;
                // Optionally reduce gain for very high frequencies to maintain balance
                const gainReduction = Math.sqrt(scaleFactor);
                stationWhistles.push({
                    stationId: station.id,
                    frequency: frequency,
                    gain: 0, // Will be calculated below
                    offset: offset,
                    gainReduction: gainReduction
                });
            } else {
                stationWhistles.push({
                    stationId: station.id,
                    frequency: frequency,
                    gain: 0, // Will be calculated below
                    offset: offset,
                    gainReduction: 1.0
                });
            }
        }
        
        // Calculate gains for all stations
        for (const whistle of stationWhistles) {
            if (whistle.frequency > 0) {
                // Calculate gain using edge-gated Gaussian
                const proximity = Math.exp(-0.5 * Math.pow(whistle.offset / this.whistleEdgeWidth, 2));
                let gain = this.whistleMaxGain * proximity;
                
                // Apply gain reduction for high frequencies
                gain *= whistle.gainReduction;
                
                // Optional: modulate by station strength
                const station = stations.find(s => s.id === whistle.stationId);
                if (station) {
                    gain *= station.strength;
                }
                
                whistle.gain = gain;
            }
        }
        
        // Sort by gain (highest first) and limit to max simultaneous
        stationWhistles.sort((a, b) => b.gain - a.gain);
        const selectedWhistles = stationWhistles.slice(0, this.whistleMaxSimultaneous);
        
        // Apply global ceiling if needed
        let totalGain = selectedWhistles.reduce((sum, w) => sum + w.gain, 0);
        let scaleFactor = 1.0;
        
        if (totalGain > this.whistleGlobalCeiling) {
            scaleFactor = this.whistleGlobalCeiling / totalGain;
        }
        
        // Apply whistle automation for selected stations
        for (const whistle of selectedWhistles) {
            const scaledGain = whistle.gain * scaleFactor;
            this._applyWhistleAutomation(whistle.stationId, whistle.frequency, scaledGain, rampTime, currentTime);
        }
        
        // Ramp non-selected whistles to 0
        const selectedIds = new Set(selectedWhistles.map(w => w.stationId));
        for (const [stationId, whistle] of this.whistleOscillators) {
            if (!selectedIds.has(stationId)) {
                this._applyWhistleAutomation(stationId, 0, 0, rampTime, currentTime);
            }
        }
    }

    _applyWhistleAutomation(stationId, freqHz, gain, rampTime, currentTime) {
        const whistle = this.whistleOscillators.get(stationId);
        if (!whistle) return;
        
        // Ensure oscillator exists
        this._ensureWhistleForStation(stationId);
        
        // Get the updated whistle reference
        const updatedWhistle = this.whistleOscillators.get(stationId);
        if (!updatedWhistle) return;
        
        // Clamp frequency to valid Web Audio API range to prevent warnings
        const clampedFreq = Math.max(0, Math.min(freqHz, 22050));
        
        // Ramp frequency and gain smoothly
        updatedWhistle.osc.frequency.setTargetAtTime(clampedFreq, currentTime, rampTime);
        updatedWhistle.gainNode.gain.setTargetAtTime(gain, currentTime, rampTime);
        
        // Only log if frequency was clamped
        if (freqHz !== clampedFreq) {
            console.debug(`Whistle ${stationId}: frequency clamped from ${freqHz.toFixed(0)}Hz to ${clampedFreq.toFixed(0)}Hz`);
        }
    }

    // Configuration Setters/Getters
    setWhistlesEnabled(enabled) {
        this.whistlesEnabled = enabled;
        if (!enabled) {
            this.teardown();
        }
    }
    
    setWhistleScale(hzPerUnit) {
        this.whistleScaleHzPerUnit = hzPerUnit;
    }
    
    setWhistleEdgeWidth(value) {
        this.whistleEdgeWidth = value;
    }
    
    setWhistleMaxGain(value) {
        this.whistleMaxGain = value;
    }
    
    setWhistleCenterDeadband(value) {
        this.whistleCenterDeadband = value;
    }
    
    setWhistleRampMs(value) {
        this.whistleRampMs = value;
    }
    
    setWhistleMaxSimultaneous(value) {
        this.whistleMaxSimultaneous = value;
    }
    
    setWhistleGlobalCeiling(value) {
        this.whistleGlobalCeiling = value;
    }
    
    setWhistleMaxSafeFreq(value) {
        this.whistleMaxSafeFreq = value;
    }
    
    // Getters
    getWhistlesEnabled() { return this.whistlesEnabled; }
    getWhistleScale() { return this.whistleScaleHzPerUnit; }
    getWhistleEdgeWidth() { return this.whistleEdgeWidth; }
    getWhistleMaxGain() { return this.whistleMaxGain; }
    getWhistleCenterDeadband() { return this.whistleCenterDeadband; }
    getWhistleRampMs() { return this.whistleRampMs; }
    getWhistleMaxSimultaneous() { return this.whistleMaxSimultaneous; }
    getWhistleGlobalCeiling() { return this.whistleGlobalCeiling; }
    getWhistleMaxSafeFreq() { return this.whistleMaxSafeFreq; }

    // Test method for whistle system
    testWhistles(stations) {
        if (!this.whistlesEnabled) {
            console.log('Whistles are disabled');
            return;
        }
        
        console.log('Testing whistle system...');
        console.log('Current configuration:');
        console.log(`  Scale: ${this.whistleScaleHzPerUnit} Hz/unit`);
        console.log(`  Edge Width: ${this.whistleEdgeWidth}`);
        console.log(`  Max Gain: ${this.whistleMaxGain}`);
        console.log(`  Deadband: ${this.whistleCenterDeadband}`);
        console.log(`  Ramp Time: ${this.whistleRampMs}ms`);
        console.log(`  Max Simultaneous: ${this.whistleMaxSimultaneous}`);
        console.log(`  Global Ceiling: ${this.whistleGlobalCeiling}`);
        console.log(`  Max Safe Frequency: ${this.whistleMaxSafeFreq}Hz`);
        
        if (stations && stations.length > 0) {
            console.log('Stations available for whistles:', stations.map(s => `${s.id} at ${s.position}`));
        } else {
            console.log('No stations available for whistles');
        }
    }
}
