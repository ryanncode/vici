import type { FileSystemFileHandle } from '../services/FileManager';

export interface TrackMetadata {
  id: string; // Hash of filepath + file size (Primary Key)
  filePath: string;
  fileName: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  genre?: string;
  bpm: number;
  key?: string;
  fileType?: string;
  bitrate?: number;
  duration: number;
  isScanned?: boolean;
  replayGain?: number;
  // Non-indexed properties
  albumArt?: Blob;
  waveformPeaks?: Float32Array;
  introMarker?: number;
  outroMarker?: number;
  fileHandle?: FileSystemFileHandle;
  rawFile?: File; // Fallback HTML5 File
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  genre?: string;
  bpm: number;
  key?: string;
  fileType?: string;
  bitrate?: number;
  duration: string;
  replayGain?: number;
  url: string; // Dynamic Object URL or local asset path
  waveformPeaks?: Float32Array;
  introMarker?: number;
  outroMarker?: number;
  fileHandle?: FileSystemFileHandle; // FileSystemFileHandle
  rawFile?: File; // Fallback HTML5 File
}

export interface DeckState {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  introMarker: number;
  outroMarker: number;
}

