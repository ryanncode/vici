import { useState, useEffect } from 'react';
import * as Tone from 'tone';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AudioEngine } from './services/AudioEngine';
import { useAutoMixer } from './hooks/useAutoMixer';
import { Deck } from './components/Deck';
import { MixerConsole } from './components/MixerConsole';
import { Browser } from './components/Browser';
import { useMixerStore } from './store/mixerStore';
import { useLibrary } from './hooks/useLibrary';
import { useDeckControl } from './hooks/useDeckControl';
import type { Track } from './types/mixer';

export default function App() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: unknown) { console.log('SW Registered:', r); },
    onRegisterError(error: unknown) { console.error('SW registration error', error); },
  });

  // Tab High-Performance Mode Enforcer & Silent Latency Monitor
  useEffect(() => {
    let animId: number;
    const keepAwake = () => {
      // This empty rAF loop prevents the browser from putting the tab into Eco/Throttled mode
      // which causes Web Audio thread starvation (the source of the playback glitches).
      animId = requestAnimationFrame(keepAwake);
    };
    animId = requestAnimationFrame(keepAwake);

    let lastTime = performance.now();
    let lastAudioTime = Tone.context.currentTime;
    
    const interval = setInterval(() => {
      const now = performance.now();
      const delta = now - lastTime;
      
      if (delta > 50) {
        console.warn(`[PERF] Main thread blocked for ${Math.round(delta)}ms`);
      }
      
      if (Tone.context.state === 'running') {
        const audioTime = Tone.context.currentTime;
        // Only log actual drift > 150ms to avoid spam from grouped timers
        if (audioTime !== lastAudioTime) {
          lastAudioTime = audioTime;
        }
      }
      
      lastTime = now;
    }, 16);
    
    return () => {
      clearInterval(interval);
      cancelAnimationFrame(animId);
    };
  }, []);

  const isAutomixEnabled = useMixerStore(state => state.isAutomixEnabled);
  const deckATrack = useMixerStore(state => state.deckA.track);
  const deckBTrack = useMixerStore(state => state.deckB.track);
  const setDeckState = useMixerStore(state => state.setDeckState);
  const setCrossfade = useMixerStore(state => state.setCrossfade);
  
  const { displayTracks } = useLibrary();
  const deckAControl = useDeckControl('A');
  const deckBControl = useDeckControl('B');
  
  const [mixerHeightPct] = useState(65);
  const [isLibraryMaximized, setIsLibraryMaximized] = useState(false);

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
      setDeckState('A', { track: nextTrack, isPlaying: true, introMarker: nextTrack.introMarker || 0, outroMarker: nextTrack.outroMarker || defaultOutro, peaks: nextTrack.waveformPeaks || engine.deckA.peaks, segments });
      setDeckState('B', { isPlaying: false });
      setCrossfade(0);

      if (isAutomixEnabled) {
        const next = getNextTrack(nextTrack.id);
        if (next) deckBControl.loadTrack(next);
      }
    } else {
      const segments = nextTrack.segments || engine.deckB.segments;
      const defaultOutro = segments.find(s => s.type === 'outro')?.start || (engine.deckB.player.buffer ? Math.max(0, engine.deckB.player.buffer.duration - 15) : 0);
      setDeckState('B', { track: nextTrack, isPlaying: true, introMarker: nextTrack.introMarker || 0, outroMarker: nextTrack.outroMarker || defaultOutro, peaks: nextTrack.waveformPeaks || engine.deckB.peaks, segments });
      setDeckState('A', { isPlaying: false });
      setCrossfade(1);

      if (isAutomixEnabled) {
        const next = getNextTrack(nextTrack.id);
        if (next) deckAControl.loadTrack(next);
      }
    }
  };

  const handleTransitionStart = (winningDeck: 'A' | 'B', nextTrack: Track) => {
    const engine = AudioEngine.getInstance();
    if (winningDeck === 'A') {
      const segments = nextTrack.segments || engine.deckA.segments;
      const defaultOutro = segments.find(s => s.type === 'outro')?.start || (engine.deckA.player.buffer ? Math.max(0, engine.deckA.player.buffer.duration - 15) : 0);
      setDeckState('A', { track: nextTrack, isPlaying: true, introMarker: nextTrack.introMarker || 0, outroMarker: nextTrack.outroMarker || defaultOutro, peaks: nextTrack.waveformPeaks || engine.deckA.peaks, segments });
    } else {
      const segments = nextTrack.segments || engine.deckB.segments;
      const defaultOutro = segments.find(s => s.type === 'outro')?.start || (engine.deckB.player.buffer ? Math.max(0, engine.deckB.player.buffer.duration - 15) : 0);
      setDeckState('B', { track: nextTrack, isPlaying: true, introMarker: nextTrack.introMarker || 0, outroMarker: nextTrack.outroMarker || defaultOutro, peaks: nextTrack.waveformPeaks || engine.deckB.peaks, segments });
    }
  };

  const handleTransitionCancel = (cancelledDeck: 'A' | 'B') => {
    if (cancelledDeck === 'A') {
      setDeckState('A', { isPlaying: false });
    } else {
      setDeckState('B', { isPlaying: false });
    }
  };

  // Pre-load logic when automix is turned on and one deck is empty
  useEffect(() => {
    if (!isAutomixEnabled) return;
    
    const timer = setTimeout(() => {
      if (deckATrack && !deckBTrack) {
        const next = getNextTrack(deckATrack.id);
        if (next) deckBControl.loadTrack(next);
      } else if (deckBTrack && !deckATrack) {
        const next = getNextTrack(deckBTrack.id);
        if (next) deckAControl.loadTrack(next);
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [isAutomixEnabled, deckATrack, deckBTrack]);

  useAutoMixer({
    library: displayTracks as Track[],
    isAutomixEnabled: isAutomixEnabled,
    onTransitionStart: handleTransitionStart,
    onTransitionComplete: handleTransitionComplete,
    onTransitionCancel: handleTransitionCancel,
    onPitchChange: (deckId, pitch) => {
      if (deckId === 'A') {
        deckAControl.setPitch(pitch);
      } else {
        deckBControl.setPitch(pitch);
      }
    }
  });

  const toggleLibraryMaximize = () => setIsLibraryMaximized(!isLibraryMaximized);

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

      <div className="flex-1 flex flex-col min-h-0">
        <div 
          className="flex-[0_0_auto] min-h-0 p-2 sm:p-4 lg:p-6 2xl:p-8 bg-slate-950 flex justify-center items-start gap-2 sm:gap-4 lg:gap-6 2xl:gap-8 shrink-0 shadow-xl overflow-y-auto overflow-x-auto"
          style={{ height: isLibraryMaximized ? '0px' : `${mixerHeightPct}%`, display: isLibraryMaximized ? 'none' : 'flex' }}
        >
          <Deck deckId="A" />
          <MixerConsole />
          <Deck deckId="B" />
        </div>

        <div 
          className="h-6 bg-slate-900 border-y border-slate-800 flex items-center justify-between px-4 cursor-row-resize shrink-0 group hover:bg-slate-800 transition-colors"
          onDoubleClick={toggleLibraryMaximize}
        >
          <div className="w-16"></div>
          <div className="flex gap-1.5 items-center opacity-30 group-hover:opacity-100 transition-opacity">
            <div className="w-1 h-1 rounded-full bg-slate-400"></div>
            <div className="w-1 h-1 rounded-full bg-slate-400"></div>
            <div className="w-1 h-1 rounded-full bg-slate-400"></div>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); toggleLibraryMaximize(); }} 
            className="text-slate-500 hover:text-blue-400 p-1 flex items-center"
          >
            {isLibraryMaximized ? <span className="text-[10px] font-bold tracking-widest uppercase">Restore</span> : <span className="text-[10px] font-bold tracking-widest uppercase">Maximize Library</span>}
          </button>
        </div>

        <Browser />
      </div>
    </div>
  );
}
