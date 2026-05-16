import * as mm from 'music-metadata';
import type { TrackMetadata } from '../types/mixer';
import type { FileSystemFileHandle } from '../services/FileManager';

// Create a fast hash string based on path and size
async function generateId(filePath: string, size: number): Promise<string> {
  const msgUint8 = new TextEncoder().encode(`${filePath}_${size}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

self.onmessage = async (e: MessageEvent<{ fileHandle?: FileSystemFileHandle, rawFile?: File, filePath?: string }>) => {
  try {
    const { fileHandle, rawFile, filePath } = e.data;
    
    // Get the actual File object
    const file = rawFile || (fileHandle ? await fileHandle.getFile() : null);
    
    if (!file) throw new Error("No file or file handle provided");

    // Generate our ID hash
    const id = await generateId(filePath || file.name, file.size);
    
    // Check if we need to parse metadata
    const metadata = await mm.parseBlob(file, { duration: true, skipCovers: false });
    
    let albumArt: Blob | undefined;
    if (metadata.common.picture && metadata.common.picture.length > 0) {
      const pic = metadata.common.picture[0];
      albumArt = new Blob([new Uint8Array(pic.data)], { type: pic.format });
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
      isScanned: true,
      albumArt,
      fileHandle,
      rawFile
    };
    
    self.postMessage({ success: true, metadata: trackMetadata });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    self.postMessage({ success: false, error: errorMessage });
  }
};
