import { useEffect, useRef } from 'react';
import { AudioEngine } from '../services/AudioEngine';
import { createTrackUrl } from '../services/FileManager';
import type { Track } from '../types/mixer';

interface AutoMixerProps {
  deckAState: { track: Track | null; isPlaying: boolean };
  deckBState: { track: Track | null; isPlaying: boolean };
  library: Track[];
  isAutomixEnabled: boolean;
  onTransitionComplete: (winningDeck: 'A' | 'B', nextTrack: Track) => void;
}

export function useAutoMixer({ deckAState, deckBState, library, isAutomixEnabled, onTransitionComplete }: AutoMixerProps) {
  const animationRef = useRef<number | null>(null);
  const isTransitioning = useRef<boolean>(false);
  const TRANSITION_DURATION = 15; // seconds for crossfade

  useEffect(() => {
    if (!isAutomixEnabled) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }
    const audio = AudioEngine.getInstance();

    const monitorLoop = () => {
      let activeDeck: 'A' | 'B' | null = null;
      let remainingTime = Infinity;

      if (deckAState.isPlaying && !deckBState.isPlaying) activeDeck = 'A';
      if (deckBState.isPlaying && !deckAState.isPlaying) activeDeck = 'B';

      if (activeDeck === 'A' && deckAState.track && audio.deckA.player.buffer) {
        const current = audio.deckA.getCurrentTime();
        const duration = audio.deckA.player.buffer.duration;
        remainingTime = duration - current;
      } else if (activeDeck === 'B' && deckBState.track && audio.deckB.player.buffer) {
        const current = audio.deckB.getCurrentTime();
        const duration = audio.deckB.player.buffer.duration;
        remainingTime = duration - current;
      }

      // Trigger transition logic if threshold breached
      if (remainingTime <= TRANSITION_DURATION && !isTransitioning.current && library.length > 0) {
        isTransitioning.current = true;
        executeAutoTransition(activeDeck);
      }

      animationRef.current = requestAnimationFrame(monitorLoop);
    };

    const executeAutoTransition = async (currentActive: 'A' | 'B' | null) => {
      if (!currentActive) return;
      
      const nextDeckId = currentActive === 'A' ? 'B' : 'A';
      const targetDeck = nextDeckId === 'A' ? audio.deckA : audio.deckB;
      const currentDeck = currentActive === 'A' ? audio.deckA : audio.deckB;
      
      // Grab next track from library pool
      const nextTrack = library[0]; 
      if (!nextTrack) return;

      let trackUrl = nextTrack.url;
      if (nextTrack.fileHandle && !trackUrl) {
        trackUrl = await createTrackUrl(nextTrack.fileHandle);
      }

      // 1. Load and Sync Tempo
      await targetDeck.loadTrack(trackUrl);
      targetDeck.originalBpm = nextTrack.bpm;
      if (targetDeck.originalBpm > 0 && currentDeck.currentBpm > 0) {
        targetDeck.setPlaybackRate(currentDeck.currentBpm / targetDeck.originalBpm);
      }

      // 2. Start target deck
      targetDeck.play();

      // 3. Ramp Crossfader
      const targetValue = nextDeckId === 'A' ? 0 : 1;
      
      // Linear automation over the remaining duration
      audio.crossfader.fade.rampTo(targetValue, TRANSITION_DURATION);

      setTimeout(() => {
        currentDeck.stop();
        isTransitioning.current = false;
        onTransitionComplete(nextDeckId, nextTrack);
      }, TRANSITION_DURATION * 1000);
    };

    animationRef.current = requestAnimationFrame(monitorLoop);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [deckAState, deckBState, library, isAutomixEnabled, onTransitionComplete]);
}
