import { create } from 'zustand';
import type { Track, TrackSegment } from '../types/mixer';

export type DeckStatus = 'empty' | 'loading' | 'ready' | 'playing' | 'error';

export interface FxState {
  delayOn: boolean;
  delayTime: number;
  delayFeedback: number;
  reverbOn: boolean;
  reverbSize: number;
  phaserOn: boolean;
  phaserRate: number;
  gateOn: boolean;
  rollOn: boolean;
  sirenOn: boolean;
}

export interface DeckState {
  status: DeckStatus;
  track: Track | null;
  isPlaying: boolean;
  volume: number;
  gain: number;
  eq: { high: number; mid: number; low: number };
  filter: number;
  pitch: number;
  keyLock: boolean;
  sync: boolean;
  mute: boolean;
  fx: FxState;
  
  // Track specific analysis data
  introMarker: number;
  outroMarker: number;
  peaks: Float32Array | null;
  segments: TrackSegment[];
}

const initialFxState: FxState = {
  delayOn: false,
  delayTime: 0.25,
  delayFeedback: 0.5,
  reverbOn: false,
  reverbSize: 0.7,
  phaserOn: false,
  phaserRate: 0.5,
  gateOn: false,
  rollOn: false,
  sirenOn: false,
};

const initialDeckState: DeckState = {
  status: 'empty',
  track: null,
  isPlaying: false,
  volume: 1.0,
  gain: 1.0,
  eq: { high: 0, mid: 0, low: 0 },
  filter: 0,
  pitch: 1.0,
  keyLock: false,
  sync: false,
  mute: false,
  fx: { ...initialFxState },
  introMarker: 0,
  outroMarker: 0,
  peaks: null,
  segments: [],
};

export interface MixerState {
  deckA: DeckState;
  deckB: DeckState;
  crossfade: number;
  masterDeck: 'A' | 'B' | null;
  isAutomixEnabled: boolean;
  automixBars: number;
  masterVolume: number;
  
  // Actions
  setDeckState: (deckId: 'A' | 'B', partial: Partial<DeckState>) => void;
  setDeckFx: (deckId: 'A' | 'B', partial: Partial<FxState>) => void;
  setDeckEq: (deckId: 'A' | 'B', partial: Partial<{ high: number; mid: number; low: number }>) => void;
  setCrossfade: (value: number) => void;
  setMasterDeck: (deckId: 'A' | 'B' | null) => void;
  setIsAutomixEnabled: (enabled: boolean) => void;
}

export const useMixerStore = create<MixerState>((set) => ({
  deckA: { ...initialDeckState },
  deckB: { ...initialDeckState },
  crossfade: 0.5,
  masterDeck: null,
  isAutomixEnabled: false,
  automixBars: 4,
  masterVolume: 1.0,

  setDeckState: (deckId, partial) =>
    set((state) => ({
      ...state,
      [deckId === 'A' ? 'deckA' : 'deckB']: {
        ...state[deckId === 'A' ? 'deckA' : 'deckB'],
        ...partial,
      },
    })),

  setDeckFx: (deckId, partial) =>
    set((state) => {
      const deckKey = deckId === 'A' ? 'deckA' : 'deckB';
      return {
        ...state,
        [deckKey]: {
          ...state[deckKey],
          fx: {
            ...state[deckKey].fx,
            ...partial,
          },
        },
      };
    }),

  setDeckEq: (deckId, partial) =>
    set((state) => {
      const deckKey = deckId === 'A' ? 'deckA' : 'deckB';
      return {
        ...state,
        [deckKey]: {
          ...state[deckKey],
          eq: {
            ...state[deckKey].eq,
            ...partial,
          },
        },
      };
    }),

  setCrossfade: (value) => set({ crossfade: value }),
  setMasterDeck: (deckId) => set({ masterDeck: deckId }),
  setIsAutomixEnabled: (enabled) => set({ isAutomixEnabled: enabled }),
}));
