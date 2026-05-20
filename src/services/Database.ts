import Dexie, { type Table } from 'dexie';
import type { TrackMetadata, Playlist } from '../types/mixer';

export class MixerDatabase extends Dexie {
  tracks!: Table<TrackMetadata>;
  playlists!: Table<Playlist>;

  constructor() {
    super('MixerDatabase');
    // Only declare properties you want to query or sort by in the UI
    this.version(1).stores({
      tracks: 'id, filePath, artist, title, bpm'
    });
    this.version(2).stores({
      tracks: 'id, filePath, artist, title, bpm',
      playlists: 'id, name'
    });
    this.version(3).stores({
      tracks: 'id, filePath, artist, title, bpm, opfsPath, key, year, energy, genre',
      playlists: 'id, name'
    });
  }
}

export const db = new MixerDatabase();
