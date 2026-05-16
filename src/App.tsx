import React, { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { Play, Square, Music, ArrowLeftSquare, ArrowRightSquare, ToggleLeft, ToggleRight, FolderSearch } from 'lucide-react';
import { AudioEngine } from './services/AudioEngine';
import { useAutoMixer } from './hooks/useAutoMixer';
import { PlaylistSidebar } from './components/PlaylistSidebar';
import { loadLocalDirectory, createTrackUrl } from './services/FileManager';
import type { Track } from './types/mixer';

// Mock Library Data for Verification
const MOCK_LIBRARY: Track[] = [
  { id: '1', title: 'Deep House Groove', artist: 'Lofi Core', bpm: 122, duration: '05:24', url: 'https://actions.google.com/sounds/v1/science_fiction/ambient_space_machine.ogg' },
  { id: '2', title: 'Synthwave Driver', artist: 'Retro Future', bpm: 118, duration: '04:12', url: 'https://actions.google.com/sounds/v1/science_fiction/retro_teleport.ogg' },
  { id: '3', title: 'Cosmic Journey', artist: 'Space Beats', bpm: 124, duration: '03:45', url: 'https://actions.google.com/sounds/v1/science_fiction/force_field_loop.ogg' },
];

export default function App() {
  const [library, setLibrary] = useState<Track[]>(MOCK_LIBRARY);
  const [deckA, setDeckA] = useState<{ track: Track | null; isPlaying: boolean }>({ track: null, isPlaying: false });
  const [deckB, setDeckB] = useState<{ track: Track | null; isPlaying: boolean }>({ track: null, isPlaying: false });
  const [xfade, setXfade] = useState<number>(0.5);
  const [isAutomixEnabled, setIsAutomixEnabled] = useState(false);
  const [progressA, setProgressA] = useState({ current: 0, max: 100 });
  const [progressB, setProgressB] = useState({ current: 0, max: 100 });
  const [bpmA, setBpmA] = useState(0);
  const [bpmB, setBpmB] = useState(0);
  
  const [eqA, setEqA] = useState({ high: 0, mid: 0, low: 0 });
  const [filterA, setFilterA] = useState(0);
  const [eqB, setEqB] = useState({ high: 0, mid: 0, low: 0 });
  const [filterB, setFilterB] = useState(0);
  
  const fallbackDirInputRef = useRef<HTMLInputElement>(null);

  const handleTransitionComplete = (winningDeck: 'A' | 'B', nextTrack: Track) => {
    if (winningDeck === 'A') {
      setDeckA({ track: nextTrack, isPlaying: true });
      setDeckB(prev => ({ ...prev, isPlaying: false }));
      setXfade(0);
    } else {
      setDeckB({ track: nextTrack, isPlaying: true });
      setDeckA(prev => ({ ...prev, isPlaying: false }));
      setXfade(1);
    }
    setLibrary(prev => prev.slice(1));
  };

  useAutoMixer({
    deckAState: deckA,
    deckBState: deckB,
    library,
    isAutomixEnabled,
    onTransitionComplete: handleTransitionComplete
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const engine = AudioEngine.getInstance();
      if (deckA.isPlaying && engine.deckA.player.buffer) {
        setProgressA({ current: engine.deckA.getCurrentTime(), max: engine.deckA.player.buffer.duration });
      }
      setBpmA(engine.deckA.currentBpm);
      
      if (deckB.isPlaying && engine.deckB.player.buffer) {
        setProgressB({ current: engine.deckB.getCurrentTime(), max: engine.deckB.player.buffer.duration });
      }
      setBpmB(engine.deckB.currentBpm);

      if (isAutomixEnabled) {
        setXfade(engine.crossfader.fade.value as number);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [deckA.isPlaying, deckB.isPlaying, isAutomixEnabled]);

  const handleLoadDirectory = async () => {
    if ('showDirectoryPicker' in window) {
      try {
        const handles = await loadLocalDirectory();
        if (handles.length > 0) {
          const newTracks: Track[] = handles.map((handle, i) => ({
            id: `local-${Date.now()}-${i}`,
            title: handle.name.replace(/\.[^/.]+$/, ""),
            artist: 'Local File',
            bpm: 120,
            duration: '--:--',
            url: '', 
            fileHandle: handle
          }));
          setLibrary(newTracks);
          return;
        }
      } catch (e) {
        console.warn('Directory picker failed', e);
      }
    }
    // Fallback if API blocked or user cancelled without selecting
    fallbackDirInputRef.current?.click();
  };

  const handleFallbackFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const audioFiles = files.filter(f => ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/ogg'].includes(f.type) || f.name.match(/\.(mp3|wav|flac|ogg)$/i));
    
    if (audioFiles.length === 0) {
      alert("No valid audio files found in selection.");
      return;
    }

    const newTracks: Track[] = audioFiles.map((file, i) => ({
      id: `fallback-${Date.now()}-${i}`,
      title: file.name.replace(/\.[^/.]+$/, ""),
      artist: 'Local File',
      bpm: 120,
      duration: '--:--',
      url: URL.createObjectURL(file) // Load immediately since no handles
    }));
    
    setLibrary(newTracks);
  };

  const handleLoadTrack = async (track: Track, deckId: 'A' | 'B') => {
    try {
      const engine = AudioEngine.getInstance();
      if (Tone.context.state !== 'running') {
        await Tone.start();
      }

      let trackUrl = track.url;
      if (track.fileHandle && !trackUrl) {
        trackUrl = await createTrackUrl(track.fileHandle);
      }

      if (deckId === 'A') {
        setDeckA(prev => ({ ...prev, track }));
        await engine.deckA.loadTrack(trackUrl);
        engine.deckA.originalBpm = track.bpm;
      } else {
        setDeckB(prev => ({ ...prev, track }));
        await engine.deckB.loadTrack(trackUrl);
        engine.deckB.originalBpm = track.bpm;
      }
    } catch (err) {
      console.error("Audio load error:", err);
      alert("Failed to load track. The mock audio URLs might be offline. Please use the 'Load Directory' button to load your own local audio files!");
      if (deckId === 'A') setDeckA(prev => ({ ...prev, track: null }));
      else setDeckB(prev => ({ ...prev, track: null }));
    }
  };

  const toggleDeck = (deckId: 'A' | 'B') => {
    const engine = AudioEngine.getInstance();
    if (deckId === 'A') {
      if (deckA.isPlaying) {
        engine.deckA.stop();
        setDeckA(prev => ({ ...prev, isPlaying: false }));
      } else {
        engine.deckA.play();
        setDeckA(prev => ({ ...prev, isPlaying: true }));
      }
    } else {
      if (deckB.isPlaying) {
        engine.deckB.stop();
        setDeckB(prev => ({ ...prev, isPlaying: false }));
      } else {
        engine.deckB.play();
        setDeckB(prev => ({ ...prev, isPlaying: true }));
      }
    }
  };

  const handleCrossfadeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setXfade(val);
    const engine = AudioEngine.getInstance();
    engine.crossfader.fade.cancelScheduledValues(Tone.now());
    engine.setCrossfadeValue(val);
  };

  const handleSeek = (deckId: 'A' | 'B', value: number) => {
    const engine = AudioEngine.getInstance();
    if (deckId === 'A') {
      engine.deckA.seek(value);
      setProgressA(prev => ({ ...prev, current: value }));
    } else {
      engine.deckB.seek(value);
      setProgressB(prev => ({ ...prev, current: value }));
    }
  };

  const handleEqChange = (deckId: 'A' | 'B', band: 'high' | 'mid' | 'low', value: number) => {
    const engine = AudioEngine.getInstance();
    if (deckId === 'A') {
      setEqA(prev => ({ ...prev, [band]: value }));
      engine.deckA.setEq(band, value);
    } else {
      setEqB(prev => ({ ...prev, [band]: value }));
      engine.deckB.setEq(band, value);
    }
  };

  const handleFilterChange = (deckId: 'A' | 'B', value: number) => {
    const engine = AudioEngine.getInstance();
    if (deckId === 'A') {
      setFilterA(value);
      engine.deckA.setFilterColor(value);
    } else {
      setFilterB(value);
      engine.deckB.setFilterColor(value);
    }
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden">
      <PlaylistSidebar library={library} setLibrary={setLibrary} />
      
      {/* Hidden fallback input for environments without File System Access API */}
      <input 
        type="file" 
        ref={fallbackDirInputRef} 
        style={{ display: 'none' }} 
        multiple 
        // @ts-expect-error directory attribute is non-standard but heavily supported
        webkitdirectory="true"
        directory="true"
        onChange={handleFallbackFiles} 
      />

      <div className="flex-1 flex flex-col p-6 gap-6 min-w-0 overflow-hidden">
        <header className="border-b border-slate-800 pb-4 flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-amber-500">Casual Auto-Mixer Lab</h1>
            <p className="text-sm text-slate-400">Keyboard / Touch Native Playground</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={handleLoadDirectory}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700"
            >
              <FolderSearch size={20} />
              Load Directory
            </button>
            <button 
              onClick={() => setIsAutomixEnabled(!isAutomixEnabled)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition ${isAutomixEnabled ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
            >
              {isAutomixEnabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
              Automix Mode
            </button>
          </div>
        </header>

        {/* Mixer Console Layout */}
        <div className="grid grid-cols-2 gap-6 bg-slate-950 p-6 rounded-xl border border-slate-800 shrink-0">
          {/* Deck A Control Block */}
          <div className={`p-4 rounded-lg border transition-colors flex flex-col gap-4 ${deckA.isPlaying ? 'bg-emerald-950/20 border-emerald-500/40' : 'bg-slate-900 border-slate-800'}`}>
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800">DECK A</span>
                <h2 className="text-lg font-semibold mt-2 truncate">{deckA.track?.title || 'No Track Loaded'}</h2>
                <p className="text-xs text-slate-400 truncate">{deckA.track?.artist || 'Empty Deck'}</p>
              </div>
              <span className="text-sm font-mono text-slate-400">{deckA.track ? `${bpmA.toFixed(1)} BPM` : '-- BPM'}</span>
            </div>
            
            <input 
              type="range" 
              className="w-full h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-emerald-500" 
              value={progressA.current || 0} 
              max={progressA.max || 100} 
              step="0.1"
              onChange={(e) => handleSeek('A', parseFloat(e.target.value))}
            />
            
            {/* EQ and Filter Section */}
            <div className="grid grid-cols-4 gap-2 border border-slate-800 rounded p-2 bg-slate-950/50">
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-500 font-bold">HIGH</span>
                <input type="range" min="-24" max="6" step="0.1" value={eqA.high} onChange={(e) => handleEqChange('A', 'high', parseFloat(e.target.value))} className="w-16 h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-slate-300 rotate-270 -rotate-90 origin-center my-8" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-500 font-bold">MID</span>
                <input type="range" min="-24" max="6" step="0.1" value={eqA.mid} onChange={(e) => handleEqChange('A', 'mid', parseFloat(e.target.value))} className="w-16 h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-slate-300 rotate-270 -rotate-90 origin-center my-8" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-500 font-bold">LOW</span>
                <input type="range" min="-24" max="6" step="0.1" value={eqA.low} onChange={(e) => handleEqChange('A', 'low', parseFloat(e.target.value))} className="w-16 h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-slate-300 rotate-270 -rotate-90 origin-center my-8" />
              </div>
              <div className="flex flex-col items-center gap-1 border-l border-slate-800 pl-2">
                <span className="text-[10px] text-slate-500 font-bold">FILTER</span>
                <input type="range" min="-100" max="100" step="1" value={filterA} onChange={(e) => handleFilterChange('A', parseFloat(e.target.value))} className="w-16 h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-emerald-500 rotate-270 -rotate-90 origin-center my-8" />
              </div>
            </div>

            {/* Effects Skeleton UI */}
            <div className="border border-slate-800 border-dashed rounded p-2 bg-slate-950/30 flex items-center justify-center opacity-50">
              <span className="text-xs text-slate-500 font-medium">FX UNIT (COMING SOON)</span>
            </div>

            <button 
              disabled={!deckA.track}
              onClick={() => toggleDeck('A')}
              className="w-full py-3 rounded-md font-medium flex items-center justify-center gap-2 transition bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white mt-auto"
            >
              {deckA.isPlaying ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              {deckA.isPlaying ? 'Stop Deck' : 'Play Deck'}
            </button>
          </div>

          {/* Deck B Control Block */}
          <div className={`p-4 rounded-lg border transition-colors flex flex-col gap-4 ${deckB.isPlaying ? 'bg-amber-950/20 border-amber-500/40' : 'bg-slate-900 border-slate-800'}`}>
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-950/80 border border-amber-800">DECK B</span>
                <h2 className="text-lg font-semibold mt-2 truncate">{deckB.track?.title || 'No Track Loaded'}</h2>
                <p className="text-xs text-slate-400 truncate">{deckB.track?.artist || 'Empty Deck'}</p>
              </div>
              <span className="text-sm font-mono text-slate-400">{deckB.track ? `${bpmB.toFixed(1)} BPM` : '-- BPM'}</span>
            </div>
            
            <input 
              type="range" 
              className="w-full h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-amber-500" 
              value={progressB.current || 0} 
              max={progressB.max || 100} 
              step="0.1"
              onChange={(e) => handleSeek('B', parseFloat(e.target.value))}
            />

            {/* EQ and Filter Section */}
            <div className="grid grid-cols-4 gap-2 border border-slate-800 rounded p-2 bg-slate-950/50">
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-500 font-bold">HIGH</span>
                <input type="range" min="-24" max="6" step="0.1" value={eqB.high} onChange={(e) => handleEqChange('B', 'high', parseFloat(e.target.value))} className="w-16 h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-slate-300 rotate-270 -rotate-90 origin-center my-8" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-500 font-bold">MID</span>
                <input type="range" min="-24" max="6" step="0.1" value={eqB.mid} onChange={(e) => handleEqChange('B', 'mid', parseFloat(e.target.value))} className="w-16 h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-slate-300 rotate-270 -rotate-90 origin-center my-8" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-500 font-bold">LOW</span>
                <input type="range" min="-24" max="6" step="0.1" value={eqB.low} onChange={(e) => handleEqChange('B', 'low', parseFloat(e.target.value))} className="w-16 h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-slate-300 rotate-270 -rotate-90 origin-center my-8" />
              </div>
              <div className="flex flex-col items-center gap-1 border-l border-slate-800 pl-2">
                <span className="text-[10px] text-slate-500 font-bold">FILTER</span>
                <input type="range" min="-100" max="100" step="1" value={filterB} onChange={(e) => handleFilterChange('B', parseFloat(e.target.value))} className="w-16 h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-amber-500 rotate-270 -rotate-90 origin-center my-8" />
              </div>
            </div>

            {/* Effects Skeleton UI */}
            <div className="border border-slate-800 border-dashed rounded p-2 bg-slate-950/30 flex items-center justify-center opacity-50">
              <span className="text-xs text-slate-500 font-medium">FX UNIT (COMING SOON)</span>
            </div>

            <button 
              disabled={!deckB.track}
              onClick={() => toggleDeck('B')}
              className="w-full py-3 rounded-md font-medium flex items-center justify-center gap-2 transition bg-amber-600 hover:bg-amber-500 disabled:opacity-30 text-white mt-auto"
            >
              {deckB.isPlaying ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              {deckB.isPlaying ? 'Stop Deck' : 'Play Deck'}
            </button>
          </div>

          {/* Unified Crossfader Module */}
          <div className="col-span-2 flex flex-col items-center gap-2 mt-4 pt-4 border-t border-slate-800">
            <div className="flex justify-between w-full max-w-md text-xs text-slate-500 px-2">
              <span>DECK A (100%)</span>
              <span>CENTER</span>
              <span>DECK B (100%)</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01" 
              value={xfade} 
              onChange={handleCrossfadeChange}
              className="w-full max-w-md h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        </div>

        {/* Library View Management Panel */}
        <div className="flex-1 min-h-0 bg-slate-950 rounded-xl border border-slate-800 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 shrink-0">
            <Music size={18} className="text-amber-500" />
            <h3 className="font-semibold text-slate-200">Track Library Pool</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto divide-y divide-slate-900">
            {library.map((track) => (
              <div key={track.id} className="flex items-center justify-between py-3 px-2 hover:bg-slate-900 transition-colors rounded">
                <div className="min-w-0 flex-1 pr-4">
                  <p className="font-medium text-sm text-slate-200 truncate">{track.title}</p>
                  <p className="text-xs text-slate-400 truncate">{track.artist}</p>
                </div>
                <div className="flex items-center gap-4 font-mono text-xs text-slate-400 pr-6">
                  <span>{track.bpm} BPM</span>
                  <span>{track.duration}</span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleLoadTrack(track, 'A')}
                    className="p-2 bg-slate-800 hover:bg-emerald-950/60 border border-slate-700 hover:border-emerald-600/40 text-slate-300 hover:text-emerald-400 rounded transition flex items-center gap-1 text-xs"
                    title="Load onto Deck A"
                  >
                    <ArrowLeftSquare size={14} />
                    <span>Deck A</span>
                  </button>
                  <button 
                    onClick={() => handleLoadTrack(track, 'B')}
                    className="p-2 bg-slate-800 hover:bg-amber-950/60 border border-slate-700 hover:border-amber-600/40 text-slate-300 hover:text-amber-400 rounded transition flex items-center gap-1 text-xs"
                    title="Load onto Deck B"
                  >
                    <span>Deck B</span>
                    <ArrowRightSquare size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
