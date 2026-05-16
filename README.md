# Vici Pro

Vici Pro is a high-performance, web-based dual-deck DJ auto-mixing application. Built with React, TypeScript, and the Web Audio API (via Tone.js), Vici acts as an autonomous virtual DJ, allowing users to load local music directories, organize playlists, manipulate audio in real-time, and let the engine seamlessly crossfade between tracks completely hands-free.

## Features

- **Dual-Deck Architecture:** Independent 'Deck A' and 'Deck B' modules with dedicated `Tone.Player` instances routed into a master `Tone.CrossFade` node.
- **Parametric EQ & Filters:** Each deck features dedicated 3-band EQ processing (-24dB to +6dB for High/Mid/Low) and a bipolar DJ-style macro filter (Lowpass on the left, Highpass on the right).
- **Dub & Techno FX Bay:** Each deck features a dedicated FX unit with an analog-style Tape Echo (adjustable Time and Feedback) and a cavernous Reverb (adjustable Size).
- **Pitch & Tempo Control:** Decks include ±16% pitch faders. Changes to playback rate dynamically adjust a sub-millisecond offset tracker to ensure visually smooth seekbar tracking.
- **Sync & Master Lock:** Click `SYNC` to match the opposite deck's tempo instantly, or hold it to lock into continuous tracking mode. Assigning a deck as `MASTER` forces the secondary deck to mathematically mirror all tempo fluctuations.
- **Playback Tracking:** Native seekbars allow users to drag the playback position in real-time. Live BPM and track duration are continuously polled.
- **Automix Supervisor:** A high-frequency polling loop monitors active track lengths. When a track reaches its final 15 seconds, the engine initiates a synchronized equal-power crossfade into the standby deck and queues the next track from the library.
- **Local File Management:** Utilizes the desktop-class `window.showDirectoryPicker` to recursively read local audio folders into the browser without uploading. Includes fallbacks for restricted iframe environments.
- **M3U Playlist Support:** Import and export `.m3u` or `.m3u8` playlists to instantly queue up specific sets of tracks. Playlists are permanently saved to the browser's local database and accessible directly from the sidebar.

## Software Stack

- **Framework:** React 18 (Vite)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + Lucide React (Icons)
- **Audio Engine:** Web Audio API via `Tone.js`

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
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

1. Click **Load Library** in the top right to select a local folder containing your audio files.
2. The browser panel at the bottom will populate with your tracks.
3. Click the left or right arrow buttons next to a track to load it into Deck A or Deck B.
4. Use the play buttons, EQ, filters, pitch faders, and FX to mix manually.
5. Toggle **Automix Mode** in the header to let the engine take over crossfading and queuing automatically.

## License

MIT License.
