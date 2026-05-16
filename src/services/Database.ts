import Dexie, { type Table } from 'dexie';
import type { TrackMetadata } from '../types/mixer';

export class MixerDatabase extends Dexie {
  tracks!: Table<TrackMetadata>;

  constructor() {
    super('MixerDatabase');
    // Only declare properties you want to query or sort by in the UI
    this.version(1).stores({
      tracks: 'id, filePath, artist, title, bpm'
    });
  }
}

export const db = new MixerDatabase();
