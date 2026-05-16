import { useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../services/Database';
import { useLibraryStore } from '../store/libraryStore';
import { loadLocalDirectory, type FileSystemFileHandle } from '../services/FileManager';
import { metadataScanner } from '../services/MetadataScanner';
import type { Track, TrackMetadata } from '../types/mixer';

export function useLibrary() {
  const store = useLibraryStore();
  
  const fallbackDirInputRef = useRef<HTMLInputElement>(null);
  
  const rawSessionTracks = useLiveQuery(
    async () => {
      if (store.activeSessionTrackIds.length === 0) return [];
      return await db.tracks.where('id').anyOf(store.activeSessionTrackIds).toArray();
    },
    [store.activeSessionTrackIds]
  ) || [];

  const sessionTracks = rawSessionTracks.map(t => ({ ...t, ...store.sessionHandles[t.id] }));
  const displayTracks: (Track | TrackMetadata)[] = store.activeTab === 'tracks' ? (store.sessionStarted ? sessionTracks : []) : store.library;

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
        store.clearSession();
      } catch (e) {
        console.error("Failed to clear cache", e);
      }
    }
  };

  return {
    ...store,
    displayTracks,
    handleLoadDirectory,
    clearCache,
    fallbackDirInputRef,
    handleFallbackFiles
  };
}
