import React, { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { Play, Square, Music, ArrowLeftSquare, ArrowRightSquare, ToggleLeft, ToggleRight, FolderSearch, FolderOpen, Save, ListMusic } from 'lucide-react';
import { AudioEngine } from './services/AudioEngine';
import { useAutoMixer } from './hooks/useAutoMixer';
import { loadLocalDirectory, createTrackUrl } from './services/FileManager';
import { parseM3U, generateM3U } from './utils/m3uParser';
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

  const [activeTab, setActiveTab] = useState<'tracks' | 'playlists'>('tracks');
  const [dragActive, setDragActive] = useState(false);
  
  const [mixerHeightPct, setMixerHeightPct] = useState(50);
  const [isLibraryMaximized, setIsLibraryMaximized] = useState(false);
  const dragRef = useRef<boolean>(false);

  const fallbackDirInputRef = useRef<HTMLInputElement>(null);
  const fallbackM3uInputRef = useRef<HTMLInputElement>(null);

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
      url: URL.createObjectURL(file)
    }));
    
    setLibrary(newTracks);
  };

  const applyM3U = (content: string) => {
    const paths = parseM3U(content);
    const newLibrary = paths.map(path => {
      const filename = path.split('\\').pop()?.split('/').pop();
      return library.find(t => t.fileHandle?.name === filename || t.title === filename || t.url === path);
    }).filter(Boolean) as Track[];
    
    if (newLibrary.length > 0) {
      setLibrary(newLibrary);
    } else {
      alert('No matching files found. Load the directory containing these audio files first.');
    }
  };

  const handleOpenPlaylist = async () => {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ accept: { 'audio/x-mpegurl': ['.m3u', '.m3u8'] } }]
        });
        const file = await handle.getFile();
        const content = await file.text();
        applyM3U(content);
        return;
      } catch (e) {
        console.warn('showOpenFilePicker failed or cancelled', e);
      }
    }
    fallbackM3uInputRef.current?.click();
  };

  const handleFallbackM3u = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      applyM3U(content);
    };
    reader.readAsText(file);
  };

  const handleSavePlaylist = async () => {
    try {
      const m3uContent = generateM3U(library.map(t => t.url));
      const handle = await window.showSaveFilePicker({
        suggestedName: 'playlist.m3u',
        types: [{ accept: { 'audio/x-mpegurl': ['.m3u'] } }]
      });
      // @ts-expect-error createWritable
      const writable = await handle.createWritable();
      await writable.write(m3uContent);
      await writable.close();
      alert('Playlist saved!');
    } catch (e) {
      console.log('User cancelled or error', e);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.m3u') || file.name.endsWith('.m3u8')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          applyM3U(content);
        };
        reader.readAsText(file);
      }
    }
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
      alert("Failed to load track. If using mocks, they might be offline. Use 'Load Directory' for local files.");
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

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragRef.current) return;
    const newPct = (e.clientY / window.innerHeight) * 100;
    // Limit between 20% and 80%
    setMixerHeightPct(Math.min(80, Math.max(20, newPct)));
  };

  const handleMouseUp = () => {
    dragRef.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    // eslint-disable-next-line
    document.body.style.cursor = '';
  };

  const handleMouseDown = () => {
    if (isLibraryMaximized) {
      setIsLibraryMaximized(false);
    }
    dragRef.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    // eslint-disable-next-line
    document.body.style.cursor = 'row-resize';
  };

  const toggleLibraryMaximize = () => {
    setIsLibraryMaximized(!isLibraryMaximized);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden select-none">
      
      {/* Hidden fallback inputs */}
      {/* @ts-expect-error directory attribute is non-standard but heavily supported */}
      <input type="file" ref={fallbackDirInputRef} style={{ display: 'none' }} multiple webkitdirectory="true" directory="true" onChange={handleFallbackFiles} />
      <input type="file" ref={fallbackM3uInputRef} style={{ display: 'none' }} accept=".m3u,.m3u8" onChange={handleFallbackM3u} />

      {/* TOP HEADER */}
      <header className="flex justify-between items-center px-6 py-4 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center">
            <Play size={16} fill="white" className="ml-0.5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">Vici <span className="text-blue-500 font-light">Pro</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleLoadDirectory}
            className="flex items-center gap-2 px-4 py-2 rounded shadow-sm text-sm font-medium transition bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 hover:border-slate-600"
          >
            <FolderSearch size={16} className="text-blue-400" />
            Load Library
          </button>
          <div className="h-6 w-px bg-slate-800"></div>
          <button 
            onClick={() => setIsAutomixEnabled(!isAutomixEnabled)}
            className={`flex items-center gap-2 px-4 py-2 rounded shadow-sm text-sm font-medium transition ${isAutomixEnabled ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}
          >
            {isAutomixEnabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            Automix Mode
          </button>
        </div>
      </header>

      {/* MAIN CONTENT - HORIZONTAL SPLIT */}
      <div className="flex-1 flex flex-col min-h-0">
        
        {/* MIXER CONSOLE (TOP HALF) */}
        <div 
          className="flex-[0_0_auto] min-h-0 p-6 bg-slate-950 grid grid-cols-[1fr_auto_1fr] gap-6 shrink-0 shadow-xl overflow-y-auto"
          style={{ height: isLibraryMaximized ? '0px' : `${mixerHeightPct}%`, display: isLibraryMaximized ? 'none' : 'grid', padding: isLibraryMaximized ? '0' : '1.5rem' }}
        >
          
          {/* Deck A */}
          <div className={`p-5 rounded-xl border flex flex-col transition-colors ${deckA.isPlaying ? 'bg-slate-900/80 border-blue-500/30' : 'bg-slate-900/40 border-slate-800/80'}`}>
            <div className="flex justify-between items-start mb-6">
              <div className="flex gap-3">
                <div className="w-12 h-12 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-500 font-black text-xl">A</div>
                <div className="overflow-hidden">
                  <h2 className="text-lg font-bold text-white truncate w-48">{deckA.track?.title || 'No Track'}</h2>
                  <p className="text-sm text-slate-400 truncate">{deckA.track?.artist || 'Ready to load'}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-mono font-light text-cyan-400">{deckA.track ? bpmA.toFixed(1) : '---'}</div>
                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">BPM</div>
              </div>
            </div>
            
            <div className="mt-auto flex flex-col gap-6">
              <div className="relative group cursor-pointer">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 to-cyan-400/20 rounded-full blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                <input 
                  type="range" 
                  className="w-full h-1.5 relative z-10 bg-slate-800 rounded-full appearance-none cursor-pointer accent-blue-500" 
                  value={progressA.current || 0} 
                  max={progressA.max || 100} 
                  step="0.1"
                  onChange={(e) => handleSeek('A', parseFloat(e.target.value))}
                />
              </div>

              <div className="flex justify-between items-center">
                <button 
                  disabled={!deckA.track}
                  onClick={() => toggleDeck('A')}
                  className="w-16 h-16 rounded-full flex items-center justify-center transition bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white shadow-inner border border-slate-700/50"
                >
                  {deckA.isPlaying ? <Square size={24} fill="currentColor" className="text-blue-500" /> : <Play size={26} fill="currentColor" className="ml-1" />}
                </button>
              </div>
            </div>
          </div>

          {/* Central Mixer Controls */}
          <div className="w-80 flex flex-col justify-between items-center p-4 rounded-xl border border-slate-800/80 bg-slate-900/60 shadow-inner">
            <div className="flex w-full justify-between px-6 mb-2">
              <div className="text-xs font-bold text-slate-500 tracking-wider">CH A</div>
              <div className="text-xs font-bold text-slate-500 tracking-wider">CH B</div>
            </div>

            {/* EQ Section */}
            <div className="grid grid-cols-2 gap-12 w-full px-6 flex-1">
              {/* EQ A */}
              <div className="flex flex-col gap-4">
                {[
                  { band: 'high', label: 'HI', value: eqA.high, handler: handleEqChange },
                  { band: 'mid', label: 'MID', value: eqA.mid, handler: handleEqChange },
                  { band: 'low', label: 'LOW', value: eqA.low, handler: handleEqChange }
                ].map(({ band, label, value, handler }) => (
                  <div key={`eqa-${band}`} className="flex flex-col items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-bold">{label}</span>
                    <input type="range" min="-24" max="6" step="0.1" value={value} onChange={(e) => handler('A', band as 'high'|'mid'|'low', parseFloat(e.target.value))} className="w-20 h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-slate-300 rotate-270 -rotate-90 origin-center my-10" />
                  </div>
                ))}
              </div>

              {/* EQ B */}
              <div className="flex flex-col gap-4">
                {[
                  { band: 'high', label: 'HI', value: eqB.high, handler: handleEqChange },
                  { band: 'mid', label: 'MID', value: eqB.mid, handler: handleEqChange },
                  { band: 'low', label: 'LOW', value: eqB.low, handler: handleEqChange }
                ].map(({ band, label, value, handler }) => (
                  <div key={`eqb-${band}`} className="flex flex-col items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-bold">{label}</span>
                    <input type="range" min="-24" max="6" step="0.1" value={value} onChange={(e) => handler('B', band as 'high'|'mid'|'low', parseFloat(e.target.value))} className="w-20 h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-slate-300 rotate-270 -rotate-90 origin-center my-10" />
                  </div>
                ))}
              </div>
            </div>

            {/* Filter Section */}
            <div className="grid grid-cols-2 gap-12 w-full px-6 mt-6 pt-6 border-t border-slate-800/50">
              <div className="flex flex-col items-center gap-2">
                <span className="text-[10px] text-slate-400 font-bold text-blue-400">FILTER</span>
                <input type="range" min="-100" max="100" step="1" value={filterA} onChange={(e) => handleFilterChange('A', parseFloat(e.target.value))} className="w-20 h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-blue-500 rotate-270 -rotate-90 origin-center my-10" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-[10px] text-slate-400 font-bold text-blue-400">FILTER</span>
                <input type="range" min="-100" max="100" step="1" value={filterB} onChange={(e) => handleFilterChange('B', parseFloat(e.target.value))} className="w-20 h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-blue-500 rotate-270 -rotate-90 origin-center my-10" />
              </div>
            </div>

            {/* Crossfader */}
            <div className="w-full px-4 mt-8 bg-slate-950/50 p-4 rounded-lg border border-slate-800/50">
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={xfade} 
                onChange={handleCrossfadeChange}
                className="w-full h-2.5 bg-slate-900 rounded-full appearance-none cursor-pointer accent-blue-500 shadow-inner"
              />
            </div>
          </div>

          {/* Deck B */}
          <div className={`p-5 rounded-xl border flex flex-col transition-colors ${deckB.isPlaying ? 'bg-slate-900/80 border-blue-500/30' : 'bg-slate-900/40 border-slate-800/80'}`}>
            <div className="flex justify-between items-start mb-6">
              <div className="text-left">
                <div className="text-2xl font-mono font-light text-cyan-400">{deckB.track ? bpmB.toFixed(1) : '---'}</div>
                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">BPM</div>
              </div>
              <div className="flex gap-3 text-right">
                <div className="overflow-hidden">
                  <h2 className="text-lg font-bold text-white truncate w-48 text-right">{deckB.track?.title || 'No Track'}</h2>
                  <p className="text-sm text-slate-400 truncate text-right">{deckB.track?.artist || 'Ready to load'}</p>
                </div>
                <div className="w-12 h-12 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-500 font-black text-xl">B</div>
              </div>
            </div>
            
            <div className="mt-auto flex flex-col gap-6">
              <div className="relative group cursor-pointer">
                <div className="absolute -inset-1 bg-gradient-to-r from-cyan-400/20 to-blue-600/20 rounded-full blur opacity-0 group-hover:opacity-100 transition duration-500"></div>
                <input 
                  type="range" 
                  className="w-full h-1.5 relative z-10 bg-slate-800 rounded-full appearance-none cursor-pointer accent-blue-500" 
                  value={progressB.current || 0} 
                  max={progressB.max || 100} 
                  step="0.1"
                  onChange={(e) => handleSeek('B', parseFloat(e.target.value))}
                />
              </div>

              <div className="flex justify-between items-center flex-row-reverse">
                <button 
                  disabled={!deckB.track}
                  onClick={() => toggleDeck('B')}
                  className="w-16 h-16 rounded-full flex items-center justify-center transition bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white shadow-inner border border-slate-700/50"
                >
                  {deckB.isPlaying ? <Square size={24} fill="currentColor" className="text-blue-500" /> : <Play size={26} fill="currentColor" className="ml-1" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* DRAGGABLE DIVIDER / LIBRARY HEADER */}
        <div 
          className="h-6 bg-slate-900 border-y border-slate-800 flex items-center justify-between px-4 cursor-row-resize shrink-0 group hover:bg-slate-800 transition-colors"
          onMouseDown={handleMouseDown}
          onDoubleClick={toggleLibraryMaximize}
        >
          <div className="w-16"></div> {/* spacer */}
          <div className="flex gap-1.5 items-center opacity-30 group-hover:opacity-100 transition-opacity">
            <div className="w-1 h-1 rounded-full bg-slate-400"></div>
            <div className="w-1 h-1 rounded-full bg-slate-400"></div>
            <div className="w-1 h-1 rounded-full bg-slate-400"></div>
          </div>
          <button 
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); toggleLibraryMaximize(); }} 
            className="text-slate-500 hover:text-blue-400 p-1 flex items-center"
          >
            {isLibraryMaximized ? <span className="text-[10px] font-bold tracking-widest uppercase">Restore</span> : <span className="text-[10px] font-bold tracking-widest uppercase">Maximize Library</span>}
          </button>
        </div>

        {/* BROWSER (BOTTOM HALF) */}
        <div className="flex-1 flex bg-slate-900 min-h-0">
          
          {/* Browser Navigation Pane */}
          <div className="w-64 border-r border-slate-800 flex flex-col bg-slate-950/50">
            <div className="p-4 border-b border-slate-800">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Browser</div>
              <div className="flex flex-col gap-1">
                <button 
                  onClick={() => setActiveTab('tracks')}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition ${activeTab === 'tracks' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
                >
                  <Music size={16} /> Track Library
                </button>
                <button 
                  onClick={() => setActiveTab('playlists')}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition ${activeTab === 'playlists' ? 'bg-blue-600/20 text-blue-400' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'}`}
                >
                  <ListMusic size={16} /> Playlists (M3U)
                </button>
              </div>
            </div>

            {/* M3U Context Menu */}
            {activeTab === 'playlists' && (
              <div className="p-4" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>
                <div className={`p-4 border-2 border-dashed rounded-lg text-center transition ${dragActive ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 bg-slate-900/50'}`}>
                  <p className="text-xs text-slate-400 mb-4">Drag & drop .m3u files here, or use the buttons below.</p>
                  <div className="flex flex-col gap-2">
                    <button onClick={handleOpenPlaylist} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium flex justify-center items-center gap-2">
                      <FolderOpen size={14} /> Open M3U
                    </button>
                    <button onClick={handleSavePlaylist} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium flex justify-center items-center gap-2">
                      <Save size={14} /> Save Queue as M3U
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Data Table */}
          <div className="flex-1 overflow-auto bg-slate-900/80 p-4">
            <div className="grid grid-cols-[1fr_1fr_80px_80px_100px] gap-4 px-4 py-2 border-b border-slate-800 text-xs font-bold text-slate-500 tracking-wider">
              <div>TITLE</div>
              <div>ARTIST</div>
              <div>BPM</div>
              <div>TIME</div>
              <div className="text-center">LOAD</div>
            </div>
            <div className="flex flex-col mt-2">
              {library.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
                  The active queue is empty. Load a directory or playlist.
                </div>
              ) : (
                library.map((track) => (
                  <div key={track.id} className="grid grid-cols-[1fr_1fr_80px_80px_100px] gap-4 px-4 py-2 hover:bg-slate-800/50 rounded-md items-center group transition">
                    <div className="font-medium text-sm text-slate-200 truncate">{track.title}</div>
                    <div className="text-xs text-slate-400 truncate">{track.artist}</div>
                    <div className="font-mono text-xs text-slate-400">{track.bpm}</div>
                    <div className="font-mono text-xs text-slate-400">{track.duration}</div>
                    <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleLoadTrack(track, 'A')} className="p-1.5 bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-400 rounded transition" title="Load to Deck A">
                        <ArrowLeftSquare size={16} />
                      </button>
                      <button onClick={() => handleLoadTrack(track, 'B')} className="p-1.5 bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-400 rounded transition" title="Load to Deck B">
                        <ArrowRightSquare size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
