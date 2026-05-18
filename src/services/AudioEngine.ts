/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TrackSegment } from '../types/mixer';
import { metadataScanner } from './MetadataScanner';
import { SharedRingBuffer } from '../audio/SharedRingBuffer';

import { FaustMonoDspGenerator } from '@grame/faustwasm';

// We will use standard Web Audio API AudioWorkletNode
export class Deck {
  public id: 'A' | 'B';
  public originalBpm: number = 120;
  public currentBpm: number = 120;
  
  public peaks: Float32Array | null = null;
  public segments: TrackSegment[] = [];
  public mfccs?: Float32Array;
  public cens?: Float32Array;
  public channelVolume: number = 1.0;
  public channelGain: number = 1.0;
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

      // Load WASM processor module
      const wasmResponse = await fetch('/worklets/wasm/audio-processor.wasm');
      const wasmBuffer = await wasmResponse.arrayBuffer();
      
      this.trackNode.port.postMessage({ type: 'INIT_WASM', wasmBinary: wasmBuffer });

      this.trackNode.port.onmessage = (e) => {
        if (e.data.type === 'TIME_UPDATE') {
          this.currentTime = e.data.value;
        } else if (e.data.type === 'SEEK_STREAM') {
          if (AudioEngine.getInstance().decodingWorker) {
            AudioEngine.getInstance().decodingWorker!.postMessage({
              type: 'SEEK_STREAM',
              payload: { deckId: this.id, frame: e.data.frame }
            });
          }
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
      
      // FX Defaults
      this.faustNode.setParamValue('/engine/fx_delay_on', 0);
      this.faustNode.setParamValue('/engine/fx_reverb_on', 0);
      this.faustNode.setParamValue('/engine/fx_phaser_on', 0);
      this.faustNode.setParamValue('/engine/fx_gate_on', 0);
      this.faustNode.setParamValue('/engine/fx_roll_on', 0);
      this.faustNode.setParamValue('/engine/fx_siren_on', 0);
      this.faustNode.setParamValue('/engine/fx_compressor_on', 0);

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
      
      // Yield to let audio engine breathe
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // 2. Decode to raw Float32Array PCM
      // Use OfflineAudioContext for decoding to prevent stuttering/blocking the main active AudioContext
      const audioCtx = AudioEngine.getInstance().context;
      const offlineCtx = new OfflineAudioContext(2, 1, audioCtx.sampleRate);
      const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
      
      // Yield again
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // 3. Store PCM in memory
      const leftChannel = audioBuffer.getChannelData(0);
      const rightChannel = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel;
      this.pcmData = leftChannel; // Keep left channel for duration and peaks
      
      // Yield before large array copy
      await new Promise(resolve => setTimeout(resolve, 15));

      // Generate peaks FIRST so waveforms load regardless of streaming setup success
      await this.generatePeaks(audioBuffer);

      // Explicitly copy the arrays to guarantee they survive postMessage cloning
      const clonedLeft = new Float32Array(leftChannel);
      const clonedRight = new Float32Array(rightChannel);
      const bufferLength = clonedLeft.length;

      // Yield to main thread to prevent UI freezing before sending to worklet
      await new Promise(resolve => setTimeout(resolve, 15));

      // Feature detection for cross-origin isolation and SharedArrayBuffer
      const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated;

      if (hasSharedArrayBuffer) {
        // 4. Setup SharedRingBuffer for streaming
        const capacity = 131072; // ~1.5s at 44.1kHz, 2 channels interleaved
        const ringBuffer = new SharedRingBuffer(capacity);
        const sharedBuffer = ringBuffer.getSharedBuffer();

        // Send to background worker to stream
        if (AudioEngine.getInstance().decodingWorker) {
          AudioEngine.getInstance().decodingWorker!.postMessage({
            type: 'STREAM_DECODED',
            payload: {
              deckId: this.id,
              buffers: [clonedLeft, clonedRight],
              sharedBuffer,
              capacity
            }
          }, [clonedLeft.buffer, clonedRight.buffer]);
        }

        // Send memory pointers / buffers to Worklet
        if (this.trackNode) {
          this.trackNode.port.postMessage({
            type: 'LOAD_TRACK',
            sharedBuffer,
            capacity,
            bufferLength
          });
        }
      } else {
        console.warn("SharedArrayBuffer not supported (missing COOP/COEP). Falling back to full buffer transfer.");
        // Send full buffer directly to worklet
        if (this.trackNode) {
          this.trackNode.port.postMessage({
            type: 'LOAD_TRACK_FULL',
            leftChannel: clonedLeft,
            rightChannel: clonedRight,
            bufferLength
          }, [clonedLeft.buffer, clonedRight.buffer]);
        }
      }

      // Yield again
      await new Promise(resolve => setTimeout(resolve, 10));
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
      this.mfccs = result.mfccs;
      this.cens = result.cens;
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

  public setKeyLock(isLocked: boolean): void {
    if (this.trackNode) {
      this.trackNode.port.postMessage({ type: 'SET_KEY_LOCK', value: isLocked });
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
  public setDelayState(isOn: boolean): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_delay_on', isOn ? 1 : 0);
  }
  public setDelayFeedback(value: number): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_delay_feedback', value);
  }
  public setDelayTime(timeInSeconds: number): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_delay_time', timeInSeconds);
  }
  public setReverbState(isOn: boolean): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_reverb_on', isOn ? 1 : 0);
  }
  public setReverbSize(value: number): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_reverb_size', value);
  }
  public setPhaserState(isOn: boolean): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_phaser_on', isOn ? 1 : 0);
  }
  public setPhaserRate(rateHz: number): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_phaser_rate', rateHz);
  }
  public setGateState(isOn: boolean): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_gate_on', isOn ? 1 : 0);
  }
  public triggerSiren(isOn: boolean): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_siren_on', isOn ? 1 : 0);
  }
  public setCompressorState(isOn: boolean): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_compressor_on', isOn ? 1 : 0);
  }
  public setRoll(isActive: boolean, _rate: number = 8): void {
    if (this.faustNode) {
      this.faustNode.setParamValue('/engine/fx_roll_on', isActive ? 1 : 0);
      if (isActive && this.currentBpm > 0) {
        this.faustNode.setParamValue('/engine/fx_roll_bpm', this.currentBpm);
      }
    }
  }

  public setChannelVolume(linearGain: number): void {
    this.channelVolume = linearGain;
    this.updateFaustVolume();
  }

  public setChannelGain(gain: number): void {
    this.channelGain = gain;
    this.updateFaustVolume();
  }

  public setCrossfadeGain(gain: number): void {
    this.crossfadeGain = gain;
    this.updateFaustVolume();
  }

  private updateFaustVolume(): void {
    if (this.faustNode) {
      this.faustNode.setParamValue('/engine/volume', this.channelVolume * this.channelGain * this.crossfadeGain);
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
  public masterGainNode!: GainNode;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  public decodingWorker: Worker | null = null;

  private constructor() {
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)({ latencyHint: 'interactive' });
    this.masterGainNode = this.context.createGain();
    this.masterGainNode.connect(this.context.destination);
    this.deckA = new Deck('A', this.masterGainNode);
    this.deckB = new Deck('B', this.masterGainNode);
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
        await this.context.audioWorklet.addModule('/worklets/track-processor.js?v=' + Date.now(), { type: 'module' } as any);
      } catch (e) {
        console.warn("Could not load track processor", e);
      }

      // Initialize background decoding worker
      try {
        this.decodingWorker = new Worker(new URL('../audio/decoding.worker.ts', import.meta.url), { type: 'module' });
        this.decodingWorker.postMessage({ type: 'INIT' });
      } catch (e) {
        console.warn("Could not load decoding worker", e);
      }

      await this.deckA.init(this.context);
      await this.deckB.init(this.context);

      this.initialized = true;
    })();

    return this.initPromise;
  }

  public setMasterVolume(vol: number): void {
    if (this.masterGainNode) {
      this.masterGainNode.gain.setTargetAtTime(vol, this.context.currentTime, 0.05);
    }
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
