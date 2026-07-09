import { useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/Database';
import { useLibraryStore } from '../store/libraryStore';
import { loadLocalDirectory, type FileSystemFileHandle } from '../services/FileManager';
import { metadataScanner } from '../services/MetadataScanner';
import { OPFSManager } from '../services/OPFSManager';
import type { Track, TrackMetadata } from '../types/mixer';

export function useLibrary() {
  const store = useLibraryStore();
  
  const fallbackDirInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  // Use a local state for the currently "browsed" crate, separate from the mixer queue
  const [activeCrateId, setActiveCrateId] = useState<string | null>(null);

  useEffect(() => {
    OPFSManager.init();
  }, []);
  
  const browseTracks = useLiveQuery(
    async () => {
      if (!activeCrateId) return [];
      const crate = await db.playlists.get(activeCrateId);
      if (!crate || !crate.trackIds) return [];
      const tracks = await db.tracks.where('id').anyOf(crate.trackIds).toArray();
      // Keep exact order
      const trackMap = new Map(tracks.map(t => [t.id, t]));
      return crate.trackIds.map(id => trackMap.get(id)).filter(Boolean) as TrackMetadata[];
    },
    [activeCrateId]
  ) || [];

  const displayTracks: (Track | TrackMetadata)[] = browseTracks.length > 0 ? browseTracks : [];

  const processDropItems = async (items: DataTransferItemList) => {
    setIsImporting(true);
    setImportProgress(0);
    
    const filesToProcess: { file: File, path: string }[] = [];
    
    const readDirectory = async (dirEntry: any, path = '') => {
      const reader = dirEntry.createReader();
      const entries = await new Promise<any[]>((resolve) => {
        reader.readEntries((res: any[]) => resolve(res));
      });
      
      for (const entry of entries) {
        if (entry.isFile) {
          const file = await new Promise<File>((resolve) => entry.file(resolve));
          if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|flac|ogg)$/i)) {
            filesToProcess.push({ file, path: path + file.name });
          }
        } else if (entry.isDirectory) {
          await readDirectory(entry, path + entry.name + '/');
        }
      }
    };

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.();
        if (entry) {
          if (entry.isDirectory) {
            await readDirectory(entry, entry.name + '/');
          } else if (entry.isFile) {
            const file = item.getAsFile();
            if (file && (file.type.startsWith('audio/') || file.name.match(/\.(mp3|wav|flac|ogg)$/i))) {
              filesToProcess.push({ file, path: file.name });
            }
          }
        }
      }
    }

    if (filesToProcess.length === 0) {
      setIsImporting(false);
      return;
    }

    const newIds: string[] = [];
    const newHandles: Record<string, { rawFile: File }> = {};
    const unScanned: { id: string, rawFile: File, filePath: string, opfsPath?: string }[] = [];

    const playlistName = filesToProcess[0].path.split('/')[0] || `Crate ${new Date().toLocaleDateString()}`;
    const playlistId = `playlist-${Date.now()}`;

    let current = 0;
    for (const item of filesToProcess) {
      const { file, path } = item;
      try {
        const safeFilename = path.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const opfsPath = await OPFSManager.saveFile(file, safeFilename);

        const id = `opfs-${Date.now()}-${current}`;
        await db.tracks.put({
          id,
          filePath: path,
          fileName: file.name,
          title: file.name.replace(/\.[^/.]+$/, ""),
          artist: 'Local File',
          bpm: 120,
          duration: 0,
          opfsPath
        });

        newIds.push(id);
        newHandles[id] = { rawFile: file };
        unScanned.push({ id, rawFile: file, filePath: path, opfsPath });
      } catch (e) {
        console.error("Failed to process file:", file.name, e);
      }
      current++;
      setImportProgress(Math.round((current / filesToProcess.length) * 100));
    }

    let playlistId = `playlist-${Date.now()}`;
    const existing = await db.playlists.where('name').equals(playlistName).first();
    if (existing) {
      playlistId = existing.id;
      existing.trackIds = Array.from(new Set([...existing.trackIds, ...newIds]));
      await db.playlists.put(existing);
    } else {
      await db.playlists.put({
        id: playlistId,
        name: playlistName,
        trackIds: newIds
      });
    }

    setActiveCrateId(playlistId);
    store.setSessionHandles(prev => ({ ...prev, ...newHandles }));
    store.setActiveSessionTrackIds(prev => Array.from(new Set([...prev, ...newIds])));
    store.setSessionStarted(true);
    store.setActiveTab('tracks');
    setIsImporting(false);

    for (const t of unScanned) {
      try {
        await metadataScanner.scanFileHandle(undefined, t.filePath, t.rawFile, t.id);
      } catch (error) {
        console.error("OPFS background scan failed:", error);
      }
    }
  };

  const handleLoadDirectory = async () => {
    if ('showDirectoryPicker' in window) {
      try {
        const handles = await loadLocalDirectory();
        if (handles.length > 0) {
          const newIds: string[] = [];
          const newHandles: Record<string, { fileHandle: FileSystemFileHandle }> = {};
          const unScanned: { id: string, fileHandle: FileSystemFileHandle, filePath: string }[] = [];

          for (let i = 0; i < handles.length; i++) {
             const handle = handles[i];
             const cached = await db.tracks.where('filePath').equals(handle.name).first();
             if (cached) {
                newIds.push(cached.id);
                newHandles[cached.id] = { fileHandle: handle };
                if (!cached.isScanned || cached.duration === 0) {
                  unScanned.push({ id: cached.id, fileHandle: handle, filePath: handle.name });
                }
             } else {
                const id = `temp-${Date.now()}-${i}`;
                await db.tracks.put({
                  id,
                  filePath: handle.name,
                  fileName: handle.name,
                  title: handle.name.replace(/\.[^/.]+$/, ""),
                  artist: 'Unknown Artist',
                  bpm: 120,
                  duration: 0
                });
                newIds.push(id);
                newHandles[id] = { fileHandle: handle };
                unScanned.push({ id, fileHandle: handle, filePath: handle.name });
             }
          }
          
          const playlistName = handles[0].name.split('/')[0] || `Folder ${new Date().toLocaleDateString()}`;
          const playlistId = `playlist-${Date.now()}`;
          let playlistId = `playlist-${Date.now()}`;
          const existing = await db.playlists.where('name').equals(playlistName).first();
          if (existing) {
             playlistId = existing.id;
             existing.trackIds = Array.from(new Set([...existing.trackIds, ...newIds]));
             await db.playlists.put(existing);
          } else {
             await db.playlists.put({
               id: playlistId,
               name: playlistName,
               trackIds: newIds
             });
          }
          
          setActiveCrateId(playlistId);
          store.setSessionHandles(prev => ({ ...prev, ...newHandles }));
          store.setActiveSessionTrackIds(prev => Array.from(new Set([...prev, ...newIds])));
          store.setSessionStarted(true);
          store.setActiveTab('tracks');
          
          const processBackgroundScan = async () => {
            console.log(`[Library] Beginning background scan for ${unScanned.length} items`);
            for (const t of unScanned) {
              try {
                await metadataScanner.scanFileHandle(t.fileHandle, t.filePath, undefined, t.id);
              } catch (error) {
                console.error("[Library] Background scan failed:", error);
              }
            }
          };
          processBackgroundScan();
          return;
        }
      } catch (e) {
        console.warn('Directory picker failed', e);
      }
    }
    fallbackDirInputRef.current?.click();
  };

  const handleFallbackFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const audioFiles = files.filter(f => ['audio/mpeg', 'audio/wav', 'audio/flac', 'audio/ogg'].includes(f.type) || f.name.match(/\.(mp3|wav|flac|ogg)$/i));
    
    if (audioFiles.length === 0) {
      alert("No valid audio files found in selection.");
      return;
    }

    const newIds: string[] = [];
    const newHandles: Record<string, { rawFile: File }> = {};
    const unScanned: { id: string, rawFile: File, filePath: string }[] = [];

    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      const cached = await db.tracks.where('filePath').equals(file.name).first();
      
      if (cached) {
         newIds.push(cached.id);
         newHandles[cached.id] = { rawFile: file };
         if (!cached.isScanned || cached.duration === 0) {
           unScanned.push({ id: cached.id, rawFile: file, filePath: file.name });
         }
      } else {
         const id = `fallback-${Date.now()}-${i}`;
         await db.tracks.put({
           id,
           filePath: file.name,
           fileName: file.name,
           title: file.name.replace(/\.[^/.]+$/, ""),
           artist: 'Local File',
           bpm: 120,
           duration: 0
         });
         newIds.push(id);
         newHandles[id] = { rawFile: file };
         unScanned.push({ id, rawFile: file, filePath: file.name });
      }
    }

    const playlistName = `Folder ${new Date().toLocaleDateString()}`;
    const playlistId = `playlist-${Date.now()}`;
    let playlistId = `playlist-${Date.now()}`;
    const existing = await db.playlists.where('name').equals(playlistName).first();
    if (existing) {
      playlistId = existing.id;
      existing.trackIds = Array.from(new Set([...existing.trackIds, ...newIds]));
      await db.playlists.put(existing);
    } else {
      await db.playlists.put({
        id: playlistId,
        name: playlistName,
        trackIds: newIds
      });
    }

    setActiveCrateId(playlistId);
    store.setSessionHandles(prev => ({ ...prev, ...newHandles }));
    store.setActiveSessionTrackIds(prev => Array.from(new Set([...prev, ...newIds])));
    store.setSessionStarted(true);
    store.setActiveTab('tracks');

    const processFallbackBackgroundScan = async () => {
      for (const t of unScanned) {
        try {
          await metadataScanner.scanFileHandle(undefined, t.filePath, t.rawFile, t.id);
        } catch (error) {
          console.error("Fallback background scan failed:", error);
        }
      }
    };
    processFallbackBackgroundScan();
  };

  const clearCache = async () => {
    if (window.confirm("Are you sure you want to clear the entire library cache?")) {
      try {
        await db.tracks.clear();
        await db.playlists.clear();
        await OPFSManager.clearAll();
        store.clearSession();
        setActiveCrateId(null);
        window.dispatchEvent(new Event('storage-updated'));
        
        // Force reload to completely clear IndexedDB connections and memory state
        window.location.reload();
      } catch (e) {
        console.error("Failed to clear cache", e);
      }
    }
  };

  const crates = useLiveQuery(() => db.playlists.toArray(), []) || [];

  return {
    ...store,
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
  };
}
