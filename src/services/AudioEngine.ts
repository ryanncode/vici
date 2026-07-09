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
  public bandPeaks: Float32Array | null = null;
  public segments: TrackSegment[] = [];
  public mfccs?: Float32Array;
  public cens?: Float32Array;
  public channelVolume: number = 1.0;
  public channelGain: number = 1.0;
  public crossfadeGain: number = 1.0;
  public trackGainDb: number = 0;
  public currentTime: number = 0;
  public isPlaying: boolean = false;
  private lastTimeUpdateReal: number = 0;
  
  private _duration: number = 0;
  private _loaded: boolean = false;

  // Web Audio Nodes
  private trackNode: AudioWorkletNode | null = null;
  private faustNode: any | null = null;

  public get duration(): number {
    return this._duration;
  }
  public get loaded(): boolean {
    return this._loaded;
  }
  public mute: boolean = false;

  public outputNode: AudioNode;
  public cueOutputNode: AudioNode;
  public cueGainNode!: GainNode;

  constructor(id: 'A' | 'B', outputNode: AudioNode, cueOutputNode: AudioNode) {
    this.id = id;
    this.outputNode = outputNode;
    this.cueOutputNode = cueOutputNode;
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
          this.lastTimeUpdateReal = performance.now();
        } else if (e.data.type === 'SEEK_STREAM') {
          if (AudioEngine.getInstance().decodingWorker) {
            AudioEngine.getInstance().decodingWorker!.postMessage({
              type: 'SEEK_STREAM',
              payload: { deckId: this.id, frame: e.data.frame, seekId: e.data.seekId }
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
      const dspModule = await WebAssembly.compileStreaming(fetch(`${basePath}faust/dsp-module.wasm`));
      
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
      this.faustNode.setParamValue('/engine/fx_roll_beats', 1.0);
      this.faustNode.setParamValue('/engine/fx_siren_on', 0);
      this.faustNode.setParamValue('/engine/fx_siren_type', 1);
      this.faustNode.setParamValue('/engine/fx_siren_freq', 300.0);
      this.faustNode.setParamValue('/engine/fx_siren_lfo_rate', 2.0);
      this.faustNode.setParamValue('/engine/fx_siren_lfo_depth', 500.0);
      this.faustNode.setParamValue('/engine/fx_compressor_on', 0);
      this.faustNode.setParamValue('/engine/fx_compressor_ratio', 2.0);
      this.faustNode.setParamValue('/engine/fx_compressor_thresh', -12.0);
      this.faustNode.setParamValue('/engine/fx_compressor_attack', 0.01);
      this.faustNode.setParamValue('/engine/fx_compressor_release', 0.1);

      // 3. Connect Graph: Track -> Faust -> Output
      if (this.faustNode) {
        this.trackNode.connect(this.faustNode);
        
        // Split Faust 4-channel output
        const splitter = audioContext.createChannelSplitter(4);
        this.faustNode.connect(splitter);

        const masterMerger = audioContext.createChannelMerger(2);
        splitter.connect(masterMerger, 0, 0); // Ch 1 to L
        splitter.connect(masterMerger, 1, 1); // Ch 2 to R
        masterMerger.connect(this.outputNode);

        const cueMerger = audioContext.createChannelMerger(2);
        splitter.connect(cueMerger, 2, 0); // Ch 3 to L
        splitter.connect(cueMerger, 3, 1); // Ch 4 to R

        this.cueGainNode = audioContext.createGain();
        this.cueGainNode.gain.value = 0.0; // Cue off by default
        cueMerger.connect(this.cueGainNode);
        this.cueGainNode.connect(this.cueOutputNode);

      } else {
        this.trackNode.connect(this.outputNode);
      }

    } catch (e) {
      console.warn("AudioWorklet not loaded, proceeding with dummy engine", e);
    }
  }

  public async loadTrack(url: string, fileTypeHint?: string): Promise<void> {
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
      const workerResponse = await new Promise<{ peaks: Float32Array, bandPeaks?: Float32Array, duration: number, bufferLength: number, trackSampleRate: number, leftChannel?: Float32Array, rightChannel?: Float32Array, analysisBuffer?: Float32Array }>((resolve, reject) => {
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
        let derivedType = extMatch ? extMatch[1].toLowerCase() : 'mp3';
        if (fileTypeHint) {
          if (fileTypeHint.includes('flac')) derivedType = 'flac';
          else if (fileTypeHint.includes('wav')) derivedType = 'wav';
          else if (fileTypeHint.includes('mp3') || fileTypeHint.includes('mpeg')) derivedType = 'mp3';
        }

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

      // 3. Generate metadata from precomputed peaks or raw analysis buffer
      if (workerResponse.analysisBuffer) {
        await this.generatePeaks(workerResponse.analysisBuffer, workerResponse.duration, workerResponse.bandPeaks, false, workerResponse.trackSampleRate);
      } else {
        await this.generatePeaks(workerResponse.peaks, workerResponse.duration, workerResponse.bandPeaks, true, workerResponse.trackSampleRate);
      }
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

  private async generatePeaks(peaksOrAudio: Float32Array, duration: number, precomputedBandPeaks?: Float32Array, isPrecomputed: boolean = true, sampleRate: number = 44100) {
    try {
      const result = await metadataScanner.analyzeWaveform(peaksOrAudio, duration, this.originalBpm, isPrecomputed, sampleRate);
      this.peaks = result.peaks;
      this.bandPeaks = precomputedBandPeaks || result.bandPeaks || null;
      this.segments = result.segments;
      this.mfccs = result.mfccs;
      this.cens = result.cens;
    } catch (err) {
      console.error("Worker waveform analysis failed:", err);
    }
  }

  public play(): void {
    if (this.trackNode) {
      this.isPlaying = true;
      this.lastTimeUpdateReal = performance.now();
      this.trackNode.port.postMessage({ type: 'PLAY' });
    }
  }

  public stop(): void {
    if (this.trackNode) {
      this.isPlaying = false;
      this.trackNode.port.postMessage({ type: 'STOP' });
    }
  }

  public getCurrentTime(): number {
    if (this.isPlaying && this.currentBpm > 0) {
      const now = performance.now();
      const elapsedSec = (now - this.lastTimeUpdateReal) / 1000;
      
      // Limit extrapolation to 100ms. If we haven't received a TIME_UPDATE in 100ms, 
      // something is wrong (worklet starving) so we shouldn't keep running forward.
      if (elapsedSec < 0.1) {
        const pitch = this.currentBpm / this.originalBpm;
        return Math.min(this._duration, this.currentTime + (elapsedSec * pitch));
      }
    }
    return this.currentTime;
  }

  public seek(time: number): void {
    this.currentTime = time;
    this.lastTimeUpdateReal = performance.now();
    if (this.trackNode) {
      this.trackNode.port.postMessage({ type: 'SEEK', value: time });
    }
  }

  public nudge(frames: number): void {
    if (this.trackNode && this.isPlaying) {
      this.trackNode.port.postMessage({ type: 'NUDGE', frames: frames });
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
  public setReverbDecay(value: number): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_reverb_decay', value);
  }
  public setReverbPredelay(value: number): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_reverb_predelay', value);
  }
  public setReverbColor(value: number): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_reverb_color', value);
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
  public setRollBeats(beats: number): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_roll_beats', beats);
  }
  public setSirenType(type: number): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_siren_type', type);
  }
  public setSirenFreq(freq: number): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_siren_freq', freq);
  }
  public setSirenLfoRate(rate: number): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_siren_lfo_rate', rate);
  }
  public setSirenLfoDepth(depth: number): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_siren_lfo_depth', depth);
  }
  public setCompressorRatio(ratio: number): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_compressor_ratio', ratio);
  }
  public setCompressorThresh(thresh: number): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_compressor_thresh', thresh);
  }
  public setCompressorAttack(attack: number): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_compressor_attack', attack);
  }
  public setCompressorRelease(release: number): void {
    if (this.faustNode) this.faustNode.setParamValue('/engine/fx_compressor_release', release);
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

  public setCueState(isCue: boolean): void {
    if (this.cueGainNode) {
      this.cueGainNode.gain.value = isCue ? 1.0 : 0.0;
    }
    const engine = AudioEngine.getInstance();
    if (isCue && engine.cueAudioElement && engine.cueAudioElement.paused) {
      engine.cueAudioElement.play().catch(e => console.warn("Cue audio play prevented", e));
    }
  }
}

