import React, { useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';
import { useLibraryStore } from '../store/libraryStore';
import { useDeckControl } from '../hooks/useDeckControl';
import type { Track } from '../types/mixer';
import { parseM3U } from '../utils/m3uParser';
import { db } from '../services/Database';
import { Settings2 } from 'lucide-react';
import { SortSettings } from './SortSettings';

interface MiniPlaylistProps {
  onExpandLibrary?: () => void;
}

export const MiniPlaylist: React.FC<MiniPlaylistProps> = ({ onExpandLibrary }) => {
  const library = useLibraryStore(state => state.library);
  const setLibrary = useLibraryStore(state => state.setLibrary);
  const deckA = useDeckControl('A');
  const deckB = useDeckControl('B');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showSettings, setShowSettings] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  
  // Slice to show up to 5 tracks initially
  const tracks = library || [];

  const formatTime = (seconds?: number | string) => {
    if (!seconds) return '0:00';
    const s = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDoubleClick = (track: Track) => {
    deckA.loadTrack(track);
  };

  const onDragStart = (e: React.DragEvent, idx: number) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    // Small timeout to allow drag image to render before applying styles to original
    setTimeout(() => {
      if (e.target instanceof HTMLElement) {
        e.target.style.opacity = '0.5';
      }
    }, 0);
  };

  const onDragEnterItem = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;

    const newTracks = [...tracks];
    const draggedTrack = newTracks[draggedIdx];
    newTracks.splice(draggedIdx, 1);
    newTracks.splice(idx, 0, draggedTrack);
    
    setDraggedIdx(idx);
    setLibrary(newTracks);
  };

  const onDragEnd = (e: React.DragEvent) => {
    setDraggedIdx(null);
    if (e.target instanceof HTMLElement) {
      e.target.style.opacity = '1';
    }
  };

  const handlePlaylistFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseM3U(text);
      if (parsed.length > 0) {
        // Fetch all tracks once to avoid n concurrent full table scans
        const allTracks = await db.tracks.toArray();
        const sessionHandles = useLibraryStore.getState().sessionHandles;

        // Resolve tracks from Dexie using paths
        let playableCount = 0;
        let missingCount = 0;
        
        const resolvedTracks = parsed.map(path => {
           // Decode URI component in case the m3u has URL encoded file paths (like %20 for space)
           const filename = decodeURIComponent(path.split(/[/\\]/).pop() || path).replace(/^["']|["']$/g, '').trim();
           
           // Dexie's 'filePath' is populated with handle.name which is the exact filename
           // Use case-insensitive filter to handle Windows path discrepancies
           const match = allTracks.find(t => 
             (t.filePath && t.filePath.toLowerCase() === filename.toLowerCase()) || 
             (t.fileName && t.fileName.toLowerCase() === filename.toLowerCase()) ||
             (t.title && `${t.title.toLowerCase()}.${(t.fileType||'mp3').toLowerCase()}` === filename.toLowerCase())
           );

           if (match) {
             const handles = sessionHandles[match.id];
             const finalFileHandle = handles?.fileHandle || match.fileHandle;
             const finalRawFile = handles?.rawFile || match.rawFile;
             
             if (finalFileHandle || finalRawFile) {
               playableCount++;
             } else {
               missingCount++;
             }
             
             return { 
               ...match, 
               url: '', 
               duration: match.duration.toString(),
               fileHandle: finalFileHandle,
               rawFile: finalRawFile
             } as unknown as Track;
           }
           
           missingCount++;
           // Fallback for missing tracks
           return {
             id: path,
             title: filename || 'Unknown',
             artist: 'Unknown',
             duration: '0',
             url: '',
             filePath: path,
             bpm: 120
           } as Track;
        });
        
        setLibrary(resolvedTracks);
        
        if (playableCount === 0) {
          alert(`Found ${parsed.length} tracks in playlist, but none are currently loaded in your library. Please use 'Load Library' on the folder containing them so they can be played!`);
        } else if (playableCount < parsed.length) {
          alert(`Playlist loaded. ${playableCount} tracks are playable. ${missingCount} tracks are missing from your loaded library. Please load the containing folder to play them.`);
        }
      }
    } catch(e) {
      console.error('Failed to parse playlist', e);
    }
  };

  const onDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const onDrop = async (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.m3u') || file.name.endsWith('.m3u8')) {
        await handlePlaylistFile(file);
      }
    }
  };

  return (
    <div 
      className="w-full flex-1 flex flex-col relative min-h-0"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      
      {/* Header / Expand Toggle (Pill) */}
      <div className="h-[32px] bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 rounded-full flex items-center justify-between px-4 z-10 shrink-0 mb-2 shadow-sm">
        
        <div className="flex items-center gap-3">
          <span className="text-[14px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">
            Mixer Queue
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono font-bold bg-slate-200 dark:bg-slate-900/50 px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-700/50">
            {tracks.length}
          </span>
          
          <div className="w-px h-4 bg-slate-300 dark:bg-slate-700 ml-1 mr-1"></div>

          <div className="relative">
            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-full transition-colors ${showSettings ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'bg-transparent text-slate-700 dark:text-white hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
              title="Sort Settings"
            >
              <Settings2 size={14} />
              <span className="text-[11px] font-bold uppercase tracking-widest">Sort</span>
            </button>
            {showSettings && <SortSettings onClose={() => setShowSettings(false)} />}
          </div>
        </div>
        
        <div className="flex items-center">
          <button 
            onClick={onExpandLibrary}
            className="text-slate-700 dark:text-white hover:text-slate-900 dark:hover:text-slate-200 transition flex items-center gap-1.5 group px-2 py-1 rounded-full bg-transparent border-transparent"
          >
            <span className="text-[11px] font-bold uppercase tracking-widest group-hover:text-blue-500 dark:group-hover:text-blue-400">Expand</span>
            <div className="w-3 h-3 flex items-center justify-center text-[11px] group-hover:text-blue-500 transition-colors">
              ▲
            </div>
          </button>
        </div>
      </div>

      {/* Track List */}
      <div className="flex-1 overflow-y-auto pr-1 pb-2 space-y-px relative scrollbar-hide" style={{
        scrollbarWidth: 'none',
      }}>
        {tracks.length > 0 ? (
          tracks.map((track, idx) => (
            <div 
              key={track.id || idx} 
              draggable 
              onDragStart={(e) => onDragStart(e, idx)}
              onDragEnter={(e) => onDragEnterItem(e, idx)}
              onDragEnd={onDragEnd}
              onDoubleClick={() => handleDoubleClick(track)} 
              className={`flex items-center px-2 py-0.5 bg-transparent hover:bg-slate-200/50 dark:hover:bg-slate-800/50 rounded-sm group transition-colors cursor-pointer ${draggedIdx === idx ? 'opacity-50' : ''}`}
            >
              
              {/* Drag Handle */}
              <div className="w-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 cursor-grab text-[11px]">
                ≡
              </div>
              
              {/* Title & Artist */}
              <div className="flex-1 flex items-baseline gap-2 truncate mr-2">
                <span className="text-[14px] font-bold text-slate-700 dark:text-slate-300 truncate">{track.title || 'Unknown Title'}</span>
                <span className="text-[13px] text-slate-500 truncate">{track.artist || 'Unknown Artist'}</span>
              </div>
              
              {/* BPM */}
              <div className="w-10 text-right text-[13px] font-mono text-slate-500 dark:text-slate-400">
                {track.bpm ? track.bpm.toFixed(1) : '-'}
              </div>
              
              {/* Key */}
              <div className="w-8 text-right text-[13px] font-mono text-slate-400 dark:text-slate-500">
                {track.key || '-'}
              </div>

              {/* Energy */}
              <div className="w-8 text-right text-[13px] font-mono text-slate-400 dark:text-slate-500">
                {track.energy ? track.energy.toFixed(1) : '-'}
              </div>
              
              {/* Duration */}
              <div className="w-12 text-right text-[13px] font-mono text-slate-400 dark:text-slate-500">
                {formatTime(track.duration)}
              </div>
              
              {/* Load Targets (Hover) */}
              <div className="w-12 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                <button 
                  onClick={(e) => { e.stopPropagation(); deckA.loadTrack(track); }}
                  className="px-1.5 py-0.5 text-[9px] font-bold bg-slate-200 dark:bg-slate-700 hover:bg-blue-600 text-slate-500 dark:text-slate-300 hover:text-white rounded transition-colors">
                  A
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); deckB.loadTrack(track); }}
                  className="px-1.5 py-0.5 text-[9px] font-bold bg-slate-200 dark:bg-slate-700 hover:bg-amber-500 text-slate-500 dark:text-slate-300 hover:text-white rounded transition-colors">
                  B
                </button>
              </div>

            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 dark:text-slate-400 font-mono text-sm gap-2">
            <div>DRAG & DROP .M3U PLAYLIST OR</div>
            <input 
              type="file" 
              accept=".m3u,.m3u8" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handlePlaylistFile(e.target.files[0]);
                }
              }} 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 underline underline-offset-4"
            >
              Open M3U Playlist
            </button>
          </div>
        )}
      </div>

    </div>
  );
};
