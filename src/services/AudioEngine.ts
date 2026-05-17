/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TrackSegment } from '../types/mixer';
import { metadataScanner } from './MetadataScanner';

import { FaustMonoDspGenerator } from '@grame/faustwasm';

// We will use standard Web Audio API AudioWorkletNode
export class Deck {
  public id: 'A' | 'B';
  public originalBpm: number = 120;
  public currentBpm: number = 120;
  
  public peaks: Float32Array | null = null;
  public segments: TrackSegment[] = [];
  public channelVolume: number = 1.0;
  public crossfadeGain: number = 1.0;
  public trackGainDb: number = 0;
  public currentTime: number = 0;

  // Web Audio Nodes
  private trackNode: AudioWorkletNode | null = null;
  private faustNode: any | null = null;
  private pcmData: Float32Array | null = null;
  private outputNode: AudioNode;

  public get duration(): number {
    return this.pcmData ? this.pcmData.length / this.outputNode.context.sampleRate : 0;
  }
  public get loaded(): boolean {
    return this.pcmData !== null;
  }
  public mute: boolean = false;

  constructor(id: 'A' | 'B', outputNode: AudioNode) {
    this.id = id;
    this.outputNode = outputNode;
  }

  public async init(audioContext: AudioContext) {
    try {
      // 1. Initialize track playback worklet
      this.trackNode = new AudioWorkletNode(audioContext, 'track-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2]
      });

      this.trackNode.port.onmessage = (e) => {
        if (e.data.type === 'TIME_UPDATE') {
          this.currentTime = e.data.value;
        }
      };

      // 2. Load FAUST DSP
      const generator = new FaustMonoDspGenerator();
      
      // Fetch compiled wasm and metadata from public dir
      const dspMeta = await (await fetch("/faust/dsp-meta.json")).json();
      const dspModule = await WebAssembly.compileStreaming(await fetch("/faust/dsp-module.wasm"));
      
      this.faustNode = await generator.createNode(
        audioContext,
        "engine",
        { module: dspModule, json: JSON.stringify(dspMeta), soundfiles: {} },
        false
      );

      // Initialize Faust parameters
      this.updateFaustVolume();
      this.faustNode.setParamValue('/engine/pitch', 1.0);
      this.faustNode.setParamValue('/engine/filter', 0.0);
      this.faustNode.setParamValue('/engine/eq_low', 0.0);
      this.faustNode.setParamValue('/engine/eq_mid', 0.0);
      this.faustNode.setParamValue('/engine/eq_high', 0.0);

      // 3. Connect Graph: Track -> Faust -> Output
      if (this.faustNode) {
        this.trackNode.connect(this.faustNode);
        this.faustNode.connect(this.outputNode);
      } else {
        this.trackNode.connect(this.outputNode);
      }

      // Temp debug bypass
      // this.trackNode.connect(this.outputNode);

    } catch (e) {
      console.warn("AudioWorklet not loaded, proceeding with dummy engine", e);
    }
  }

  public async loadTrack(url: string): Promise<void> {
    try {
      // 1. Fetch file
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      
      // 2. Decode to raw Float32Array PCM
      const audioCtx = AudioEngine.getInstance().context;
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      
      // 3. Store PCM in memory
      this.pcmData = audioBuffer.getChannelData(0);
      
      // Explicitly copy the array to guarantee it survives postMessage cloning
      const clonedPcm = new Float32Array(this.pcmData);

      // 4. Send memory pointer / buffer to Worklet
      if (this.trackNode) {
        this.trackNode.port.postMessage({
          type: 'LOAD_TRACK',
          buffer: clonedPcm
        });
      }

      await this.generatePeaks(audioBuffer);
    } catch (err) {
      console.error("Failed to load track:", err);
    }
  }

  private async generatePeaks(buffer: AudioBuffer) {
    const data = buffer.getChannelData(0);
    try {
      const result = await metadataScanner.analyzeWaveform(data, buffer.duration, this.originalBpm);
      this.peaks = result.peaks;
      this.segments = result.segments;
    } catch (err) {
      console.error("Worker waveform analysis failed:", err);
    }
  }

  public play(): void {
    if (this.trackNode) {
      this.trackNode.port.postMessage({ type: 'PLAY' });
    }
  }

  public stop(): void {
    if (this.trackNode) {
      this.trackNode.port.postMessage({ type: 'STOP' });
    }
  }

  public getCurrentTime(): number {
    return this.currentTime;
  }

  public seek(time: number): void {
    this.currentTime = time;
    if (this.trackNode) {
      this.trackNode.port.postMessage({ type: 'SEEK', value: time });
    }
  }

  public setPlaybackRate(rate: number): void {
    this.currentBpm = this.originalBpm * rate;
    
    // Send rate to track node for basic variable speed playback
    if (this.trackNode) {
      this.trackNode.port.postMessage({ path: '/faust/pitch', value: rate });
    }

    // Also send to Faust if we want it to handle effects based on pitch
    if (this.faustNode) {
      this.faustNode.setParamValue('/engine/pitch', rate);
    }
  }

  public setEq(band: 'high' | 'mid' | 'low', value: number): void {
    if (this.faustNode) {
      this.faustNode.setParamValue(`/engine/eq_${band}`, value);
    }
  }

  public setFilterColor(value: number): void {
    if (this.faustNode) {
      this.faustNode.setParamValue('/engine/filter', value);
    }
  }
  public setDelayState(_isOn: boolean): void {}
  public setDelayFeedback(_value: number): void {}
  public setDelayTime(_timeInSeconds: number): void {}
  public setReverbState(_isOn: boolean): void {}
  public setReverbSize(_value: number): void {}
  public setPhaserState(_isOn: boolean): void {}
  public setPhaserRate(_rateHz: number): void {}
  public setGateState(_isOn: boolean): void {}
  public triggerSiren(_isOn: boolean): void {}
  public setRoll(_isActive: boolean, _rate: number = 8): void {}

  public setChannelVolume(linearGain: number): void {
    this.channelVolume = linearGain;
    this.updateFaustVolume();
  }

  public setCrossfadeGain(gain: number): void {
    this.crossfadeGain = gain;
    this.updateFaustVolume();
  }

  private updateFaustVolume(): void {
    if (this.faustNode) {
      this.faustNode.setParamValue('/engine/volume', this.channelVolume * this.crossfadeGain);
    }
  }

  public setTrackGainDb(db: number): void {
    this.trackGainDb = db;
  }
}

export class AudioEngine {
  private static instance: AudioEngine;
  public context: AudioContext;
  public deckA!: Deck;
  public deckB!: Deck;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.deckA = new Deck('A', this.context.destination);
    this.deckB = new Deck('B', this.context.destination);
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  public async init() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // Load custom track processor
      try {
        await this.context.audioWorklet.addModule('/worklets/track-processor.js?v=' + Date.now());
      } catch (e) {
        console.warn("Could not load track processor", e);
      }

      await this.deckA.init(this.context);
      await this.deckB.init(this.context);

      this.initialized = true;
    })();

    return this.initPromise;
  }

  public setCrossfadeValue(value: number): void {
    // Value range: 0 (Deck A) to 1 (Deck B)
    // Equal power crossfade
    const gainA = Math.cos(value * 0.5 * Math.PI);
    const gainB = Math.cos((1.0 - value) * 0.5 * Math.PI);

    if (this.deckA) {
      this.deckA.setCrossfadeGain(gainA);
    }
    if (this.deckB) {
      this.deckB.setCrossfadeGain(gainB);
    }
  }
}
