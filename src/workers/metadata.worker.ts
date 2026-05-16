// Polyfill window for music-metadata which checks for browser environments
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window = globalThis;

import * as mm from 'music-metadata';
import type { TrackMetadata } from '../types/mixer';

// Create a safe hash string based on path and size without relying on crypto.subtle
function generateId(filePath: string, size: number): string {
  try {
    return btoa(encodeURIComponent(`${filePath}_${size}`)).replace(/[/+=]/g, '');
  } catch {
    return `id_${Date.now()}_${size}`;
  }
}

self.onmessage = async (e: MessageEvent<{ jobId: string, file: File, filePath?: string, existingId?: string }>) => {
  const { jobId, file, filePath, existingId } = e.data;
  try {
    if (!file) throw new Error("No file provided to worker");

    // Generate our ID hash
    const id = existingId || generateId(filePath || file.name, file.size);
    
    // Check if we need to parse metadata
    const metadata = await mm.parseBlob(file, { duration: true, skipCovers: false });
    
    let albumArt: Blob | undefined;
    if (metadata.common.picture && metadata.common.picture.length > 0) {
      const pic = metadata.common.picture[0];
      albumArt = new Blob([new Uint8Array(pic.data)], { type: pic.format });
    }

    let replayGain: number | undefined = undefined;
    if (metadata.common.replaygain_track_gain !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rg: any = metadata.common.replaygain_track_gain;
      if (typeof rg === 'number') {
        replayGain = rg;
      } else if (typeof rg === 'string') {
        const match = rg.match(/([+-]?[\d.]+)/);
        if (match && match[1]) replayGain = parseFloat(match[1]);
      } else if (rg && typeof rg === 'object' && rg.ratio !== undefined) {
        // Handle music-metadata IRatio type
        replayGain = rg.ratio;
        // If it's something like -6 dB, it might be in description
        if (rg.description && typeof rg.description === 'string') {
          const match = rg.description.match(/([+-]?[\d.]+)/);
          if (match && match[1]) replayGain = parseFloat(match[1]);
        }
      }
    }
    
    const trackMetadata: TrackMetadata = {
      id,
      filePath: filePath || file.name,
      fileName: file.name,
      title: metadata.common.title || file.name.replace(/\.[^/.]+$/, ""),
      artist: metadata.common.artist || "Unknown Artist",
      album: metadata.common.album,
      year: metadata.common.year,
      genre: metadata.common.genre ? metadata.common.genre.join(", ") : undefined,
      bpm: metadata.common.bpm || 120, // Default to 120 if no BPM tag is found
      key: metadata.common.key,
      fileType: metadata.format.container || file.name.split('.').pop()?.toUpperCase(),
      bitrate: metadata.format.bitrate,
      duration: metadata.format.duration || 0,
      replayGain,
      isScanned: true,
      albumArt
    };
    
    self.postMessage({ jobId, success: true, metadata: trackMetadata });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    self.postMessage({ jobId, success: false, error: errorMessage });
  }
};
