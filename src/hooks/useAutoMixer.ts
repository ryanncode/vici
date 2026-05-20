import { useEffect, useRef } from 'react';
import { AudioEngine } from '../services/AudioEngine';
import { createTrackUrl } from '../services/FileManager';
import type { Track } from '../types/mixer';
import { useMixerStore } from '../store/mixerStore';
import { useLibraryStore } from '../store/libraryStore';
import { OPFSManager } from '../services/OPFSManager';

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
  const lastMixNowTimeRef = useRef<number>(0);

  // Keep refs to the latest props to avoid stale closures during long async transitions
  const latestProps = useRef({ library, onTransitionComplete, onTransitionStart, onTransitionCancel, onPitchChange });
  useEffect(() => {
    latestProps.current = { library, onTransitionComplete, onTransitionStart, onTransitionCancel, onPitchChange };
  }, [library, onTransitionComplete, onTransitionStart, onTransitionCancel, onPitchChange]);

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
      const automixBars = state.automixBars;
      
      let activeDeck: 'A' | 'B' | null = null;
      let timePastOutro = -1;
      let fadeDuration = 15;
      let isBpmClose = false;

      if (deckAState.isPlaying && !deckBState.isPlaying) activeDeck = 'A';
      if (deckBState.isPlaying && !deckAState.isPlaying) activeDeck = 'B';

      const calculateFadeLogic = (deckState: typeof deckAState, audioDeck: typeof audio.deckA, oppositeDeckState: typeof deckBState) => {
        const current = audioDeck.getCurrentTime();
        const duration = audioDeck.duration;
        const bpm = audioDeck.currentBpm > 0 ? audioDeck.currentBpm : (deckState.track?.bpm || 120);
        
        if (automixBars === 0) {
          fadeDuration = 0;
          timePastOutro = current - (duration - 0.2); // Trigger slightly before the very end to prevent playhead freezing
        } else if (automixBars === 4) {
          // Casual Listening BPM Check
          const currentTrackId = deckState.track?.id;
          let nextIndex = 0;
          if (currentTrackId) {
            const currentIndex = latestProps.current.library.findIndex(t => t.id === currentTrackId);
            if (currentIndex !== -1 && currentIndex + 1 < latestProps.current.library.length) nextIndex = currentIndex + 1;
          }
          const nextTrack = oppositeDeckState.track || latestProps.current.library[nextIndex];
          
          if (nextTrack && nextTrack.bpm) {
            const nextBpm = nextTrack.bpm;
            const ratio = bpm / nextBpm;
            isBpmClose = ratio >= 0.92 && ratio <= 1.08;
          }

          if (isBpmClose) {
            fadeDuration = (60 / bpm) * (automixBars * 4); // e.g. 16 beats
            const outroMarker = deckState.outroMarker ?? (duration - fadeDuration);
            timePastOutro = current - outroMarker;
          } else {
            fadeDuration = (60 / bpm) * 8; // 2 bars quick crossfade (8 beats)
            const outroMarker = duration - fadeDuration;
            timePastOutro = current - outroMarker;
          }
        } else if (automixBars === 8) {
          fadeDuration = (60 / bpm) * 256; // 64 bars for Long Progressions
          const outroMarker = duration - fadeDuration;
          timePastOutro = current - outroMarker;
        } else {
          fadeDuration = (60 / bpm) * (automixBars * 4);
          const outroMarker = deckState.outroMarker ?? (duration - fadeDuration);
          timePastOutro = current - outroMarker;
        }
      };

      if (activeDeck === 'A' && deckAState.track && audio.deckA.loaded) {
        calculateFadeLogic(deckAState, audio.deckA, deckBState);
      } else if (activeDeck === 'B' && deckBState.track && audio.deckB.loaded) {
        calculateFadeLogic(deckBState, audio.deckB, deckAState);
      }

      const { library, onTransitionCancel } = latestProps.current;
      const targetDeckState = activeDeck === 'A' ? deckBState : deckAState;
      const hasNextTrack = library.length > 0 || targetDeckState.track !== null;
      const mixNowTime = useMixerStore.getState().mixNowTrigger;
      
      const shouldTriggerNow = mixNowTime > 0 && mixNowTime > lastMixNowTimeRef.current;
      lastMixNowTimeRef.current = mixNowTime;

      if ((timePastOutro >= 0 || shouldTriggerNow) && !isTransitioning.current && hasNextTrack && activeDeck) {
        isTransitioning.current = true;
        const safeFadeDuration = Math.max(0, fadeDuration);
        executeAutoTransition(activeDeck, safeFadeDuration, isBpmClose);
      } else if (isTransitioning.current && timePastOutro < 0 && activeDeck && !shouldTriggerNow) {
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

    const executeAutoTransition = async (currentActive: 'A' | 'B' | null, fadeDuration: number, isBpmClose: boolean = false) => {
      if (!currentActive) return;
      
      const { library, onTransitionComplete, onTransitionStart, onPitchChange } = latestProps.current;
      const state = useMixerStore.getState();
      const deckAState = state.deckA;
      const deckBState = state.deckB;
      const automixBars = state.automixBars;
      
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
        
        // Dynamically fetch handles if missing (e.g. from DB)
        if (!nextTrack.fileHandle && !nextTrack.rawFile && nextTrack.id) {
           const handles = useLibraryStore.getState().sessionHandles[nextTrack.id];
           if (handles) {
              nextTrack.fileHandle = handles.fileHandle || nextTrack.fileHandle;
              nextTrack.rawFile = handles.rawFile || nextTrack.rawFile;
           }
        }

        if (nextTrack.opfsPath && !trackUrl) {
           try {
              const file = await OPFSManager.getFile(nextTrack.opfsPath);
              trackUrl = URL.createObjectURL(file);
              nextTrack.url = trackUrl;
           } catch(e) {
              console.error("Failed to load OPFS file in AutoMixer", e);
           }
        } else if (nextTrack.fileHandle && !trackUrl) {
          if (await nextTrack.fileHandle.queryPermission({ mode: 'read' }) === 'prompt') {
            await nextTrack.fileHandle.requestPermission({ mode: 'read' });
          }
          trackUrl = await createTrackUrl(nextTrack.fileHandle);
        } else if (!trackUrl && nextTrack.rawFile) {
          trackUrl = URL.createObjectURL(nextTrack.rawFile);
        }

        // 1. Load and Sync Tempo
        if (isFromLibrary || (!targetDeck.loaded && nextDeckState.status !== 'loading')) {
          if (!trackUrl) throw new Error("AutoMixer could not resolve a valid URL for track " + nextTrack.title);
          await targetDeck.loadTrack(trackUrl);
        } else if (nextDeckState.status === 'loading') {
          // Wait for useDeckControl's loadTrack to finish
          let attempts = 0;
          while (useMixerStore.getState()[nextDeckId === 'A' ? 'deckA' : 'deckB'].status !== 'ready' && attempts < 100) { // 5 seconds max wait
             await new Promise(r => setTimeout(r, 50));
             attempts++;
          }
        }

        targetDeck.originalBpm = nextTrack.bpm;
        
        // Tempo syncing for Casual Listening (if close) or default styles (excluding No Fade)
        if (automixBars !== 0 && targetDeck.originalBpm > 0 && currentDeck.currentBpm > 0) {
          if (automixBars !== 4 || isBpmClose) {
            const newPitch = currentDeck.currentBpm / targetDeck.originalBpm;
            onPitchChange(nextDeckId, newPitch);
          }
        }

        const introMarker = nextDeckState.introMarker ?? 0;
        
        let startPosition = introMarker - fadeDuration;
        if (startPosition < 0 || automixBars === 0) {
           startPosition = 0;
        }
        
        // 2. Start target deck
        if (Math.abs(targetDeck.getCurrentTime() - startPosition) > 0.05) {
           targetDeck.seek(startPosition);
        }
        targetDeck.play();
        
        onTransitionStart(nextDeckId, nextTrack!);

        // --- No Fade Fast Path ---
        if (automixBars === 0) {
           const finalCrossfade = nextDeckId === 'A' ? 0 : 1;
           useMixerStore.getState().setCrossfade(finalCrossfade);
           audio.setCrossfadeValue(finalCrossfade, 'constant_power');
           currentDeck.stop();
           isTransitioning.current = false;
           onTransitionComplete(nextDeckId, nextTrack!);
           return;
        }

        // 3. Ramp Crossfader & Handle EQ Ducking / Macro Dynamics
        const targetValue = currentActive === 'A' ? 1 : 0;
        const startValue = currentActive === 'A' ? 0 : 1;
        const startTime = performance.now();
        const durationMs = fadeDuration * 1000;
        
        // Initial Pitch setup for ramp (Casual Listening and Long Progressions)
        const startPitch = targetDeck.originalBpm > 0 ? (currentDeck.currentBpm / targetDeck.originalBpm) : 1.0;

        if (automixBars !== 4 && automixBars !== 8) {
          // Macro Dynamics: Auto set 3rd FX to compressor and turn it on (Default/Club)
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
        } else if (automixBars === 8) {
          // Long Progressions setup
          const currentDeckState = currentActive === 'A' ? deckAState : deckBState;
          const currentSlots = [...currentDeckState.fxSlots] as typeof currentDeckState.fxSlots;
          currentSlots[0] = 'phaser';
          currentSlots[1] = 'gate';
          currentSlots[2] = 'delay';
          useMixerStore.getState().setDeckState(currentActive, { fxSlots: currentSlots });
          // Ensure FX are off at the start
          useMixerStore.getState().setDeckFx(currentActive, { 
             phaserOn: false, gateOn: false, delayOn: false,
             phaserRate: 0.1, delayTime: 0.5, delayFeedback: 0.4
          });
          currentDeck.setPhaserState(false);
          currentDeck.setGateState(false);
          currentDeck.setDelayState(false);

          // Kill incoming bass
          useMixerStore.getState().setDeckEq(nextDeckId, { low: -24 });
          targetDeck.setEq('low', -24);
        }

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

        // Dynamic EQ Masking
        if (automixBars === 4 || (automixBars > 0 && automixBars !== 8)) {
          useMixerStore.getState().setDeckEq(nextDeckId, { low: -12 });
          targetDeck.setEq('low', -12);
        }
        
        let eqRestored = false;
        let phase3Triggered = false;

        const animateTransition = () => {
          if (!isTransitioning.current) return;
          
          const now = performance.now();
          const elapsed = now - startTime;
          const progress = Math.min(elapsed / durationMs, 1);
          
          const currentValue = startValue + (targetValue - startValue) * progress;
          const currentState = useMixerStore.getState();
          
          if (automixBars === 8) {
             // 4-Phase Choreography
             
             // Phase 1: 0% - 25% (Crossfader creeps 0 to 0.4)
             let faderProgress: number;
             if (progress < 0.25) {
                faderProgress = (progress / 0.25) * 0.4;
             } else if (progress < 0.75) {
                faderProgress = 0.4 + ((progress - 0.25) / 0.5) * 0.2; // drifts 0.4 to 0.6
             } else {
                faderProgress = 0.6 + ((progress - 0.75) / 0.25) * 0.4; // 0.6 to 1.0
             }
             const actualFader = startValue === 0 ? faderProgress : (1 - faderProgress);
             currentState.setCrossfade(actualFader);
             audio.setCrossfadeValue(actualFader, 'linear'); // use linear for long blends

             // Pitch ramping back to 1.0 continuously over the whole transition
             const currentPitch = startPitch + (1.0 - startPitch) * progress;
             onPitchChange(nextDeckId, currentPitch);

             // Phase 2: 25% - 50% (Phaser & Outgoing Low Roll-off)
             if (progress >= 0.25 && progress < 0.5) {
                const phase2Prog = (progress - 0.25) / 0.25;
                if (phase2Prog < 0.05) {
                   currentState.setDeckFx(currentActive, { phaserOn: true });
                   currentDeck.setPhaserState(true);
                }
                const outLow = -6 * phase2Prog;
                currentState.setDeckEq(currentActive, { low: outLow });
                currentDeck.setEq('low', outLow);
             }

             // Phase 3: 50% - 75% (Bass Drop & Gate)
             if (progress >= 0.5) {
                if (!phase3Triggered) {
                   phase3Triggered = true;
                   // Bass Swap!
                   currentState.setDeckEq(currentActive, { low: -24 });
                   currentDeck.setEq('low', -24);
                   currentState.setDeckEq(nextDeckId, { low: 0 });
                   targetDeck.setEq('low', 0);
                   
                   // Activate Gate
                   currentState.setDeckFx(currentActive, { gateOn: true });
                   currentDeck.setGateState(true);
                }
             }

             // Phase 4: 75% - 100% (Delay Wash)
             if (progress >= 0.75) {
                const phase4Prog = (progress - 0.75) / 0.25;
                if (phase4Prog < 0.05) {
                   currentState.setDeckFx(currentActive, { delayOn: true });
                   currentDeck.setDelayState(true);
                }
                const delayFeedback = 0.4 + (0.4 * phase4Prog);
                currentState.setDeckFx(currentActive, { delayFeedback });
                currentDeck.setDelayFeedback(delayFeedback);
             }

          } else {
             currentState.setCrossfade(currentValue);
             audio.setCrossfadeValue(currentValue, currentState.crossfadeCurve || 'constant_power');
             
             if (automixBars === 4) {
                // Casual Listening: Light high EQ adjustments
                // Outgoing Highs duck to -4dB, Incoming Highs ramp from -4dB to 0dB
                const outHigh = -4 * progress;
                const inHigh = -4 * (1 - progress);
                
                currentState.setDeckEq(currentActive, { high: outHigh });
                currentDeck.setEq('high', outHigh);
                
                currentState.setDeckEq(nextDeckId, { high: inHigh });
                targetDeck.setEq('high', inHigh);

                // Pitch ramping back to 1.0
                if (isBpmClose) {
                   const currentPitch = startPitch + (1.0 - startPitch) * progress;
                   onPitchChange(nextDeckId, currentPitch);
                }
             } else if (automixBars !== 0) {
               // Default FX Spillover for other styles
               const delayFeedback = 0.2 + (0.55 * progress);
               currentState.setDeckFx(currentActive, { delayFeedback });
               currentDeck.setDelayFeedback(delayFeedback);
             }

             // Check outgoing deck amplitude for EQ masking restore (Not for Long Progressions which has explicit phases)
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
          }

          if (progress < 1) {
            setTimeout(animateTransition, 20);
          } else {
             // Reset EQs and FX on completion just in case
             if (automixBars === 4 || automixBars === 8) {
               useMixerStore.getState().setDeckEq(currentActive, { high: 0, low: 0 });
               currentDeck.setEq('high', 0);
               currentDeck.setEq('low', 0);
               useMixerStore.getState().setDeckEq(nextDeckId, { high: 0, low: 0 });
               targetDeck.setEq('high', 0);
               targetDeck.setEq('low', 0);
               
               if (automixBars === 8) {
                 useMixerStore.getState().setDeckFx(currentActive, { phaserOn: false, gateOn: false, delayOn: false });
                 currentDeck.setPhaserState(false);
                 currentDeck.setGateState(false);
                 currentDeck.setDelayState(false);
               }
             }
             
             currentDeck.stop();
             isTransitioning.current = false;
             onTransitionComplete(nextDeckId, nextTrack!);
          }
        };
        setTimeout(animateTransition, 20);
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
  }, [isAutomixEnabled]);
}
