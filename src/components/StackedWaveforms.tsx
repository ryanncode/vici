import React, { useCallback, useRef, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useMixerStore } from '../store/mixerStore';
import { AudioEngine } from '../services/AudioEngine';
import type { TrackSegment } from '../types/mixer';

interface WaveformProps {
  deckId: 'A' | 'B';
  peaks: Float32Array | null;
  segments?: TrackSegment[];
  introMarker: number;
  outroMarker: number;
  color: string;
  onSeek: (time: number) => void;
  onMarkerChange: (type: 'intro' | 'outro', time: number) => void;
}

const Waveform: React.FC<WaveformProps> = React.memo(({
  deckId,
  peaks,
  segments,
  introMarker,
  outroMarker,
  color,
  onSeek,
  onMarkerChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [draggingMarker, setDraggingMarker] = useState<'intro' | 'outro' | 'playhead' | null>(null);
  const [dragTime, setDragTime] = useState<number | null>(null);

  const getDuration = () => {
    const engine = AudioEngine.getInstance();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    return deckEngine.duration || 0;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || peaks.length === 0) return;

    const duration = getDuration();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    if (segments && segments.length > 0 && duration > 0) {
      for (const segment of segments) {
        const startX = (segment.start / duration) * width;
        const endX = (segment.end / duration) * width;
        const segmentWidth = endX - startX;
        
        ctx.fillStyle = `${segment.color}33`; 
        ctx.fillRect(startX, 0, segmentWidth, height);
      }
    }

    const step = width / peaks.length;
    
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, `${color}80`);
    gradient.addColorStop(0.5, color);
    gradient.addColorStop(1, `${color}80`);

    ctx.fillStyle = gradient;

    for (let i = 0; i < peaks.length; i++) {
      const peak = peaks[i];
      const h = Math.max(1, peak * height);
      const x = i * step;
      const y = (height - h) / 2;
      ctx.fillRect(x, y, Math.max(1, step - 0.5), h);
    }
  }, [peaks, segments, color, deckId]);

  const onSeekRef = useRef(onSeek);
  const onMarkerChangeRef = useRef(onMarkerChange);

  useEffect(() => {
    onSeekRef.current = onSeek;
    onMarkerChangeRef.current = onMarkerChange;
  }, [onSeek, onMarkerChange]);

  useEffect(() => {
    let lastPctStr = '';

    const updatePlayhead = () => {
      const duration = getDuration();
      let pct = 0;
      let shouldUpdate = false;
      
      if (duration > 0 && draggingMarker !== 'playhead') {
        const engine = AudioEngine.getInstance();
        const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
        const current = deckEngine.getCurrentTime();
        pct = (current / duration) * 100;
        shouldUpdate = true;
      } else if (draggingMarker === 'playhead' && dragTime !== null && duration > 0) {
        pct = (dragTime / duration) * 100;
        shouldUpdate = true;
      }
      
      if (shouldUpdate) {
        const pctStr = pct.toFixed(2);
        if (pctStr !== lastPctStr) {
          if (playheadRef.current) {
            playheadRef.current.style.left = `${pctStr}%`;
          }
          if (overlayRef.current) {
            overlayRef.current.style.width = `${pctStr}%`;
          }
          lastPctStr = pctStr;
        }
      }
    };

    const intervalId = setInterval(updatePlayhead, 50);
    return () => clearInterval(intervalId);
  }, [deckId, draggingMarker, dragTime]);

  const getMouseTime = (e: ReactMouseEvent | globalThis.MouseEvent) => {
    const duration = getDuration();
    if (!containerRef.current || duration <= 0) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    return (x / rect.width) * duration;
  };

  const handleMouseDown = (e: ReactMouseEvent) => {
    const duration = getDuration();
    if (duration <= 0) return;
    
    const clickTime = getMouseTime(e);
    const timeThreshold = duration * 0.02;
    
    if (Math.abs(clickTime - introMarker) < timeThreshold) {
      setDraggingMarker('intro');
      e.stopPropagation();
      return;
    }
    
    if (Math.abs(clickTime - outroMarker) < timeThreshold) {
      setDraggingMarker('outro');
      e.stopPropagation();
      return;
    }

    setDraggingMarker('playhead');
    setDragTime(clickTime);
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (draggingMarker) {
        const time = getMouseTime(e);
        if (draggingMarker === 'playhead') {
          setDragTime(time);
        } else {
          onMarkerChangeRef.current(draggingMarker, time);
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (draggingMarker === 'playhead') {
        const time = getMouseTime(e);
        onSeekRef.current(time);
      }
      setDraggingMarker(null);
      setDragTime(null);
    };

    if (draggingMarker) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [draggingMarker]);

  const duration = getDuration();
  const introPct = duration > 0 ? (introMarker / duration) * 100 : 0;
  const outroPct = duration > 0 ? (outroMarker / duration) * 100 : 100;

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full cursor-crosshair"
      onMouseDown={handleMouseDown}
    >
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full"
      />

      <div 
        ref={overlayRef}
        className="absolute top-0 bottom-0 left-0 bg-slate-950/40 pointer-events-none mix-blend-overlay"
        style={{ width: '0%' }}
      />
      
      <div 
        ref={playheadRef}
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_5px_rgba(255,255,255,0.8)] pointer-events-none z-20 hidden"
        style={{ left: '0%' }}
      />

      <div 
        className="absolute top-0 bottom-0 w-px bg-green-500 z-10 group hidden"
        style={{ left: `${introPct}%` }}
      />

      <div 
        className="absolute top-0 bottom-0 w-px bg-red-500 z-10 group hidden"
        style={{ left: `${outroPct}%` }}
      />
    </div>
  );
});

