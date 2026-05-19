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

const OverviewWaveform: React.FC<WaveformProps> = React.memo(({
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
    let animationFrameId: number;
    let lastPctStr = '';

    const updatePlayhead = () => {
      const duration = getDuration();
      let pct = 0;
      let shouldUpdate = false;
      
      if (duration > 0 && draggingMarker !== 'playhead') {
        const engine = AudioEngine.getInstance();
        const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
        pct = (deckEngine.getCurrentTime() / duration) * 100;
        shouldUpdate = true;
      } else if (draggingMarker === 'playhead' && dragTime !== null && duration > 0) {
        pct = (dragTime / duration) * 100;
        shouldUpdate = true;
      }
      
      if (shouldUpdate) {
        const pctStr = pct.toFixed(3);
        if (pctStr !== lastPctStr) {
          if (overlayRef.current) {
            overlayRef.current.style.width = `${pctStr}%`;
          }
          lastPctStr = pctStr;
        }
      }
      
      animationFrameId = requestAnimationFrame(updatePlayhead);
    };

    animationFrameId = requestAnimationFrame(updatePlayhead);
    return () => cancelAnimationFrame(animationFrameId);
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

      {/* Micro-playhead for the overview */}
      <div 
        ref={overlayRef}
        className="absolute top-0 bottom-0 left-0 bg-slate-950/40 pointer-events-none mix-blend-overlay border-r-[2px] border-white/50 shadow-[1px_0_4px_rgba(0,0,0,0.5)]"
        style={{ width: '0%' }}
      />
      
      <div 
        className="absolute top-0 bottom-0 w-[3px] bg-green-500 z-10"
        style={{ left: `${introPct}%` }}
      />

      <div 
        className="absolute top-0 bottom-0 w-[3px] bg-red-500 z-10"
        style={{ left: `${outroPct}%` }}
      />
    </div>
  );
});

interface ZoomWaveformProps extends WaveformProps {
  bpm?: number;
}

