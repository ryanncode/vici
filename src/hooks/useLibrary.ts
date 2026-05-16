import { db } from '../services/Database';
import { useLibraryStore } from '../store/libraryStore';
import { loadLocalDirectory, type FileSystemFileHandle } from '../services/FileManager';
import { metadataScanner } from '../services/MetadataScanner';

export function useLibrary() {
  const store = useLibraryStore();
  
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
             const cached = await db.tracks.where('fileName').equals(handle.name).first();
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
  };

  const clearCache = async () => {
    if (window.confirm("Are you sure you want to clear the entire library cache?")) {
      try {
        await db.tracks.clear();
        store.clearSession();
      } catch (e) {
        console.error("Failed to clear cache", e);
      }
    }
  };

  return {
    ...store,
    handleLoadDirectory,
    clearCache
  };
}
