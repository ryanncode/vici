export class OPFSManager {
  private static root: FileSystemDirectoryHandle | null = null;
  private static isPersisted = false;

  public static async init(): Promise<void> {
    try {
      if (navigator.storage && navigator.storage.persist) {
        this.isPersisted = await navigator.storage.persist();
        console.log(`[OPFS] Storage persisted: ${this.isPersisted}`);
      }
      this.root = await navigator.storage.getDirectory();
      console.log('[OPFS] Root directory initialized');
    } catch (e) {
      console.error('[OPFS] Initialization failed:', e);
    }
  }

  public static async getStorageEstimate(): Promise<StorageEstimate | null> {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        return await navigator.storage.estimate();
      }
    } catch (e) {
      console.error('[OPFS] Failed to get storage estimate:', e);
    }
    return null;
  }

  public static async saveFile(file: File, filename: string): Promise<string> {
    if (!this.root) await this.init();
    if (!this.root) throw new Error('OPFS not supported or initialized');

    try {
      // Use the filename directly or a sanitized version as the handle name
      const safeFilename = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const fileHandle = await this.root.getFileHandle(safeFilename, { create: true });
      
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();
      
      return safeFilename;
    } catch (e) {
      console.error(`[OPFS] Failed to save file ${filename}:`, e);
      throw e;
    }
  }

  public static async getFile(filename: string): Promise<File> {
    if (!this.root) await this.init();
    if (!this.root) throw new Error('OPFS not supported or initialized');

    try {
      const fileHandle = await this.root.getFileHandle(filename);
      return await fileHandle.getFile();
    } catch (e) {
      console.error(`[OPFS] Failed to get file ${filename}:`, e);
      throw e;
    }
  }

  public static async deleteFile(filename: string): Promise<void> {
    if (!this.root) await this.init();
    if (!this.root) throw new Error('OPFS not supported or initialized');

    try {
      await this.root.removeEntry(filename);
    } catch (e) {
      console.error(`[OPFS] Failed to delete file ${filename}:`, e);
      throw e;
    }
  }

  public static async clearAll(): Promise<void> {
    if (!this.root) await this.init();
    if (!this.root) return;

    try {
      // Web APIs don't have a direct clear(), we must iterate and remove
      // Async iteration over values()
      for await (const name of this.root.keys()) {
        await this.root.removeEntry(name, { recursive: true });
      }
    } catch (e) {
      console.error('[OPFS] Failed to clear OPFS:', e);
    }
  }
}
