# Ether Ocean

Ether Ocean is a vintage radio simulator based on the BBC’s “Which Station Was That?” dataset. It recreates the experience of tuning across the interwar ether, letting users explore simulated broadcasts from 1920s and 1930s radio stations.

- Repository name: etherocean
- Project name: Ether Ocean

## Demo & Status
Run locally (instructions below). The simulator loads stations defined in `stations.yaml` and plays layered audio (stations + ether noise) with a master-bus processing chain that emulates a vintage radio cabinet.

## Quick Start

1) Clone and open the project
```bash
git clone <your-fork-or-remote> etherocean
cd etherocean/simulator
```

2) Start a local web server (required for loading audio assets)
```bash
python3 -m http.server 8000
```

3) Open the app in a browser
- Navigate to `http://localhost:8000/`
- Click the Start button after it appears (it shows only after audio is initialized)
- Turn the dial to tune across stations

Notes
- Modern Chromium-based browsers or Safari recommended.
- Audio will only start after a user gesture due to browser auto-play policies.

## Project Structure

```
simulator/
  index.html              # App shell, debug panel wiring, script includes
  radio-main.js           # Orchestrator (controller) connecting UI and Audio
  radio-ui.js             # Dial UI, interaction, and dial position handling
  radio-audio.js          # Web Audio engine, stations, mixing, whistles, master bus
  radio-cabinet.js        # Vintage cabinet effects (high/low pass, tube, cabinet resonance, reverb)
  stations.yaml           # Station definitions (position, strength, etc.)
  img/
    dial.png              # Dial image used for rotary UI
  sounds/                 # Audio assets: stations and noise beds
    ...
```

## Technical Overview

Ether Ocean is built around the Web Audio API and a master-bus architecture:

- AudioContext lifecycle
  - The context is created suspended and resumes on user interaction.
  - The Start button appears once initialization completes (buffers, graph, cabinet).

- Tracks and mixing
  - Station tracks: One per station defined in `stations.yaml`. Each is a `GainNode` feeding a shared `masterBus`.
  - Ether noise: Combined noise bed (`ether-static.mp3`) mixed alongside stations for "air" and static.
  - Dial-based mixing: Each station’s gain is driven by a Gaussian centered on its `position`. Sigma controls tuning width, strength scales max gain.
  - Master volume fade: On power-on, the master bus fades in smoothly to avoid abrupt starts.

- Vintage cabinet processing (`radio-cabinet.js`)
  - Master-bus effects chain that emulates a vintage radio cabinet.
  - Components (toggleable):
    - High-pass filter
    - Low-pass filter
    - Tube saturation (waveshaper)
    - Cabinet resonance (peaking filter with adjustable frequency, gain, Q)
    - Reverb (convolver with procedurally generated impulse; controllable room size, decay, damping)
  - Effects are enabled/disabled and parameterized programmatically; the graph is rebuilt when toggles change.

- Heterodyne whistles (simulated)
  - Optional oscillator-based “whistles” whose frequency scales with dial offset from station centers.
  - Per-station whistle voices are mixed into a whistle bus, limited, then fed into the master bus.
  - Frequency and gain are automated with time constants to avoid clicks.

- Controller and UI separation
  - `radio-main.js` wires together `RadioUI` and `RadioAudio` and handles power and initialization flow.
  - `radio-ui.js` maintains the dial position and interaction, emitting changes via a callback to the audio engine.

- Debug panel
  - Hidden by default; press the `D` key to toggle.
  - Provides simple toggles for cabinet effects in development.

## Stations Configuration (`stations.yaml`)
Stations are defined in YAML. Each entry supports:

- `id` (string): Unique identifier.
- `title` (string): Display name of the station.
- `description` (string): Short description.
- `src` (string): Filename in `sounds/` for the station’s audio.
- `position` (number): Dial position (same domain used by the UI dial).
- `strength` (number): Max station level scaling (0..1 typical).
- `sigma` (number): Tuning width; larger sigma means a wider, gentler tuning curve.

Example
```yaml
- id: "example-station"
  title: "Example Broadcast"
  description: "Historical programming"
  src: "example.mp3"
  position: 42.0
  strength: 0.7
  sigma: 1.2
```

Audio files should live in `simulator/sounds/` and be referenced by filename in `src`.

## Development Notes

- Live reload: Use any static server. The app relies on HTTP(s) for fetching audio and YAML.
- Browser caching: If changes to `stations.yaml` don’t appear, hard refresh the page.
- BufferSource nodes: Each play action creates a new `AudioBufferSourceNode` (they are one-shot by spec).
- Parameter automation: Where possible, ramps and `setTargetAtTime` are used to avoid clicks and zipper noise.

## Roadmap Ideas

- Improve title screen experience
- Add more stations

## Credits & Data

- Inspired by and based in part on the BBC’s “Which Station Was That?” dataset (repository coming soon)
- Audio assets are provided in `sounds/`. 

## License

TBD.