export class AudioEngine {
  private static instance: AudioEngine;
  public context: AudioContext;
  public deckA!: Deck;
  public deckB!: Deck;
  public masterGainNode!: GainNode;
  public headroomGainNode!: GainNode;
  
  public cueBusGainNode!: GainNode;
  public cueDestination!: MediaStreamAudioDestinationNode;
  public cueAudioElement!: HTMLAudioElement;

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

    // Cue (Headphone) routing
    this.cueBusGainNode = this.context.createGain();
    this.cueDestination = this.context.createMediaStreamDestination();
    this.cueBusGainNode.connect(this.cueDestination);

    this.cueAudioElement = new Audio();
    this.cueAudioElement.srcObject = this.cueDestination.stream;
    this.cueAudioElement.style.display = 'none';
    document.body.appendChild(this.cueAudioElement);

    // Restore saved headphone device and volume
    const savedDevice = localStorage.getItem('vici_cue_device') || '';
    if (savedDevice === 'default' || savedDevice === '') {
      this.cueBusGainNode.disconnect();
      this.cueBusGainNode.connect(this.context.destination);
    } else {
      if ('setSinkId' in this.cueAudioElement) {
        (this.cueAudioElement as any).setSinkId(savedDevice).catch(() => {});
      }
    }

    const savedVol = localStorage.getItem('vici_cue_volume');
    if (savedVol) {
      this.cueBusGainNode.gain.value = parseFloat(savedVol);
    }
    
