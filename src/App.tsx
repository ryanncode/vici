import React, { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { Play, Square, Music, ArrowLeftSquare, ArrowRightSquare, ToggleLeft, ToggleRight, FolderSearch, FolderOpen, Save, ListMusic, Link, Lock, Scan } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './services/Database';
import { metadataScanner } from './services/MetadataScanner';
import { AudioEngine } from './services/AudioEngine';
import { useAutoMixer } from './hooks/useAutoMixer';
import { loadLocalDirectory, createTrackUrl } from './services/FileManager';
import { parseM3U, generateM3U } from './utils/m3uParser';
import type { Track, TrackMetadata } from './types/mixer';

import { Waveform } from './components/Waveform';

// Mock Library Data for Verification
const MOCK_LIBRARY: Track[] = [
  { id: '1', title: 'Deep House Groove', artist: 'Lofi Core', album: 'Chill Vibes Vol 1', year: 2023, genre: 'Deep House', key: 'Am', fileType: 'OGG', bitrate: 320000, bpm: 122, duration: '05:24', url: 'https://actions.google.com/sounds/v1/science_fiction/ambient_space_machine.ogg' },
  { id: '2', title: 'Synthwave Driver', artist: 'Retro Future', album: 'Night Drive', year: 2021, genre: 'Synthwave', key: 'Fm', fileType: 'OGG', bitrate: 256000, bpm: 118, duration: '04:12', url: 'https://actions.google.com/sounds/v1/science_fiction/retro_teleport.ogg' },
  { id: '3', title: 'Cosmic Journey', artist: 'Space Beats', album: 'Galaxy', year: 2024, genre: 'Ambient', key: 'C', fileType: 'OGG', bitrate: 192000, bpm: 124, duration: '03:45', url: 'https://actions.google.com/sounds/v1/science_fiction/force_field_loop.ogg' },
];

const formatDuration = (seconds: number | string) => {
  if (typeof seconds === 'string') return seconds;
  if (!seconds || isNaN(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const formatAdjustedTime = (seconds: number, pitch: number) => {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
  return formatDuration(seconds / pitch);
};

export default function App() {
  const [library, setLibrary] = useState<Track[]>(MOCK_LIBRARY);
  const [deckA, setDeckA] = useState<{ track: Track | null; isPlaying: boolean; introMarker: number; outroMarker: number; peaks: Float32Array | null }>({ track: null, isPlaying: false, introMarker: 0, outroMarker: 0, peaks: null });
  const [deckB, setDeckB] = useState<{ track: Track | null; isPlaying: boolean; introMarker: number; outroMarker: number; peaks: Float32Array | null }>({ track: null, isPlaying: false, introMarker: 0, outroMarker: 0, peaks: null });
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

  const [pitchA, setPitchA] = useState(1.0);
  const [pitchB, setPitchB] = useState(1.0);
  const [syncA, setSyncA] = useState(false);
  const [syncB, setSyncB] = useState(false);
  const [masterDeck, setMasterDeck] = useState<'A' | 'B' | null>(null);

  const [volA, setVolA] = useState(1.0);
  const [volB, setVolB] = useState(1.0);

  const [fxA, setFxA] = useState({ delayOn: false, delayTime: 0.25, delayFeedback: 0.5, reverbOn: false, reverbSize: 0.7, phaserOn: false, phaserRate: 0.5, gateOn: false, rollOn: false, sirenOn: false });
  const [fxB, setFxB] = useState({ delayOn: false, delayTime: 0.25, delayFeedback: 0.5, reverbOn: false, reverbSize: 0.7, phaserOn: false, phaserRate: 0.5, gateOn: false, rollOn: false, sirenOn: false });

  const syncTimerA = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimerB = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncHandledA = useRef<boolean>(false);
  const syncHandledB = useRef<boolean>(false);

  const [activeTab, setActiveTab] = useState<'tracks' | 'playlists'>('tracks');
  const [dragActive, setDragActive] = useState(false);
  
  const dbTracks = useLiveQuery(() => db.tracks.toArray()) || [];
  const displayTracks: (Track | TrackMetadata)[] = activeTab === 'tracks' ? dbTracks : library;

  const [mixerHeightPct, setMixerHeightPct] = useState(50);
  const [isLibraryMaximized, setIsLibraryMaximized] = useState(false);
  const dragRef = useRef<boolean>(false);

  const fallbackDirInputRef = useRef<HTMLInputElement>(null);
  const fallbackM3uInputRef = useRef<HTMLInputElement>(null);

  const handleTransitionComplete = (winningDeck: 'A' | 'B', nextTrack: Track, isFromLibrary: boolean) => {
    const engine = AudioEngine.getInstance();
    if (winningDeck === 'A') {
      setDeckA(prev => ({ ...prev, track: nextTrack, isPlaying: true, introMarker: prev.introMarker || 0, outroMarker: engine.deckA.player.buffer ? Math.max(0, engine.deckA.player.buffer.duration - 15) : 0, peaks: engine.deckA.peaks }));
      setDeckB(prev => ({ ...prev, isPlaying: false }));
      setXfade(0);
    } else {
      setDeckB(prev => ({ ...prev, track: nextTrack, isPlaying: true, introMarker: prev.introMarker || 0, outroMarker: engine.deckB.player.buffer ? Math.max(0, engine.deckB.player.buffer.duration - 15) : 0, peaks: engine.deckB.peaks }));
      setDeckA(prev => ({ ...prev, isPlaying: false }));
      setXfade(1);
    }
    if (isFromLibrary) {
      setLibrary(prev => prev.slice(1));
    }
  };

  const handleTransitionStart = (winningDeck: 'A' | 'B', nextTrack: Track) => {
    const engine = AudioEngine.getInstance();
    if (winningDeck === 'A') {
      setDeckA(prev => ({ ...prev, track: nextTrack, isPlaying: true, introMarker: prev.introMarker || 0, outroMarker: engine.deckA.player.buffer ? Math.max(0, engine.deckA.player.buffer.duration - 15) : 0, peaks: engine.deckA.peaks }));
    } else {
      setDeckB(prev => ({ ...prev, track: nextTrack, isPlaying: true, introMarker: prev.introMarker || 0, outroMarker: engine.deckB.player.buffer ? Math.max(0, engine.deckB.player.buffer.duration - 15) : 0, peaks: engine.deckB.peaks }));
    }
  };

  const handleTransitionCancel = (cancelledDeck: 'A' | 'B') => {
    if (cancelledDeck === 'A') {
      setDeckA(prev => ({ ...prev, isPlaying: false }));
    } else {
      setDeckB(prev => ({ ...prev, isPlaying: false }));
    }
  };

  useAutoMixer({
    deckAState: deckA,
    deckBState: deckB,
    library,
    isAutomixEnabled,
    onTransitionStart: handleTransitionStart,
    onTransitionComplete: handleTransitionComplete,
    onTransitionCancel: handleTransitionCancel
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const engine = AudioEngine.getInstance();
      if (engine.deckA.player.buffer) {
        setProgressA({ current: engine.deckA.getCurrentTime(), max: engine.deckA.player.buffer.duration });
      }
      setBpmA(engine.deckA.currentBpm);
      
      if (engine.deckB.player.buffer) {
        setProgressB({ current: engine.deckB.getCurrentTime(), max: engine.deckB.player.buffer.duration });
      }
      setBpmB(engine.deckB.currentBpm);

      if (isAutomixEnabled) {
        setXfade(engine.crossfader.fade.value as number);
      }
    }, 50); // Polling faster (50ms) for ultra-smooth waveform tracking
    return () => clearInterval(interval);
  }, [isAutomixEnabled]);

  const handleLoadDirectory = async () => {
    if ('showDirectoryPicker' in window) {
      try {
        const handles = await loadLocalDirectory();
        if (handles.length > 0) {
          const newTracks: TrackMetadata[] = handles.map((handle, i) => ({
            id: `temp-${Date.now()}-${i}`,
            filePath: handle.name,
            fileName: handle.name,
            title: handle.name.replace(/\.[^/.]+$/, ""),
            artist: 'Unknown Artist',
            bpm: 120,
            duration: 0,
            fileHandle: handle
          }));
          
          await db.tracks.bulkPut(newTracks);
          
          // Background scan
          handles.forEach(handle => {
            metadataScanner.scanFileHandle(handle);
          });
          
          setActiveTab('tracks');
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
      url: URL.createObjectURL(file),
      rawFile: file
    }));
    
    setLibrary(prev => [...prev, ...newTracks]);
    setActiveTab('playlists');
  };

  const handlePreScanAll = () => {
    const unscannedDb = dbTracks.filter(t => t.fileHandle && !t.isScanned);
    unscannedDb.forEach(t => {
      if (t.fileHandle) {
        metadataScanner.scanFileHandle(t.fileHandle, t.filePath);
      }
    });

    const unscannedLibrary = library.filter(t => t.rawFile && (!('isScanned' in t) || !(t as unknown as TrackMetadata).isScanned));
    unscannedLibrary.forEach(t => {
      if (t.rawFile) {
        metadataScanner.scanFileHandle(undefined, t.rawFile.name, t.rawFile).then(scanned => {
          setLibrary(prev => prev.map(lt => lt.id === t.id ? { ...lt, ...scanned, duration: formatDuration(scanned.duration) } : lt));
        }).catch(console.error);
      }
    });
  };

  const applyM3U = (content: string) => {
    const paths = parseM3U(content);
    const newLibrary = paths.map(path => {
      const filename = path.split('\\').pop()?.split('/').pop();
      const dbMatch = dbTracks.find(t => t.fileName === filename || t.filePath === path);
      if (dbMatch) return dbMatch as unknown as Track;
      return library.find(t => t.fileHandle?.name === filename || t.title === filename || t.url === path);
    }).filter(Boolean) as Track[];
    
    if (newLibrary.length > 0) {
      setLibrary(newLibrary);
      setActiveTab('playlists');
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

  const handleLoadTrack = async (inputTrack: Track | TrackMetadata, deckId: 'A' | 'B') => {
    try {
      const engine = AudioEngine.getInstance();
      if (Tone.context.state !== 'running') {
        await Tone.start();
      }

      let track = inputTrack as Track;

      const needsScan = !('isScanned' in inputTrack) || !inputTrack.isScanned;

      if (needsScan && (inputTrack.fileHandle || inputTrack.rawFile)) {
        try {
          const filePath = ('filePath' in inputTrack) ? inputTrack.filePath : (inputTrack.fileHandle?.name || inputTrack.rawFile?.name);
          const scanned = await metadataScanner.scanFileHandle(inputTrack.fileHandle, filePath, inputTrack.rawFile);
          track = { ...(scanned as unknown as Track), url: (inputTrack as Track).url };
        } catch (e) {
          console.error("Failed to scan metadata before load:", e);
        }
      }

      let trackUrl = track.url;
      if (track.fileHandle && !trackUrl) {
        if (await track.fileHandle.queryPermission({ mode: 'read' }) === 'prompt') {
          await track.fileHandle.requestPermission({ mode: 'read' });
        }
        trackUrl = await createTrackUrl(track.fileHandle);
      }

      if (typeof track.duration === 'number') {
        track = { ...track, duration: formatDuration(track.duration) };
      }

      if (deckId === 'A') {
        setDeckA(prev => ({ ...prev, track }));
        await engine.deckA.loadTrack(trackUrl);
        engine.deckA.originalBpm = track.bpm;
        engine.deckA.setTrackGainDb(track.replayGain || 0);
        setPitchA(1.0);
        engine.deckA.setPlaybackRate(1.0);
        setDeckA(prev => ({ ...prev, peaks: engine.deckA.peaks, introMarker: 0, outroMarker: engine.deckA.player.buffer ? Math.max(0, engine.deckA.player.buffer.duration - 15) : 0 }));
      } else {
        setDeckB(prev => ({ ...prev, track }));
        await engine.deckB.loadTrack(trackUrl);
        engine.deckB.originalBpm = track.bpm;
        engine.deckB.setTrackGainDb(track.replayGain || 0);
        setPitchB(1.0);
        engine.deckB.setPlaybackRate(1.0);
        setDeckB(prev => ({ ...prev, peaks: engine.deckB.peaks, introMarker: 0, outroMarker: engine.deckB.player.buffer ? Math.max(0, engine.deckB.player.buffer.duration - 15) : 0 }));
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

  const handleVolumeChange = (deckId: 'A' | 'B', value: number) => {
    const engine = AudioEngine.getInstance();
    if (deckId === 'A') {
      setVolA(value);
      engine.deckA.setChannelVolume(value);
    } else {
      setVolB(value);
      engine.deckB.setChannelVolume(value);
    }
  };

  const applySyncMath = (deckToAdjust: 'A' | 'B') => {
    const audio = AudioEngine.getInstance();
    if (deckToAdjust === 'A') {
      if (audio.deckA.originalBpm > 0 && audio.deckB.currentBpm > 0) {
        const newPitchA = audio.deckB.currentBpm / audio.deckA.originalBpm;
        setPitchA(newPitchA);
        audio.deckA.setPlaybackRate(newPitchA);
      }
    } else {
      if (audio.deckB.originalBpm > 0 && audio.deckA.currentBpm > 0) {
        const newPitchB = audio.deckA.currentBpm / audio.deckB.originalBpm;
        setPitchB(newPitchB);
        audio.deckB.setPlaybackRate(newPitchB);
      }
    }
  };

  const handlePitchChange = (deckId: 'A' | 'B', newPitch: number) => {
    const audio = AudioEngine.getInstance();
    if (deckId === 'A') {
      setPitchA(newPitch);
      audio.deckA.setPlaybackRate(newPitch);
      
      if (syncB || masterDeck === 'A') {
        const newBpmA = audio.deckA.currentBpm;
        if (audio.deckB.originalBpm > 0) {
          const requiredPitchB = newBpmA / audio.deckB.originalBpm;
          setPitchB(requiredPitchB);
          audio.deckB.setPlaybackRate(requiredPitchB);
        }
      }
    } else {
      setPitchB(newPitch);
      audio.deckB.setPlaybackRate(newPitch);
      
      if (syncA || masterDeck === 'B') {
        const newBpmB = audio.deckB.currentBpm;
        if (audio.deckA.originalBpm > 0) {
          const requiredPitchA = newBpmB / audio.deckA.originalBpm;
          setPitchA(requiredPitchA);
          audio.deckA.setPlaybackRate(requiredPitchA);
        }
      }
    }
  };

  const handleSyncDown = (deckId: 'A' | 'B') => {
    const timer = deckId === 'A' ? syncTimerA : syncTimerB;
    const handledRef = deckId === 'A' ? syncHandledA : syncHandledB;
    handledRef.current = false;
    
    timer.current = setTimeout(() => {
      handledRef.current = true;
      if (deckId === 'A') setSyncA(true); else setSyncB(true);
      applySyncMath(deckId);
    }, 1000);
  };

  const handleSyncUp = (deckId: 'A' | 'B') => {
    const timer = deckId === 'A' ? syncTimerA : syncTimerB;
    const handledRef = deckId === 'A' ? syncHandledA : syncHandledB;
    
    if (timer.current) clearTimeout(timer.current);
    
    if (!handledRef.current) {
      const isCurrentlySyncing = deckId === 'A' ? syncA : syncB;
      if (isCurrentlySyncing) {
         if (deckId === 'A') setSyncA(false); else setSyncB(false);
      } else {
         applySyncMath(deckId);
      }
    }
  };

  const handleMasterToggle = (deckId: 'A' | 'B') => {
    if (masterDeck === deckId) {
      setMasterDeck(null);
    } else {
      setMasterDeck(deckId);
      applySyncMath(deckId === 'A' ? 'B' : 'A');
    }
  };

  const handleFxToggle = (deckId: 'A' | 'B', fxType: 'delay' | 'reverb' | 'phaser' | 'gate' | 'roll' | 'siren') => {
    const engine = AudioEngine.getInstance();
    const setFx = deckId === 'A' ? setFxA : setFxB;
    const currentFx = deckId === 'A' ? fxA : fxB;
    const deck = deckId === 'A' ? engine.deckA : engine.deckB;
    
    if (fxType === 'delay') {
      const newState = !currentFx.delayOn;
      setFx(prev => ({ ...prev, delayOn: newState }));
      deck.setDelayState(newState);
    } else if (fxType === 'reverb') {
      const newState = !currentFx.reverbOn;
      setFx(prev => ({ ...prev, reverbOn: newState }));
      deck.setReverbState(newState);
    } else if (fxType === 'phaser') {
      const newState = !currentFx.phaserOn;
      setFx(prev => ({ ...prev, phaserOn: newState }));
      deck.setPhaserState(newState);
    } else if (fxType === 'gate') {
      const newState = !currentFx.gateOn;
      setFx(prev => ({ ...prev, gateOn: newState }));
      deck.setGateState(newState);
    } else if (fxType === 'roll') {
      const newState = !currentFx.rollOn;
      setFx(prev => ({ ...prev, rollOn: newState }));
      deck.setRoll(newState, 8); // Default 1/8th roll
    } else if (fxType === 'siren') {
      const newState = !currentFx.sirenOn;
      setFx(prev => ({ ...prev, sirenOn: newState }));
      deck.triggerSiren(newState);
    }
  };

  const handleFxParamChange = (deckId: 'A' | 'B', fxType: 'delay' | 'reverb' | 'phaser', param: 'time' | 'feedback' | 'size' | 'rate', value: number) => {
    const engine = AudioEngine.getInstance();
    const setFx = deckId === 'A' ? setFxA : setFxB;
    const deck = deckId === 'A' ? engine.deckA : engine.deckB;
    
    if (fxType === 'delay') {
      if (param === 'time') {
        setFx(prev => ({ ...prev, delayTime: value }));
        deck.setDelayTime(value);
      } else if (param === 'feedback') {
        setFx(prev => ({ ...prev, delayFeedback: value }));
        deck.setDelayFeedback(value);
      }
    } else if (fxType === 'reverb' && param === 'size') {
      setFx(prev => ({ ...prev, reverbSize: value }));
      deck.setReverbSize(value);
    } else if (fxType === 'phaser' && param === 'rate') {
      setFx(prev => ({ ...prev, phaserRate: value }));
      deck.setPhaserRate(value);
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
          className="flex-[0_0_auto] min-h-0 p-2 sm:p-4 lg:p-6 2xl:p-8 bg-slate-950 grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-4 lg:gap-6 2xl:gap-8 shrink-0 shadow-xl overflow-y-auto"
          style={{ height: isLibraryMaximized ? '0px' : `${mixerHeightPct}%`, display: isLibraryMaximized ? 'none' : 'grid' }}
        >
          
          {/* Deck A */}
          <div className={`p-3 sm:p-4 lg:p-5 rounded-xl border flex flex-col gap-3 lg:gap-4 transition-colors ${deckA.isPlaying ? 'bg-slate-900/80 border-blue-500/30' : 'bg-slate-900/40 border-slate-800/80'}`}>
            
            {/* 1. Waveform */}
            <div className="h-10 sm:h-12 lg:h-16 w-full shrink-0 rounded overflow-hidden shadow-inner bg-slate-950/50">
              <Waveform 
                peaks={deckA.peaks}
                currentTime={progressA.current || 0}
                duration={progressA.max || 0}
                introMarker={deckA.introMarker}
                outroMarker={deckA.outroMarker}
                color="#3b82f6"
                onSeek={(time) => handleSeek('A', time)}
                onMarkerChange={(type, time) => setDeckA(prev => ({ ...prev, [type === 'intro' ? 'introMarker' : 'outroMarker']: time }))}
              />
            </div>

            {/* 2. Metadata & Time */}
            <div className="flex justify-between items-start">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-500 font-black text-lg shrink-0">A</div>
                <div className="overflow-hidden">
                  <h2 className="text-base sm:text-lg font-bold text-white truncate w-40 sm:w-48">{deckA.track?.title || 'No Track'}</h2>
                  <p className="text-xs sm:text-sm text-slate-400 truncate">{deckA.track?.artist || 'Ready to load'}</p>
                  {deckA.track && (
                    <div className="flex flex-col mt-0.5">
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] sm:text-[10px] text-slate-500 font-mono leading-tight">
                        {deckA.track.album && <span><span className="text-slate-600">ALB:</span> {deckA.track.album}</span>}
                        {deckA.track.year && <span><span className="text-slate-600">YR:</span> {deckA.track.year}</span>}
                        {deckA.track.genre && <span><span className="text-slate-600">GEN:</span> {deckA.track.genre}</span>}
                        {deckA.track.key && <span><span className="text-slate-600">KEY:</span> {deckA.track.key}</span>}
                        {deckA.track.fileType && <span><span className="text-slate-600">FMT:</span> {deckA.track.fileType}</span>}
                        {deckA.track.bitrate && <span><span className="text-slate-600">KBPS:</span> {Math.round(deckA.track.bitrate / 1000)}</span>}
                        {deckA.track.replayGain !== undefined && <span><span className="text-slate-600">GAIN:</span> {deckA.track.replayGain.toFixed(1)}dB</span>}
                      </div>
                      <div className="flex gap-3 mt-1 text-[9px] sm:text-[10px] font-mono text-slate-400">
                        <span><span className="text-slate-500">TIME:</span> {formatAdjustedTime(progressA.current, pitchA)} / {formatAdjustedTime(progressA.max, pitchA)}</span>
                        <span><span className="text-slate-500">IN:</span> {formatAdjustedTime(deckA.introMarker, pitchA)}</span>
                        <span><span className="text-slate-500">OUT:</span> {formatAdjustedTime(progressA.max - deckA.outroMarker, pitchA)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xl sm:text-2xl font-mono font-light text-cyan-400">{deckA.track ? bpmA.toFixed(1) : '---'}</div>
                <div className="text-[9px] sm:text-[10px] uppercase text-slate-500 font-bold tracking-widest">BPM</div>
              </div>
            </div>
            
            {/* 3. Transport, Performance Pads & Pitch */}
            <div className="flex justify-between items-center bg-slate-950/50 p-2 sm:p-3 rounded-lg border border-slate-800/50 mt-auto">
              <button 
                disabled={!deckA.track}
                onClick={() => toggleDeck('A')}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white shadow-inner border border-slate-700/50 shrink-0"
              >
                {deckA.isPlaying ? <Square size={20} fill="currentColor" className="text-blue-500" /> : <Play size={22} fill="currentColor" className="ml-1" />}
              </button>

              <div className="flex gap-2 items-center mx-2 sm:mx-4 flex-1 justify-center">
                <button
                  onMouseDown={() => handleFxToggle('A', 'roll')}
                  onMouseUp={() => handleFxToggle('A', 'roll')}
                  onMouseLeave={() => fxA.rollOn && handleFxToggle('A', 'roll')}
                  className={`w-12 h-10 sm:w-14 sm:h-12 rounded flex flex-col items-center justify-center border font-bold transition-all text-[8px] sm:text-[9px] ${fxA.rollOn ? 'bg-amber-500 text-white border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.6)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                >
                  <span>ROLL</span><span>1/8</span>
                </button>
                <button
                  onClick={() => handleFxToggle('A', 'gate')}
                  className={`w-12 h-10 sm:w-14 sm:h-12 rounded flex flex-col items-center justify-center border font-bold transition-all text-[8px] sm:text-[9px] ${fxA.gateOn ? 'bg-purple-500 text-white border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.6)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                >
                  <span>TRANCE</span><span>GATE</span>
                </button>
                <button
                  onMouseDown={() => handleFxToggle('A', 'siren')}
                  onMouseUp={() => handleFxToggle('A', 'siren')}
                  onMouseLeave={() => fxA.sirenOn && handleFxToggle('A', 'siren')}
                  className={`w-12 h-10 sm:w-14 sm:h-12 rounded flex flex-col items-center justify-center border font-bold transition-all text-[8px] sm:text-[9px] ${fxA.sirenOn ? 'bg-red-500 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.6)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                >
                  <span>DUB</span><span>SIREN</span>
                </button>
              </div>

              <div className="flex gap-3 sm:gap-4 items-center shrink-0">
                <div className="flex flex-col gap-1.5 sm:gap-2">
                  <button 
                    onMouseDown={() => handleSyncDown('A')}
                    onMouseUp={() => handleSyncUp('A')}
                    onMouseLeave={() => handleSyncUp('A')}
                    className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded text-[9px] sm:text-[10px] font-bold transition-colors flex items-center gap-1 sm:gap-1.5 border ${syncA ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.5)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                  >
                    <Link size={10} className="sm:w-3 sm:h-3" /> SYNC
                  </button>
                  <button 
                    onClick={() => handleMasterToggle('A')}
                    className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded text-[9px] sm:text-[10px] font-bold transition-colors flex items-center gap-1 sm:gap-1.5 border ${masterDeck === 'A' ? 'bg-amber-600 text-white border-amber-500 shadow-[0_0_10px_rgba(217,119,6,0.5)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                  >
                    <Lock size={10} className="sm:w-3 sm:h-3" /> MASTER
                  </button>
                </div>
                
                <div className="flex flex-col items-center gap-1 w-20 sm:w-24">
                  <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold tracking-widest">PITCH</span>
                  <input 
                    type="range" 
                    min="0.84" 
                    max="1.16" 
                    step="0.001" 
                    value={pitchA} 
                    onChange={(e) => handlePitchChange('A', parseFloat(e.target.value))} 
                    onDoubleClick={() => handlePitchChange('A', 1.0)}
                    className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-blue-500 shadow-inner" 
                  />
                  <span className="text-[9px] sm:text-[10px] font-mono text-slate-500">{((pitchA - 1) * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* 4. Parametric FX Bay */}
            <div className="flex gap-2 sm:gap-3 p-2 sm:p-3 bg-slate-900/80 rounded-lg border border-slate-800/80">
              {/* Echo */}
              <div className="flex flex-col gap-1.5 sm:gap-2 flex-1 border-r border-slate-800/50 pr-2 sm:pr-3">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-blue-400">ECHO</span>
                  <button 
                    onClick={() => handleFxToggle('A', 'delay')}
                    className={`w-6 sm:w-8 h-3 sm:h-4 rounded-full transition-colors ${fxA.delayOn ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'bg-slate-700'}`}
                  ></button>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <span className="text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7">TIME</span>
                  <input type="range" min="0.05" max="1" step="0.01" value={fxA.delayTime} onChange={(e) => handleFxParamChange('A', 'delay', 'time', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('A', 'delay', 'time', 0.25)} className="flex-1 h-1 bg-slate-800 rounded appearance-none accent-slate-400" />
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <span className="text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7">FDBK</span>
                  <input type="range" min="0" max="0.95" step="0.01" value={fxA.delayFeedback} onChange={(e) => handleFxParamChange('A', 'delay', 'feedback', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('A', 'delay', 'feedback', 0.5)} className="flex-1 h-1 bg-slate-800 rounded appearance-none accent-slate-400" />
                </div>
              </div>

              {/* Reverb */}
              <div className="flex flex-col gap-1.5 sm:gap-2 flex-1 border-r border-slate-800/50 pr-2 sm:pr-3">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-cyan-400">REVERB</span>
                  <button 
                    onClick={() => handleFxToggle('A', 'reverb')}
                    className={`w-6 sm:w-8 h-3 sm:h-4 rounded-full transition-colors ${fxA.reverbOn ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]' : 'bg-slate-700'}`}
                  ></button>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 mt-auto mb-0.5 sm:mb-1">
                  <span className="text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7">SIZE</span>
                  <input type="range" min="0" max="1" step="0.01" value={fxA.reverbSize} onChange={(e) => handleFxParamChange('A', 'reverb', 'size', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('A', 'reverb', 'size', 0.7)} className="flex-1 h-1 bg-slate-800 rounded appearance-none accent-slate-400" />
                </div>
              </div>

              {/* Phaser */}
              <div className="flex flex-col gap-1.5 sm:gap-2 flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-fuchsia-400">PHASER</span>
                  <button 
                    onClick={() => handleFxToggle('A', 'phaser')}
                    className={`w-6 sm:w-8 h-3 sm:h-4 rounded-full transition-colors ${fxA.phaserOn ? 'bg-fuchsia-500 shadow-[0_0_8px_rgba(217,70,239,0.6)]' : 'bg-slate-700'}`}
                  ></button>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 mt-auto mb-0.5 sm:mb-1">
                  <span className="text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7">RATE</span>
                  <input type="range" min="0.1" max="10" step="0.1" value={fxA.phaserRate} onChange={(e) => handleFxParamChange('A', 'phaser', 'rate', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('A', 'phaser', 'rate', 0.5)} className="flex-1 h-1 bg-slate-800 rounded appearance-none accent-slate-400" />
                </div>
              </div>
            </div>

          </div>

          {/* Central Mixer Controls */}
          <div className="w-56 sm:w-64 lg:w-72 flex flex-col p-2 sm:p-4 rounded-xl border border-slate-800/80 bg-slate-900/60 shadow-inner">
            <div className="flex w-full justify-between px-2 mb-2 sm:mb-4">
              <div className="text-[10px] sm:text-xs font-bold text-slate-500 tracking-wider">CH A</div>
              <div className="text-[10px] sm:text-xs font-bold text-slate-500 tracking-wider">CH B</div>
            </div>

            <div className="flex justify-between w-full flex-1 gap-2 sm:gap-4">
              {/* CH A STRIP */}
              <div className="flex flex-1 gap-1 sm:gap-2">
                <div className="flex flex-col items-center h-full justify-center pb-4">
                  <div className="h-32 sm:h-40 w-4 flex items-center justify-center relative">
                    <input type="range" min="0" max="1.5" step="0.01" value={volA} onChange={(e) => handleVolumeChange('A', parseFloat(e.target.value))} onDoubleClick={() => handleVolumeChange('A', 1.0)} className="w-32 sm:w-40 h-1.5 absolute rotate-270 -rotate-90 appearance-none cursor-pointer accent-blue-500 bg-slate-800 rounded-full" />
                  </div>
                  <span className="text-[8px] sm:text-[9px] mt-2 font-bold text-slate-500">VOL</span>
                </div>
                
                <div className="flex flex-col justify-between flex-1 py-1 gap-2 sm:gap-3">
                  {[
                    { band: 'high', label: 'HI', value: eqA.high, handler: handleEqChange },
                    { band: 'mid', label: 'MID', value: eqA.mid, handler: handleEqChange },
                    { band: 'low', label: 'LOW', value: eqA.low, handler: handleEqChange }
                  ].map(({ band, label, value, handler }) => (
                    <div key={`eqa-${band}`} className="flex flex-col gap-1">
                      <span className="text-[8px] sm:text-[9px] text-slate-400 font-bold">{label}</span>
                      <input type="range" min="-24" max="6" step="0.1" value={value} onChange={(e) => handler('A', band as 'high'|'mid'|'low', parseFloat(e.target.value))} onDoubleClick={() => handler('A', band as 'high'|'mid'|'low', 0)} className="w-full h-1 sm:h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-slate-300 shadow-inner" />
                    </div>
                  ))}
                  <div className="flex flex-col gap-1 mt-auto">
                    <span className="text-[8px] sm:text-[9px] text-blue-400 font-bold">FLT</span>
                    <input type="range" min="-100" max="100" step="1" value={filterA} onChange={(e) => handleFilterChange('A', parseFloat(e.target.value))} onDoubleClick={() => handleFilterChange('A', 0)} className="w-full h-1 sm:h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-blue-500 shadow-inner" />
                  </div>
                </div>
              </div>

              {/* CH B STRIP */}
              <div className="flex flex-1 gap-1 sm:gap-2 flex-row-reverse">
                <div className="flex flex-col items-center h-full justify-center pb-4">
                  <div className="h-32 sm:h-40 w-4 flex items-center justify-center relative">
                    <input type="range" min="0" max="1.5" step="0.01" value={volB} onChange={(e) => handleVolumeChange('B', parseFloat(e.target.value))} onDoubleClick={() => handleVolumeChange('B', 1.0)} className="w-32 sm:w-40 h-1.5 absolute rotate-270 -rotate-90 appearance-none cursor-pointer accent-cyan-500 bg-slate-800 rounded-full" />
                  </div>
                  <span className="text-[8px] sm:text-[9px] mt-2 font-bold text-slate-500">VOL</span>
                </div>
                
                <div className="flex flex-col justify-between flex-1 py-1 gap-2 sm:gap-3 items-end">
                  {[
                    { band: 'high', label: 'HI', value: eqB.high, handler: handleEqChange },
                    { band: 'mid', label: 'MID', value: eqB.mid, handler: handleEqChange },
                    { band: 'low', label: 'LOW', value: eqB.low, handler: handleEqChange }
                  ].map(({ band, label, value, handler }) => (
                    <div key={`eqb-${band}`} className="flex flex-col gap-1 items-end w-full">
                      <span className="text-[8px] sm:text-[9px] text-slate-400 font-bold">{label}</span>
                      <input type="range" min="-24" max="6" step="0.1" value={value} onChange={(e) => handler('B', band as 'high'|'mid'|'low', parseFloat(e.target.value))} onDoubleClick={() => handler('B', band as 'high'|'mid'|'low', 0)} className="w-full h-1 sm:h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-slate-300 shadow-inner rotate-180" />
                    </div>
                  ))}
                  <div className="flex flex-col gap-1 mt-auto items-end w-full">
                    <span className="text-[8px] sm:text-[9px] text-cyan-400 font-bold">FLT</span>
                    <input type="range" min="-100" max="100" step="1" value={filterB} onChange={(e) => handleFilterChange('B', parseFloat(e.target.value))} onDoubleClick={() => handleFilterChange('B', 0)} className="w-full h-1 sm:h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-cyan-500 shadow-inner rotate-180" />
                  </div>
                </div>
              </div>
            </div>

            {/* Crossfader */}
            <div className="w-full mt-4 sm:mt-6 bg-slate-950/80 px-4 py-3 sm:py-4 rounded-lg border border-slate-800/80 shadow-inner">
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={xfade} 
                onChange={handleCrossfadeChange}
                onDoubleClick={() => handleCrossfadeChange({ target: { value: '0.5' } } as React.ChangeEvent<HTMLInputElement>)}
                className="w-full h-2 sm:h-2.5 bg-slate-900 rounded-full appearance-none cursor-pointer accent-slate-400 shadow-inner"
              />
            </div>
          </div>

          {/* Deck B */}
          <div className={`p-3 sm:p-4 lg:p-5 rounded-xl border flex flex-col gap-3 lg:gap-4 transition-colors ${deckB.isPlaying ? 'bg-slate-900/80 border-blue-500/30' : 'bg-slate-900/40 border-slate-800/80'}`}>
            
            {/* 1. Waveform */}
            <div className="h-10 sm:h-12 lg:h-16 w-full shrink-0 rounded overflow-hidden shadow-inner bg-slate-950/50">
              <Waveform 
                peaks={deckB.peaks}
                currentTime={progressB.current || 0}
                duration={progressB.max || 0}
                introMarker={deckB.introMarker}
                outroMarker={deckB.outroMarker}
                color="#06b6d4"
                onSeek={(time) => handleSeek('B', time)}
                onMarkerChange={(type, time) => setDeckB(prev => ({ ...prev, [type === 'intro' ? 'introMarker' : 'outroMarker']: time }))}
              />
            </div>

            {/* 2. Metadata & Time */}
            <div className="flex justify-between items-start flex-row-reverse text-right">
              <div className="flex gap-3 flex-row-reverse">
                <div className="w-10 h-10 rounded bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-500 font-black text-lg shrink-0">B</div>
                <div className="overflow-hidden">
                  <h2 className="text-base sm:text-lg font-bold text-white truncate w-40 sm:w-48">{deckB.track?.title || 'No Track'}</h2>
                  <p className="text-xs sm:text-sm text-slate-400 truncate">{deckB.track?.artist || 'Ready to load'}</p>
                  {deckB.track && (
                    <div className="flex flex-col mt-0.5">
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] sm:text-[10px] text-slate-500 font-mono leading-tight justify-end">
                        {deckB.track.album && <span><span className="text-slate-600">ALB:</span> {deckB.track.album}</span>}
                        {deckB.track.year && <span><span className="text-slate-600">YR:</span> {deckB.track.year}</span>}
                        {deckB.track.genre && <span><span className="text-slate-600">GEN:</span> {deckB.track.genre}</span>}
                        {deckB.track.key && <span><span className="text-slate-600">KEY:</span> {deckB.track.key}</span>}
                        {deckB.track.fileType && <span><span className="text-slate-600">FMT:</span> {deckB.track.fileType}</span>}
                        {deckB.track.bitrate && <span><span className="text-slate-600">KBPS:</span> {Math.round(deckB.track.bitrate / 1000)}</span>}
                        {deckB.track.replayGain !== undefined && <span><span className="text-slate-600">GAIN:</span> {deckB.track.replayGain.toFixed(1)}dB</span>}
                      </div>
                      <div className="flex gap-3 mt-1 text-[9px] sm:text-[10px] font-mono text-slate-400 justify-end flex-row-reverse">
                        <span>{formatAdjustedTime(progressB.current, pitchB)} / {formatAdjustedTime(progressB.max, pitchB)} <span className="text-slate-500">:TIME</span></span>
                        <span>{formatAdjustedTime(deckB.introMarker, pitchB)} <span className="text-slate-500">:IN</span></span>
                        <span>{formatAdjustedTime(progressB.max - deckB.outroMarker, pitchB)} <span className="text-slate-500">:OUT</span></span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-left shrink-0">
                <div className="text-xl sm:text-2xl font-mono font-light text-cyan-400">{deckB.track ? bpmB.toFixed(1) : '---'}</div>
                <div className="text-[9px] sm:text-[10px] uppercase text-slate-500 font-bold tracking-widest">BPM</div>
              </div>
            </div>
            
            {/* 3. Transport, Performance Pads & Pitch */}
            <div className="flex justify-between items-center flex-row-reverse bg-slate-950/50 p-2 sm:p-3 rounded-lg border border-slate-800/50 mt-auto">
              <button 
                disabled={!deckB.track}
                onClick={() => toggleDeck('B')}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white shadow-inner border border-slate-700/50 shrink-0"
              >
                {deckB.isPlaying ? <Square size={20} fill="currentColor" className="text-blue-500" /> : <Play size={22} fill="currentColor" className="mr-1" />}
              </button>

              <div className="flex gap-2 items-center mx-2 sm:mx-4 flex-1 justify-center flex-row-reverse">
                <button
                  onMouseDown={() => handleFxToggle('B', 'roll')}
                  onMouseUp={() => handleFxToggle('B', 'roll')}
                  onMouseLeave={() => fxB.rollOn && handleFxToggle('B', 'roll')}
                  className={`w-12 h-10 sm:w-14 sm:h-12 rounded flex flex-col items-center justify-center border font-bold transition-all text-[8px] sm:text-[9px] ${fxB.rollOn ? 'bg-amber-500 text-white border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.6)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                >
                  <span>ROLL</span><span>1/8</span>
                </button>
                <button
                  onClick={() => handleFxToggle('B', 'gate')}
                  className={`w-12 h-10 sm:w-14 sm:h-12 rounded flex flex-col items-center justify-center border font-bold transition-all text-[8px] sm:text-[9px] ${fxB.gateOn ? 'bg-purple-500 text-white border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.6)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                >
                  <span>TRANCE</span><span>GATE</span>
                </button>
                <button
                  onMouseDown={() => handleFxToggle('B', 'siren')}
                  onMouseUp={() => handleFxToggle('B', 'siren')}
                  onMouseLeave={() => fxB.sirenOn && handleFxToggle('B', 'siren')}
                  className={`w-12 h-10 sm:w-14 sm:h-12 rounded flex flex-col items-center justify-center border font-bold transition-all text-[8px] sm:text-[9px] ${fxB.sirenOn ? 'bg-red-500 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.6)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                >
                  <span>DUB</span><span>SIREN</span>
                </button>
              </div>

              <div className="flex gap-3 sm:gap-4 items-center flex-row-reverse shrink-0">
                <div className="flex flex-col gap-1.5 sm:gap-2">
                  <button 
                    onMouseDown={() => handleSyncDown('B')}
                    onMouseUp={() => handleSyncUp('B')}
                    onMouseLeave={() => handleSyncUp('B')}
                    className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded text-[9px] sm:text-[10px] font-bold transition-colors flex items-center gap-1 sm:gap-1.5 border ${syncB ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.5)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                  >
                    <Link size={10} className="sm:w-3 sm:h-3" /> SYNC
                  </button>
                  <button 
                    onClick={() => handleMasterToggle('B')}
                    className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded text-[9px] sm:text-[10px] font-bold transition-colors flex items-center gap-1 sm:gap-1.5 border ${masterDeck === 'B' ? 'bg-amber-600 text-white border-amber-500 shadow-[0_0_10px_rgba(217,119,6,0.5)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                  >
                    <Lock size={10} className="sm:w-3 sm:h-3" /> MASTER
                  </button>
                </div>
                
                <div className="flex flex-col items-center gap-1 w-20 sm:w-24">
                  <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold tracking-widest">PITCH</span>
                  <input 
                    type="range" 
                    min="0.84" 
                    max="1.16" 
                    step="0.001" 
                    value={pitchB} 
                    onChange={(e) => handlePitchChange('B', parseFloat(e.target.value))} 
                    onDoubleClick={() => handlePitchChange('B', 1.0)}
                    className="w-full h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-cyan-500 shadow-inner" 
                  />
                  <span className="text-[9px] sm:text-[10px] font-mono text-slate-500">{((pitchB - 1) * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* 4. Parametric FX Bay */}
            <div className="flex gap-2 sm:gap-3 p-2 sm:p-3 bg-slate-900/80 rounded-lg border border-slate-800/80 flex-row-reverse">
              {/* Echo */}
              <div className="flex flex-col gap-1.5 sm:gap-2 flex-1 border-l border-slate-800/50 pl-2 sm:pl-3">
                <div className="flex justify-between items-center flex-row-reverse">
                  <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-blue-400">ECHO</span>
                  <button 
                    onClick={() => handleFxToggle('B', 'delay')}
                    className={`w-6 sm:w-8 h-3 sm:h-4 rounded-full transition-colors ${fxB.delayOn ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'bg-slate-700'}`}
                  ></button>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 flex-row-reverse">
                  <span className="text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7 text-right">TIME</span>
                  <input type="range" min="0.05" max="1" step="0.01" value={fxB.delayTime} onChange={(e) => handleFxParamChange('B', 'delay', 'time', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('B', 'delay', 'time', 0.25)} className="flex-1 h-1 bg-slate-800 rounded appearance-none accent-slate-400 rotate-180" />
                </div>
                <div className="flex items-center gap-1 sm:gap-2 flex-row-reverse">
                  <span className="text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7 text-right">FDBK</span>
                  <input type="range" min="0" max="0.95" step="0.01" value={fxB.delayFeedback} onChange={(e) => handleFxParamChange('B', 'delay', 'feedback', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('B', 'delay', 'feedback', 0.5)} className="flex-1 h-1 bg-slate-800 rounded appearance-none accent-slate-400 rotate-180" />
                </div>
              </div>

              {/* Reverb */}
              <div className="flex flex-col gap-1.5 sm:gap-2 flex-1 border-l border-slate-800/50 pl-2 sm:pl-3">
                <div className="flex justify-between items-center flex-row-reverse">
                  <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-cyan-400">REVERB</span>
                  <button 
                    onClick={() => handleFxToggle('B', 'reverb')}
                    className={`w-6 sm:w-8 h-3 sm:h-4 rounded-full transition-colors ${fxB.reverbOn ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]' : 'bg-slate-700'}`}
                  ></button>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 mt-auto mb-0.5 sm:mb-1 flex-row-reverse">
                  <span className="text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7 text-right">SIZE</span>
                  <input type="range" min="0" max="1" step="0.01" value={fxB.reverbSize} onChange={(e) => handleFxParamChange('B', 'reverb', 'size', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('B', 'reverb', 'size', 0.7)} className="flex-1 h-1 bg-slate-800 rounded appearance-none accent-slate-400 rotate-180" />
                </div>
              </div>

              {/* Phaser */}
              <div className="flex flex-col gap-1.5 sm:gap-2 flex-1">
                <div className="flex justify-between items-center flex-row-reverse">
                  <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-fuchsia-400">PHASER</span>
                  <button 
                    onClick={() => handleFxToggle('B', 'phaser')}
                    className={`w-6 sm:w-8 h-3 sm:h-4 rounded-full transition-colors ${fxB.phaserOn ? 'bg-fuchsia-500 shadow-[0_0_8px_rgba(217,70,239,0.6)]' : 'bg-slate-700'}`}
                  ></button>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 mt-auto mb-0.5 sm:mb-1 flex-row-reverse">
                  <span className="text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7 text-right">RATE</span>
                  <input type="range" min="0.1" max="10" step="0.1" value={fxB.phaserRate} onChange={(e) => handleFxParamChange('B', 'phaser', 'rate', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('B', 'phaser', 'rate', 0.5)} className="flex-1 h-1 bg-slate-800 rounded appearance-none accent-slate-400 rotate-180" />
                </div>
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

            {/* Tracks Context Menu */}
            {activeTab === 'tracks' && (
              <div className="p-4 mt-auto border-t border-slate-800">
                <div className="flex flex-col gap-2">
                  <button onClick={handlePreScanAll} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium flex justify-center items-center gap-2">
                    <Scan size={14} /> Scan Missing Metadata
                  </button>
                </div>
              </div>
            )}

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
          <div className="flex-1 overflow-auto bg-slate-900/80 p-2 sm:p-4">
            <div className="grid grid-cols-[1fr_1fr_80px_80px_100px] gap-4 px-4 py-2 border-b border-slate-800 text-xs font-bold text-slate-500 tracking-wider">
              <div>TITLE</div>
              <div>ARTIST</div>
              <div>BPM</div>
              <div>TIME</div>
              <div className="text-center">LOAD</div>
            </div>
            <div className="flex flex-col mt-2">
              {displayTracks.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-500 text-sm">
                  {activeTab === 'playlists' ? 'The active queue is empty. Load a directory or playlist.' : 'The database is empty. Load a directory.'}
                </div>
              ) : (
                displayTracks.map((track) => (
                  <div key={track.id} className="grid grid-cols-[1fr_1fr_80px_80px_100px] gap-4 px-4 py-2 hover:bg-slate-800/50 rounded-md items-center group transition">
                    <div className="font-medium text-sm text-slate-200 truncate">{track.title}</div>
                    <div className="text-xs text-slate-400 truncate">{track.artist}</div>
                    <div className="font-mono text-xs text-slate-400">{track.bpm}</div>
                    <div className="font-mono text-xs text-slate-400">{typeof track.duration === 'number' ? formatDuration(track.duration) : track.duration}</div>
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
