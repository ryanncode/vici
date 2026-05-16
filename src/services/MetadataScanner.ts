import { db } from './Database';
import type { TrackMetadata } from '../types/mixer';
import type { FileSystemFileHandle } from './FileManager';

class MetadataScanner {
  private worker: Worker | null = null;
  private pendingResolvers = new Map<string, { resolve: (val: TrackMetadata) => void, reject: (err: unknown) => void }>();

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof window !== 'undefined') {
      this.worker = new Worker(new URL('../workers/metadata.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = async (e) => {
        const { success, metadata, error } = e.data;
        if (success && metadata) {
          try {
            await db.tracks.put(metadata);
            
            // Find any pending promises for this file (we use fileName as a makeshift key since we don't have the id before scanning)
            const resolverKey = metadata.fileName;
            if (this.pendingResolvers.has(resolverKey)) {
              this.pendingResolvers.get(resolverKey)?.resolve(metadata);
              this.pendingResolvers.delete(resolverKey);
            }
          } catch (dbError) {
            console.error('Error saving metadata to IndexedDB:', dbError);
          }
        } else {
          console.error('Metadata worker error:', error);
          // Try to reject if we know which one failed... but we might not know.
        }
      };
    }
  }

  public async scanFileHandle(fileHandle?: FileSystemFileHandle, filePath?: string, rawFile?: File): Promise<TrackMetadata> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("Worker not initialized"));
        return;
      }
      
      const resolverKey = fileHandle?.name || rawFile?.name || "unknown";
      this.pendingResolvers.set(resolverKey, { resolve, reject });
      
      this.worker.postMessage({ fileHandle, filePath, rawFile });
    });
  }
}

export const metadataScanner = new MetadataScanner();
