import { useState, useEffect } from 'react';
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

  const store = useMixerStore();
  const deckAState = store.deckA;
  const deckBState = store.deckB;
  const { displayTracks } = useLibrary();
  const deckAControl = useDeckControl('A');
  const deckBControl = useDeckControl('B');
  
  const [mixerHeightPct] = useState(65);
  const [isLibraryMaximized, setIsLibraryMaximized] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const engine = AudioEngine.getInstance();
      
      if (engine.deckA.player.buffer) {
        store.setDeckState('A', {
          progress: { current: engine.deckA.getCurrentTime(), max: engine.deckA.player.buffer.duration },
          currentBpm: engine.deckA.currentBpm
        });
      }
      
      if (engine.deckB.player.buffer) {
        store.setDeckState('B', {
          progress: { current: engine.deckB.getCurrentTime(), max: engine.deckB.player.buffer.duration },
          currentBpm: engine.deckB.currentBpm
        });
      }

      if (store.isAutomixEnabled) {
        store.setCrossfade(engine.crossfader.fade.value as number);
      }
    }, 50);
    return () => clearInterval(interval);
  }, [store.isAutomixEnabled]);

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
      store.setDeckState('A', { track: nextTrack, isPlaying: true, introMarker: nextTrack.introMarker || 0, outroMarker: nextTrack.outroMarker || defaultOutro, peaks: nextTrack.waveformPeaks || engine.deckA.peaks, segments });
      store.setDeckState('B', { isPlaying: false });
      store.setCrossfade(0);

      if (store.isAutomixEnabled) {
        const next = getNextTrack(nextTrack.id);
        if (next) deckBControl.loadTrack(next);
      }
    } else {
      const segments = nextTrack.segments || engine.deckB.segments;
      const defaultOutro = segments.find(s => s.type === 'outro')?.start || (engine.deckB.player.buffer ? Math.max(0, engine.deckB.player.buffer.duration - 15) : 0);
      store.setDeckState('B', { track: nextTrack, isPlaying: true, introMarker: nextTrack.introMarker || 0, outroMarker: nextTrack.outroMarker || defaultOutro, peaks: nextTrack.waveformPeaks || engine.deckB.peaks, segments });
      store.setDeckState('A', { isPlaying: false });
      store.setCrossfade(1);

      if (store.isAutomixEnabled) {
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
      store.setDeckState('A', { track: nextTrack, isPlaying: true, introMarker: nextTrack.introMarker || 0, outroMarker: nextTrack.outroMarker || defaultOutro, peaks: nextTrack.waveformPeaks || engine.deckA.peaks, segments });
    } else {
      const segments = nextTrack.segments || engine.deckB.segments;
      const defaultOutro = segments.find(s => s.type === 'outro')?.start || (engine.deckB.player.buffer ? Math.max(0, engine.deckB.player.buffer.duration - 15) : 0);
      store.setDeckState('B', { track: nextTrack, isPlaying: true, introMarker: nextTrack.introMarker || 0, outroMarker: nextTrack.outroMarker || defaultOutro, peaks: nextTrack.waveformPeaks || engine.deckB.peaks, segments });
    }
  };

  const handleTransitionCancel = (cancelledDeck: 'A' | 'B') => {
    if (cancelledDeck === 'A') {
      store.setDeckState('A', { isPlaying: false });
    } else {
      store.setDeckState('B', { isPlaying: false });
    }
  };

  // Pre-load logic when automix is turned on and one deck is empty
  useEffect(() => {
    if (!store.isAutomixEnabled) return;
    
    const timer = setTimeout(() => {
      if (deckAState.track && !deckBState.track) {
        const next = getNextTrack(deckAState.track.id);
        if (next) deckBControl.loadTrack(next);
      } else if (deckBState.track && !deckAState.track) {
        const next = getNextTrack(deckBState.track.id);
        if (next) deckAControl.loadTrack(next);
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [store.isAutomixEnabled, deckAState.track, deckBState.track]);

  useAutoMixer({
    deckAState: deckAState,
    deckBState: deckBState,
    library: displayTracks as Track[],
    isAutomixEnabled: store.isAutomixEnabled,
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
