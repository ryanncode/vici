import React, { useCallback, useRef, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useMixerStore } from '../store/mixerStore';
import { AudioEngine } from '../services/AudioEngine';
import type { TrackSegment } from '../types/mixer';

interface WaveformProps {
  deckId: 'A' | 'B';
  peaks: Float32Array | null;
  bandPeaks?: Float32Array | null;
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
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

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

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    const step = width / peaks.length;

    // The overview is a compressed 20px strip. We use a monochromatic style 
    // based on the deck's primary brand color.
    
    // Convert hex color to rgba for low opacity
    const hexToRgb = (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : { r: 255, g: 255, b: 255 };
    };
    
    const rgb = hexToRgb(color);
    
    let fillR = rgb.r;
    let fillG = rgb.g;
    let fillB = rgb.b;
    
    if (!isDark) {
      if (deckId === 'B') {
        fillR = Math.floor(fillR + (255 - fillR) * 0.55);
        fillG = Math.floor(fillG + (255 - fillG) * 0.55);
        fillB = Math.floor(fillB + (255 - fillB) * 0.55);
      } else {
        fillR = Math.floor(fillR + (255 - fillR) * 0.40);
        fillG = Math.floor(fillG + (255 - fillG) * 0.40);
        fillB = Math.floor(fillB + (255 - fillB) * 0.40);
      }
    }
    
    const opacity = isDark ? 0.2 : 0.10;
    ctx.fillStyle = `rgba(${fillR}, ${fillG}, ${fillB}, ${opacity})`;

    for (let i = 0; i < peaks.length; i++) {
      const peak = peaks[i];
      const h_px = Math.max(1, peak * height);
      const x = i * step;
      const y = (height - h_px) / 2;
      ctx.fillRect(x, y, Math.max(1, step - 0.5), h_px);
    }
  }, [peaks, color, deckId, isDark]);

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
        className="absolute top-0 bottom-0 left-0 bg-slate-900/5 dark:bg-slate-950/40 pointer-events-none mix-blend-overlay border-r-[2px] border-[#dce3ec] dark:border-slate-500/70 z-20"
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
  firstBeatOffset?: number;
}

