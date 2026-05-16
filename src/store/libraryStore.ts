import { create } from 'zustand';
import type { Track } from '../types/mixer';
import type { FileSystemFileHandle } from '../services/FileManager';

export interface LibraryState {
  activeTab: 'tracks' | 'playlists';
  library: Track[];
  sessionStarted: boolean;
  activeSessionTrackIds: string[];
  sessionHandles: Record<string, { fileHandle?: FileSystemFileHandle; rawFile?: File }>;

  setActiveTab: (tab: 'tracks' | 'playlists') => void;
  setLibrary: (tracks: Track[]) => void;
  setSessionStarted: (started: boolean) => void;
  setActiveSessionTrackIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  setSessionHandles: (handles: Record<string, { fileHandle?: FileSystemFileHandle; rawFile?: File }> | ((prev: Record<string, { fileHandle?: FileSystemFileHandle; rawFile?: File }>) => Record<string, { fileHandle?: FileSystemFileHandle; rawFile?: File }>)) => void;
  clearSession: () => void;
}

export const useLibraryStore = create<LibraryState>((set) => ({
  activeTab: 'tracks',
  library: [],
  sessionStarted: false,
  activeSessionTrackIds: [],
  sessionHandles: {},

  setActiveTab: (tab) => set({ activeTab: tab }),
  setLibrary: (library) => set({ library }),
  setSessionStarted: (sessionStarted) => set({ sessionStarted }),
  
  setActiveSessionTrackIds: (ids) => set((state) => ({
    activeSessionTrackIds: typeof ids === 'function' ? ids(state.activeSessionTrackIds) : ids
  })),

  setSessionHandles: (handles) => set((state) => ({
    sessionHandles: typeof handles === 'function' ? handles(state.sessionHandles) : handles
  })),

  clearSession: () => set({
    sessionStarted: false,
    activeSessionTrackIds: [],
    sessionHandles: {}
  })
}));
