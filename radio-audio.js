class RadioAudio {
    constructor() {
        this.audioContext = null;
        this.isPoweredOn = false;
        this.dialPosition = 90; // Default center position
        
        // Audio tracks
        this.stationTracks = new Map(); // Map of station ID to audio track
        this.noiseTracks = new Map(); // Map of noise type to audio track
        
        // Configuration
        this.maxConstantNoiseVolume = 1;
        this.maxEtherNoiseVolume = 0.3;
        this.etherBaselineVolume = 0.3;  // Volume multiplier for baseline noise
        this.etherAMStaticVolume = 0.8;  // Volume multiplier for AM static noise
        this.startupFadeDuration = 2; // Fade-in duration in seconds
        this.masterVolume = 0; // Master volume control
        
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
        
        // Station data
        this.stations = [];
        
        // Callback for when initialization is complete
        this.onInitializationComplete = null;
        
        // Whistle structures
        this.whistleBus = null;                  // GainNode (sum of all whistle tones)
        this.whistleLimiter = null;              // optional DynamicsCompressorNode
        this.whistleOscillators = new Map();     // stationId -> { osc, gainNode }
        
        // Cabinet effects
        this.cabinet = null;
        
        // Master bus for unified processing
        this.masterBus = null;
        
        this.initializeAudio();
    }

    _initializeWhistles() {
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
        
        // Connect whistle bus through limiter (will connect to master bus later)
        this.whistleBus.connect(this.whistleLimiter);
        
        console.log('Whistle system initialized');
    }

    _initializeMasterBus() {
        if (!this.audioContext) return;
        
        // Create master bus (GainNode that all tracks feed into)
        this.masterBus = this.audioContext.createGain();
        this.masterBus.gain.value = 1.0;
        
        console.log('Master bus initialized');
    }

    _initializeCabinet() {
        console.log('_initializeCabinet called');
        if (!this.audioContext) {
            console.log('No audio context, returning');
            return;
        }
        
        console.log('Initializing cabinet effects...');
        console.log('RadioCabinet available:', typeof RadioCabinet !== 'undefined');
        
        // Import RadioCabinet class (assuming it's loaded in the page)
        if (typeof RadioCabinet !== 'undefined') {
            this.cabinet = new RadioCabinet(this.audioContext);
            console.log('Cabinet effects initialized successfully');
            
            // Connect master bus through cabinet to destination
            if (this.masterBus) {
                this.cabinet.connect(this.masterBus, this.audioContext.destination);
                console.log('Master bus routed through cabinet effects');
                
                // Connect whistles to master bus
                if (this.whistleLimiter) {
                    this.whistleLimiter.connect(this.masterBus);
                    console.log('Whistles connected to master bus');
                }
            }
        } else {
            console.warn('RadioCabinet class not found - cabinet effects disabled');
            // Connect master bus directly to destination
            if (this.masterBus) {
                this.masterBus.connect(this.audioContext.destination);
                console.log('Master bus connected directly to destination');
                
                // Connect whistles to master bus
                if (this.whistleLimiter) {
                    this.whistleLimiter.connect(this.masterBus);
                    console.log('Whistles connected to master bus');
                }
            }
        }
    }

    _startWhistleOscillators() {
        if (!this.whistlesEnabled || !this.whistleBus) return;
        
        // Create oscillators for all stations
        for (const station of this.stations) {
            this._ensureWhistleForStation(station.id);
        }
        
        console.log('Whistle oscillators started');
    }

    _stopWhistleOscillators() {
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

    _teardownWhistles() {
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

    _updateWhistlesForDial(dialPosition) {
        if (!this.whistlesEnabled || !this.whistleBus || !this.isPoweredOn) return;
        
        const currentTime = this.audioContext.currentTime;
        const rampTime = this.whistleRampMs / 1000;
        
        // Calculate maximum safe frequency to prevent clamping warnings
        const maxSafeFreq = this.whistleMaxSafeFreq;
        const maxSafeOffset = maxSafeFreq / this.whistleScaleHzPerUnit;
        
        // Calculate whistle parameters for each station
        const stationWhistles = [];
        
        for (const station of this.stations) {
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
                const station = this.stations.find(s => s.id === whistle.stationId);
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

    setInitializationCallback(callback) {
        this.onInitializationComplete = callback;
    }

    async initializeAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('Audio context created:', this.audioContext.state);
            
            // Initialize master bus
            this._initializeMasterBus();
            
            // Initialize whistle system
            this._initializeWhistles();
            
            // Initialize cabinet effects
            this._initializeCabinet();
            
            await this.loadStations();
            await this.loadNoiseTracks();
            
            console.log(`Audio initialized: ${this.stations.length} stations, ${this.stationTracks.size} tracks created`);
            
            // Notify that initialization is complete
            if (this.onInitializationComplete) {
                this.onInitializationComplete();
            }
        } catch (error) {
            console.error('Web Audio API not supported:', error);
            // Still show start button even if audio fails
            if (this.onInitializationComplete) {
                this.onInitializationComplete();
            }
        }
    }

    async loadStations() {
        try {
            const response = await fetch('stations.yaml');
            const yamlText = await response.text();
            // For now, we'll parse a simplified format. In production, use a proper YAML parser
            this.stations = this.parseStationsYaml(yamlText);
            
            // Create tracks with Safari mobile fallback
            try {
                await this.createStationTracks();
            } catch (error) {
                console.warn('Some tracks failed to load, continuing anyway:', error);
            }
        } catch (error) {
            console.error('Failed to load stations:', error);
        }
    }

    parseStationsYaml(yamlText) {
        // Simple YAML parsing for demo. In production, use a proper YAML parser
        const stations = [];
        const lines = yamlText.split('\n');
        let currentStation = {};
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            if (trimmed.startsWith('-')) {
                // If we have a current station with data, save it
                if (Object.keys(currentStation).length > 0) {
                    stations.push({...currentStation});
                }
                currentStation = {};
                
                // Parse the id from the same line if it's there
                const idMatch = trimmed.match(/- id:\s*"([^"]+)"/);
                if (idMatch) {
                    currentStation.id = idMatch[1];
                }
            } else if (trimmed.includes(':') && !trimmed.startsWith('stations:')) {
                const [key, value] = trimmed.split(':').map(s => s.trim());
                if (key === 'id' || key === 'title' || key === 'description' || key === 'src') {
                    currentStation[key] = value.replace(/"/g, '');
                } else if (key === 'position' || key === 'strength' || key === 'sigma') {
                    currentStation[key] = parseFloat(value);
                }
            }
        }
        
        // Don't forget the last station
        if (Object.keys(currentStation).length > 0) {
            stations.push({...currentStation});
        }
        
        console.log(`Parsed ${stations.length} stations:`, stations.map(s => s.id));
        return stations;
    }

    async createStationTracks() {
        console.log(`Creating ${this.stations.length} station tracks with streaming...`);
        
        for (const station of this.stations) {
            try {
                const track = this.createStreamingTrack(station);
                this.stationTracks.set(station.id, track);
                
                // Wait for metadata to be ready with timeout
                await Promise.race([
                    track.waitForReady(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Timeout')), 5000)
                    )
                ]);
                console.log(`✓ ${station.id} ready for streaming`);
            } catch (error) {
                console.error(`✗ Failed to create streaming track for ${station.id}:`, error.message);
                // Mark as ready anyway to prevent blocking
                const track = this.stationTracks.get(station.id);
                if (track) {
                    track.isReady = true;
                }
            }
        }
        
        console.log(`Station tracks: ${this.stationTracks.size}/${this.stations.length} created`);
    }

    async loadNoiseTracks() {
        try {
            // Load constant noise (white-hiss.mp3)
            const constantNoiseBuffer = await this.loadAudioFile('sounds/white-hiss.mp3');
            const constantNoiseTrack = this.createAudioTrack(constantNoiseBuffer, true);
            constantNoiseTrack.gainNode.gain.value = this.maxConstantNoiseVolume;
            this.noiseTracks.set('constantNoise', constantNoiseTrack);
            
            // Load ether noise components (baseline + AM static)
            const baselineNoiseBuffer = await this.loadAudioFile('sounds/baseline-noise.mp3');
            const amStaticBuffer = await this.loadAudioFile('sounds/am-static.wav');
            
            // Create separate tracks for each component
            const baselineTrack = this.createAudioTrack(baselineNoiseBuffer, true);
            const amStaticTrack = this.createAudioTrack(amStaticBuffer, true);
            
            // Store both tracks for the ether noise channel
            this.noiseTracks.set('etherNoiseBaseline', baselineTrack);
            this.noiseTracks.set('etherNoiseAMStatic', amStaticTrack);
            
            console.log('Noise tracks loaded');
        } catch (error) {
            console.error('Failed to load noise tracks:', error);
        }
    }

    async loadAudioFile(filename) {
        const response = await fetch(filename);
        const arrayBuffer = await response.arrayBuffer();
        return await this.audioContext.decodeAudioData(arrayBuffer);
    }

    createStreamingTrack(station) {
        // Create HTML audio element for streaming
        const audioEl = new Audio(`sounds/${station.src}`);
        audioEl.preload = 'metadata'; // Safari mobile compatible
        audioEl.loop = true;
        
        // Create MediaElementSourceNode
        const sourceNode = this.audioContext.createMediaElementSource(audioEl);
        const gainNode = this.audioContext.createGain();
        
        // Connect to master bus
        if (this.masterBus) {
            sourceNode.connect(gainNode).connect(this.masterBus);
        } else {
            sourceNode.connect(gainNode).connect(this.audioContext.destination);
        }
        
        return {
            audioEl,      // HTML audio element
            sourceNode,   // MediaElementSourceNode
            gainNode,     // Volume control
            isPlaying: false,
            isReady: false,
            stationId: station.id,
            
            // Wait for audio to be ready
            waitForReady: function() {
                return new Promise((resolve) => {
                    if (this.isReady) {
                        resolve();
                        return;
                    }
                    
                    // Safari mobile compatible ready check
                    const onReady = () => {
                        this.isReady = true;
                        resolve();
                    };
                    
                    // Check if already ready
                    if (audioEl.readyState >= 3) { // HAVE_FUTURE_DATA or higher
                        onReady();
                        return;
                    }
                    
                    // Listen for multiple events for better Safari compatibility
                    const events = ['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough'];
                    let resolved = false;
                    
                    const cleanup = () => {
                        events.forEach(event => {
                            audioEl.removeEventListener(event, onReady);
                        });
                    };
                    
                    const onReadyOnce = () => {
                        if (!resolved) {
                            resolved = true;
                            cleanup();
                            onReady();
                        }
                    };
                    
                    events.forEach(event => {
                        audioEl.addEventListener(event, onReadyOnce, { once: true });
                    });
                });
            },
            
            start: function() {
                if (this.isPlaying) return;
                
                // Try to play even if not marked as ready (audio might be ready but event didn't fire)
                this.audioEl.play().catch(error => {
                    if (!this.isReady) {
                        console.warn(`Station ${this.stationId} not ready yet, retrying...`);
                        // Retry after a short delay
                        setTimeout(() => {
                            this.audioEl.play().catch(err => {
                                console.warn(`Failed to play station ${this.stationId} after retry:`, err);
                            });
                        }, 100);
                    } else {
                        console.warn(`Failed to play station ${this.stationId}:`, error);
                    }
                });
                this.isPlaying = true;
            },
            
            stop: function() {
                if (!this.isPlaying) return;
                
                this.audioEl.pause();
                this.isPlaying = false;
            }
        };
    }

    createAudioTrack(audioBuffer, loop = false) {
        // Keep this method for noise tracks (they still use BufferSource)
        const audioContext = this.audioContext;
        const gainNode = audioContext.createGain();
        
        if (this.masterBus) {
            gainNode.connect(this.masterBus);
        } else {
            gainNode.connect(audioContext.destination);
        }
        
        return {
            audioBuffer,
            loop,
            gainNode,
            source: null,
            
            start: function() {
                try {
                    if (audioContext.state === 'suspended') {
                        audioContext.resume();
                    }
                    
                    this.source = audioContext.createBufferSource();
                    this.source.buffer = this.audioBuffer;
                    this.source.loop = this.loop;
                    this.source.connect(this.gainNode);
                    this.source.start();
                } catch (error) {
                    console.error('Error starting audio track:', error);
                }
            },
            
            stop: function() {
                if (this.source) {
                    try {
                        this.source.stop();
                        this.source.disconnect();
                        this.source = null;
                    } catch (error) {
                        console.error('Error stopping audio track:', error);
                    }
                }
            }
        };
    }

    // Station tuning function - calculates volume based on dial position
    calculateStationVolume(station, dialPosition) {
        const distance = Math.abs(dialPosition - station.position);
        const sigma = station.sigma;
        const strength = station.strength;
        
        // Gaussian function: volume = strength * exp(-(distance^2) / (2 * sigma^2))
        const volume = strength * Math.exp(-(distance * distance) / (2 * sigma * sigma));
        return Math.max(0, Math.min(1, volume));
    }

    // Mixing function - updates all track volumes based on dial position with top-K streaming
    updateMixing(dialPosition) {
        // Check if audio context is ready
        if (!this.audioContext || this.audioContext.state !== 'running') {
            return;
        }
        
        this.dialPosition = dialPosition;
        
        // Calculate volumes for all stations
        const stationVolumes = [];
        for (const station of this.stations) {
            const track = this.stationTracks.get(station.id);
            if (track) {
                const volume = this.calculateStationVolume(station, dialPosition);
                stationVolumes.push({
                    id: station.id,
                    volume: volume,
                    track: track
                });
            }
        }
        
        // Sort by volume (highest first) and get top K stations
        stationVolumes.sort((a, b) => b.volume - a.volume);
        const topK = stationVolumes.slice(0, 3); // Only play top 3 stations
        const topKIds = new Set(topK.map(s => s.id));
        
        // Start/stop stations based on top-K selection
        for (const stationData of stationVolumes) {
            const { id, volume, track } = stationData;
            const isTopK = topKIds.has(id);
            const scaledVolume = isTopK ? volume * this.masterVolume : 0;
            
            // Only start/stop if track is ready
            if (track.isReady) {
                // Start/stop streaming based on top-K status
                if (isTopK && !track.isPlaying) {
                    track.start();
                } else if (!isTopK && track.isPlaying) {
                    track.stop();
                }
            }
            
            // Set volume (0 for non-top-K stations)
            track.gainNode.gain.setValueAtTime(scaledVolume, this.audioContext.currentTime);
        }
        
        // Calculate ether noise volume based on how "tuned in" we are
        // If we have strong station signals, reduce ether noise
        // If we have weak/no station signals, increase ether noise
        const maxStationVolume = topK.length > 0 ? Math.max(...topK.map(s => s.volume)) : 0;
        const etherVolume = this.maxEtherNoiseVolume * (1 - maxStationVolume) * this.masterVolume;
        
        // Apply volume to both ether noise components
        const baselineTrack = this.noiseTracks.get('etherNoiseBaseline');
        const amStaticTrack = this.noiseTracks.get('etherNoiseAMStatic');
        
        if (baselineTrack) {
            baselineTrack.gainNode.gain.setValueAtTime(etherVolume * this.etherBaselineVolume, this.audioContext.currentTime);
        }
        
        if (amStaticTrack) {
            amStaticTrack.gainNode.gain.setValueAtTime(etherVolume * this.etherAMStaticVolume, this.audioContext.currentTime);
        }
        
        // Apply master volume to constant noise
        const constantNoiseTrack = this.noiseTracks.get('constantNoise');
        if (constantNoiseTrack) {
            constantNoiseTrack.gainNode.gain.setValueAtTime(this.maxConstantNoiseVolume * this.masterVolume, this.audioContext.currentTime);
        }

        // Update whistle automation
        this._updateWhistlesForDial(dialPosition);
    }

    togglePower() {
        const wasPoweredOn = this.isPoweredOn;
        
        if (!wasPoweredOn) {
            // Turning on
            this.startAllTracks();
            this.isPoweredOn = true;
        } else {
            // Turning off
            this.isPoweredOn = false;
            this.stopAllTracks();
        }
        
        return this.isPoweredOn;
    }

    startAllTracks() {
        if (!this.audioContext) {
            console.log('startAllTracks early return: no audio context');
            return;
        }
        
        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            console.log('Resuming suspended audio context...');
            this.audioContext.resume().then(() => {
                console.log('Audio context resumed successfully, state:', this.audioContext.state);
                // Now that context is resumed, start the tracks
                this._startTracksAfterResume();
            }).catch(error => {
                console.error('Failed to resume audio context:', error);
            });
            return; // Don't continue until context is resumed
        }
        
        // If context is already running, start tracks immediately
        this._startTracksAfterResume();
    }

    _startTracksAfterResume() {
        console.log('Starting audio tracks...');
        
        // For streaming tracks, don't start all stations - let updateMixing handle top-K selection
        // Tracks are already ready from createStationTracks()
        
        // Start all noise tracks (these still use BufferSource)
        for (const [noiseType, track] of this.noiseTracks) {
            if (track && track.start) {
                track.start();
                track.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            } else {
                console.warn(`Invalid noise track for ${noiseType}`);
            }
        }
        
        // Start whistle oscillators
        this._startWhistleOscillators();
        
        // Start master volume fade-in
        this.fadeInMasterVolume();
    }

    fadeInMasterVolume() {
        const startTime = this.audioContext.currentTime;
        const fadeEndTime = startTime + this.startupFadeDuration;
        
        // Fade master volume from 0 to 1
        this.masterVolume = 0;
        console.log(`Master volume fade-in: ${this.startupFadeDuration}s`);
        
        // Use linear ramp for smooth fade
        const fadeInterval = setInterval(() => {
            // Check if audio context is running
            if (this.audioContext.state !== 'running') {
                return;
            }
            
            const elapsed = (this.audioContext.currentTime - startTime);
            const progress = Math.min(elapsed / this.startupFadeDuration, 1);
            
            this.masterVolume = progress;
            
            // Update mixing with current master volume
            this.updateMixing(this.dialPosition);
            
            if (progress >= 1) {
                clearInterval(fadeInterval);
                console.log('Master volume fade-in complete');
            }
        }, 16); // Update every 16ms for smooth 60fps fade
    }

    stopAllTracks() {
        if (!this.audioContext || !this.isPoweredOn) return;
        
        this.isPoweredOn = false;
        console.log('Stopping all audio tracks...');
        
        // Stop all station tracks (streaming tracks)
        for (const [stationId, track] of this.stationTracks) {
            if (track.stop) {
                track.stop(); // Pause the audio element
            }
            if (track.gainNode) {
                track.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            }
        }
        
        // Stop all noise tracks (BufferSource tracks)
        for (const [noiseType, track] of this.noiseTracks) {
            if (track.gainNode) {
                track.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            }
        }
        
        // Stop whistle oscillators cleanly
        this._stopWhistleOscillators();
        
        console.log('Radio powered off');
    }

    // Method to be called when dial position changes
    onDialPositionChange(dialPosition) {
        if (this.isPoweredOn) {
            this.updateMixing(dialPosition);
        }
    }

    setStartupFadeDuration(durationSeconds) {
        this.startupFadeDuration = Math.max(0.1, Math.min(5.0, durationSeconds));
    }

    getStartupFadeDuration() {
        return this.startupFadeDuration;
    }

    // Configuration methods
    setMaxConstantNoiseVolume(volume) {
        this.maxConstantNoiseVolume = Math.max(0, Math.min(1, volume));
        const constantNoiseTrack = this.noiseTracks.get('constantNoise');
        if (constantNoiseTrack) {
            constantNoiseTrack.gainNode.gain.setValueAtTime(this.maxConstantNoiseVolume, this.audioContext.currentTime);
        }
    }

    setMaxEtherNoiseVolume(volume) {
        this.maxEtherNoiseVolume = Math.max(0, Math.min(1, volume));
        if (this.isPoweredOn) {
            this.updateMixing(this.dialPosition);
        }
    }

    setEtherBaselineVolume(volume) {
        this.etherBaselineVolume = Math.max(0, Math.min(1, volume));
        if (this.isPoweredOn) {
            this.updateMixing(this.dialPosition);
        }
    }

    setEtherAMStaticVolume(volume) {
        this.etherAMStaticVolume = Math.max(0, Math.min(1, volume));
        if (this.isPoweredOn) {
            this.updateMixing(this.dialPosition);
        }
    }

    getMaxConstantNoiseVolume() {
        return this.maxConstantNoiseVolume;
    }

    getMaxEtherNoiseVolume() {
        return this.maxEtherNoiseVolume;
    }

    getEtherBaselineVolume() {
        return this.etherBaselineVolume;
    }

    getEtherAMStaticVolume() {
        return this.etherAMStaticVolume;
    }

    // Whistle Configuration Setters/Getters
    setWhistlesEnabled(enabled) {
        this.whistlesEnabled = enabled;
        if (!enabled) {
            this._teardownWhistles();
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
    
    // Whistle Getters
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
    testWhistles() {
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
        
        if (this.stations.length > 0) {
            console.log('Stations available for whistles:', this.stations.map(s => `${s.id} at ${s.position}`));
        } else {
            console.log('No stations available for whistles');
        }
    }
} 