export const StackedWaveforms: React.FC = () => {
  const deckA = useMixerStore(state => state.deckA);
  const deckB = useMixerStore(state => state.deckB);

  const handleSeekA = useCallback((time: number) => {
    AudioEngine.getInstance().deckA.seek(time);
  }, []);
  
  const handleMarkerChangeA = useCallback((type: 'intro' | 'outro', time: number) => {
    useMixerStore.getState().setDeckState('A', { [type === 'intro' ? 'introMarker' : 'outroMarker']: time });
  }, []);

  const handleSeekB = useCallback((time: number) => {
    AudioEngine.getInstance().deckB.seek(time);
  }, []);
  
  const handleMarkerChangeB = useCallback((type: 'intro' | 'outro', time: number) => {
    useMixerStore.getState().setDeckState('B', { [type === 'intro' ? 'introMarker' : 'outroMarker']: time });
  }, []);

  return (
    <div className="h-[150px] shrink-0 bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-2xl flex flex-col w-full relative overflow-hidden shadow-lg">
      
      {/* Central Playhead Line (Static, dead center) */}
      <div className="absolute top-[20px] bottom-[20px] left-1/2 w-1 bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)] z-50 -translate-x-1/2 pointer-events-none rounded-full"></div>

      {/* Deck A Overview (20px) */}
      <div className="h-[20px] w-full bg-slate-100 dark:bg-slate-950 flex relative border-b-2 border-slate-200 dark:border-slate-800 group cursor-pointer overflow-hidden">
        {deckA.track ? (
          <div className="absolute inset-0 opacity-50">
            <Waveform 
              deckId="A"
              peaks={deckA.peaks}
              segments={deckA.segments}
              introMarker={deckA.introMarker}
              outroMarker={deckA.outroMarker}
              color="#3b82f6"
              onSeek={handleSeekA}
              onMarkerChange={handleMarkerChangeA}
            />
          </div>
        ) : (
          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.05)_10px,rgba(0,0,0,0.05)_20px)] dark:bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(255,255,255,0.05)_10px,rgba(255,255,255,0.05)_20px)]"></div>
        )}
      </div>

      {/* Deck A Zoom Grid (55px) */}
      <div className="flex-1 h-[55px] w-full relative flex items-center border-b-2 border-slate-300 dark:border-slate-700 cursor-grab active:cursor-grabbing overflow-hidden">
        {deckA.track ? (
          <div className="w-full h-full relative">
            <Waveform 
              deckId="A"
              peaks={deckA.peaks}
              segments={deckA.segments}
              introMarker={deckA.introMarker}
              outroMarker={deckA.outroMarker}
              color="#3b82f6"
              onSeek={handleSeekA}
              onMarkerChange={handleMarkerChangeA}
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 dark:text-slate-600 font-mono tracking-widest">
            NO TRACK LOADED
          </div>
        )}
      </div>

      {/* Deck B Zoom Grid (55px) */}
      <div className="flex-1 h-[55px] w-full relative flex items-center border-b-2 border-slate-200 dark:border-slate-800 cursor-grab active:cursor-grabbing overflow-hidden">
        {deckB.track ? (
          <div className="w-full h-full relative">
            <Waveform 
              deckId="B"
              peaks={deckB.peaks}
              segments={deckB.segments}
              introMarker={deckB.introMarker}
              outroMarker={deckB.outroMarker}
              color="#06b6d4"
              onSeek={handleSeekB}
              onMarkerChange={handleMarkerChangeB}
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-400 dark:text-slate-600 font-mono tracking-widest">
            NO TRACK LOADED
          </div>
        )}
      </div>

      {/* Deck B Overview (20px) */}
      <div className="h-[20px] w-full bg-slate-100 dark:bg-slate-950 flex relative group cursor-pointer overflow-hidden">
        {deckB.track ? (
          <div className="absolute inset-0 opacity-50">
            <Waveform 
              deckId="B"
              peaks={deckB.peaks}
              segments={deckB.segments}
              introMarker={deckB.introMarker}
              outroMarker={deckB.outroMarker}
              color="#06b6d4"
              onSeek={handleSeekB}
              onMarkerChange={handleMarkerChangeB}
            />
          </div>
        ) : (
          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(0,0,0,0.05)_10px,rgba(0,0,0,0.05)_20px)] dark:bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(255,255,255,0.05)_10px,rgba(255,255,255,0.05)_20px)]"></div>
        )}
      </div>

    </div>
  );
};
