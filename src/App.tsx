import React, { useState, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { Play, Square, Music, ArrowLeftSquare, ArrowRightSquare, ToggleLeft, ToggleRight, FolderSearch, FolderOpen, Save, ListMusic, Scan, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './services/Database';
import { metadataScanner } from './services/MetadataScanner';
import { AudioEngine } from './services/AudioEngine';
import { useAutoMixer } from './hooks/useAutoMixer';
import { loadLocalDirectory, createTrackUrl, type FileSystemFileHandle } from './services/FileManager';
import { parseM3U, generateM3U } from './utils/m3uParser';
import type { Track, TrackMetadata, TrackSegment } from './types/mixer';

import { Waveform } from './components/Waveform';
import { useRegisterSW } from 'virtual:pwa-register/react';

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
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: unknown) {
      console.log('SW Registered:', r);
    },
    onRegisterError(error: unknown) {
      console.error('SW registration error', error);
    },
  });

  const [library, setLibrary] = useState<Track[]>([]);
  const [deckA, setDeckA] = useState<{ track: Track | null; isPlaying: boolean; introMarker: number; outroMarker: number; peaks: Float32Array | null; segments: TrackSegment[] }>({ track: null, isPlaying: false, introMarker: 0, outroMarker: 0, peaks: null, segments: [] });
  const [deckB, setDeckB] = useState<{ track: Track | null; isPlaying: boolean; introMarker: number; outroMarker: number; peaks: Float32Array | null; segments: TrackSegment[] }>({ track: null, isPlaying: false, introMarker: 0, outroMarker: 0, peaks: null, segments: [] });
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
  const [muteA, setMuteA] = useState(false);
  const [muteB, setMuteB] = useState(false);
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
  const [sessionStarted, setSessionStarted] = useState(false);
  
  const [activeSessionTrackIds, setActiveSessionTrackIds] = useState<string[]>([]);
  const [sessionHandles, setSessionHandles] = useState<Record<string, { fileHandle?: FileSystemFileHandle, rawFile?: File }>>({});
  
  const dbTracksCount = useLiveQuery(() => db.tracks.count()) || 0;
  const savedPlaylists = useLiveQuery(() => db.playlists.toArray()) || [];
  const rawSessionTracks = useLiveQuery(
    async () => {
      if (activeSessionTrackIds.length === 0) return [];
      return await db.tracks.where('id').anyOf(activeSessionTrackIds).toArray();
    },
    [activeSessionTrackIds]
  ) || [];

  const sessionTracks = rawSessionTracks.map(t => ({ ...t, ...sessionHandles[t.id] }));
  const displayTracks: (Track | TrackMetadata)[] = activeTab === 'tracks' ? (sessionStarted ? sessionTracks : []) : library;

  const [mixerHeightPct, setMixerHeightPct] = useState(65);
  const [isLibraryMaximized, setIsLibraryMaximized] = useState(false);
  const dragRef = useRef<boolean>(false);

  const fallbackDirInputRef = useRef<HTMLInputElement>(null);
  const fallbackM3uInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<{ time: number, multiplier: number }>({ time: 0, multiplier: 1 });

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
    }, 50);
    return () => clearInterval(interval);
  }, [isAutomixEnabled]);

  useEffect(() => {
    if (!deckA.track || (!deckA.peaks && deckA.introMarker === 0 && deckA.outroMarker === 0 && deckA.segments.length === 0)) return;
    
    const trackId = deckA.track.id;
    const intro = deckA.introMarker;
    const outro = deckA.outroMarker;
    const peaks = deckA.peaks;
    const segments = deckA.segments;
    
    const timeout = setTimeout(() => {
      db.tracks.update(trackId, {
        waveformPeaks: peaks || undefined,
        segments: segments.length > 0 ? segments : undefined,
        introMarker: intro,
        outroMarker: outro
      }).catch(console.error);
    }, 1000);
    return () => clearTimeout(timeout);
  }, [deckA.track?.id, deckA.peaks, deckA.segments, deckA.introMarker, deckA.outroMarker]);

  useEffect(() => {
    if (!deckB.track || (!deckB.peaks && deckB.introMarker === 0 && deckB.outroMarker === 0 && deckB.segments.length === 0)) return;
    
    const trackId = deckB.track.id;
    const intro = deckB.introMarker;
    const outro = deckB.outroMarker;
    const peaks = deckB.peaks;
    const segments = deckB.segments;
    
    const timeout = setTimeout(() => {
      db.tracks.update(trackId, {
        waveformPeaks: peaks || undefined,
        segments: segments.length > 0 ? segments : undefined,
        introMarker: intro,
        outroMarker: outro
      }).catch(console.error);
    }, 1000);
    return () => clearTimeout(timeout);
  }, [deckB.track?.id, deckB.peaks, deckB.segments, deckB.introMarker, deckB.outroMarker]);

  const handleRestoreSession = async () => {
    const allTracks = await db.tracks.toArray();
    setActiveSessionTrackIds(allTracks.map(t => t.id));
    setSessionStarted(true);
  };

  const handleLoadDirectory = async () => {
    if ('showDirectoryPicker' in window) {
      try {
        const handles = await loadLocalDirectory();
        if (handles.length > 0) {
          const newIds: string[] = [];
          const newHandles: Record<string, { fileHandle: FileSystemFileHandle }> = {};
          const unScanned: { id: string, fileHandle: FileSystemFileHandle, filePath: string }[] = [];

          for (let i = 0; i < handles.length; i++) {
             const handle = handles[i];
             const cached = await db.tracks.where('fileName').equals(handle.name).first();
             if (cached) {
                newIds.push(cached.id);
                newHandles[cached.id] = { fileHandle: handle };
                if (!cached.isScanned || cached.duration === 0) {
                  unScanned.push({ id: cached.id, fileHandle: handle, filePath: handle.name });
                }
             } else {
                const id = `temp-${Date.now()}-${i}`;
                await db.tracks.put({
                  id,
                  filePath: handle.name,
                  fileName: handle.name,
                  title: handle.name.replace(/\.[^/.]+$/, ""),
                  artist: 'Unknown Artist',
                  bpm: 120,
                  duration: 0
                });
                newIds.push(id);
                newHandles[id] = { fileHandle: handle };
                unScanned.push({ id, fileHandle: handle, filePath: handle.name });
             }
          }
          
          setSessionHandles(prev => ({ ...prev, ...newHandles }));
          setActiveSessionTrackIds(prev => Array.from(new Set([...prev, ...newIds])));
          setSessionStarted(true);
          setActiveTab('tracks');
          
          const processBackgroundScan = async () => {
            console.log(`[App] Beginning background scan for ${unScanned.length} items`);
            for (const t of unScanned) {
              try {
                console.log(`[App] Calling metadataScanner for ${t.filePath}`);
                await metadataScanner.scanFileHandle(t.fileHandle, t.filePath, undefined, t.id);
                console.log(`[App] Successfully scanned ${t.filePath}`);
              } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                console.error("[App] Background scan failed:", errMsg);
              }
            }
            console.log(`[App] Background scan loop finished`);
          };
          processBackgroundScan();
          return;
        }
      } catch (e) {
        console.warn('Directory picker failed', e);
      }
    }
    fallbackDirInputRef.current?.click();
  };

  const handleFallbackFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const audioFiles = files.filter(f => ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/ogg'].includes(f.type) || f.name.match(/\.(mp3|wav|flac|ogg)$/i));
    
    if (audioFiles.length === 0) {
      alert("No valid audio files found in selection.");
      return;
    }

    const newIds: string[] = [];
    const newHandles: Record<string, { rawFile: File }> = {};
    const unScanned: { id: string, rawFile: File, filePath: string }[] = [];

    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      const id = `fallback-${Date.now()}-${i}`;
      await db.tracks.put({
        id,
        filePath: file.name,
        fileName: file.name,
        title: file.name.replace(/\.[^/.]+$/, ""),
        artist: 'Local File',
        bpm: 120,
        duration: 0
      });
      newIds.push(id);
      newHandles[id] = { rawFile: file };
      unScanned.push({ id, rawFile: file, filePath: file.name });
    }

    setSessionHandles(prev => ({ ...prev, ...newHandles }));
    setActiveSessionTrackIds(prev => Array.from(new Set([...prev, ...newIds])));
    setSessionStarted(true);
    setActiveTab('tracks');

    const processFallbackBackgroundScan = async () => {
      for (const t of unScanned) {
        try {
          await metadataScanner.scanFileHandle(undefined, t.filePath, t.rawFile, t.id);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          console.error("Fallback background scan failed:", errMsg);
        }
      }
    };
    processFallbackBackgroundScan();
  };

  const handlePreScanAll = async () => {
    console.log(`[App] Manual scan triggered`);
    const unscannedSession = sessionTracks.filter(t => (t.fileHandle || t.rawFile) && (!t.isScanned || String(t.duration) === '0' || String(t.duration) === '0:00'));
    const unscannedLibrary = library.filter(t => t.rawFile && (!('isScanned' in t && (t as unknown as TrackMetadata).isScanned) || String(t.duration) === '0' || String(t.duration) === '0:00'));

    console.log(`[App] Found ${unscannedSession.length} unscanned session tracks and ${unscannedLibrary.length} unscanned library tracks`);

    if (unscannedSession.length === 0 && unscannedLibrary.length === 0) {
      alert("All tracks are already fully scanned!");
      return;
    }

    for (const t of unscannedSession) {
      if (t.fileHandle || t.rawFile) {
        const filePath = t.filePath || t.fileHandle?.name || t.rawFile?.name || 'unknown';
        try {
          console.log(`[App] Requesting manual scan for ${filePath}`);
          await metadataScanner.scanFileHandle(t.fileHandle, filePath, t.rawFile, t.id);
          console.log(`[App] Finished manual scan for ${filePath}`);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          console.error("[App] Manual scan failed:", errMsg);
          alert(`Scan failed for ${filePath}: ${errMsg}`);
        }
      }
    }

    for (const t of unscannedLibrary) {
      if (t.rawFile) {
        try {
          const scanned = await metadataScanner.scanFileHandle(undefined, t.rawFile.name, t.rawFile, t.id);
          setLibrary(prev => prev.map(lt => lt.id === t.id ? { ...lt, ...scanned, duration: formatDuration(scanned.duration) } : lt));
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          console.error("Library scan failed:", errMsg);
          alert(`Scan failed for ${t.rawFile.name}: ${errMsg}`);
        }
      }
    }
  };

  const handleClearCache = async () => {
    if (window.confirm("Are you sure you want to clear the entire library cache? This will remove all scanned tracks, waveforms, and markers.")) {
      try {
        await db.tracks.clear();
        setActiveSessionTrackIds([]);
        setSessionHandles({});
        setSessionStarted(false);
      } catch (e) {
        console.error("Failed to clear cache", e);
      }
    }
  };

  const applyM3U = async (content: string) => {
    const paths = parseM3U(content);
    const dbTracks = await db.tracks.toArray();
    const newLibrary = paths.map(path => {
      const filename = path.split('\\').pop()?.split('/').pop();
      const sessionMatch = sessionTracks.find(t => t.fileName === filename || t.filePath === path);
      if (sessionMatch) return sessionMatch as unknown as Track;
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
        
        // Save to DB so it appears in the sidebar permanently
        await db.playlists.put({ id: handle.name, name: handle.name.replace(/\.[^/.]+$/, ""), content: content });
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
    reader.onload = async (evt) => {
      const content = evt.target?.result as string;
      applyM3U(content);
      // Save to DB so it appears in the sidebar permanently
      await db.playlists.put({ id: file.name, name: file.name.replace(/\.[^/.]+$/, ""), content: content });
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
      
      await db.playlists.put({ id: handle.name, name: handle.name.replace(/\.[^/.]+$/, ""), content: m3uContent });
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
          const scanned = await metadataScanner.scanFileHandle(inputTrack.fileHandle, filePath, inputTrack.rawFile, inputTrack.id);
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
      } else if (!trackUrl && track.rawFile) {
        trackUrl = URL.createObjectURL(track.rawFile);
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
        
        const segments = track.segments || engine.deckA.segments;
        const intro = track.introMarker !== undefined ? track.introMarker : 0;
        let outro = track.outroMarker;
        if (outro === undefined) {
          const outroSeg = segments.find(s => s.type === 'outro');
          outro = outroSeg ? outroSeg.start : (engine.deckA.player.buffer ? Math.max(0, engine.deckA.player.buffer.duration - 15) : 0);
        }
        
        setDeckA(prev => ({ ...prev, peaks: track.waveformPeaks || engine.deckA.peaks, segments, introMarker: intro, outroMarker: outro }));
      } else {
        setDeckB(prev => ({ ...prev, track }));
        await engine.deckB.loadTrack(trackUrl);
        engine.deckB.originalBpm = track.bpm;
        engine.deckB.setTrackGainDb(track.replayGain || 0);
        setPitchB(1.0);
        engine.deckB.setPlaybackRate(1.0);

        const segments = track.segments || engine.deckB.segments;
        const intro = track.introMarker !== undefined ? track.introMarker : 0;
        let outro = track.outroMarker;
        if (outro === undefined) {
          const outroSeg = segments.find(s => s.type === 'outro');
          outro = outroSeg ? outroSeg.start : (engine.deckB.player.buffer ? Math.max(0, engine.deckB.player.buffer.duration - 15) : 0);
        }

        setDeckB(prev => ({ ...prev, peaks: track.waveformPeaks || engine.deckB.peaks, segments, introMarker: intro, outroMarker: outro }));
      }
    } catch (err) {
      console.error("Audio load error:", err);
      alert("Failed to load track. Please check file permissions or try re-loading the directory.");
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

  const handleMuteToggle = (deckId: 'A' | 'B') => {
    const engine = AudioEngine.getInstance();
    if (deckId === 'A') {
      const newMute = !muteA;
      setMuteA(newMute);
      engine.deckA.player.mute = newMute;
    } else {
      const newMute = !muteB;
      setMuteB(newMute);
      engine.deckB.player.mute = newMute;
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
      let finalPitch = newPitch;
      if (newPitch !== 1.0 && audio.deckA.originalBpm > 0) {
        const rawBpm = newPitch * audio.deckA.originalBpm;
        const snappedBpm = Math.round(rawBpm * 10) / 10;
        finalPitch = snappedBpm / audio.deckA.originalBpm;
      }

      setPitchA(finalPitch);
      audio.deckA.setPlaybackRate(finalPitch);
      
      if (syncB || masterDeck === 'A') {
        const newBpmA = audio.deckA.currentBpm;
        if (audio.deckB.originalBpm > 0) {
          const requiredPitchB = newBpmA / audio.deckB.originalBpm;
          setPitchB(requiredPitchB); // Let sync have exact floating point, or should we snap it too? We'll let it be exact to match BPM
          audio.deckB.setPlaybackRate(requiredPitchB);
        }
      }
    } else {
      let finalPitch = newPitch;
      if (newPitch !== 1.0 && audio.deckB.originalBpm > 0) {
        const rawBpm = newPitch * audio.deckB.originalBpm;
        const snappedBpm = Math.round(rawBpm * 10) / 10;
        finalPitch = snappedBpm / audio.deckB.originalBpm;
      }

      setPitchB(finalPitch);
      audio.deckB.setPlaybackRate(finalPitch);
      
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

  const handlePitchNudge = (deckId: 'A' | 'B', bpmDelta: number) => {
    const audio = AudioEngine.getInstance();
    const deck = deckId === 'A' ? audio.deckA : audio.deckB;
    const currentPitch = deckId === 'A' ? pitchA : pitchB;
    
    if (deck.originalBpm > 0) {
      const currentBpm = deck.originalBpm * currentPitch;
      const targetBpm = currentBpm + bpmDelta;
      let newPitch = targetBpm / deck.originalBpm;
      newPitch = Math.max(0.84, Math.min(1.16, newPitch));
      handlePitchChange(deckId, newPitch);
    }
  };

  const handleSliderWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    if (e.currentTarget.type !== 'range') return;
    e.preventDefault();
    const target = e.currentTarget;
    const min = parseFloat(target.min || "0");
    const max = parseFloat(target.max || "100");
    const baseStep = parseFloat(target.step || "1");
    
    if (isNaN(baseStep)) return;

    const now = Date.now();
    const timeSinceLast = now - scrollRef.current.time;
    if (timeSinceLast < 50) {
      scrollRef.current.multiplier = Math.min(20, scrollRef.current.multiplier + 1);
    } else if (timeSinceLast > 250) {
      scrollRef.current.multiplier = 1;
    }
    scrollRef.current.time = now;
    
    // Scale step by multiplier, cap max step at 10% of total range to avoid wild jumps
    let effectiveStep = baseStep * scrollRef.current.multiplier;
    const maxAllowedStep = (max - min) * 0.1;
    if (effectiveStep > maxAllowedStep) effectiveStep = maxAllowedStep;
    
    const currentVal = parseFloat(target.value);
    const direction = e.deltaY > 0 ? -1 : 1;
    let nextVal = currentVal + (direction * effectiveStep);
    nextVal = Math.max(min, Math.min(max, nextVal));
    
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(target, nextVal.toString());
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
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
      deck.setRoll(newState, 8);
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

  const getNextTrack = (currentTrackId?: string): Track | null => {
    if (displayTracks.length === 0) return null;
    if (!currentTrackId) return displayTracks[0] as Track;
    const currentIndex = displayTracks.findIndex(t => t.id === currentTrackId);
    if (currentIndex === -1) return displayTracks[0] as Track;
    const nextIndex = (currentIndex + 1) % displayTracks.length;
    return displayTracks[nextIndex] as Track;
  };

  const handleTransitionComplete = (winningDeck: 'A' | 'B', nextTrack: Track) => {
    const engine = AudioEngine.getInstance();
    if (winningDeck === 'A') {
      const segments = nextTrack.segments || engine.deckA.segments;
      const defaultOutro = segments.find(s => s.type === 'outro')?.start || (engine.deckA.player.buffer ? Math.max(0, engine.deckA.player.buffer.duration - 15) : 0);
      setDeckA(prev => ({ ...prev, track: nextTrack, isPlaying: true, introMarker: nextTrack.introMarker || 0, outroMarker: nextTrack.outroMarker || defaultOutro, peaks: nextTrack.waveformPeaks || engine.deckA.peaks, segments }));
      setDeckB(prev => ({ ...prev, isPlaying: false }));
      setXfade(0);

      // Pre-load next track for continuous automix
      if (isAutomixEnabled) {
        const next = getNextTrack(nextTrack.id);
        if (next) handleLoadTrack(next, 'B');
      }
    } else {
      const segments = nextTrack.segments || engine.deckB.segments;
      const defaultOutro = segments.find(s => s.type === 'outro')?.start || (engine.deckB.player.buffer ? Math.max(0, engine.deckB.player.buffer.duration - 15) : 0);
      setDeckB(prev => ({ ...prev, track: nextTrack, isPlaying: true, introMarker: nextTrack.introMarker || 0, outroMarker: nextTrack.outroMarker || defaultOutro, peaks: nextTrack.waveformPeaks || engine.deckB.peaks, segments }));
      setDeckA(prev => ({ ...prev, isPlaying: false }));
      setXfade(1);

      // Pre-load next track for continuous automix
      if (isAutomixEnabled) {
        const next = getNextTrack(nextTrack.id);
        if (next) handleLoadTrack(next, 'A');
      }
    }
  };

  const handleTransitionStart = (winningDeck: 'A' | 'B', nextTrack: Track) => {
    const engine = AudioEngine.getInstance();
    if (winningDeck === 'A') {
      const segments = nextTrack.segments || engine.deckA.segments;
      const defaultOutro = segments.find(s => s.type === 'outro')?.start || (engine.deckA.player.buffer ? Math.max(0, engine.deckA.player.buffer.duration - 15) : 0);
      setDeckA(prev => ({ ...prev, track: nextTrack, isPlaying: true, introMarker: nextTrack.introMarker || 0, outroMarker: nextTrack.outroMarker || defaultOutro, peaks: nextTrack.waveformPeaks || engine.deckA.peaks, segments }));
    } else {
      const segments = nextTrack.segments || engine.deckB.segments;
      const defaultOutro = segments.find(s => s.type === 'outro')?.start || (engine.deckB.player.buffer ? Math.max(0, engine.deckB.player.buffer.duration - 15) : 0);
      setDeckB(prev => ({ ...prev, track: nextTrack, isPlaying: true, introMarker: nextTrack.introMarker || 0, outroMarker: nextTrack.outroMarker || defaultOutro, peaks: nextTrack.waveformPeaks || engine.deckB.peaks, segments }));
    }
  };

  const handleTransitionCancel = (cancelledDeck: 'A' | 'B') => {
    if (cancelledDeck === 'A') {
      setDeckA(prev => ({ ...prev, isPlaying: false }));
    } else {
      setDeckB(prev => ({ ...prev, isPlaying: false }));
    }
  };

  useEffect(() => {
    if (!isAutomixEnabled) return;
    
    // Use a timeout to avoid immediate state loops during React renders
    const timer = setTimeout(() => {
      // If one deck has a track and is playing, and the other is empty, auto-load the next track into the empty deck
      if (deckA.track && !deckB.track) {
        const next = getNextTrack(deckA.track.id);
        if (next) handleLoadTrack(next, 'B');
      } else if (deckB.track && !deckA.track) {
        const next = getNextTrack(deckB.track.id);
        if (next) handleLoadTrack(next, 'A');
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [isAutomixEnabled, deckA.track, deckB.track]);

  useAutoMixer({
    deckAState: deckA,
    deckBState: deckB,
    library: displayTracks as Track[],
    isAutomixEnabled,
    onTransitionStart: handleTransitionStart,
    onTransitionComplete: handleTransitionComplete,
    onTransitionCancel: handleTransitionCancel,
    onPitchChange: handlePitchChange
  });

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 font-sans overflow-hidden select-none">
      
      {needRefresh && (
        <div className="absolute top-4 right-4 z-50 bg-blue-600 text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-4 border border-blue-400/30">
          <span className="text-sm font-bold tracking-wide">Update Available</span>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 bg-white text-blue-900 font-bold hover:bg-blue-50 rounded text-xs transition" onClick={() => updateServiceWorker(true)}>Reload App</button>
            <button className="px-3 py-1.5 hover:bg-black/20 rounded text-xs font-medium transition" onClick={() => setNeedRefresh(false)}>Dismiss</button>
          </div>
        </div>
      )}

      {/* @ts-expect-error directory attribute is non-standard but heavily supported */}
      <input type="file" ref={fallbackDirInputRef} style={{ display: 'none' }} multiple webkitdirectory="true" directory="true" onChange={handleFallbackFiles} />
      <input type="file" ref={fallbackM3uInputRef} style={{ display: 'none' }} accept=".m3u,.m3u8" onChange={handleFallbackM3u} />

      <div className="flex-1 flex flex-col min-h-0">
        
        <div 
          className="flex-[0_0_auto] min-h-0 p-2 sm:p-4 lg:p-6 2xl:p-8 bg-slate-950 flex justify-center items-start gap-2 sm:gap-4 lg:gap-6 2xl:gap-8 shrink-0 shadow-xl overflow-y-auto overflow-x-auto"
          style={{ height: isLibraryMaximized ? '0px' : `${mixerHeightPct}%`, display: isLibraryMaximized ? 'none' : 'flex' }}
        >
          
          <div className={`flex-1 min-w-0 w-full p-3 sm:p-4 lg:p-5 rounded-xl border flex flex-col gap-2 transition-colors ${deckA.isPlaying ? 'bg-slate-900/80 border-blue-500/30' : 'bg-slate-900/40 border-slate-800/80'}`}>
            
            <div className="h-10 sm:h-12 lg:h-16 w-full shrink-0 rounded overflow-hidden shadow-inner bg-slate-950/50">
              <Waveform 
                peaks={deckA.peaks}
                segments={deckA.segments}
                currentTime={progressA.current || 0}
                duration={progressA.max || 0}
                introMarker={deckA.introMarker}
                outroMarker={deckA.outroMarker}
                color="#3b82f6"
                onSeek={(time) => handleSeek('A', time)}
                onMarkerChange={(type, time) => setDeckA(prev => ({ ...prev, [type === 'intro' ? 'introMarker' : 'outroMarker']: time }))}
              />
            </div>

            <div className="flex items-center bg-slate-950/50 p-2 sm:p-3 rounded-lg border border-slate-800/50 gap-2 sm:gap-4 mt-auto">
              <div className="flex flex-col items-center gap-2 shrink-0">
                <button 
                  disabled={!deckA.track}
                  onClick={() => toggleDeck('A')}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white shadow-inner border border-slate-700/50 shrink-0"
                >
                  {deckA.isPlaying ? <Square size={18} fill="currentColor" className="text-blue-500" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                </button>
                <button 
                  onClick={() => handleMuteToggle('A')}
                  className={`w-full py-0.5 px-2 rounded-full text-[8px] sm:text-[9px] font-bold tracking-widest transition-colors flex items-center justify-center border ${muteA ? 'bg-red-600 text-white border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                >
                  MUTE
                </button>
              </div>

              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex justify-between items-end mb-0.5">
                  <div className="truncate pr-2">
                    <h2 className="text-sm sm:text-base font-bold text-white truncate">{deckA.track?.title || 'No Track'}</h2>
                    <p className="text-[10px] sm:text-xs text-slate-400 truncate">{deckA.track?.artist || 'Ready to load'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg sm:text-xl font-mono font-light text-cyan-400 leading-none">{deckA.track ? bpmA.toFixed(1) : '---'}</div>
                    <div className="text-[8px] sm:text-[9px] uppercase text-slate-500 font-bold tracking-widest mt-0.5">BPM</div>
                  </div>
                </div>
                {deckA.track && (
                  <div className="flex gap-2 sm:gap-3 text-[9px] sm:text-[10px] font-mono text-slate-400">
                    <span><span className="text-slate-500">TIME:</span> {formatAdjustedTime(progressA.current, pitchA)} / {formatAdjustedTime(progressA.max, pitchA)}</span>
                    <span className="hidden sm:inline"><span className="text-slate-500">IN:</span> {formatAdjustedTime(deckA.introMarker, pitchA)}</span>
                    <span className="hidden sm:inline"><span className="text-slate-500">OUT:</span> {formatAdjustedTime(progressA.max - deckA.outroMarker, pitchA)}</span>
                    {deckA.track.key && <span className="hidden lg:inline"><span className="text-slate-600">KEY:</span> {deckA.track.key}</span>}
                  </div>
                )}
              </div>

              <div className="flex gap-2 sm:gap-3 items-center shrink-0 border-l border-slate-800/50 pl-2 sm:pl-3">
                <div className="flex flex-col items-center gap-1 w-20 sm:w-24">
                  <span className="text-[8px] sm:text-[9px] text-slate-400 font-bold tracking-widest leading-none">PITCH</span>
                  <div className="flex items-center w-full gap-1">
                    <button onClick={() => handlePitchNudge('A', -0.1)} className="text-[10px] text-slate-500 hover:text-slate-200 font-bold leading-none select-none px-1 py-0.5 rounded hover:bg-slate-800">-</button>
                    <input 
                      type="range" 
                      min="0.84" 
                      max="1.16" 
                      step="any" 
                      value={pitchA} 
                      onChange={(e) => handlePitchChange('A', parseFloat(e.target.value))} 
                      onDoubleClick={() => handlePitchChange('A', 1.0)}
                      onWheel={(e) => {
                        e.preventDefault();
                        const now = Date.now();
                        const timeSinceLast = now - scrollRef.current.time;
                        if (timeSinceLast < 50) {
                          scrollRef.current.multiplier = Math.min(20, scrollRef.current.multiplier + 1);
                        } else if (timeSinceLast > 250) {
                          scrollRef.current.multiplier = 1;
                        }
                        scrollRef.current.time = now;
                        
                        let amt = 0.1 * scrollRef.current.multiplier;
                        // cap max jump to 2.0 BPM at once so it doesn't go crazy
                        if (amt > 2.0) amt = 2.0;
                        handlePitchNudge('A', e.deltaY > 0 ? -amt : amt);
                      }}
                      className="flex-1 w-full h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-blue-500 shadow-inner min-w-0" 
                    />
                    <button onClick={() => handlePitchNudge('A', 0.1)} className="text-[10px] text-slate-500 hover:text-slate-200 font-bold leading-none select-none px-1 py-0.5 rounded hover:bg-slate-800">+</button>
                  </div>
                  <span className="text-[8px] sm:text-[9px] font-mono text-slate-500 leading-none">{((pitchA - 1) * 100).toFixed(1)}%</span>
                  
                  <div className="flex w-full gap-1 mt-0.5">
                    <button 
                      onMouseDown={() => handleSyncDown('A')}
                      onMouseUp={() => handleSyncUp('A')}
                      onMouseLeave={() => handleSyncUp('A')}
                      className={`flex-1 py-0.5 rounded text-[7px] sm:text-[8px] font-bold transition-colors flex items-center justify-center border ${syncA ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.5)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                    >
                      SYNC
                    </button>
                    <button 
                      onClick={() => handleMasterToggle('A')}
                      className={`flex-1 py-0.5 rounded text-[7px] sm:text-[8px] font-bold transition-colors flex items-center justify-center border ${masterDeck === 'A' ? 'bg-amber-600 text-white border-amber-500 shadow-[0_0_8px_rgba(217,119,6,0.5)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                    >
                      MST
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 sm:gap-3 p-2 sm:p-3 bg-slate-900/80 rounded-lg border border-slate-800/80">
              <div className="flex flex-col gap-1.5 sm:gap-2 flex-1 min-w-0 border-r border-slate-800/50 pr-2 sm:pr-3">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-blue-400">ECHO</span>
                  <button 
                    onClick={() => handleFxToggle('A', 'delay')}
                    className={`w-6 sm:w-8 h-3 sm:h-4 rounded-full transition-colors ${fxA.delayOn ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'bg-slate-700'}`}
                  ></button>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <span className="text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7">TIME</span>
                  <input type="range" min="0.05" max="1" step="0.01" value={fxA.delayTime} onChange={(e) => handleFxParamChange('A', 'delay', 'time', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('A', 'delay', 'time', 0.25)} onWheel={handleSliderWheel} className="flex-1 min-w-0 h-1 bg-slate-800 rounded appearance-none accent-slate-400" />
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <span className="text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7">FDBK</span>
                  <input type="range" min="0" max="0.95" step="0.01" value={fxA.delayFeedback} onChange={(e) => handleFxParamChange('A', 'delay', 'feedback', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('A', 'delay', 'feedback', 0.5)} onWheel={handleSliderWheel} className="flex-1 min-w-0 h-1 bg-slate-800 rounded appearance-none accent-slate-400" />
                </div>
                <div className="flex gap-1 justify-end -mt-1 flex-wrap">
                  <button onClick={() => handleFxParamChange('A', 'delay', 'time', Math.min(1, 60 / (bpmA || 120)))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">1/4</button>
                  <button onClick={() => handleFxParamChange('A', 'delay', 'time', Math.min(1, (60 / (bpmA || 120)) * 0.5))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">1/8</button>
                  <button onClick={() => handleFxParamChange('A', 'delay', 'time', Math.min(1, (60 / (bpmA || 120)) * 0.25))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">1/16</button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 sm:gap-2 flex-1 min-w-0 border-r border-slate-800/50 pr-2 sm:pr-3">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-cyan-400">REVERB</span>
                  <button 
                    onClick={() => handleFxToggle('A', 'reverb')}
                    className={`w-6 sm:w-8 h-3 sm:h-4 rounded-full transition-colors ${fxA.reverbOn ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]' : 'bg-slate-700'}`}
                  ></button>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 mt-auto mb-0.5 sm:mb-1">
                  <span className="text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7">SIZE</span>
                  <input type="range" min="0" max="1" step="0.01" value={fxA.reverbSize} onChange={(e) => handleFxParamChange('A', 'reverb', 'size', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('A', 'reverb', 'size', 0.7)} onWheel={handleSliderWheel} className="flex-1 min-w-0 h-1 bg-slate-800 rounded appearance-none accent-slate-400" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 sm:gap-2 flex-1 min-w-0">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-fuchsia-400">PHASER</span>
                  <button 
                    onClick={() => handleFxToggle('A', 'phaser')}
                    className={`w-6 sm:w-8 h-3 sm:h-4 rounded-full transition-colors ${fxA.phaserOn ? 'bg-fuchsia-500 shadow-[0_0_8px_rgba(217,70,239,0.6)]' : 'bg-slate-700'}`}
                  ></button>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 mt-auto mb-0.5 sm:mb-1">
                  <span className="text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7">RATE</span>
                  <input type="range" min="0.1" max="10" step="0.1" value={fxA.phaserRate} onChange={(e) => handleFxParamChange('A', 'phaser', 'rate', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('A', 'phaser', 'rate', 0.5)} onWheel={handleSliderWheel} className="flex-1 min-w-0 h-1 bg-slate-800 rounded appearance-none accent-slate-400" />
                </div>
                <div className="flex gap-1 justify-end -mt-1 flex-wrap">
                  <button onClick={() => handleFxParamChange('A', 'phaser', 'rate', Math.min(10, ((bpmA || 120) / 60) * 0.25))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">4 BARS</button>
                  <button onClick={() => handleFxParamChange('A', 'phaser', 'rate', Math.min(10, ((bpmA || 120) / 60) * 0.5))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">2 BARS</button>
                  <button onClick={() => handleFxParamChange('A', 'phaser', 'rate', Math.min(10, (bpmA || 120) / 60))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">1 BAR</button>
                </div>
              </div>
            </div>
          </div>

          <div className="w-56 sm:w-64 lg:w-72 flex flex-col p-2 sm:p-4 rounded-xl border border-slate-800/80 bg-slate-900/60 shadow-inner">
            <div className="flex w-full justify-between items-start px-2 mb-2 sm:mb-4">
              <div className="text-[10px] sm:text-xs font-bold text-slate-500 tracking-wider mt-1">CH A</div>
              
              <div className="flex flex-col items-center gap-1.5 -mt-1">
                <h1 className="text-xl font-bold tracking-tight text-white leading-none">Vici</h1>
                <button 
                  onClick={() => setIsAutomixEnabled(!isAutomixEnabled)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide transition ${isAutomixEnabled ? 'bg-blue-600/20 text-blue-400 border border-blue-500/50' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
                  title="Automix Mode"
                >
                  {isAutomixEnabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                  AUTOMIX
                </button>
              </div>

              <div className="text-[10px] sm:text-xs font-bold text-slate-500 tracking-wider mt-1">CH B</div>
            </div>

            <div className="flex justify-between w-full flex-1 gap-2 sm:gap-4">
              <div className="flex flex-1 gap-1 sm:gap-2">
                <div className="flex flex-col items-center h-full justify-center pb-4">
                  <div className="h-32 sm:h-40 w-4 flex items-center justify-center relative">
                    <input type="range" min="0" max="1.5" step="0.01" value={volA} onChange={(e) => handleVolumeChange('A', parseFloat(e.target.value))} onDoubleClick={() => handleVolumeChange('A', 1.0)} onWheel={handleSliderWheel} className="w-32 sm:w-40 h-1.5 absolute rotate-270 -rotate-90 appearance-none cursor-pointer accent-blue-500 bg-slate-800 rounded-full" />
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
                      <input type="range" min="-24" max="6" step="0.1" value={value} onChange={(e) => handler('A', band as 'high'|'mid'|'low', parseFloat(e.target.value))} onDoubleClick={() => handler('A', band as 'high'|'mid'|'low', 0)} onWheel={handleSliderWheel} className="w-full h-1 sm:h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-slate-300 shadow-inner" />
                    </div>
                  ))}
                  <div className="flex gap-1 mt-auto mb-1">
                    <button
                      onMouseDown={() => handleFxToggle('A', 'roll')}
                      onMouseUp={() => handleFxToggle('A', 'roll')}
                      onMouseLeave={() => fxA.rollOn && handleFxToggle('A', 'roll')}
                      className={`flex-1 py-1 rounded text-[7px] font-bold transition-all ${fxA.rollOn ? 'bg-amber-500 text-white shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
                    >
                      ROLL
                    </button>
                    <button
                      onClick={() => handleFxToggle('A', 'gate')}
                      className={`flex-1 py-1 rounded text-[7px] font-bold transition-all ${fxA.gateOn ? 'bg-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.6)]' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
                    >
                      GATE
                    </button>
                    <button
                      onMouseDown={() => handleFxToggle('A', 'siren')}
                      onMouseUp={() => handleFxToggle('A', 'siren')}
                      onMouseLeave={() => fxA.sirenOn && handleFxToggle('A', 'siren')}
                      className={`flex-1 py-1 rounded text-[7px] font-bold transition-all ${fxA.sirenOn ? 'bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
                    >
                      SIREN
                    </button>
                  </div>

                  <div className="flex flex-col gap-1 mt-1 mb-1">
                    <span className="text-[8px] sm:text-[9px] text-blue-400 font-bold">FLT</span>
                    <input type="range" min="-100" max="100" step="1" value={filterA} onChange={(e) => handleFilterChange('A', parseFloat(e.target.value))} onDoubleClick={() => handleFilterChange('A', 0)} onWheel={handleSliderWheel} className="w-full h-2 sm:h-2.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-blue-500 shadow-inner" />
                  </div>
                </div>
              </div>

              <div className="flex flex-1 gap-1 sm:gap-2 flex-row-reverse">
                <div className="flex flex-col items-center h-full justify-center pb-4">
                  <div className="h-32 sm:h-40 w-4 flex items-center justify-center relative">
                    <input type="range" min="0" max="1.5" step="0.01" value={volB} onChange={(e) => handleVolumeChange('B', parseFloat(e.target.value))} onDoubleClick={() => handleVolumeChange('B', 1.0)} onWheel={handleSliderWheel} className="w-32 sm:w-40 h-1.5 absolute rotate-270 -rotate-90 appearance-none cursor-pointer accent-cyan-500 bg-slate-800 rounded-full" />
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
                      <input type="range" min="-24" max="6" step="0.1" value={value} onChange={(e) => handler('B', band as 'high'|'mid'|'low', parseFloat(e.target.value))} onDoubleClick={() => handler('B', band as 'high'|'mid'|'low', 0)} onWheel={handleSliderWheel} className="w-full h-1 sm:h-1.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-slate-300 shadow-inner rotate-180" />
                    </div>
                  ))}
                  <div className="flex gap-1 mt-auto mb-1 w-full">
                    <button
                      onMouseDown={() => handleFxToggle('B', 'roll')}
                      onMouseUp={() => handleFxToggle('B', 'roll')}
                      onMouseLeave={() => fxB.rollOn && handleFxToggle('B', 'roll')}
                      className={`flex-1 py-1 rounded text-[7px] font-bold transition-all ${fxB.rollOn ? 'bg-amber-500 text-white shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
                    >
                      ROLL
                    </button>
                    <button
                      onClick={() => handleFxToggle('B', 'gate')}
                      className={`flex-1 py-1 rounded text-[7px] font-bold transition-all ${fxB.gateOn ? 'bg-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.6)]' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
                    >
                      GATE
                    </button>
                    <button
                      onMouseDown={() => handleFxToggle('B', 'siren')}
                      onMouseUp={() => handleFxToggle('B', 'siren')}
                      onMouseLeave={() => fxB.sirenOn && handleFxToggle('B', 'siren')}
                      className={`flex-1 py-1 rounded text-[7px] font-bold transition-all ${fxB.sirenOn ? 'bg-red-500 text-white shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'}`}
                    >
                      SIREN
                    </button>
                  </div>

                  <div className="flex flex-col gap-1 mt-1 mb-1 items-end w-full">
                    <span className="text-[8px] sm:text-[9px] text-cyan-400 font-bold">FLT</span>
                    <input type="range" min="-100" max="100" step="1" value={filterB} onChange={(e) => handleFilterChange('B', parseFloat(e.target.value))} onDoubleClick={() => handleFilterChange('B', 0)} onWheel={handleSliderWheel} className="w-full h-2 sm:h-2.5 bg-slate-800 rounded-full appearance-none cursor-pointer accent-cyan-500 shadow-inner rotate-180" />
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full mt-4 sm:mt-6 bg-slate-950/80 px-4 py-3 sm:py-4 rounded-lg border border-slate-800/80 shadow-inner">
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                value={xfade} 
                onChange={handleCrossfadeChange}
                onDoubleClick={() => handleCrossfadeChange({ target: { value: '0.5' } } as React.ChangeEvent<HTMLInputElement>)}
                onWheel={handleSliderWheel}
                className="w-full h-2 sm:h-2.5 bg-slate-900 rounded-full appearance-none cursor-pointer accent-slate-400 shadow-inner"
              />
            </div>
          </div>

          <div className={`flex-1 min-w-0 w-full p-3 sm:p-4 lg:p-5 rounded-xl border flex flex-col gap-2 transition-colors ${deckB.isPlaying ? 'bg-slate-900/80 border-blue-500/30' : 'bg-slate-900/40 border-slate-800/80'}`}>
            
            <div className="h-10 sm:h-12 lg:h-16 w-full shrink-0 rounded overflow-hidden shadow-inner bg-slate-950/50">
              <Waveform 
                peaks={deckB.peaks}
                segments={deckB.segments}
                currentTime={progressB.current || 0}
                duration={progressB.max || 0}
                introMarker={deckB.introMarker}
                outroMarker={deckB.outroMarker}
                color="#06b6d4"
                onSeek={(time) => handleSeek('B', time)}
                onMarkerChange={(type, time) => setDeckB(prev => ({ ...prev, [type === 'intro' ? 'introMarker' : 'outroMarker']: time }))}
              />
            </div>

            <div className="flex items-center bg-slate-950/50 p-2 sm:p-3 rounded-lg border border-slate-800/50 gap-2 sm:gap-4 mt-auto flex-row-reverse text-right">
              <div className="flex flex-col items-center gap-2 shrink-0">
                <button 
                  disabled={!deckB.track}
                  onClick={() => toggleDeck('B')}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white shadow-inner border border-slate-700/50 shrink-0"
                >
                  {deckB.isPlaying ? <Square size={18} fill="currentColor" className="text-cyan-500" /> : <Play size={20} fill="currentColor" className="mr-1" />}
                </button>
                <button 
                  onClick={() => handleMuteToggle('B')}
                  className={`w-full py-0.5 px-2 rounded-full text-[8px] sm:text-[9px] font-bold tracking-widest transition-colors flex items-center justify-center border ${muteB ? 'bg-red-600 text-white border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                >
                  MUTE
                </button>
              </div>

              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex justify-between items-end mb-0.5 flex-row-reverse">
                  <div className="truncate pl-2">
                    <h2 className="text-sm sm:text-base font-bold text-white truncate">{deckB.track?.title || 'No Track'}</h2>
                    <p className="text-[10px] sm:text-xs text-slate-400 truncate">{deckB.track?.artist || 'Ready to load'}</p>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="text-lg sm:text-xl font-mono font-light text-cyan-400 leading-none">{deckB.track ? bpmB.toFixed(1) : '---'}</div>
                    <div className="text-[8px] sm:text-[9px] uppercase text-slate-500 font-bold tracking-widest mt-0.5">BPM</div>
                  </div>
                </div>
                {deckB.track && (
                  <div className="flex gap-2 sm:gap-3 text-[9px] sm:text-[10px] font-mono text-slate-400 flex-row-reverse">
                    <span>{formatAdjustedTime(progressB.current, pitchB)} / {formatAdjustedTime(progressB.max, pitchB)} <span className="text-slate-500">:TIME</span></span>
                    <span className="hidden sm:inline">{formatAdjustedTime(deckB.introMarker, pitchB)} <span className="text-slate-500">:IN</span></span>
                    <span className="hidden sm:inline">{formatAdjustedTime(progressB.max - deckB.outroMarker, pitchB)} <span className="text-slate-500">:OUT</span></span>
                    {deckB.track.key && <span className="hidden lg:inline">{deckB.track.key} <span className="text-slate-600">:KEY</span></span>}
                  </div>
                )}
              </div>

              <div className="flex gap-2 sm:gap-3 items-center shrink-0 border-r border-slate-800/50 pr-2 sm:pr-3 flex-row-reverse">
                <div className="flex flex-col items-center gap-1 w-20 sm:w-24">
                  <span className="text-[8px] sm:text-[9px] text-slate-400 font-bold tracking-widest leading-none">PITCH</span>
                  <div className="flex items-center w-full gap-1">
                    <button onClick={() => handlePitchNudge('B', -0.1)} className="text-[10px] text-slate-500 hover:text-slate-200 font-bold leading-none select-none px-1 py-0.5 rounded hover:bg-slate-800">-</button>
                    <input 
                      type="range" 
                      min="0.84" 
                      max="1.16" 
                      step="any" 
                      value={pitchB} 
                      onChange={(e) => handlePitchChange('B', parseFloat(e.target.value))} 
                      onDoubleClick={() => handlePitchChange('B', 1.0)}
                      onWheel={(e) => {
                        e.preventDefault();
                        const now = Date.now();
                        const timeSinceLast = now - scrollRef.current.time;
                        if (timeSinceLast < 50) {
                          scrollRef.current.multiplier = Math.min(20, scrollRef.current.multiplier + 1);
                        } else if (timeSinceLast > 250) {
                          scrollRef.current.multiplier = 1;
                        }
                        scrollRef.current.time = now;
                        
                        let amt = 0.1 * scrollRef.current.multiplier;
                        if (amt > 2.0) amt = 2.0;
                        handlePitchNudge('B', e.deltaY > 0 ? -amt : amt);
                      }}
                      className="flex-1 w-full h-1 bg-slate-800 rounded-full appearance-none cursor-pointer accent-cyan-500 shadow-inner min-w-0" 
                    />
                    <button onClick={() => handlePitchNudge('B', 0.1)} className="text-[10px] text-slate-500 hover:text-slate-200 font-bold leading-none select-none px-1 py-0.5 rounded hover:bg-slate-800">+</button>
                  </div>
                  <span className="text-[8px] sm:text-[9px] font-mono text-slate-500 leading-none">{((pitchB - 1) * 100).toFixed(1)}%</span>
                  
                  <div className="flex w-full gap-1 mt-0.5">
                    <button 
                      onClick={() => handleMasterToggle('B')}
                      className={`flex-1 py-0.5 rounded text-[7px] sm:text-[8px] font-bold transition-colors flex items-center justify-center border ${masterDeck === 'B' ? 'bg-amber-600 text-white border-amber-500 shadow-[0_0_8px_rgba(217,119,6,0.5)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                    >
                      MST
                    </button>
                    <button 
                      onMouseDown={() => handleSyncDown('B')}
                      onMouseUp={() => handleSyncUp('B')}
                      onMouseLeave={() => handleSyncUp('B')}
                      className={`flex-1 py-0.5 rounded text-[7px] sm:text-[8px] font-bold transition-colors flex items-center justify-center border ${syncB ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.5)]' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'}`}
                    >
                      SYNC
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 sm:gap-3 p-2 sm:p-3 bg-slate-900/80 rounded-lg border border-slate-800/80 flex-row-reverse">
              <div className="flex flex-col gap-1.5 sm:gap-2 flex-1 min-w-0 border-l border-slate-800/50 pl-2 sm:pl-3">
                <div className="flex justify-between items-center flex-row-reverse">
                  <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-blue-400">ECHO</span>
                  <button 
                    onClick={() => handleFxToggle('B', 'delay')}
                    className={`w-6 sm:w-8 h-3 sm:h-4 rounded-full transition-colors ${fxB.delayOn ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]' : 'bg-slate-700'}`}
                  ></button>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 flex-row-reverse">
                  <span className="text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7 text-right">TIME</span>
                  <input type="range" min="0.05" max="1" step="0.01" value={fxB.delayTime} onChange={(e) => handleFxParamChange('B', 'delay', 'time', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('B', 'delay', 'time', 0.25)} onWheel={handleSliderWheel} className="flex-1 min-w-0 h-1 bg-slate-800 rounded appearance-none accent-slate-400 rotate-180" />
                </div>
                <div className="flex items-center gap-1 sm:gap-2 flex-row-reverse">
                  <span className="text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7 text-right">FDBK</span>
                  <input type="range" min="0" max="0.95" step="0.01" value={fxB.delayFeedback} onChange={(e) => handleFxParamChange('B', 'delay', 'feedback', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('B', 'delay', 'feedback', 0.5)} onWheel={handleSliderWheel} className="flex-1 min-w-0 h-1 bg-slate-800 rounded appearance-none accent-slate-400 rotate-180" />
                </div>
                <div className="flex gap-1 justify-start -mt-1 flex-row-reverse flex-wrap">
                  <button onClick={() => handleFxParamChange('B', 'delay', 'time', Math.min(1, 60 / (bpmB || 120)))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">1/4</button>
                  <button onClick={() => handleFxParamChange('B', 'delay', 'time', Math.min(1, (60 / (bpmB || 120)) * 0.5))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">1/8</button>
                  <button onClick={() => handleFxParamChange('B', 'delay', 'time', Math.min(1, (60 / (bpmB || 120)) * 0.25))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">1/16</button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 sm:gap-2 flex-1 min-w-0 border-l border-slate-800/50 pl-2 sm:pl-3">
                <div className="flex justify-between items-center flex-row-reverse">
                  <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-cyan-400">REVERB</span>
                  <button 
                    onClick={() => handleFxToggle('B', 'reverb')}
                    className={`w-6 sm:w-8 h-3 sm:h-4 rounded-full transition-colors ${fxB.reverbOn ? 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)]' : 'bg-slate-700'}`}
                  ></button>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 mt-auto mb-0.5 sm:mb-1 flex-row-reverse">
                  <span className="text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7 text-right">SIZE</span>
                  <input type="range" min="0" max="1" step="0.01" value={fxB.reverbSize} onChange={(e) => handleFxParamChange('B', 'reverb', 'size', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('B', 'reverb', 'size', 0.7)} onWheel={handleSliderWheel} className="flex-1 min-w-0 h-1 bg-slate-800 rounded appearance-none accent-slate-400 rotate-180" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 sm:gap-2 flex-1 min-w-0">
                <div className="flex justify-between items-center flex-row-reverse">
                  <span className="text-[9px] sm:text-[10px] font-bold tracking-widest text-fuchsia-400">PHASER</span>
                  <button 
                    onClick={() => handleFxToggle('B', 'phaser')}
                    className={`w-6 sm:w-8 h-3 sm:h-4 rounded-full transition-colors ${fxB.phaserOn ? 'bg-fuchsia-500 shadow-[0_0_8px_rgba(217,70,239,0.6)]' : 'bg-slate-700'}`}
                  ></button>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 mt-auto mb-0.5 sm:mb-1 flex-row-reverse">
                  <span className="text-[7px] sm:text-[8px] text-slate-500 w-5 sm:w-7 text-right">RATE</span>
                  <input type="range" min="0.1" max="10" step="0.1" value={fxB.phaserRate} onChange={(e) => handleFxParamChange('B', 'phaser', 'rate', parseFloat(e.target.value))} onDoubleClick={() => handleFxParamChange('B', 'phaser', 'rate', 0.5)} onWheel={handleSliderWheel} className="flex-1 min-w-0 h-1 bg-slate-800 rounded appearance-none accent-slate-400 rotate-180" />
                </div>
                <div className="flex gap-1 justify-start -mt-1 flex-row-reverse flex-wrap">
                  <button onClick={() => handleFxParamChange('B', 'phaser', 'rate', Math.min(10, ((bpmB || 120) / 60) * 0.25))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">4 BARS</button>
                  <button onClick={() => handleFxParamChange('B', 'phaser', 'rate', Math.min(10, ((bpmB || 120) / 60) * 0.5))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">2 BARS</button>
                  <button onClick={() => handleFxParamChange('B', 'phaser', 'rate', Math.min(10, (bpmB || 120) / 60))} className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[6px] sm:text-[7px] font-bold text-slate-400 transition-colors">1 BAR</button>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div 
          className="h-6 bg-slate-900 border-y border-slate-800 flex items-center justify-between px-4 cursor-row-resize shrink-0 group hover:bg-slate-800 transition-colors"
          onMouseDown={handleMouseDown}
          onDoubleClick={toggleLibraryMaximize}
        >
          <div className="w-16"></div>
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

        <div className="flex-1 flex bg-slate-900 min-h-0">
          
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

              {savedPlaylists.length > 0 && (
                <div className="mt-6">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Saved Playlists</div>
                  <div className="flex flex-col gap-1">
                    {savedPlaylists.map(pl => (
                      <button
                         key={pl.id}
                         onClick={() => {
                           applyM3U(pl.content);
                           setActiveTab('playlists');
                         }}
                         className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition text-slate-400 hover:bg-slate-900 hover:text-slate-200 text-left truncate"
                      >
                         <ListMusic size={14} className="shrink-0" /> <span className="truncate">{pl.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {activeTab === 'playlists' && (
              <div className="p-4" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>
                <div className={`p-4 border-2 border-dashed rounded-lg text-center transition ${dragActive ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 bg-slate-900/50'}`}>
                  <p className="text-xs text-slate-400">Drag & drop .m3u files here to load them.</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto bg-slate-900/80 p-2 sm:p-4 flex flex-col">
            {activeTab === 'tracks' && (
              <div className="flex justify-start gap-3 mb-3">
                <button onClick={handleLoadDirectory} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-500/20 rounded text-xs font-medium flex justify-center items-center gap-2 transition">
                  <FolderSearch size={14} /> Load Library
                </button>
                {sessionStarted && (
                  <button onClick={handlePreScanAll} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium flex justify-center items-center gap-2 transition">
                    <Scan size={14} /> Scan Missing Metadata
                  </button>
                )}
                {!sessionStarted && dbTracksCount > 0 && (
                  <button onClick={handleRestoreSession} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium flex justify-center items-center gap-2 transition">
                    Restore Previous Session ({dbTracksCount} tracks)
                  </button>
                )}
                {dbTracksCount > 0 && (
                  <button onClick={handleClearCache} className="px-3 py-1.5 ml-auto bg-red-900/40 hover:bg-red-800/60 text-red-300 hover:text-red-200 rounded text-xs font-medium flex justify-center items-center gap-2 transition">
                    <Trash2 size={14} /> Clear Cache
                  </button>
                )}
              </div>
            )}

            {activeTab === 'playlists' && (
              <div className="flex justify-start gap-3 mb-3">
                <button onClick={handleOpenPlaylist} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-500/20 rounded text-xs font-medium flex justify-center items-center gap-2 transition">
                  <FolderOpen size={14} /> Open M3U
                </button>
                <button onClick={handleSavePlaylist} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-medium flex justify-center items-center gap-2 transition">
                  <Save size={14} /> Save Queue as M3U
                </button>
              </div>
            )}

            <div className="grid grid-cols-[1fr_1fr_80px_80px_100px] gap-4 px-4 py-2 border-b border-slate-800 text-xs font-bold text-slate-500 tracking-wider shrink-0">
              <div>TITLE</div>
              <div>ARTIST</div>
              <div>BPM</div>
              <div>TIME</div>
              <div className="text-center">LOAD</div>
            </div>
            <div className="flex flex-col mt-2 flex-1 overflow-auto">
              {displayTracks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-sm gap-2">
                  <p>{activeTab === 'playlists' ? 'The active queue is empty. Load a directory or playlist.' : 'The track view is empty.'}</p>
                  {activeTab === 'tracks' && !sessionStarted && dbTracksCount === 0 && <p className="text-xs text-slate-600">Use "Load Library" to add your local audio folders.</p>}
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