    // Add interaction listener to jumpstart audio
    const jumpstartCue = () => {
      if (this.cueAudioElement.paused) {
        this.cueAudioElement.play().catch(() => {});
      }
      document.removeEventListener('click', jumpstartCue);
    };
    document.addEventListener('click', jumpstartCue);

    this.deckA = new Deck('A', this.masterGainNode, this.cueBusGainNode);
    this.deckB = new Deck('B', this.masterGainNode, this.cueBusGainNode);
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
        this.decodingWorker.addEventListener('message', (e: MessageEvent) => {
           if (e.data.type === 'SEEK_ACK') {
              const targetDeck = e.data.deckId === 'A' ? this.deckA : this.deckB;
              // @ts-expect-error trackNode is private but we need to send message
              if (targetDeck && targetDeck.trackNode) {
                 // @ts-expect-error trackNode is private
                 targetDeck.trackNode.port.postMessage({ type: 'SEEK_ACK', seekId: e.data.seekId });
              }
           }
        });
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

  public setCrossfadeValue(value: number, curve: 'constant_power' | 'linear' | 'cut' = 'constant_power'): void {
    // Value range: 0 (Deck A) to 1 (Deck B)
    let gainA: number;
    let gainB: number;

    if (curve === 'linear') {
      gainA = 1.0 - value;
      gainB = value;
    } else if (curve === 'cut') {
      gainA = value > 0.95 ? 0.0 : 1.0;
      gainB = value < 0.05 ? 0.0 : 1.0;
    } else {
      // Equal power crossfade
      gainA = Math.cos(value * 0.5 * Math.PI);
      gainB = Math.cos((1.0 - value) * 0.5 * Math.PI);
    }

    if (this.deckA) {
      this.deckA.setCrossfadeGain(gainA);
    }
    if (this.deckB) {
      this.deckB.setCrossfadeGain(gainB);
    }
  }

  public setHeadphoneVolume(vol: number): void {
    if (this.cueBusGainNode) {
      this.cueBusGainNode.gain.value = vol;
    }
  }

  public async setHeadphoneDevice(deviceId: string): Promise<void> {
    try {
      this.cueBusGainNode.disconnect();
    } catch (e) {}

    if (deviceId === 'default' || deviceId === '') {
      this.cueBusGainNode.connect(this.context.destination);
    } else {
      this.cueBusGainNode.connect(this.cueDestination);
      if (this.cueAudioElement) {
        if ('setSinkId' in this.cueAudioElement) {
          try {
            await (this.cueAudioElement as any).setSinkId(deviceId);
          } catch (err) {
            console.error("Failed to set headphone audio device", err);
          }
        }
        if (this.cueAudioElement.paused) {
          this.cueAudioElement.play().catch(e => console.warn("Cue play prevented", e));
        }
      }
    }
  }
}
