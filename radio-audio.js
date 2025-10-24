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
        this.maxEtherNoiseVolume = 0.2;
        // Ether noise volume is now controlled by maxEtherNoiseVolume
        this.startupFadeDuration = 2; // Fade-in duration in seconds
        this.masterVolume = 0; // Master volume control
        
        // Whistle system will be initialized separately
        
        // Station data
        this.stations = [];
        
        // Callback for when initialization is complete
        this.onInitializationComplete = null;
        
        // Whistle system instance
        this.whistleSystem = null;
        
        // Cabinet effects
        this.cabinet = null;
        
        // Master bus for unified processing
        this.masterBus = null;
        
        this.initializeAudio();
    }

    _initializeMasterBus() {
        if (!this.audioContext) return;
        
        // Create master bus (GainNode that all tracks feed into)
        this.masterBus = this.audioContext.createGain();
        this.masterBus.gain.value = 1.0;
        
        console.log('Master bus initialized');
    }

    setInitializationCallback(callback) {
        this.onInitializationComplete = callback;
    }
    
    setProgressCallback(callback) {
        this.onProgressUpdate = callback;
    }

    async initializeAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('Audio context created:', this.audioContext.state);
            
            // Initialize master bus
            this._initializeMasterBus();
            
            // Initialize whistle system
            this.whistleSystem = new RadioWhistles(this.audioContext, this.masterBus);
            
            // Initialize cabinet effects
            this.cabinet = new RadioCabinet(this.audioContext);
            this.cabinet.connect(this.masterBus, this.audioContext.destination);
            
            await this.loadStations();
            await this.loadNoiseTracks();
            
            console.log(`Audio initialized: ${this.stations.length} stations, ${this.stationTracks.size} tracks created`);
            
            // Start debugging automatically
            this.startDebugging();
            
            // Notify that initialization is complete
            console.log('=== Audio initialization complete, calling callback ===');
            console.log('Callback function exists:', !!this.onInitializationComplete);
            if (this.onInitializationComplete) {
                console.log('Calling initialization callback...');
                this.onInitializationComplete();
                console.log('Initialization callback called');
            } else {
                console.error('No initialization callback set!');
            }
        } catch (error) {
            console.error('initializeAudio faled. Web Audio API not supported:', error);
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
        
        for (let i = 0; i < this.stations.length; i++) {
            const station = this.stations[i];
            try {
                const track = this.createStreamingTrack(station);
                this.stationTracks.set(station.id, track);
                
                // Update progress
                const progress = Math.round(((i + 1) / this.stations.length) * 100);
                if (this.onProgressUpdate) {
                    this.onProgressUpdate(progress);
                }
                
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
            
            // Load ether noise (combined baseline + AM static)
            const etherNoiseBuffer = await this.loadAudioFile('sounds/ether-static.mp3');
            
            // Create single track for ether noise
            const etherNoiseTrack = this.createAudioTrack(etherNoiseBuffer, true);
            
            // Store the combined ether noise track
            this.noiseTracks.set('etherNoise', etherNoiseTrack);
            
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

    // Mixing function - keeps all tracks playing and controls volume (mobile Safari friendly)
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
        
        // Sort by volume (highest first) for debugging
        stationVolumes.sort((a, b) => b.volume - a.volume);
        
        // Keep all tracks playing and just control volume (mobile Safari friendly)
        for (const stationData of stationVolumes) {
            const { id, volume, track } = stationData;
            const scaledVolume = volume * this.masterVolume;
            
            // Ensure track is playing if ready
            if (track.isReady && !track.isPlaying) {
                track.start();
            }
            
            // Set volume for all stations (0 for very low volumes)
            track.gainNode.gain.setValueAtTime(scaledVolume, this.audioContext.currentTime);
        }
        
        // Calculate ether noise volume based on how "tuned in" we are
        // If we have strong station signals, reduce ether noise
        // If we have weak/no station signals, increase ether noise
        const maxStationVolume = stationVolumes.length > 0 ? Math.max(...stationVolumes.map(s => s.volume)) : 0;
        const etherVolume = this.maxEtherNoiseVolume * (1 - maxStationVolume) * this.masterVolume;
        
        // Apply volume to ether noise
        const etherNoiseTrack = this.noiseTracks.get('etherNoise');
        
        if (etherNoiseTrack) {
            etherNoiseTrack.gainNode.gain.setValueAtTime(etherVolume, this.audioContext.currentTime);
        }
        
        // Apply master volume to constant noise
        const constantNoiseTrack = this.noiseTracks.get('constantNoise');
        if (constantNoiseTrack) {
            constantNoiseTrack.gainNode.gain.setValueAtTime(this.maxConstantNoiseVolume * this.masterVolume, this.audioContext.currentTime);
        }

        // Update whistle automation
        if (this.whistleSystem) {
            this.whistleSystem.updateWhistlesForDial(dialPosition, this.stations, this.isPoweredOn);
        }
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
        if (this.whistleSystem) {
            this.whistleSystem.startWhistleOscillators(this.stations);
        }
        
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
        if (this.whistleSystem) {
            this.whistleSystem.stopWhistleOscillators();
        }
        
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

    // Ether noise volume is now controlled by setMaxEtherNoiseVolume()

    getMaxConstantNoiseVolume() {
        return this.maxConstantNoiseVolume;
    }

    getMaxEtherNoiseVolume() {
        return this.maxEtherNoiseVolume;
    }

    // Ether noise volume is now controlled by getMaxEtherNoiseVolume()

    // Whistle configuration methods are now available directly on the whistleSystem instance
    // Access them via: radioAudio.whistleSystem.setWhistlesEnabled(), etc.

    // Comprehensive debugging method
    debugAudioSystem() {
        console.log('\n=== AUDIO SYSTEM DEBUG REPORT ===');
        console.log(`Timestamp: ${new Date().toISOString()}`);
        console.log(`Current Dial Position: ${this.dialPosition}`);
        console.log(`Power State: ${this.isPoweredOn ? 'ON' : 'OFF'}`);
        console.log(`Master Volume: ${this.masterVolume.toFixed(3)}`);
        
        // Audio Context Status
        if (this.audioContext) {
            console.log(`Audio Context State: ${this.audioContext.state}`);
            console.log(`Audio Context Sample Rate: ${this.audioContext.sampleRate}Hz`);
            console.log(`Audio Context Current Time: ${this.audioContext.currentTime.toFixed(3)}s`);
        } else {
            console.log('Audio Context: NOT INITIALIZED');
        }
        
        // Master Bus Status
        if (this.masterBus) {
            console.log(`Master Bus Gain: ${this.masterBus.gain.value.toFixed(3)}`);
        } else {
            console.log('Master Bus: NOT INITIALIZED');
        }
        
        // Station Tracks Status
        console.log('\n--- STATION TRACKS ---');
        console.log(`Total Stations: ${this.stations.length}`);
        console.log(`Total Tracks Created: ${this.stationTracks.size}`);
        
        // Calculate current volumes for all stations
        const stationVolumes = [];
        for (const station of this.stations) {
            const track = this.stationTracks.get(station.id);
            const volume = this.calculateStationVolume(station, this.dialPosition);
            stationVolumes.push({
                id: station.id,
                position: station.position,
                strength: station.strength,
                sigma: station.sigma,
                volume: volume,
                track: track
            });
        }
        
        // Sort by volume for display
        stationVolumes.sort((a, b) => b.volume - a.volume);
        
        stationVolumes.forEach((station, index) => {
            const track = station.track;
            const hasAudibleVolume = station.volume > 0.01; // Audible if volume > 1%
            
            console.log(`\nStation ${index + 1}: ${station.id}`);
            console.log(`  Position: ${station.position}`);
            console.log(`  Strength: ${station.strength}`);
            console.log(`  Sigma: ${station.sigma}`);
            console.log(`  Calculated Volume: ${station.volume.toFixed(3)}`);
            console.log(`  Audible Volume: ${hasAudibleVolume}`);
            
            if (track) {
                console.log(`  Track Ready: ${track.isReady}`);
                console.log(`  Track Playing: ${track.isPlaying}`);
                console.log(`  Track Gain Node Value: ${track.gainNode.gain.value.toFixed(3)}`);
                console.log(`  Audio Element Ready State: ${track.audioEl.readyState}`);
                console.log(`  Audio Element Paused: ${track.audioEl.paused}`);
                console.log(`  Audio Element Current Time: ${track.audioEl.currentTime.toFixed(3)}s`);
                console.log(`  Audio Element Duration: ${track.audioEl.duration || 'Unknown'}`);
                console.log(`  Audio Element Error: ${track.audioEl.error ? track.audioEl.error.message : 'None'}`);
            } else {
                console.log(`  Track: NOT CREATED`);
            }
        });
        
        // Noise Tracks Status
        console.log('\n--- NOISE TRACKS ---');
        for (const [noiseType, track] of this.noiseTracks) {
            console.log(`\nNoise: ${noiseType}`);
            if (track && track.gainNode) {
                console.log(`  Gain Node Value: ${track.gainNode.gain.value.toFixed(3)}`);
                console.log(`  Source Active: ${track.source ? 'Yes' : 'No'}`);
            } else {
                console.log(`  Track: NOT AVAILABLE`);
            }
        }
        
        // Whistle System Status
        console.log('\n--- WHISTLE SYSTEM ---');
        if (this.whistleSystem) {
            console.log(`Whistle System: ACTIVE`);
            // For detailed whistle debugging, use: this.whistleSystem.testWhistles(this.stations)
        } else {
            console.log(`Whistle System: NOT INITIALIZED`);
        }
        
        // Cabinet Effects Status
        console.log('\n--- CABINET EFFECTS ---');
        if (this.cabinet) {
            console.log(`Cabinet Effects: ACTIVE`);
        } else {
            console.log(`Cabinet Effects: NOT INITIALIZED`);
        }
        
        console.log('=== END DEBUG REPORT ===\n');
    }

    // Start debugging interval
    startDebugging() {
        if (this.debugInterval) {
            clearInterval(this.debugInterval);
        }
        
        console.log('Starting audio system debugging (every 5 seconds)...');
        this.debugInterval = setInterval(() => {
            this.debugAudioSystem();
        }, 5000);
    }

    // Stop debugging interval
    stopDebugging() {
        if (this.debugInterval) {
            clearInterval(this.debugInterval);
            this.debugInterval = null;
            console.log('Audio system debugging stopped');
        }
    }
} 