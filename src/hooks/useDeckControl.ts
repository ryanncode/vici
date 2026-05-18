import { useRef } from 'react';
import { AudioEngine } from '../services/AudioEngine';
import { useMixerStore } from '../store/mixerStore';
import type { Track, TrackMetadata } from '../types/mixer';
import { createTrackUrl } from '../services/FileManager';
import { metadataScanner } from '../services/MetadataScanner';

export function useDeckControl(deckId: 'A' | 'B') {
  const setDeckState = useMixerStore(state => state.setDeckState);
  const lastStateUpdateRef = useRef<{ [key: string]: number }>({});
  const dspThrottleRef = useRef<{ [key: string]: number }>({});
  const dspTimeoutRef = useRef<{ [key: string]: ReturnType<typeof setTimeout> }>({});

  const throttledDSP = (key: string, fn: () => void, delay = 32) => {
    const now = Date.now();
    const lastUpdate = dspThrottleRef.current[key] || 0;
    
    if (dspTimeoutRef.current[key]) {
      clearTimeout(dspTimeoutRef.current[key]);
    }

    if (now - lastUpdate >= delay) {
      fn();
      dspThrottleRef.current[key] = now;
    } else {
      dspTimeoutRef.current[key] = setTimeout(() => {
        fn();
        dspThrottleRef.current[key] = Date.now();
      }, delay);
    }
  };
  
  const loadTrack = async (inputTrack: Track | TrackMetadata) => {
    try {
      setDeckState(deckId, { status: 'loading', track: inputTrack as Track });
      const engine = AudioEngine.getInstance();
      
      if (AudioEngine.getInstance().context.state !== 'running') {
        await AudioEngine.getInstance().context.resume();
      }

      await engine.init();

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
        outro = outroSeg ? outroSeg.start : (deckEngine.loaded ? Math.max(0, deckEngine.duration - 15) : 0);
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
    
    const now = Date.now();
    const lastUpdate = lastStateUpdateRef.current['pitch'] || 0;
    if (now - lastUpdate > 200) {
      setDeckState(deckId, { pitch: finalPitch });
      lastStateUpdateRef.current['pitch'] = now;
    }
    
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
  
  const handleFxToggle = (fxType: 'delay' | 'reverb' | 'phaser' | 'gate' | 'roll' | 'siren') => {
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
    }
  };

  const handleFxParamChange = (fxType: 'delay' | 'reverb' | 'phaser', param: 'time' | 'feedback' | 'size' | 'rate', value: number) => {
    const engine = AudioEngine.getInstance();
    const deckEngine = deckId === 'A' ? engine.deckA : engine.deckB;
    const store = useMixerStore.getState();
    
    const now = Date.now();
    const key = `fx-${fxType}-${param}`;
    const lastUpdate = lastStateUpdateRef.current[key] || 0;
    const shouldUpdateStore = now - lastUpdate > 200;
    
    if (fxType === 'delay') {
      if (param === 'time') {
        if (shouldUpdateStore) { store.setDeckFx(deckId, { delayTime: value }); lastStateUpdateRef.current[key] = now; }
        throttledDSP(`fx-${deckId}-delayTime`, () => deckEngine.setDelayTime(value));
      } else if (param === 'feedback') {
        if (shouldUpdateStore) { store.setDeckFx(deckId, { delayFeedback: value }); lastStateUpdateRef.current[key] = now; }
        throttledDSP(`fx-${deckId}-delayFB`, () => deckEngine.setDelayFeedback(value));
      }
    } else if (fxType === 'reverb' && param === 'size') {
      if (shouldUpdateStore) { store.setDeckFx(deckId, { reverbSize: value }); lastStateUpdateRef.current[key] = now; }
      throttledDSP(`fx-${deckId}-revSize`, () => deckEngine.setReverbSize(value));
    } else if (fxType === 'phaser' && param === 'rate') {
      if (shouldUpdateStore) { store.setDeckFx(deckId, { phaserRate: value }); lastStateUpdateRef.current[key] = now; }
      throttledDSP(`fx-${deckId}-phaseRate`, () => deckEngine.setPhaserRate(value));
    }
  };

  return {
    get state() { return useMixerStore.getState()[deckId === 'A' ? 'deckA' : 'deckB']; },
    loadTrack,
    togglePlayback,
    setVolume,
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
