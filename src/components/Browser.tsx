import React from 'react';
import { ListMusic, FolderSearch, Trash2, ArrowLeftSquare, ArrowRightSquare } from 'lucide-react';
import { useLibrary } from '../hooks/useLibrary';
import { useDeckControl } from '../hooks/useDeckControl';
import { useLibraryStore } from '../store/libraryStore';
import type { Track, TrackMetadata } from '../types/mixer';

const formatDuration = (seconds: number | string) => {
  if (typeof seconds === 'string') return seconds;
  if (!seconds || isNaN(seconds) || seconds < 0) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const Browser = React.memo(function Browser() {
  const deckAControl = useDeckControl('A');
  const deckBControl = useDeckControl('B');
  
  const { 
    displayTracks,
    handleLoadDirectory, 
    clearCache,
    fallbackDirInputRef,
    fileInputRef,
    handleFallbackFiles,
    processDropItems,
    isImporting,
    importProgress,
    crates,
    activeCrateId,
    setActiveCrateId
  } = useLibrary();

  React.useEffect(() => {
    if (crates.length > 0 && !activeCrateId) {
      setActiveCrateId(crates[0].id);
    }
  }, [crates, activeCrateId, setActiveCrateId]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) return;
      
      if (crates.length === 0) return;
      const currentIndex = crates.findIndex((c: { id: string }) => c.id === activeCrateId);
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % crates.length;
        setActiveCrateId(crates[nextIndex].id);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex === -1 ? crates.length - 1 : (currentIndex - 1 + crates.length) % crates.length;
        setActiveCrateId(crates[prevIndex].id);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const activeCrate = crates.find((c: { id: string, name: string, trackIds: string[] }) => c.id === activeCrateId);
        if (activeCrate) {
          handleLoadCrateToQueue(undefined, activeCrate as { id: string, name: string, trackIds: string[] });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [crates, activeCrateId, setActiveCrateId]);

  const handleSelectCrate = (crate: { id: string }) => {
    setActiveCrateId(crate.id);
  };

  const handleLoadCrateToQueue = async (e: React.MouseEvent | undefined, crate: { id: string, name: string, trackIds: string[] }) => {
    if (e) e.stopPropagation();
    if (crate && crate.trackIds) {
      const db = (await import('../services/Database')).db;
      const tracks = await db.tracks.where('id').anyOf(crate.trackIds).toArray();
      // Keep exact order
      const trackMap = new Map(tracks.map(t => [t.id, t]));
      const orderedTracks = crate.trackIds.map(id => trackMap.get(id)).filter(Boolean) as TrackMetadata[];
      const playableTracks = orderedTracks.map(t => ({ ...t, url: '', duration: t.duration.toString() })) as unknown as Track[];
      useLibraryStore.getState().setLibrary(playableTracks);
    }
  };
  
  const [storageUsage, setStorageUsage] = React.useState<number | null>(null);
  const [storageQuota, setStorageQuota] = React.useState<number | null>(null);

  const fetchStorage = async () => {
     const estimate = await window.navigator.storage?.estimate?.();
     if (estimate) {
        setStorageUsage(estimate.usage || 0);
        setStorageQuota(estimate.quota || 0);
     }
  };

  React.useEffect(() => {
    fetchStorage();
    const interval = setInterval(fetchStorage, 10000);
    window.addEventListener('storage-updated', fetchStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage-updated', fetchStorage);
    };
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const items = e.dataTransfer.items;
    if (items) {
      processDropItems(items);
    }
  };

  const [draggedIdx, setDraggedIdx] = React.useState<number | null>(null);

  const onDragStart = (e: React.DragEvent, idx: number) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => {
      if (e.target instanceof HTMLElement) {
        e.target.style.opacity = '0.5';
      }
    }, 0);
  };

  const onDragEnterItem = async (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;

    const newTracks = [...displayTracks];
    const draggedTrack = newTracks[draggedIdx];
    newTracks.splice(draggedIdx, 1);
    newTracks.splice(idx, 0, draggedTrack);
    setDraggedIdx(idx);
    
    if (activeCrateId) {
      const db = (await import('../services/Database')).db;
      const crate = await db.playlists.get(activeCrateId);
      if (crate) {
        crate.trackIds = newTracks.map(t => t.id);
        await db.playlists.put(crate);
      }
    }
  };

  const onDragEnd = (e: React.DragEvent) => {
    setDraggedIdx(null);
    if (e.target instanceof HTMLElement) {
      e.target.style.opacity = '1';
    }
  };

  return (
    <div className="flex-1 flex bg-slate-100 dark:bg-slate-900 min-h-0">
      {/* @ts-expect-error directory attribute is non-standard but heavily supported */}
      <input type="file" ref={fallbackDirInputRef} style={{ display: 'none' }} multiple webkitdirectory="true" directory="true" onChange={handleFallbackFiles} />
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} multiple accept="audio/*,.m3u,.m3u8" onChange={handleFallbackFiles} />
      
      <div className="w-64 border-r border-slate-300 dark:border-slate-800 flex flex-col bg-slate-50/50 dark:bg-slate-950/50">
        <div className="p-4 border-b border-slate-300 dark:border-slate-800">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Crates</div>
          <div className="flex gap-2 mb-4">
             <button onClick={handleLoadDirectory} className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-500/20 rounded text-[10px] font-medium flex justify-center items-center gap-1 transition">
               <FolderSearch size={12} /> Load Folder
             </button>
             { 'showDirectoryPicker' in window && (
               <button onClick={() => fileInputRef.current?.click()} className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-500/20 rounded text-[10px] font-medium flex justify-center items-center gap-1 transition">
                 <ListMusic size={12} /> Load Playlist
               </button>
             )}
          </div>
          <div className="flex flex-col gap-1">
            {crates.length === 0 ? (
              <div className="text-xs text-slate-500 p-2 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded">
                No Crates Loaded
              </div>
            ) : (
              crates.map(crate => (
                <div 
                  key={crate.id}
                  onClick={() => handleSelectCrate(crate)}
                  className={`group flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition cursor-pointer ${activeCrateId === crate.id ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900 hover:text-slate-800 dark:hover:text-slate-200'}`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <ListMusic size={16} className="shrink-0" /> 
                    <span className="truncate">{crate.name}</span>
                  </div>
                  <button
                    onClick={(e) => handleLoadCrateToQueue(e, crate)}
                    className="opacity-0 group-hover:opacity-100 p-1 bg-slate-200 dark:bg-slate-800 hover:bg-blue-600 dark:hover:bg-blue-600 hover:text-white text-slate-500 dark:text-slate-400 rounded transition shrink-0"
                    title="Load to Mixer Queue"
                  >
                    Load
                  </button>
                </div>
              ))
            )}
          </div>
          
          {storageQuota !== null && storageUsage !== null && (
            <div className="mt-6 pt-4 border-t border-slate-300 dark:border-slate-800">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between">
                <span>OPFS Storage</span>
                <span>{Math.round((storageUsage / storageQuota) * 100)}%</span>
              </div>
              <div className="w-full bg-slate-300 dark:bg-slate-900 rounded-full h-1.5 mb-1">
                <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (storageUsage / storageQuota) * 100)}%` }}></div>
              </div>
              <div className="text-[10px] text-slate-500 text-right">
                {formatBytes(storageUsage)} / {formatBytes(storageQuota)}
              </div>
              <button onClick={clearCache} className="mt-3 w-full px-3 py-1.5 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/60 text-red-600 dark:text-red-300 hover:text-red-700 dark:hover:text-red-200 rounded text-xs font-medium flex justify-center items-center gap-2 transition">
                <Trash2 size={14} /> Clear Cache
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50/80 dark:bg-slate-900/80 p-2 sm:p-4 flex flex-col">
        <div className="p-4" onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>
          <div className={`p-4 border-2 border-dashed rounded-lg text-center transition border-slate-300 dark:border-slate-800 ${isImporting ? 'bg-blue-100/50 dark:bg-blue-900/30 border-blue-500/50' : 'bg-slate-200/50 dark:bg-slate-900/50'}`}>
            {isImporting ? (
              <div className="flex flex-col items-center gap-2">
                <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Importing Crate... {importProgress}%</div>
                <div className="w-full bg-slate-300 dark:bg-slate-900 rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${importProgress}%` }}></div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">Drag & drop a folder here to load it as a Crate.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_1fr_60px_60px_60px_60px_100px] gap-4 px-4 py-2 border-b border-slate-300 dark:border-slate-800 text-[10px] font-bold text-slate-500 tracking-wider shrink-0 mt-4">
          <div>TITLE</div>
          <div>ARTIST</div>
          <div>BPM</div>
          <div>KEY</div>
          <div>YEAR</div>
          <div>TIME</div>
          <div className="text-center">LOAD</div>
        </div>
        
        <div className="flex flex-col mt-2 flex-1 overflow-auto pb-4">
          {displayTracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-sm gap-2">
              <p>The active crate is empty. Load a directory or select a crate.</p>
            </div>
          ) : (
            displayTracks.map((track: Track | TrackMetadata, idx: number) => (
              <div 
                key={track.id} 
                draggable
                onDragStart={(e) => onDragStart(e, idx)}
                onDragEnter={(e) => onDragEnterItem(e, idx)}
                onDragEnd={onDragEnd}
                className={`grid grid-cols-[1fr_1fr_60px_60px_60px_60px_100px] gap-4 px-4 py-2 even:bg-black/[0.02] dark:even:bg-white/[0.02] hover:bg-slate-200/50 dark:hover:bg-slate-800/50 rounded-md items-center group transition cursor-pointer ${draggedIdx === idx ? 'opacity-50' : ''}`}
              >
                <div className="font-medium text-sm text-slate-800 dark:text-slate-200 truncate flex items-center gap-2">
                  <div className="w-4 text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 cursor-grab">≡</div>
                  {track.title}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{track.artist}</div>
                <div className="font-mono text-xs text-slate-500 dark:text-slate-400">{track.bpm}</div>
                <div className="font-mono text-xs text-slate-500 dark:text-slate-400">{track.key || '-'}</div>
                <div className="font-mono text-xs text-slate-500 dark:text-slate-400">{track.year || '-'}</div>
                <div className="font-mono text-xs text-slate-500 dark:text-slate-400">{typeof track.duration === 'number' ? formatDuration(track.duration) : track.duration}</div>
                <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleLoadTrack(track as Track, 'A')} className="p-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-600 dark:hover:bg-blue-600 hover:text-white text-slate-500 dark:text-slate-400 rounded transition" title="Load to Deck A">
                    <ArrowLeftSquare size={16} />
                  </button>
                  <button onClick={() => handleLoadTrack(track as Track, 'B')} className="p-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-blue-600 dark:hover:bg-blue-600 hover:text-white text-slate-500 dark:text-slate-400 rounded transition" title="Load to Deck B">
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
});
