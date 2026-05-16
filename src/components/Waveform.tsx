import React, { useRef, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { TrackSegment } from '../types/mixer';

interface WaveformProps {
  peaks: Float32Array | null;
  segments?: TrackSegment[];
  currentTime: number;
  duration: number;
  introMarker: number;
  outroMarker: number;
  color: string;
  onSeek: (time: number) => void;
  onMarkerChange: (type: 'intro' | 'outro', time: number) => void;
}

export const Waveform: React.FC<WaveformProps> = ({
  peaks,
  segments,
  currentTime,
  duration,
  introMarker,
  outroMarker,
  color,
  onSeek,
  onMarkerChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingMarker, setDraggingMarker] = useState<'intro' | 'outro' | 'playhead' | null>(null);
  const [dragTime, setDragTime] = useState<number | null>(null);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || peaks.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    // Draw segments (colored blocks)
    if (segments && segments.length > 0 && duration > 0) {
      for (const segment of segments) {
        const startX = (segment.start / duration) * width;
        const endX = (segment.end / duration) * width;
        const segmentWidth = endX - startX;
        
        ctx.fillStyle = `${segment.color}33`; // 20% opacity block
        ctx.fillRect(startX, 0, segmentWidth, height);
      }
    }

    // Draw peaks
    const step = width / peaks.length;
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, `${color}80`); // 50% opacity
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
  }, [peaks, segments, color, duration]);

  // Handle interactions
  const getMouseTime = (e: ReactMouseEvent | globalThis.MouseEvent) => {
    if (!containerRef.current || duration <= 0) return 0;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    return (x / rect.width) * duration;
  };

  const handleMouseDown = (e: ReactMouseEvent) => {
    if (duration <= 0) return;
    
    // Check if clicking near a marker
    const clickTime = getMouseTime(e);
    const timeThreshold = duration * 0.02; // 2% of duration as drag tolerance
    
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

    // Otherwise, start dragging playhead
    setDraggingMarker('playhead');
    setDragTime(clickTime);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (draggingMarker) {
      const time = getMouseTime(e);
      if (draggingMarker === 'playhead') {
        setDragTime(time);
      } else {
        onMarkerChange(draggingMarker, time);
      }
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (draggingMarker === 'playhead') {
      const time = getMouseTime(e);
      onSeek(time);
    }
    setDraggingMarker(null);
    setDragTime(null);
  };

  useEffect(() => {
    if (draggingMarker) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingMarker, duration]);

  const displayTime = draggingMarker === 'playhead' && dragTime !== null ? dragTime : currentTime;
  const progressPct = duration > 0 ? (displayTime / duration) * 100 : 0;
  const introPct = duration > 0 ? (introMarker / duration) * 100 : 0;
  const outroPct = duration > 0 ? (outroMarker / duration) * 100 : 100;

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-16 bg-slate-900/50 rounded overflow-hidden cursor-crosshair border border-slate-800"
      onMouseDown={handleMouseDown}
    >
      {/* Waveform Canvas */}
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full"
      />

      {/* Progress Overlay */}
      <div 
        className="absolute top-0 bottom-0 left-0 bg-slate-950/40 pointer-events-none mix-blend-overlay"
        style={{ width: `${progressPct}%` }}
      />
      
      {/* Playhead */}
      <div 
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_5px_rgba(255,255,255,0.8)] pointer-events-none z-20"
        style={{ left: `${progressPct}%` }}
      />

      {/* Intro Marker */}
      <div 
        className="absolute top-0 bottom-0 w-px bg-green-500 z-10 group"
        style={{ left: `${introPct}%` }}
      >
        <div className={`absolute -top-1 -left-2 w-4 h-4 bg-green-500 rounded-sm cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center ${draggingMarker === 'intro' ? 'opacity-100' : ''}`}>
          <div className="w-0.5 h-2 bg-slate-900 rounded-full" />
        </div>
        <div className="absolute bottom-0 text-[8px] font-bold text-green-500 ml-1">IN</div>
      </div>

      {/* Outro Marker */}
      <div 
        className="absolute top-0 bottom-0 w-px bg-red-500 z-10 group"
        style={{ left: `${outroPct}%` }}
      >
        <div className={`absolute -top-1 -left-2 w-4 h-4 bg-red-500 rounded-sm cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center ${draggingMarker === 'outro' ? 'opacity-100' : ''}`}>
          <div className="w-0.5 h-2 bg-slate-900 rounded-full" />
        </div>
        <div className="absolute bottom-0 text-[8px] font-bold text-red-500 ml-1">OUT</div>
      </div>
    </div>
  );
};
