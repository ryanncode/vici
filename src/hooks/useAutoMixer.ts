import { useEffect, useRef } from 'react';
import { AudioEngine } from '../services/AudioEngine';
import { createTrackUrl } from '../services/FileManager';
import type { Track } from '../types/mixer';
import { useMixerStore } from '../store/mixerStore';

interface AutoMixerProps {
  library: Track[];
  isAutomixEnabled: boolean;
  onTransitionStart: (winningDeck: 'A' | 'B', nextTrack: Track) => void;
  onTransitionComplete: (winningDeck: 'A' | 'B', nextTrack: Track) => void;
  onTransitionCancel: (cancelledDeck: 'A' | 'B') => void;
  onPitchChange: (deckId: 'A' | 'B', pitch: number) => void;
}

export function useAutoMixer({ library, isAutomixEnabled, onTransitionStart, onTransitionComplete, onTransitionCancel, onPitchChange }: AutoMixerProps) {
  const workerRef = useRef<Worker | null>(null);
  const isTransitioning = useRef<boolean>(false);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAutomixEnabled) {
      if (workerRef.current) {
        workerRef.current.postMessage('stop');
        workerRef.current.terminate();
        workerRef.current = null;
      }
      return;
    }

    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('../workers/timer.worker.ts', import.meta.url), { type: 'module' });
    }

    const audio = AudioEngine.getInstance();

    const monitorLoop = () => {
      const state = useMixerStore.getState();
      const deckAState = state.deckA;
      const deckBState = state.deckB;
      
      let activeDeck: 'A' | 'B' | null = null;
      let timePastOutro = -1;
      let fadeDuration = 15;

      if (deckAState.isPlaying && !deckBState.isPlaying) activeDeck = 'A';
      if (deckBState.isPlaying && !deckAState.isPlaying) activeDeck = 'B';

      if (activeDeck === 'A' && deckAState.track && audio.deckA.loaded) {
        const current = audio.deckA.getCurrentTime();
        const duration = audio.deckA.duration;
        const bpm = audio.deckA.currentBpm > 0 ? audio.deckA.currentBpm : (deckAState.track.bpm || 120);
        fadeDuration = (60 / bpm) * 32; // 32 beats based on active BPM
        const outroMarker = deckAState.outroMarker ?? (duration - fadeDuration);
        timePastOutro = current - outroMarker;
      } else if (activeDeck === 'B' && deckBState.track && audio.deckB.loaded) {
        const current = audio.deckB.getCurrentTime();
        const duration = audio.deckB.duration;
        const bpm = audio.deckB.currentBpm > 0 ? audio.deckB.currentBpm : (deckBState.track.bpm || 120);
        fadeDuration = (60 / bpm) * 32; // 32 beats based on active BPM
        const outroMarker = deckBState.outroMarker ?? (duration - fadeDuration);
        timePastOutro = current - outroMarker;
      }

      // Trigger transition logic if threshold breached
      const targetDeckState = activeDeck === 'A' ? deckBState : deckAState;
      const hasNextTrack = library.length > 0 || targetDeckState.track !== null;

      if (timePastOutro >= 0 && !isTransitioning.current && hasNextTrack) {
        isTransitioning.current = true;
        // Ensure fadeDuration is valid
        const safeFadeDuration = Math.max(1, fadeDuration);
        executeAutoTransition(activeDeck, safeFadeDuration);
      } else if (isTransitioning.current && timePastOutro < 0 && activeDeck) {
        // User scrubbed backward before the outro marker during a transition
        isTransitioning.current = false;
        if (transitionTimeoutRef.current) {
          clearTimeout(transitionTimeoutRef.current);
          transitionTimeoutRef.current = null;
        }
        
        // Stop the incoming deck, cancel the crossfade ramp
        const targetDeckId = activeDeck === 'A' ? 'B' : 'A';
        const targetDeck = targetDeckId === 'A' ? audio.deckA : audio.deckB;
        targetDeck.stop();
        // audio.crossfader.fade.cancelScheduledValues(Tone.now());
        const curve = useMixerStore.getState().crossfadeCurve || 'constant_power';
        audio.setCrossfadeValue(activeDeck === 'A' ? 0 : 1, curve);
        
        onTransitionCancel(targetDeckId);
      }
    };

    workerRef.current.onmessage = (e) => {
      if (e.data === 'tick') {
        monitorLoop();
      }
    };
    workerRef.current.postMessage('start');

    const executeAutoTransition = async (currentActive: 'A' | 'B' | null, fadeDuration: number) => {
      if (!currentActive) return;
      
      const state = useMixerStore.getState();
      const deckAState = state.deckA;
      const deckBState = state.deckB;
      
      const nextDeckId = currentActive === 'A' ? 'B' : 'A';
      const targetDeck = nextDeckId === 'A' ? audio.deckA : audio.deckB;
      const currentDeck = currentActive === 'A' ? audio.deckA : audio.deckB;
      const nextDeckState = currentActive === 'A' ? deckBState : deckAState;
      
      let nextTrack = nextDeckState.track;
      let isFromLibrary = false;

      // If the target deck is empty, pull from library
      if (!nextTrack) {
        const currentDeckState = currentActive === 'A' ? deckAState : deckBState;
        const currentTrackId = currentDeckState.track?.id;
        let nextIndex = 0;
        
        if (currentTrackId) {
          const currentIndex = library.findIndex(t => t.id === currentTrackId);
          if (currentIndex !== -1 && currentIndex + 1 < library.length) {
            nextIndex = currentIndex + 1;
          }
        }
        
        nextTrack = library[nextIndex]; 
        isFromLibrary = true;
      }

      if (!nextTrack) {
        isTransitioning.current = false;
        return;
      }

      try {
        let trackUrl = nextTrack.url;
        if (nextTrack.fileHandle && !trackUrl) {
          if (await nextTrack.fileHandle.queryPermission({ mode: 'read' }) === 'prompt') {
            await nextTrack.fileHandle.requestPermission({ mode: 'read' });
          }
          trackUrl = await createTrackUrl(nextTrack.fileHandle);
        } else if (!trackUrl && nextTrack.rawFile) {
          trackUrl = URL.createObjectURL(nextTrack.rawFile);
        }

        // 1. Load and Sync Tempo
        if (isFromLibrary || !targetDeck.loaded) {
          await targetDeck.loadTrack(trackUrl);
        }

        targetDeck.originalBpm = nextTrack.bpm;
        if (targetDeck.originalBpm > 0 && currentDeck.currentBpm > 0) {
          const newPitch = currentDeck.currentBpm / targetDeck.originalBpm;
          onPitchChange(nextDeckId, newPitch);
        }

        const introMarker = nextDeckState.introMarker ?? 0;
        
        // 2. Start target deck at its Intro marker
        targetDeck.seek(introMarker);
        targetDeck.play();
        
        onTransitionStart(nextDeckId, nextTrack!);

        // 3. Ramp Crossfader & Handle EQ Ducking / Macro Dynamics
        const targetValue = currentActive === 'A' ? 1 : 0;
        const startValue = currentActive === 'A' ? 0 : 1;
        const startTime = performance.now();
        const durationMs = fadeDuration * 1000;
        
        // Macro Dynamics: Auto set 3rd FX to compressor and turn it on
        const newSlots = [...nextDeckState.fxSlots] as typeof nextDeckState.fxSlots;
        newSlots[2] = 'compressor';
        useMixerStore.getState().setDeckState(nextDeckId, { fxSlots: newSlots });
        useMixerStore.getState().setDeckFx(nextDeckId, { compressorOn: true });
        targetDeck.setCompressorState(true);
        
        // Automated FX Spillover: Ramp up delay on outgoing deck
        const currentDeckState = currentActive === 'A' ? deckAState : deckBState;
        const currentSlots = [...currentDeckState.fxSlots] as typeof currentDeckState.fxSlots;
        currentSlots[0] = 'delay';
        useMixerStore.getState().setDeckState(currentActive, { fxSlots: currentSlots });
        useMixerStore.getState().setDeckFx(currentActive, { delayOn: true, delayTime: 0.75, delayFeedback: 0.2 });
        currentDeck.setDelayState(true);
        currentDeck.setDelayTime(0.75);
        currentDeck.setDelayFeedback(0.2);

        // Cosine Similarity Matching (Heuristic Logging)
        let similarity = 0;
        if (currentDeck.cens && targetDeck.cens && currentDeck.cens.length >= 12 && targetDeck.cens.length >= 12) {
           let dotProduct = 0;
           let normA = 0;
           let normB = 0;
           for (let i = 0; i < 12; i++) {
              dotProduct += currentDeck.cens[i] * targetDeck.cens[i];
              normA += currentDeck.cens[i] ** 2;
              normB += targetDeck.cens[i] ** 2;
           }
           if (normA > 0 && normB > 0) {
              similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
           }
           console.log(`[AutoMixer] Harmonic Cosine Similarity for transition: ${similarity.toFixed(3)}`);
        }

        // Dynamic EQ Masking: Duck incoming low EQ
        useMixerStore.getState().setDeckEq(nextDeckId, { low: -12 });
        targetDeck.setEq('low', -12);
        let eqRestored = false;

        const animateTransition = () => {
          if (!isTransitioning.current) return;
          
          const now = performance.now();
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / durationMs, 1);
          
          const currentValue = startValue + (targetValue - startValue) * progress;
          
          const state = useMixerStore.getState();
          state.setCrossfade(currentValue);
          audio.setCrossfadeValue(currentValue, state.crossfadeCurve || 'constant_power');
          
          // Ramp delay feedback from 0.2 to 0.75 for trailing tail
          const delayFeedback = 0.2 + (0.55 * progress);
          useMixerStore.getState().setDeckFx(currentActive, { delayFeedback });
          currentDeck.setDelayFeedback(delayFeedback);

          // Check outgoing deck amplitude for EQ masking restore
          if (!eqRestored && currentDeck.peaks && currentDeck.duration > 0) {
            const outProgress = currentDeck.getCurrentTime() / currentDeck.duration;
            const index = Math.floor(outProgress * currentDeck.peaks.length);
            const rawPeak = currentDeck.peaks[index] || 0;
            const outLevel = rawPeak * currentDeck.channelVolume * currentDeck.channelGain * currentDeck.crossfadeGain;
            
            // If amplitude drops below ~0.25 (-12dB)
            if (outLevel < 0.25) {
              eqRestored = true;
              // Smooth ramp back to 0
              let eqVal = -12;
              const eqRamp = () => {
                if (!isTransitioning.current && eqVal === -12) return; // cancelled early
                eqVal += 0.5; // ramp step
                if (eqVal > 0) eqVal = 0;
                useMixerStore.getState().setDeckEq(nextDeckId, { low: eqVal });
                targetDeck.setEq('low', eqVal);
                if (eqVal < 0) requestAnimationFrame(eqRamp);
              };
              requestAnimationFrame(eqRamp);
            }
          }

          if (progress < 1) {
            requestAnimationFrame(animateTransition);
          } else {
             currentDeck.stop();
             isTransitioning.current = false;
             onTransitionComplete(nextDeckId, nextTrack!);
          }
        };
        requestAnimationFrame(animateTransition);
      } catch (err) {
        console.error("AutoMixer Transition Failed:", err);
        isTransitioning.current = false;
      }
    };

    return () => {
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
      }
      if (workerRef.current) {
        workerRef.current.postMessage('stop');
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [library, isAutomixEnabled, onTransitionComplete, onTransitionStart, onTransitionCancel, onPitchChange]);
}
