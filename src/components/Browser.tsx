import React from 'react';
import { Music, ListMusic, FolderSearch, Trash2, ArrowLeftSquare, ArrowRightSquare } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { useDeckControl } from '../hooks/useDeckControl';
import type { Track } from '../types/mixer';

const formatDuration = (seconds: number | string) => {
  if (typeof seconds === 'string') return seconds;
  if (!seconds || isNaN(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export function Browser() {
  const libraryStore = useLibrary();
  const deckAControl = useDeckControl('A');
  const deckBControl = useDeckControl('B');
  
  const { 
    activeTab, 
    setActiveTab, 
    displayTracks,
    handleLoadDirectory, 
    clearCache,
    fallbackDirInputRef,
    handleFallbackFiles
  } = libraryStore;
  
  const handleLoadTrack = async (track: Track, deckId: 'A' | 'B') => {
    if (deckId === 'A') {
      deckAControl.loadTrack(track);
    } else {
      deckBControl.loadTrack(track);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className="flex-1 flex bg-slate-900 min-h-0">
      {/* @ts-expect-error directory attribute is non-standard but heavily supported */}
      <input type="file" ref={fallbackDirInputRef} style={{ display: 'none' }} multiple webkitdirectory="true" directory="true" onChange={handleFallbackFiles} />
      
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
        </div>

        {activeTab === 'playlists' && (
          <div className="p-4" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>
            <div className={`p-4 border-2 border-dashed rounded-lg text-center transition border-slate-800 bg-slate-900/50`}>
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
            <button onClick={clearCache} className="px-3 py-1.5 ml-auto bg-red-900/40 hover:bg-red-800/60 text-red-300 hover:text-red-200 rounded text-xs font-medium flex justify-center items-center gap-2 transition">
              <Trash2 size={14} /> Clear Cache
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
            </div>
          ) : (
            displayTracks.map((track) => (
              <div key={track.id} className="grid grid-cols-[1fr_1fr_80px_80px_100px] gap-4 px-4 py-2 hover:bg-slate-800/50 rounded-md items-center group transition">
                <div className="font-medium text-sm text-slate-200 truncate">{track.title}</div>
                <div className="text-xs text-slate-400 truncate">{track.artist}</div>
                <div className="font-mono text-xs text-slate-400">{track.bpm}</div>
                <div className="font-mono text-xs text-slate-400">{typeof track.duration === 'number' ? formatDuration(track.duration) : track.duration}</div>
                <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleLoadTrack(track as Track, 'A')} className="p-1.5 bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-400 rounded transition" title="Load to Deck A">
                    <ArrowLeftSquare size={16} />
                  </button>
                  <button onClick={() => handleLoadTrack(track as Track, 'B')} className="p-1.5 bg-slate-800 hover:bg-blue-600 hover:text-white text-slate-400 rounded transition" title="Load to Deck B">
                    <ArrowRightSquare size={16} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
