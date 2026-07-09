<div align="center">
  <h1>Vici</h1>
  <p>
    <a href="https://woundup.here/vici"><b>About & Architecture</b></a>
    &nbsp;&nbsp;&nbsp;&nbsp; | &nbsp;&nbsp;&nbsp;&nbsp;
    <a href="https://vici.woundup.here"><b>Launch Web App</b></a>
  </p>
</div>


Vici is a high-performance, web-based dual-deck DJ auto-mixing application. Built with React 18, Zustand, TypeScript, and the Web Audio API (via FAUST and custom AudioWorklets), Vici acts as an autonomous virtual DJ, allowing users to load local music directories, organize playlists, manipulate audio in real-time, and let the engine seamlessly crossfade between tracks completely hands-free.

## Features

- **Modular React Architecture:** Clean separation of concerns with a centralized Zustand `useMixerStore`. The UI is decoupled from the raw audio thread, ensuring peak performance without layout thrashing.
- **Dual-Deck Architecture:** Independent 'Deck A' and 'Deck B' modules with dedicated `AudioWorkletNode` instances routed into a master FAUST DSP graph.
- **Parametric EQ & Filters:** Each deck features dedicated 3-band EQ processing (-24dB to +6dB for High/Mid/Low) and a bipolar DJ-style macro filter (Lowpass on the left, Highpass on the right) utilizing analog-modeled State Variable Filters (SVF).
- **Pro FX Bay:** Each deck features a dedicated FX unit with an analog-style Tape Echo, a cavernous FDN Reverb, a sweeping Phaser, a momentary Beat Roll slicer, and a Dub Siren.
- **Pitch & Tempo Control:** Decks include ±16% pitch faders using a high-fidelity Kaiser-Bessel windowed Sinc Polyphase Resampler for mastering-grade time-stretching without aliasing distortion.
- **Sync & Master Lock:** Click `SYNC` to match the opposite deck's tempo instantly. Assigning a deck as `MASTER` forces the secondary deck to mathematically mirror all tempo fluctuations.
- **High-Performance Waveform Canvas:** Native seekbars allow users to drag the playback position in real-time on a `<canvas>` element rendering audio peaks directly from the buffer. Users can drag interactive Intro and Outro mix markers directly on the waveform.
- **Automix Supervisor:** A polling loop monitors active track lengths. When a track reaches its Outro marker (or final 15 seconds), the engine initiates a synchronized equal-power trigonometric crossfade into the standby deck and queues the next track from the library.
- **Local File Management:** Utilizes the desktop-class `window.showDirectoryPicker` to recursively read local audio folders into the browser without uploading. Includes robust fallback file inputs and Web Worker based ID3/Metadata extraction.
- **Dexie.js Reactive Database:** IndexedDB caching for all track metadata and peaks ensures instantaneous subsequent loads.
- **M3U Playlist Support:** Import and export `.m3u` or `.m3u8` playlists to instantly queue up specific sets of tracks. Playlists are permanently saved to the browser's local database and accessible directly from the sidebar.

## Software Stack

- **Framework:** React 18 (Vite)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + Lucide React (Icons)
- **State Management:** Zustand
- **Audio Engine:** Web Audio API via `@grame/faustwasm` and custom AudioWorklets
- **Database:** Dexie.js (IndexedDB)
- **Metadata Parsing:** music-metadata (via Web Workers)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm or yarn

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/vici.git
   cd vici
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5173`.

## Usage

1. Click **Load Library** in the sidebar to select a local folder containing your audio files.
2. Wait for the background worker to extract metadata and waveform peaks.
3. The browser panel will populate with your tracks.
4. Click the left or right arrow buttons next to a track to load it into Deck A or Deck B.
5. Use the play buttons, EQ, filters, pitch faders, and FX to mix manually.
6. Adjust the green (IN) and red (OUT) markers on the waveform to set custom crossfade boundaries.
7. Toggle **Automix Mode** in the header to let the engine take over crossfading and queuing automatically.

## Architecture & Roadmap

Vici is built with a decoupled architecture where the React UI, Zustand state, Dexie database, and file management system operate independently from the audio engine. The audio engine has been completely migrated to a custom C++ / FAUST DSP architecture compiled to WebAssembly. This replaces the legacy Tone.js implementation, pushing expensive polyphase resampling, analog SVF filters, and feedback delay networks entirely into the `AudioWorklet` processor. This renders the audio pipeline maximally resistant to UI thread latency and ensures mastering-grade playback quality without aliasing.

For a deep dive into the mathematical integrity and phase alignment of the audio engine (including the Linkwitz-Riley crossovers, Sinc Polyphase Resampler, and Multi-Stage Lookahead Limiter), please read the [Signal Analysis & DSP Architecture](SIGNAL-ANALYSIS.md) document.

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

If you are interested in using, modifying, or distributing this software under different terms, or require a commercial license for private modifications and closed-source integrations, please contact the developer to discuss alternative licensing arrangements.
