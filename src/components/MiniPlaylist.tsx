import React from 'react';
import { useLibraryStore } from '../store/libraryStore';

export const MiniPlaylist: React.FC = () => {
  const library = useLibraryStore(state => state.library);
  
  // Slice to show up to 5 tracks initially
  const tracks = library || [];

  const formatTime = (seconds?: number | string) => {
    if (!seconds) return '0:00';
    const s = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full h-[210px] flex flex-col relative shrink-0 mt-0">
      
      {/* Header / Expand Toggle (Floating) */}
      <div className="h-[40px] bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-2xl flex items-center justify-between px-4 z-10 shadow-sm shrink-0 mb-[10px]">
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Queue
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
            {tracks.length} Tracks
          </span>
        </div>
        
        <button className="text-slate-500 hover:text-slate-800 dark:hover:text-white transition flex items-center gap-2 group">
          <span className="text-[10px] font-bold uppercase tracking-widest group-hover:text-blue-500 dark:group-hover:text-blue-400">Expand Library</span>
          <div className="w-5 h-5 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center border border-slate-300 dark:border-slate-600 group-hover:border-blue-500 transition-colors">
            ▲
          </div>
        </button>
      </div>

      {/* Table Headers (Floating visually above list) */}
      <div className="flex items-center px-4 py-1.5 mb-[10px] text-[10px] font-bold text-slate-500 uppercase tracking-widest z-10 shrink-0">
        <div className="w-8"></div>
        <div className="flex-1">Track</div>
        <div className="w-16 text-right">BPM</div>
        <div className="w-16 text-right">Key</div>
        <div className="w-16 text-right">Time</div>
        <div className="w-24"></div> {/* Load buttons spacer */}
      </div>

      {/* Track List */}
      <div className="flex-1 overflow-y-auto pr-2 pb-4 space-y-2 relative" style={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--tw-colors-slate-400) transparent'
      }}>
        {tracks.length > 0 ? (
          tracks.map((track, idx) => (
            <div key={track.id || idx} className="flex items-center px-4 h-12 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 shadow-sm group transition-all cursor-pointer">
              
              {/* Drag Handle */}
              <div className="w-8 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 cursor-grab">
                ≡
              </div>
              
              {/* Title & Artist */}
              <div className="flex-1 flex items-baseline gap-2 truncate">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate max-w-[300px]">{track.title || 'Unknown Title'}</span>
                <span className="text-xs text-slate-500 truncate max-w-[200px]">{track.artist || 'Unknown Artist'}</span>
              </div>
              
              {/* BPM */}
              <div className="w-16 text-right text-xs font-mono text-slate-600 dark:text-slate-400 font-bold">
                {track.bpm ? track.bpm.toFixed(1) : '-'}
              </div>
              
              {/* Key */}
              <div className="w-16 text-right text-xs font-mono text-slate-500 dark:text-slate-400">
                {track.key || '-'}
              </div>
              
              {/* Duration */}
              <div className="w-16 text-right text-xs font-mono text-slate-500 dark:text-slate-500">
                {formatTime(track.duration)}
              </div>
              
              {/* Load Targets (Hover) */}
              <div className="w-24 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="px-2 py-1 text-[9px] font-bold bg-slate-100 dark:bg-slate-700 hover:bg-blue-600 text-slate-600 dark:text-slate-300 hover:text-white rounded transition-colors border border-slate-300 dark:border-slate-600 hover:border-blue-500">
                  A
                </button>
                <button className="px-2 py-1 text-[9px] font-bold bg-slate-100 dark:bg-slate-700 hover:bg-amber-500 text-slate-600 dark:text-slate-300 hover:text-white rounded transition-colors border border-slate-300 dark:border-slate-600 hover:border-amber-400">
                  B
                </button>
              </div>

            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-400 font-mono text-sm gap-2">
            <div>NO TRACKS IN QUEUE</div>
            <button className="text-xs text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 underline underline-offset-4">Open Library Manager</button>
          </div>
        )}
      </div>

    </div>
  );
};
