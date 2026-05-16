export interface FileSystemHandle {
  kind: 'file' | 'directory';
  name: string;
}

export interface FileSystemFileHandle extends FileSystemHandle {
  kind: 'file';
  getFile(): Promise<File>;
}

export interface FileSystemDirectoryHandle extends FileSystemHandle {
  kind: 'directory';
  values(): AsyncIterableIterator<FileSystemHandle>;
}

declare global {
  interface Window {
    showDirectoryPicker(): Promise<FileSystemDirectoryHandle>;
    showOpenFilePicker(options?: unknown): Promise<FileSystemFileHandle[]>;
    showSaveFilePicker(options?: unknown): Promise<FileSystemFileHandle>;
  }
}

export async function loadLocalDirectory(): Promise<FileSystemFileHandle[]> {
  try {
    const dirHandle = await window.showDirectoryPicker();
    const audioHandles: FileSystemFileHandle[] = [];
    
    // We need an async iterator function to recursively fetch or just fetch the top level.
    // The requirement mentions iterating through returned directory handle.
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        const ext = entry.name.split('.').pop()?.toLowerCase();
        if (['mp3', 'wav', 'flac', 'ogg'].includes(ext || '')) {
          audioHandles.push(entry as FileSystemFileHandle);
        }
      }
    }
    return audioHandles;
  } catch (error) {
    console.error('Error loading directory:', error);
    return [];
  }
}

export async function createTrackUrl(fileHandle: FileSystemFileHandle): Promise<string> {
  const file = await fileHandle.getFile();
  return URL.createObjectURL(file);
}