const ZoomWaveform: React.FC<ZoomWaveformProps> = React.memo(({
  deckId,
  peaks,
  bandPeaks,
  segments,
  introMarker,
  outroMarker,
  color,
  bpm,
  firstBeatOffset,
  onSeek,
  onMarkerChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [draggingMarker, setDraggingMarker] = useState<'intro' | 'outro' | 'scrub' | null>(null);
  const [scrubStartX, setScrubStartX] = useState<number>(0);
  const [scrubStartTime, setScrubStartTime] = useState<number>(0);
  const zoomTimeWindow = 10; // Show 10 seconds of audio on screen
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

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
      
      const store = useMixerStore.getState();
      const currentPitch = (deckId === 'A' ? store.deckA : store.deckB).pitch;
      const currentZoomTimeWindow = zoomTimeWindow * currentPitch;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      // Update dimensions only if they changed to avoid canvas clear overhead,
      // but actually we need to clear every frame anyway.
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const width = rect.width;
      const height = rect.height;

      if (width <= 0 || height <= 0) {
        animationFrameId = requestAnimationFrame(drawZoomedWaveform);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      // Light mode 'multiply' blending requires a solid white background 
      // instead of a transparent canvas, otherwise the subtraction fails.
      if (!isDark) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }

      // We are showing `currentZoomTimeWindow` seconds across the full `width`.
      // The center of the canvas is `currentTime`.
      const pixelsPerSecond = width / currentZoomTimeWindow;
      const timeAtLeftEdge = currentTime - (currentZoomTimeWindow / 2);
      
      // Draw grid overlay (beat markers)
      if (bpm && bpm > 0) {
        const beatInterval = 60 / bpm; // seconds per beat
        
        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'; // Even lower contrast
        ctx.lineWidth = 1; // Thinner lines
        
        const offset = firstBeatOffset || 0;
        const adjustedLeftEdge = timeAtLeftEdge - offset;

        // Find the first beat time that is visible on the left edge
        const firstVisibleBeatIdx = Math.floor(adjustedLeftEdge / beatInterval);
        
        ctx.beginPath();
        for (let i = firstVisibleBeatIdx; ; i++) {
          const beatTime = offset + i * beatInterval;
          const x = (beatTime - timeAtLeftEdge) * pixelsPerSecond;
          
          if (x > width) break;
          
          if (x >= 0) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
          }
        }
        ctx.stroke();
      }

      // Draw Intro Region (from start of track to intro marker)
      if (introMarker > 0) {
        const x = (introMarker - timeAtLeftEdge) * pixelsPerSecond;
        if (x >= 0 && x <= width) {
          ctx.fillStyle = 'rgba(34, 197, 94, 0.15)'; // green-500
          ctx.fillRect(0, 0, x, height);
          
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(x, 0, 2, height);
        } else if (x > width) {
          // If marker is off right edge, entire view is inside intro region
          ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
          ctx.fillRect(0, 0, width, height);
        }
      }
      
      // Draw Outro Region (from outro marker to end of track)
      if (outroMarker > 0 && outroMarker < duration) {
        const x = (outroMarker - timeAtLeftEdge) * pixelsPerSecond;
        if (x >= 0 && x <= width) {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.15)'; // red-500
          ctx.fillRect(x, 0, width - x, height);
          
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(x, 0, 2, height);
        } else if (x < 0) {
          // If marker is off left edge, entire view is inside outro region
          ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
          ctx.fillRect(0, 0, width, height);
        }
      }

      // Draw Waveform peaks
      const peaksPerSecond = peaks.length / duration;
      const startPeakIdx = Math.max(0, Math.floor(timeAtLeftEdge * peaksPerSecond));
      const endPeakIdx = Math.min(peaks.length, Math.ceil((currentTime + (currentZoomTimeWindow / 2)) * peaksPerSecond));
      
      if (bandPeaks && bandPeaks.length === peaks.length * 3) {
        ctx.globalCompositeOperation = isDark ? 'source-over' : 'multiply';
        
        const colors = isDark 
          ? { l: '#3b82f6', m: '#6366f1', h: '#2dd4bf' }
          : { l: '#93c5fd', m: '#d8b4fe', h: '#86efac' };

        ctx.globalAlpha = isDark ? 0.45 : 0.65;

        // Low Band (Bass)
        ctx.fillStyle = colors.l;
        for (let i = startPeakIdx; i < endPeakIdx; i++) {
          const peakTime = i / peaksPerSecond;
          const x = (peakTime - timeAtLeftEdge) * pixelsPerSecond;
          const val = bandPeaks[i*3];
          const h = Math.round(Math.max(1, val * height * 0.9));
          const y = Math.floor((height - h) / 2);
          ctx.fillRect(x, y, 1.5, h);
        }

        // Mid Band (Midrange)
        ctx.fillStyle = colors.m;
        for (let i = startPeakIdx; i < endPeakIdx; i++) {
          const peakTime = i / peaksPerSecond;
          const x = (peakTime - timeAtLeftEdge) * pixelsPerSecond;
          const val = bandPeaks[i*3+1];
          const h = Math.round(Math.max(1, val * height * 0.9));
          const y = Math.floor((height - h) / 2);
          ctx.fillRect(x, y, 1.5, h);
        }

        // High Band (Treble)
        ctx.fillStyle = colors.h;
        for (let i = startPeakIdx; i < endPeakIdx; i++) {
          const peakTime = i / peaksPerSecond;
          const x = (peakTime - timeAtLeftEdge) * pixelsPerSecond;
          const val = bandPeaks[i*3+2];
          const h = Math.round(Math.max(1, val * height * 0.9));
          const y = Math.floor((height - h) / 2);
          ctx.fillRect(x, y, 1.5, h);
        }

        // Reset composite operation and alpha to source-over so playheads and markers draw normally
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
      } else {
        // Monochromatic Mode
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, `${color}99`);
        gradient.addColorStop(0.5, color);
        gradient.addColorStop(1, `${color}99`);
        ctx.fillStyle = gradient;

        for (let i = startPeakIdx; i < endPeakIdx; i++) {
          const peakTime = i / peaksPerSecond;
          const x = (peakTime - timeAtLeftEdge) * pixelsPerSecond;
          
          const peak = peaks[i];
          const h = Math.round(Math.max(1, peak * height * 0.9));
          const y = Math.floor((height - h) / 2);
          
          // Ensure we draw at least 1px wide lines for visibility
          ctx.fillRect(x, y, 2, h);
        }
      }

      animationFrameId = requestAnimationFrame(drawZoomedWaveform);
    };

    animationFrameId = requestAnimationFrame(drawZoomedWaveform);
    return () => cancelAnimationFrame(animationFrameId);
  }, [peaks, segments, color, deckId, zoomTimeWindow, bpm, firstBeatOffset, introMarker, outroMarker, bandPeaks, isDark]);

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
        className="absolute top-0 bottom-0 w-[2px] bg-white dark:bg-white/90 z-20 pointer-events-none drop-shadow-[0_0_2px_rgba(0,0,0,0.5)]"
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
    <div className="h-[160px] shrink-0 bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700 rounded-2xl flex flex-col w-full relative overflow-hidden shadow-lg">

      {/* Deck A Overview (20px) */}
      <div className="h-[20px] w-full bg-slate-100 dark:bg-slate-950 flex relative border-b-2 border-slate-300 dark:border-slate-800 group cursor-pointer overflow-hidden">
        {deckA.track ? (
          <div className="absolute inset-0">
            <OverviewWaveform 
              deckId="A"
              peaks={deckA.peaks}
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

      {/* Deck A Zoom Grid (60px) */}
      <div className="flex-1 h-[60px] w-full relative flex items-center border-b-[1px] border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
        {deckA.track ? (
          <div className="w-full h-full relative">
            <ZoomWaveform 
              deckId="A"
              peaks={deckA.peaks}
              bandPeaks={deckA.bandPeaks}
              segments={deckA.segments}
              introMarker={deckA.introMarker}
              outroMarker={deckA.outroMarker}
              bpm={deckA.track.bpm}
              firstBeatOffset={deckA.track.firstBeatOffset}
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

      {/* Deck B Zoom Grid (60px) */}
      <div className="flex-1 h-[60px] w-full relative flex items-center border-t-[1px] border-slate-300 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
        {deckB.track ? (
          <div className="w-full h-full relative">
            <ZoomWaveform 
              deckId="B"
              peaks={deckB.peaks}
              bandPeaks={deckB.bandPeaks}
              segments={deckB.segments}
              introMarker={deckB.introMarker}
              outroMarker={deckB.outroMarker}
              bpm={deckB.track.bpm}
              firstBeatOffset={deckB.track.firstBeatOffset}
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
      <div className="h-[20px] w-full bg-slate-100 dark:bg-slate-950 flex relative border-t-2 border-slate-300 dark:border-slate-800 group cursor-pointer overflow-hidden">
        {deckB.track ? (
          <div className="absolute inset-0">
            <OverviewWaveform 
              deckId="B"
              peaks={deckB.peaks}
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