const ZoomWaveform: React.FC<ZoomWaveformProps> = React.memo(({
  deckId,
  peaks,
  segments,
  introMarker,
  outroMarker,
  color,
  bpm,
  onSeek,
  onMarkerChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [draggingMarker, setDraggingMarker] = useState<'intro' | 'outro' | 'scrub' | null>(null);
  const [scrubStartX, setScrubStartX] = useState<number>(0);
  const [scrubStartTime, setScrubStartTime] = useState<number>(0);
  const zoomTimeWindow = 10; // Show 10 seconds of audio on screen

  const getDuration = () => {
    const engine = AudioEngine.getInstance();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    return deckEngine.duration || 0;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || peaks.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const drawZoomedWaveform = () => {
      const duration = getDuration();
      if (duration <= 0) {
        animationFrameId = requestAnimationFrame(drawZoomedWaveform);
        return;
      }
      
      const engine = AudioEngine.getInstance();
      const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
      const currentTime = deckEngine.getCurrentTime();

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      // Update dimensions only if they changed to avoid canvas clear overhead,
      // but actually we need to clear every frame anyway.
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const width = rect.width;
      const height = rect.height;

      ctx.clearRect(0, 0, width, height);

      // We are showing `zoomTimeWindow` seconds across the full `width`.
      // The center of the canvas is `currentTime`.
      const pixelsPerSecond = width / zoomTimeWindow;
      const timeAtLeftEdge = currentTime - (zoomTimeWindow / 2);
      
      // Draw grid overlay (beat markers)
      if (bpm && bpm > 0) {
        const beatInterval = 60 / bpm; // seconds per beat
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        
        // Find the first beat time that is visible on the left edge
        const firstVisibleBeatIdx = Math.floor(timeAtLeftEdge / beatInterval);
        
        ctx.beginPath();
        for (let i = firstVisibleBeatIdx; ; i++) {
          const beatTime = i * beatInterval;
          const x = (beatTime - timeAtLeftEdge) * pixelsPerSecond;
          
          if (x > width) break;
          
          if (x >= 0) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
          }
        }
        ctx.stroke();
      }

      // Draw Intro Marker
      if (introMarker >= 0) {
        const x = (introMarker - timeAtLeftEdge) * pixelsPerSecond;
        if (x >= 0 && x <= width) {
          ctx.fillStyle = 'rgba(34, 197, 94, 0.5)'; // green-500
          ctx.fillRect(x, 0, width - x, height);
          
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(x, 0, 2, height);
        } else if (x < 0 && introMarker > 0) {
          // If marker is way off left, the rest of the clip is active, but we only highlight from marker onwards
          // Wait, if intro marker is on left, then the right side of it is active.
          ctx.fillStyle = 'rgba(34, 197, 94, 0.5)';
          ctx.fillRect(0, 0, width, height);
        }
      }
      
      // Draw Outro Marker
      if (outroMarker > 0 && outroMarker <= duration) {
        const x = (outroMarker - timeAtLeftEdge) * pixelsPerSecond;
        if (x >= 0 && x <= width) {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.5)'; // red-500
          ctx.fillRect(0, 0, x, height);
          
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(x, 0, 2, height);
        } else if (x > width) {
           ctx.fillStyle = 'rgba(239, 68, 68, 0.5)'; 
           ctx.fillRect(0, 0, width, height);
        }
      }

      // Draw Waveform peaks
      const peaksPerSecond = peaks.length / duration;
      const startPeakIdx = Math.max(0, Math.floor(timeAtLeftEdge * peaksPerSecond));
      const endPeakIdx = Math.min(peaks.length, Math.ceil((currentTime + (zoomTimeWindow / 2)) * peaksPerSecond));
      
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, `${color}99`);
      gradient.addColorStop(0.5, color);
      gradient.addColorStop(1, `${color}99`);
      ctx.fillStyle = gradient;

      for (let i = startPeakIdx; i < endPeakIdx; i++) {
        const peakTime = i / peaksPerSecond;
        const x = (peakTime - timeAtLeftEdge) * pixelsPerSecond;
        
        const peak = peaks[i];
        const h = Math.max(1, peak * height * 0.9);
        const y = (height - h) / 2;
        
        // Ensure we draw at least 1px wide lines for visibility
        ctx.fillRect(x, y, 1.5, h);
      }

      animationFrameId = requestAnimationFrame(drawZoomedWaveform);
    };

    animationFrameId = requestAnimationFrame(drawZoomedWaveform);
    return () => cancelAnimationFrame(animationFrameId);
  }, [peaks, segments, color, deckId, zoomTimeWindow, bpm, introMarker, outroMarker]);

  const onMarkerChangeRef = useRef(onMarkerChange);
  useEffect(() => {
    onMarkerChangeRef.current = onMarkerChange;
  }, [onMarkerChange]);

  const getMouseTime = (e: ReactMouseEvent | globalThis.MouseEvent) => {
    if (!containerRef.current) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    
    const engine = AudioEngine.getInstance();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    const currentTime = deckEngine.getCurrentTime();
    
    const timeAtLeftEdge = currentTime - (zoomTimeWindow / 2);
    const timeOffset = (x / rect.width) * zoomTimeWindow;
    return timeAtLeftEdge + timeOffset;
  };

  const handleMouseDown = (e: ReactMouseEvent) => {
    const duration = getDuration();
    if (duration <= 0) return;
    
    const clickTime = getMouseTime(e);
    // Threshold is 2% of the zoom window (0.2 seconds)
    const timeThreshold = zoomTimeWindow * 0.02;
    
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

    const engine = AudioEngine.getInstance();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    const currentTime = deckEngine.getCurrentTime();

    setDraggingMarker('scrub');
    setScrubStartX(e.clientX);
    setScrubStartTime(currentTime);
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (draggingMarker) {
        if (draggingMarker === 'scrub') {
          const duration = getDuration();
          if (!containerRef.current || duration <= 0) return;
          const rect = containerRef.current.getBoundingClientRect();
          const pixelsPerSecond = rect.width / zoomTimeWindow;
          const deltaX = e.clientX - scrubStartX;
          
          // Dragging left (negative deltaX) means the track moves left, exposing later audio, so time INCREASES.
          const timeOffset = -(deltaX / pixelsPerSecond);
          let newTime = scrubStartTime + timeOffset;
          newTime = Math.max(0, Math.min(newTime, duration));
          
          onSeek(newTime);
        } else {
          let time = getMouseTime(e);
          const duration = getDuration();
          time = Math.max(0, Math.min(time, duration)); // Clamp to duration
          onMarkerChangeRef.current(draggingMarker, time);
        }
      }
    };

    const onMouseUp = () => {
      setDraggingMarker(null);
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

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full cursor-col-resize"
      onMouseDown={handleMouseDown}
    >
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full"
      />

      {/* Static Central Playhead */}
      <div 
        className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] z-20 pointer-events-none"
        style={{ left: '50%', transform: 'translateX(-50%)' }}
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
    <div className="h-[160px] shrink-0 bg-slate-900 border-2 border-slate-700 rounded-2xl flex flex-col w-full relative overflow-hidden shadow-lg">

      {/* Deck A Overview (20px) */}
      <div className="h-[20px] w-full bg-slate-950 flex relative border-b-2 border-slate-800 group cursor-pointer overflow-hidden">
        {deckA.track ? (
          <div className="absolute inset-0">
            <OverviewWaveform 
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
          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(255,255,255,0.05)_10px,rgba(255,255,255,0.05)_20px)]"></div>
        )}
      </div>

      {/* Deck A Zoom Grid (60px) */}
      <div className="flex-1 h-[60px] w-full relative flex items-center border-b-[1px] border-slate-700 overflow-hidden bg-slate-900">
        {deckA.track ? (
          <div className="w-full h-full relative">
            <ZoomWaveform 
              deckId="A"
              peaks={deckA.peaks}
              segments={deckA.segments}
              introMarker={deckA.introMarker}
              outroMarker={deckA.outroMarker}
              bpm={deckA.track.bpm}
              color="#3b82f6"
              onSeek={handleSeekA}
              onMarkerChange={handleMarkerChangeA}
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-600 font-mono tracking-widest">
            NO TRACK LOADED
          </div>
        )}
      </div>

      {/* Deck B Zoom Grid (60px) */}
      <div className="flex-1 h-[60px] w-full relative flex items-center border-t-[1px] border-slate-700 overflow-hidden bg-slate-900">
        {deckB.track ? (
          <div className="w-full h-full relative">
            <ZoomWaveform 
              deckId="B"
              peaks={deckB.peaks}
              segments={deckB.segments}
              introMarker={deckB.introMarker}
              outroMarker={deckB.outroMarker}
              bpm={deckB.track.bpm}
              color="#06b6d4"
              onSeek={handleSeekB}
              onMarkerChange={handleMarkerChangeB}
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-600 font-mono tracking-widest">
            NO TRACK LOADED
          </div>
        )}
      </div>

      {/* Deck B Overview (20px) */}
      <div className="h-[20px] w-full bg-slate-950 flex relative border-t-2 border-slate-800 group cursor-pointer overflow-hidden">
        {deckB.track ? (
          <div className="absolute inset-0">
            <OverviewWaveform 
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
          <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(255,255,255,0.05)_10px,rgba(255,255,255,0.05)_20px)]"></div>
        )}
      </div>

    </div>
  );
};
