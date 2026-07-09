import { create } from 'zustand';
import type { Track, TrackSegment } from '../types/mixer';

export type DeckStatus = 'empty' | 'loading' | 'ready' | 'playing' | 'error';

export interface FxState {
  delayOn: boolean;
  delayTime: number;
  delayFeedback: number;
  reverbOn: boolean;
  reverbSize: number;
  reverbDecay: number;
  reverbPredelay: number;
  reverbColor: number;
  phaserOn: boolean;
  phaserRate: number;
  gateOn: boolean;
  rollOn: boolean;
  rollBeats: number;
  sirenOn: boolean;
  sirenType: number;
  sirenFreq: number;
  sirenLfoRate: number;
  sirenLfoDepth: number;
  compressorOn: boolean;
  compressorRatio: number;
  compressorThresh: number;
  compressorAttack: number;
  compressorRelease: number;
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
  fxSlots: ['delay'|'reverb'|'phaser'|'gate'|'roll'|'siren'|'compressor', 'delay'|'reverb'|'phaser'|'gate'|'roll'|'siren'|'compressor', 'delay'|'reverb'|'phaser'|'gate'|'roll'|'siren'|'compressor'];
  
  // Track specific analysis data
  introMarker: number;
  outroMarker: number;
  peaks: Float32Array | null;
  bandPeaks: Float32Array | null;
  segments: TrackSegment[];
  hotCues: number[];
  activeLoop: { start: number; end: number } | null;
}

const initialFxState: FxState = {
  delayOn: false,
  delayTime: 0.25,
  delayFeedback: 0.5,
  reverbOn: false,
  reverbSize: 0.7,
  reverbDecay: 3.0,
  reverbPredelay: 20.0,
  reverbColor: 0.0,
  phaserOn: false,
  phaserRate: 0.5,
  gateOn: false,
  rollOn: false,
  rollBeats: 1.0,
  sirenOn: false,
  sirenType: 1,
  sirenFreq: 300.0,
  sirenLfoRate: 2.0,
  sirenLfoDepth: 500.0,
  compressorOn: false,
  compressorRatio: 2.0,
  compressorThresh: -12.0,
  compressorAttack: 0.01,
  compressorRelease: 0.1,
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
  fxSlots: ['delay', 'reverb', 'phaser'],
  introMarker: 0,
  outroMarker: 0,
  peaks: null,
  bandPeaks: null,
  segments: [],
  hotCues: [],
  activeLoop: null,
};

export interface MixerState {
  deckA: DeckState;
  deckB: DeckState;
  crossfade: number;
  crossfadeCurve: 'constant_power' | 'linear' | 'cut';
  masterDeck: 'A' | 'B' | null;
  isAutomixEnabled: boolean;
  automixBars: number;
  masterVolume: number;
  mixNowTrigger: number;
  
  // Actions
  setDeckState: (deckId: 'A' | 'B', partial: Partial<DeckState>) => void;
  setDeckFx: (deckId: 'A' | 'B', partial: Partial<FxState>) => void;
  setDeckEq: (deckId: 'A' | 'B', partial: Partial<{ high: number; mid: number; low: number }>) => void;
  setCrossfade: (value: number) => void;
  setCrossfadeCurve: (curve: 'constant_power' | 'linear' | 'cut') => void;
  setMasterDeck: (deckId: 'A' | 'B' | null) => void;
  setIsAutomixEnabled: (enabled: boolean) => void;
  setMixNowTrigger: () => void;
}

export const useMixerStore = create<MixerState>((set) => ({
  deckA: { ...initialDeckState },
  deckB: { ...initialDeckState },
  crossfade: 0.5,
  crossfadeCurve: 'constant_power',
  masterDeck: null,
  isAutomixEnabled: localStorage.getItem('vici-automix-enabled') === 'true',
  automixBars: localStorage.getItem('vici-automix-bars') ? parseInt(localStorage.getItem('vici-automix-bars')!) : 4,
  masterVolume: 1.0,
  mixNowTrigger: 0,

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
  setCrossfadeCurve: (curve) => set({ crossfadeCurve: curve }),
  setMasterDeck: (deckId) => set({ masterDeck: deckId }),
  setIsAutomixEnabled: (enabled) => {
    localStorage.setItem('vici-automix-enabled', String(enabled));
    set({ isAutomixEnabled: enabled });
  },
  setMasterVolume: (v: number) => set({ masterVolume: v }),
  setMixNowTrigger: () => set({ mixNowTrigger: Date.now() }),
}));
