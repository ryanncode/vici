import * as Tone from 'tone';
import { AudioEngine } from '../services/AudioEngine';
import { useMixerStore } from '../store/mixerStore';
import type { Track, TrackMetadata } from '../types/mixer';
import { createTrackUrl } from '../services/FileManager';
import { metadataScanner } from '../services/MetadataScanner';

export function useDeckControl(deckId: 'A' | 'B') {
  const storeDeck = useMixerStore(state => deckId === 'A' ? state.deckA : state.deckB);
  const setDeckState = useMixerStore(state => state.setDeckState);
  
  const loadTrack = async (inputTrack: Track | TrackMetadata) => {
    try {
      setDeckState(deckId, { status: 'loading' });
      const engine = AudioEngine.getInstance();
      
      if (Tone.context.state !== 'running') {
        await Tone.start();
      }

      let track = inputTrack as Track;
      const needsScan = !('isScanned' in inputTrack) || !inputTrack.isScanned;

      if (needsScan && (inputTrack.fileHandle || inputTrack.rawFile)) {
        try {
          const filePath = ('filePath' in inputTrack) ? inputTrack.filePath : (inputTrack.fileHandle?.name || inputTrack.rawFile?.name);
          const scanned = await metadataScanner.scanFileHandle(inputTrack.fileHandle, filePath, inputTrack.rawFile, inputTrack.id);
          track = { ...(scanned as unknown as Track), url: (inputTrack as Track).url };
        } catch (e) {
          console.error("Failed to scan metadata before load:", e);
        }
      }

      let trackUrl = track.url;
      if (track.fileHandle && !trackUrl) {
        if (await track.fileHandle.queryPermission({ mode: 'read' }) === 'prompt') {
          await track.fileHandle.requestPermission({ mode: 'read' });
        }
        trackUrl = await createTrackUrl(track.fileHandle);
      } else if (!trackUrl && track.rawFile) {
        trackUrl = URL.createObjectURL(track.rawFile);
      }

      const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
      await deckEngine.loadTrack(trackUrl);
      
      deckEngine.originalBpm = track.bpm;
      deckEngine.setTrackGainDb(track.replayGain || 0);
      deckEngine.setPlaybackRate(1.0);
      
      const segments = track.segments || deckEngine.segments;
      const intro = track.introMarker !== undefined ? track.introMarker : 0;
      let outro = track.outroMarker;
      
      if (outro === undefined) {
        const outroSeg = segments.find(s => s.type === 'outro');
        outro = outroSeg ? outroSeg.start : (deckEngine.player.buffer ? Math.max(0, deckEngine.player.buffer.duration - 15) : 0);
      }
      
      setDeckState(deckId, {
        track,
        status: 'ready',
        peaks: track.waveformPeaks || deckEngine.peaks,
        segments,
        introMarker: intro,
        outroMarker: outro,
        pitch: 1.0,
      });

    } catch (err) {
      console.error("Audio load error:", err);
      setDeckState(deckId, { status: 'error', track: null });
    }
  };

  const togglePlayback = () => {
    const engine = AudioEngine.getInstance();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    
    if (storeDeck.isPlaying) {
      deckEngine.stop();
      setDeckState(deckId, { isPlaying: false, status: 'ready' });
    } else {
      deckEngine.play();
      setDeckState(deckId, { isPlaying: true, status: 'playing' });
    }
  };

  const setVolume = (value: number) => {
    const engine = AudioEngine.getInstance();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    deckEngine.setChannelVolume(value);
    setDeckState(deckId, { volume: value });
  };
  
  const seek = (value: number) => {
    const engine = AudioEngine.getInstance();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    deckEngine.seek(value);
  };

  return {
    state: storeDeck,
    loadTrack,
    togglePlayback,
    setVolume,
    seek,
  };
}
