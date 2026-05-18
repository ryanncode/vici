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
  
  private _duration: number = 0;
  private _loaded: boolean = false;

  // Web Audio Nodes
  private trackNode: AudioWorkletNode | null = null;
  private faustNode: any | null = null;
  private outputNode: AudioNode;

  public get duration(): number {
    return this._duration;
  }
  public get loaded(): boolean {
    return this._loaded;
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

      const basePath = import.meta.env.BASE_URL || '/';

      // Send init message to worklet. The WASM is now bundled via SINGLE_FILE.
      this.trackNode.port.postMessage({ type: 'INIT_WASM' });

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
        } else if (e.data.type === 'WASM_ERROR') {
          console.error(`Deck ${this.id} WASM Error:`, e.data.error);
        }
      };

      // 2. Load FAUST DSP
      const generator = new FaustMonoDspGenerator();
      
      // Fetch compiled wasm and metadata from public dir
      const dspMeta = await (await fetch(`${basePath}faust/dsp-meta.json`)).json();
      const dspModule = await WebAssembly.compileStreaming(await fetch(`${basePath}faust/dsp-module.wasm`));
      
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

    } catch (e) {
      console.warn("AudioWorklet not loaded, proceeding with dummy engine", e);
    }
  }

  public async loadTrack(url: string): Promise<void> {
    try {
      // 1. Fetch file
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      
      // Feature detection for cross-origin isolation and SharedArrayBuffer
      const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated;
      
      const capacity = 131072; // ~1.5s at 44.1kHz, 2 channels interleaved
      const ringBuffer = hasSharedArrayBuffer ? new SharedRingBuffer(capacity) : null;
      const sharedBuffer = ringBuffer ? ringBuffer.getSharedBuffer() : null;

      // 2. Decode in background worker to completely bypass main thread memory allocation
      const workerResponse = await new Promise<{ peaks: Float32Array, duration: number, bufferLength: number, trackSampleRate: number, leftChannel?: Float32Array, rightChannel?: Float32Array }>((resolve, reject) => {
        if (!AudioEngine.getInstance().decodingWorker) return reject("No decoding worker available");
        
        const worker = AudioEngine.getInstance().decodingWorker!;
        
        const onMessage = (e: MessageEvent) => {
          if (e.data.type === 'DECODE_DONE' && e.data.deckId === this.id) {
            worker.removeEventListener('message', onMessage);
            resolve(e.data);
          } else if (e.data.type === 'DECODE_ERROR' && e.data.deckId === this.id) {
            worker.removeEventListener('message', onMessage);
            reject(new Error(e.data.error));
          }
        };
        worker.addEventListener('message', onMessage);

        const extMatch = url.match(/\.([a-z0-9]+)(?:\?.*)?$/i);
        const derivedType = extMatch ? extMatch[1].toLowerCase() : 'mp3';

        worker.postMessage({
          type: 'DECODE',
          payload: {
            buffer: arrayBuffer,
            fileType: derivedType,
            sharedBuffer,
            capacity,
            deckId: this.id
          }
        }, [arrayBuffer]);
      });

      // 3. Generate metadata from precomputed peaks
      await this.generatePeaks(workerResponse.peaks, workerResponse.duration);
      this._duration = workerResponse.duration;
      this._loaded = true;

      // 4. Send memory pointers / buffers to Worklet
      if (hasSharedArrayBuffer && sharedBuffer) {
        // Send memory pointers to Worklet
        if (this.trackNode) {
          this.trackNode.port.postMessage({
            type: 'LOAD_TRACK',
            sharedBuffer,
            capacity,
            bufferLength: workerResponse.bufferLength,
            trackSampleRate: workerResponse.trackSampleRate
          });
        }
      } else {
        console.warn("SharedArrayBuffer not supported (missing COOP/COEP). Falling back to full buffer transfer.");
        // Send full buffer directly to worklet
        if (this.trackNode && workerResponse.leftChannel && workerResponse.rightChannel) {
          this.trackNode.port.postMessage({
            type: 'LOAD_TRACK_FULL',
            leftChannel: workerResponse.leftChannel,
            rightChannel: workerResponse.rightChannel,
            bufferLength: workerResponse.bufferLength,
            trackSampleRate: workerResponse.trackSampleRate
          }, [workerResponse.leftChannel.buffer, workerResponse.rightChannel.buffer]);
        }
      }
    } catch (err) {
      console.error("Failed to load track:", err);
    }
  }

  private async generatePeaks(peaksOrAudio: Float32Array, duration: number) {
    try {
      const result = await metadataScanner.analyzeWaveform(peaksOrAudio, duration, this.originalBpm, true);
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
  public headroomGainNode!: GainNode;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;
  public decodingWorker: Worker | null = null;

  private constructor() {
    const savedRate = localStorage.getItem('vici_max_samplerate');
    const maxRate = savedRate ? parseInt(savedRate) : 0;
    
    const savedHeadroom = localStorage.getItem('vici_headroom');
    const headroomDb = savedHeadroom ? parseFloat(savedHeadroom) : -3.0; // Default -3dB
    
    const audioOptions: AudioContextOptions = { latencyHint: 'interactive' };
    if (maxRate > 0) {
      audioOptions.sampleRate = Math.min(maxRate, 96000);
    }
    
    this.context = new (window.AudioContext || (window as any).webkitAudioContext)(audioOptions);
    
    // Master routing: masterGain (fader) -> headroomGain -> safetyClipper -> destination
    this.masterGainNode = this.context.createGain();
    
    this.headroomGainNode = this.context.createGain();
    this.headroomGainNode.gain.value = Math.pow(10, headroomDb / 20); // Convert dB to linear gain

    // Lookahead peak limiter is now handled in the Faust DSP block (engine.dsp)
    // so we just pass the signal straight through to the destination.
    this.masterGainNode.connect(this.headroomGainNode);
    this.headroomGainNode.connect(this.context.destination);
    
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
      const basePath = import.meta.env.BASE_URL || '/';
      try {
        await this.context.audioWorklet.addModule(`${basePath}worklets/track-processor.bundle.js?v=` + Date.now(), { type: 'module' } as any);
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
