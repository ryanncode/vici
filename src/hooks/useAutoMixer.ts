import { useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { AudioEngine } from '../services/AudioEngine';
import { createTrackUrl } from '../services/FileManager';
import type { Track } from '../types/mixer';

interface AutoMixerProps {
  deckAState: { track: Track | null; isPlaying: boolean; introMarker?: number; outroMarker?: number };
  deckBState: { track: Track | null; isPlaying: boolean; introMarker?: number; outroMarker?: number };
  library: Track[];
  isAutomixEnabled: boolean;
  onTransitionStart: (winningDeck: 'A' | 'B', nextTrack: Track) => void;
  onTransitionComplete: (winningDeck: 'A' | 'B', nextTrack: Track) => void;
  onTransitionCancel: (cancelledDeck: 'A' | 'B') => void;
  onPitchChange: (deckId: 'A' | 'B', pitch: number) => void;
}

export function useAutoMixer({ deckAState, deckBState, library, isAutomixEnabled, onTransitionStart, onTransitionComplete, onTransitionCancel, onPitchChange }: AutoMixerProps) {
  const animationRef = useRef<number | null>(null);
  const isTransitioning = useRef<boolean>(false);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAutomixEnabled) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }
    const audio = AudioEngine.getInstance();

    const monitorLoop = () => {
      let activeDeck: 'A' | 'B' | null = null;
      let timePastOutro = -1;
      let fadeDuration = 15;

      if (deckAState.isPlaying && !deckBState.isPlaying) activeDeck = 'A';
      if (deckBState.isPlaying && !deckAState.isPlaying) activeDeck = 'B';

      if (activeDeck === 'A' && deckAState.track && audio.deckA.player.buffer) {
        const current = audio.deckA.getCurrentTime();
        const duration = audio.deckA.player.buffer.duration;
        const outroMarker = deckAState.outroMarker ?? (duration - 15);
        timePastOutro = current - outroMarker;
        fadeDuration = duration - outroMarker;
      } else if (activeDeck === 'B' && deckBState.track && audio.deckB.player.buffer) {
        const current = audio.deckB.getCurrentTime();
        const duration = audio.deckB.player.buffer.duration;
        const outroMarker = deckBState.outroMarker ?? (duration - 15);
        timePastOutro = current - outroMarker;
        fadeDuration = duration - outroMarker;
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
        audio.crossfader.fade.cancelScheduledValues(Tone.now());
        
        onTransitionCancel(targetDeckId);
      }

      animationRef.current = requestAnimationFrame(monitorLoop);
    };

    const executeAutoTransition = async (currentActive: 'A' | 'B' | null, fadeDuration: number) => {
      if (!currentActive) return;
      
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
        if (isFromLibrary || !targetDeck.player.loaded) {
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

        // 3. Ramp Crossfader
        const targetValue = nextDeckId === 'A' ? 0 : 1;
        
        // Linear automation over the remaining duration
        audio.crossfader.fade.rampTo(targetValue, fadeDuration);

        transitionTimeoutRef.current = setTimeout(() => {
          currentDeck.stop();
          isTransitioning.current = false;
          transitionTimeoutRef.current = null;
          onTransitionComplete(nextDeckId, nextTrack!);
        }, fadeDuration * 1000);
      } catch (err) {
        console.error("AutoMixer Transition Failed:", err);
        isTransitioning.current = false;
      }
    };

    animationRef.current = requestAnimationFrame(monitorLoop);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [deckAState, deckBState, library, isAutomixEnabled, onTransitionComplete]);
}
