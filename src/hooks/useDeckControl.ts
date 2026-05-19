import { AudioEngine } from '../services/AudioEngine';
import { useMixerStore } from '../store/mixerStore';
import { useLibraryStore } from '../store/libraryStore';
import type { Track, TrackMetadata } from '../types/mixer';
import { createTrackUrl } from '../services/FileManager';
import { metadataScanner } from '../services/MetadataScanner';

import { db } from '../services/Database';

export function useDeckControl(deckId: 'A' | 'B') {
  const setDeckState = useMixerStore(state => state.setDeckState);
  // dspThrottleRef and dspTimeoutRef removed for latency optimization
  const throttledDSP = (_key: string, fn: () => void) => {
    // We removed the 32ms throttle to achieve 10-millisecond latency benchmark targeted by Chrome M136
    // Audio Worklet parameters are passed synchronously to avoid React render lifecycle delays.
    fn();
  };
  
  const loadTrack = async (inputTrack: Track | TrackMetadata) => {
    try {
      setDeckState(deckId, { status: 'loading', track: inputTrack as Track });
      
      let track = { ...inputTrack } as Track;
      
      // Dynamically fetch handles if missing (e.g. track loaded from M3U playlist before library was selected)
      if (!track.fileHandle && !track.rawFile && track.id) {
         const handles = useLibraryStore.getState().sessionHandles[track.id];
         if (handles) {
            track.fileHandle = handles.fileHandle || track.fileHandle;
            track.rawFile = handles.rawFile || track.rawFile;
         }
      }

      let trackUrl = track.url;
      
      // Request permissions IMMEDIATELY to prevent user activation token expiration
      if (track.fileHandle && !trackUrl) {
        if (await track.fileHandle.queryPermission({ mode: 'read' }) === 'prompt') {
          await track.fileHandle.requestPermission({ mode: 'read' });
        }
        trackUrl = await createTrackUrl(track.fileHandle);
        track.url = trackUrl;
      } else if (!trackUrl && track.rawFile) {
        trackUrl = URL.createObjectURL(track.rawFile);
        track.url = trackUrl;
      }

      const engine = AudioEngine.getInstance();
      
      if (AudioEngine.getInstance().context.state !== 'running') {
        await AudioEngine.getInstance().context.resume();
      }

      await engine.init();

      const needsScan = !('isScanned' in inputTrack) || !inputTrack.isScanned;

      if (needsScan && (inputTrack.fileHandle || inputTrack.rawFile)) {
        try {
          await new Promise(r => setTimeout(r, 5)); // Yield before scan
          const filePath = ('filePath' in inputTrack) ? inputTrack.filePath : (inputTrack.fileHandle?.name || inputTrack.rawFile?.name);
          const scanned = await metadataScanner.scanFileHandle(inputTrack.fileHandle, filePath, inputTrack.rawFile, inputTrack.id);
          track = { ...(scanned as unknown as Track), url: trackUrl };
        } catch (e) {
          console.error("Failed to scan metadata before load:", e);
        }
      }

      await new Promise(r => setTimeout(r, 5)); // Yield before deck load
      const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
      await deckEngine.loadTrack(trackUrl);
      
      deckEngine.originalBpm = track.bpm;
      deckEngine.setTrackGainDb(track.replayGain || 0);
      deckEngine.setPlaybackRate(1.0);
      deckEngine.seek(0);
      
      const segments = track.segments || deckEngine.segments;
      // const mfccs = track.mfccs || deckEngine.mfccs;
      // const cens = track.cens || deckEngine.cens;
      
      // Save peaks, segments, mfccs, cens back to DB if they were newly generated
      if (track.id && !track.waveformPeaks && deckEngine.peaks) {
         try {
           await db.tracks.update(track.id, {
             waveformPeaks: deckEngine.peaks,
             segments: deckEngine.segments,
             mfccs: deckEngine.mfccs,
             cens: deckEngine.cens
           });
           track.waveformPeaks = deckEngine.peaks;
           track.segments = deckEngine.segments;
           track.mfccs = deckEngine.mfccs;
           track.cens = deckEngine.cens;
         } catch(e) {
           console.error('Failed to cache waveform data:', e);
         }
      }

      const intro = track.introMarker !== undefined ? track.introMarker : 0;
      let outro = track.outroMarker;
      
      if (outro === undefined) {
        const outroSeg = segments.find(s => s.type === 'outro');
        outro = outroSeg ? outroSeg.start : (deckEngine.loaded ? Math.max(0, deckEngine.duration - 15) : 0);
      }
      
      setDeckState(deckId, {
        track,
        status: 'ready',
        peaks: track.waveformPeaks || deckEngine.peaks,
        bandPeaks: track.bandPeaks || deckEngine.bandPeaks,
        segments,
        introMarker: intro,
        outroMarker: outro,
        pitch: 1.0,
        isPlaying: false,
      });

    } catch (err) {
      console.error("Audio load error:", err);
      setDeckState(deckId, { status: 'error', track: null });
    }
  };

  const togglePlayback = async () => {
    if (AudioEngine.getInstance().context.state !== 'running') {
      
      await AudioEngine.getInstance().context.resume();
    }
    const engine = AudioEngine.getInstance();
    await engine.init();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    const isPlaying = useMixerStore.getState()[deckId === 'A' ? 'deckA' : 'deckB'].isPlaying;
    
    if (isPlaying) {
      deckEngine.stop();
      setDeckState(deckId, { isPlaying: false, status: 'ready' });
    } else {
      deckEngine.play();
      setDeckState(deckId, { isPlaying: true, status: 'playing' });
    }
  };

  const setVolume = (value: number) => {
    throttledDSP(`vol-${deckId}`, () => {
      const engine = AudioEngine.getInstance();
      const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
      deckEngine.setChannelVolume(value);
    });
    setDeckState(deckId, { volume: value });
  };
  
  const setGain = (value: number) => {
    throttledDSP(`gain-${deckId}`, () => {
      const engine = AudioEngine.getInstance();
      const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
      deckEngine.setChannelGain(value);
    });
    setDeckState(deckId, { gain: value });
  };
  
  const seek = (value: number) => {
    const engine = AudioEngine.getInstance();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    deckEngine.seek(value);
  };

  const setPitch = (newPitch: number) => {
    const engine = AudioEngine.getInstance();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    
    let finalPitch = newPitch;
    if (newPitch !== 1.0 && deckEngine.originalBpm > 0) {
      const rawBpm = newPitch * deckEngine.originalBpm;
      const snappedBpm = Math.round(rawBpm * 10) / 10;
      finalPitch = snappedBpm / deckEngine.originalBpm;
    }
    
    throttledDSP(`pitch-${deckId}`, () => {
      deckEngine.setPlaybackRate(finalPitch);
    });
    
    setDeckState(deckId, { pitch: finalPitch });
    
    const store = useMixerStore.getState();
    const otherDeckId = deckId === 'A' ? 'B' : 'A';
    const otherDeckState = otherDeckId === 'A' ? store.deckA : store.deckB;
    const isMaster = store.masterDeck === deckId;
    
    if (otherDeckState.sync || isMaster) {
      const otherDeckEngine = deckId === 'A' ? engine.deckB : engine.deckA;
      if (otherDeckEngine.originalBpm > 0) {
        const requiredPitch = deckEngine.currentBpm / otherDeckEngine.originalBpm;
        otherDeckEngine.setPlaybackRate(requiredPitch);
        store.setDeckState(otherDeckId, { pitch: requiredPitch });
      }
    }
  };

  const nudgePitch = (bpmDelta: number) => {
    const engine = AudioEngine.getInstance();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    const currentPitch = useMixerStore.getState()[deckId === 'A' ? 'deckA' : 'deckB'].pitch;
    if (deckEngine.originalBpm > 0) {
      const currentBpm = deckEngine.originalBpm * currentPitch;
      const targetBpm = currentBpm + bpmDelta;
      let newPitch = targetBpm / deckEngine.originalBpm;
      newPitch = Math.max(0.84, Math.min(1.16, newPitch));
      setPitch(newPitch);
    }
  };

  const toggleMute = () => {
    const engine = AudioEngine.getInstance();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    const currentMute = useMixerStore.getState()[deckId === 'A' ? 'deckA' : 'deckB'].mute;
    const newMute = !currentMute;
    deckEngine.mute = newMute;
    setDeckState(deckId, { mute: newMute });
  };
  
  const toggleKeyLock = () => {
    const engine = AudioEngine.getInstance();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    const currentKeyLock = useMixerStore.getState()[deckId === 'A' ? 'deckA' : 'deckB'].keyLock;
    const newKeyLock = !currentKeyLock;
    deckEngine.setKeyLock(newKeyLock);
    setDeckState(deckId, { keyLock: newKeyLock });
  };
  
  const toggleSync = (sync: boolean) => {
    setDeckState(deckId, { sync });
    if (sync) {
       const engine = AudioEngine.getInstance();
       const otherDeckEngine = deckId === 'A' ? engine.deckB : engine.deckA;
       const thisDeckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
       
       if (otherDeckEngine.currentBpm > 0 && thisDeckEngine.originalBpm > 0) {
         const requiredPitch = otherDeckEngine.currentBpm / thisDeckEngine.originalBpm;
         thisDeckEngine.setPlaybackRate(requiredPitch);
         setDeckState(deckId, { pitch: requiredPitch });
       }
    }
  };
  
  const toggleMaster = () => {
    const store = useMixerStore.getState();
    if (store.masterDeck === deckId) {
       store.setMasterDeck(null);
    } else {
       store.setMasterDeck(deckId);
       const engine = AudioEngine.getInstance();
       const otherDeckEngine = deckId === 'A' ? engine.deckB : engine.deckA;
       const thisDeckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
       if (thisDeckEngine.currentBpm > 0 && otherDeckEngine.originalBpm > 0) {
         const requiredPitch = thisDeckEngine.currentBpm / otherDeckEngine.originalBpm;
         otherDeckEngine.setPlaybackRate(requiredPitch);
         store.setDeckState(deckId === 'A' ? 'B' : 'A', { pitch: requiredPitch });
       }
    }
  };
  
  const handleFxToggle = (fxType: 'delay' | 'reverb' | 'phaser' | 'gate' | 'roll' | 'siren' | 'compressor') => {
    const engine = AudioEngine.getInstance();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    const store = useMixerStore.getState();
    const currentFx = (deckId === 'A' ? store.deckA : store.deckB).fx;
    
    if (fxType === 'delay') {
      const newState = !currentFx.delayOn;
      store.setDeckFx(deckId, { delayOn: newState });
      deckEngine.setDelayState(newState);
    } else if (fxType === 'reverb') {
      const newState = !currentFx.reverbOn;
      store.setDeckFx(deckId, { reverbOn: newState });
      deckEngine.setReverbState(newState);
    } else if (fxType === 'phaser') {
      const newState = !currentFx.phaserOn;
      store.setDeckFx(deckId, { phaserOn: newState });
      deckEngine.setPhaserState(newState);
    } else if (fxType === 'gate') {
      const newState = !currentFx.gateOn;
      store.setDeckFx(deckId, { gateOn: newState });
      deckEngine.setGateState(newState);
    } else if (fxType === 'roll') {
      const newState = !currentFx.rollOn;
      store.setDeckFx(deckId, { rollOn: newState });
      deckEngine.setRoll(newState, 8);
    } else if (fxType === 'siren') {
      const newState = !currentFx.sirenOn;
      store.setDeckFx(deckId, { sirenOn: newState });
      deckEngine.triggerSiren(newState);
    } else if (fxType === 'compressor') {
      const newState = !currentFx.compressorOn;
      store.setDeckFx(deckId, { compressorOn: newState });
      deckEngine.setCompressorState(newState);
    }
  };

  const handleFxParamChange = (fxType: 'delay' | 'reverb' | 'phaser', param: 'time' | 'feedback' | 'size' | 'rate', value: number) => {
    const engine = AudioEngine.getInstance();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    const store = useMixerStore.getState();
    
    if (fxType === 'delay') {
      if (param === 'time') {
        store.setDeckFx(deckId, { delayTime: value });
        throttledDSP(`fx-${deckId}-delayTime`, () => deckEngine.setDelayTime(value));
      } else if (param === 'feedback') {
        store.setDeckFx(deckId, { delayFeedback: value });
        throttledDSP(`fx-${deckId}-delayFB`, () => deckEngine.setDelayFeedback(value));
      }
    } else if (fxType === 'reverb' && param === 'size') {
      store.setDeckFx(deckId, { reverbSize: value });
      throttledDSP(`fx-${deckId}-revSize`, () => deckEngine.setReverbSize(value));
    } else if (fxType === 'phaser' && param === 'rate') {
      store.setDeckFx(deckId, { phaserRate: value });
      throttledDSP(`fx-${deckId}-phaseRate`, () => deckEngine.setPhaserRate(value));
    }
  };

  return {
    get state() { return useMixerStore.getState()[deckId === 'A' ? 'deckA' : 'deckB']; },
    loadTrack,
    togglePlayback,
    setVolume,
    setGain,
    seek,
    setPitch,
    nudgePitch,
    toggleMute,
    toggleKeyLock,
    toggleSync,
    toggleMaster,
    handleFxToggle,
    handleFxParamChange
  };
}
