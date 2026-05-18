import { useEffect, useState } from 'react';
import { StackedWaveforms } from './components/StackedWaveforms';
import { CenterMixer } from './components/CenterMixer';
import { DeckColumn } from './components/DeckColumn';
import { MiniPlaylist } from './components/MiniPlaylist';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AudioEngine } from './services/AudioEngine';
import { useAutoMixer } from './hooks/useAutoMixer';
import { Browser } from './components/Browser';
import { Hotkeys } from './components/Hotkeys';
import { useMixerStore } from './store/mixerStore';
import { RotaryKnob } from './components/CenterMixer';
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

  const [scale, setScale] = useState(1);
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const handleResize = () => {
      // Calculate perfect aspect-ratio scale for 1050x950 baseline
      if (typeof window !== 'undefined') {
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        // Don't scale up on mobile views (<768px width)
        if (winW < 768) return;
        
        // Add a little padding (e.g., 20px) so it doesn't touch the absolute edges
        const scaleX = (winW - 20) / 1050;
        const scaleY = (winH - 20) / 950;
        
        // Take the smallest scale to maintain aspect ratio without cropping
        let calculatedScale = Math.min(scaleX, scaleY);
        
        // Optionally cap the maximum scale so it doesn't get comically huge on ultrawides
        calculatedScale = Math.min(calculatedScale, 2.5);
        
        setScale(calculatedScale);
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    let lastAudioTime = AudioEngine.getInstance().context.currentTime;
    
    const interval = setInterval(() => {
      const now = performance.now();
      const delta = now - lastTime;
      
      if (delta > 50) {
        console.warn(`[PERF] Main thread blocked for ${Math.round(delta)}ms`);
      }
      
      if (AudioEngine.getInstance().context.state === 'running') {
        const audioTime = AudioEngine.getInstance().context.currentTime;
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
  const masterVolume = useMixerStore(state => state.masterVolume);
  
  const { displayTracks } = useLibrary();
  const deckAControl = useDeckControl('A');
  const deckBControl = useDeckControl('B');
  
  const [activeView, setActiveView] = useState<'mixer' | 'library' | 'hotkeys'>('mixer');
  const [isMidiLearnActive, setIsMidiLearnActive] = useState(false);

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
      const defaultOutro = segments.find(s => s.type === 'outro')?.start || (engine.deckA.loaded ? Math.max(0, engine.deckA.duration - 15) : 0);
      setDeckState('A', { track: nextTrack, isPlaying: true, introMarker: nextTrack.introMarker || 0, outroMarker: nextTrack.outroMarker || defaultOutro, peaks: nextTrack.waveformPeaks || engine.deckA.peaks, segments });
      setDeckState('B', { isPlaying: false });
      setCrossfade(0);

      if (isAutomixEnabled) {
        const next = getNextTrack(nextTrack.id);
        if (next) deckBControl.loadTrack(next);
      }
    } else {
      const segments = nextTrack.segments || engine.deckB.segments;
      const defaultOutro = segments.find(s => s.type === 'outro')?.start || (engine.deckB.loaded ? Math.max(0, engine.deckB.duration - 15) : 0);
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
      const defaultOutro = segments.find(s => s.type === 'outro')?.start || (engine.deckA.loaded ? Math.max(0, engine.deckA.duration - 15) : 0);
      setDeckState('A', { track: nextTrack, isPlaying: true, introMarker: nextTrack.introMarker || 0, outroMarker: nextTrack.outroMarker || defaultOutro, peaks: nextTrack.waveformPeaks || engine.deckA.peaks, segments });
    } else {
      const segments = nextTrack.segments || engine.deckB.segments;
      const defaultOutro = segments.find(s => s.type === 'outro')?.start || (engine.deckB.loaded ? Math.max(0, engine.deckB.duration - 15) : 0);
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

  // const toggleLibraryMaximize = () => setIsLibraryMaximized(!isLibraryMaximized);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-200 dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-sans overflow-hidden select-none items-center justify-center relative transition-colors duration-300">
      
      {needRefresh && (
        <div className="absolute top-4 right-4 z-50 bg-blue-600 text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-4 border border-blue-400/30">
          <span className="text-sm font-bold tracking-wide">Update Available</span>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 bg-white text-blue-900 font-bold hover:bg-blue-50 rounded text-xs transition" onClick={() => updateServiceWorker(true)}>Reload App</button>
            <button className="px-3 py-1.5 hover:bg-black/20 rounded text-xs font-medium transition" onClick={() => setNeedRefresh(false)}>Dismiss</button>
          </div>
        </div>
      )}

      {/* Main Liquid Console Container (responsive scaling via exact transform matrix) */}
      <div 
        className="relative origin-center hidden md:flex flex-col shrink-0 gap-[10px]"
        style={{
          width: '1050px',
          height: '950px',
          transform: `scale(${scale})`
        }}
      >
        {/* Global Header Bar (1050x40px) */}
        <div className="h-[40px] shrink-0 bg-white/50 dark:bg-slate-800/50 backdrop-blur border-2 border-slate-300 dark:border-slate-700 rounded-t-2xl flex items-center justify-between px-4 shadow-sm">
          
          {/* Left Section (200px) */}
          <div className="w-[200px] flex items-center gap-3">
            <span className="font-black tracking-widest text-slate-900 dark:text-white italic text-lg">VICI</span>
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 px-2 py-1 rounded border border-slate-300 dark:border-slate-800">
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
              <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider">CPU</span>
            </div>
            <div className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-700" title="MIDI Disconnected"></div>
          </div>

          {/* Center Section (650px) */}
          <div className="w-[650px] flex items-center justify-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-bold tracking-widest text-slate-500 uppercase pointer-events-none mt-0.5">MASTER</span>
              <RotaryKnob label="" size="xs" min={0} max={1.5} step={0.01} value={masterVolume} onChange={(v) => {
                useMixerStore.setState({ masterVolume: v });
                AudioEngine.getInstance().setMasterVolume(v);
              }} onDoubleClick={() => {
                useMixerStore.setState({ masterVolume: 1.0 });
                AudioEngine.getInstance().setMasterVolume(1.0);
              }} />
            </div>
            
            <div className="font-mono text-xl font-bold tracking-widest text-slate-800 dark:text-slate-300 px-6 py-1 bg-white dark:bg-slate-950 rounded border-2 border-slate-300 dark:border-slate-800 shadow-inner">
              {new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
            </div>

            <div className="flex items-center gap-0 group">
              <button 
                onClick={() => useMixerStore.setState({ isAutomixEnabled: !isAutomixEnabled })}
                className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-l-lg transition-colors border-2 ${
                  isAutomixEnabled ? 'bg-amber-500 text-black border-amber-500' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                Auto-Mix
              </button>
              <div className="relative">
                <select 
                  className="appearance-none px-2 py-1.5 text-xs bg-slate-200 dark:bg-slate-800 border-y-2 border-r-2 border-slate-300 dark:border-slate-700 rounded-r-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-400 cursor-pointer outline-none focus:ring-0 w-[110px]"
                  onChange={(e) => useMixerStore.setState({ automixBars: parseInt(e.target.value) })}
                  defaultValue="4"
                >
                  <option value="0">No Fade</option>
                  <option value="1">1-2 Bars</option>
                  <option value="2">2-8 Bars</option>
                  <option value="4">4-16 Bars</option>
                  <option value="8">8-32 Bars</option>
                  <option value="16">16-64 Bars</option>
                </select>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 text-xs">▼</div>
              </div>
            </div>
          </div>

          {/* Right Section (250px) */}
          <div className="w-[250px] flex items-center justify-end gap-3">
            <button 
              onClick={() => setIsMidiLearnActive(!isMidiLearnActive)}
              className={`px-2 py-1 rounded text-[9px] uppercase font-bold tracking-widest transition-colors flex items-center gap-1 shadow-sm border ${
                isMidiLearnActive 
                  ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-500 border-amber-500/30' 
                  : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>
              MIDI Learn
            </button>
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 flex items-center justify-center border-2 border-slate-300 dark:border-slate-700 transition"
              title="Toggle Theme"
            >
              {isDarkMode ? '☀' : '🌙'}
            </button>
            <button 
              onClick={() => setActiveView(activeView === 'hotkeys' ? 'mixer' : 'hotkeys')}
              className={`w-8 h-8 rounded-lg flex items-center justify-center border-2 transition ${
                activeView === 'hotkeys' 
                  ? 'bg-blue-600 text-white border-blue-500 shadow-sm' 
                  : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
              }`}
              title="Settings & Hotkeys"
            >
              ⚙
            </button>
            <button 
              onClick={() => setActiveView(activeView === 'library' ? 'mixer' : 'library')}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg border-2 transition-colors shadow-sm ${
                activeView === 'library' 
                  ? 'bg-blue-600 text-white border-blue-500' 
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              Library
            </button>
          </div>
        </div>

        {activeView === 'library' ? (
          <div className="flex-1 flex w-full border-2 border-slate-300 dark:border-slate-700 rounded-2xl overflow-hidden shadow-md">
            <Browser />
          </div>
        ) : activeView === 'hotkeys' ? (
          <div className="flex-1 flex w-full border-2 border-slate-300 dark:border-slate-700 rounded-2xl overflow-hidden shadow-md">
            <Hotkeys />
          </div>
        ) : (
          <>
            {/* Stacked Waveform Unit (150px) */}
            <StackedWaveforms />

            {/* Center Mixer Axis & Decks (520px) */}
            <div className="h-[520px] shrink-0 flex w-full gap-[10px]">
              <DeckColumn deckId="A" />
              <CenterMixer />
              <DeckColumn deckId="B" />
            </div>

            {/* Mini-Playlist / Library Snippet (210px) */}
            <MiniPlaylist onExpandLibrary={() => setActiveView('library')} />
          </>
        )}

      </div>

      {/* Mobile/Tablet Placeholder View (< 768px) */}
      <div className="md:hidden flex flex-col items-center justify-center w-full h-full bg-slate-900 text-slate-400 p-8 text-center">
        <div className="w-16 h-16 mb-6 rounded-full bg-slate-800 flex items-center justify-center shadow-inner border border-slate-700">
          <span className="text-2xl">📱</span>
        </div>
        <h2 className="text-xl font-bold text-white mb-2 tracking-widest uppercase">Mobile View Pending</h2>
        <p className="text-sm max-w-sm">
          The specialized touch-first portrait and landscape interfaces for tablets and phones are currently in development. Please view on a desktop or larger screen.
        </p>
      </div>

    </div>
  );
}
