import type { FileSystemFileHandle } from '../services/FileManager';

export interface Track {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  duration: string;
  url: string; // Dynamic Object URL or local asset path
  fileHandle?: FileSystemFileHandle; // FileSystemFileHandle
}

export interface DeckState {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}
