import * as Tone from 'tone';
import type { TrackSegment } from '../types/mixer';
import { metadataScanner } from './MetadataScanner';

export class Deck {
  public player: Tone.Player;
  public volumeNode: Tone.Volume;
  public eq: Tone.EQ3;
  public filter: Tone.Filter;
  public delay: Tone.FeedbackDelay;
  public reverb: Tone.Freeverb;
  public phaser: Tone.Phaser;
  public gate: Tone.Tremolo;
  public sirenSynth: Tone.Synth;
  public sirenLfo: Tone.LFO;
  public id: 'A' | 'B';
  private lastRateChangeTime: number = 0;
  private currentPositionOffset: number = 0;
  public originalBpm: number = 120;
  public currentBpm: number = 120;

  public peaks: Float32Array | null = null;
  public segments: TrackSegment[] = [];
  public channelVolume: number = 1.0;
  public trackGainDb: number = 0;

  constructor(id: 'A' | 'B', outputNode: Tone.InputNode) {
    this.id = id;
    this.volumeNode = new Tone.Volume(0).connect(outputNode);
    this.eq = new Tone.EQ3(0, 0, 0);
    this.filter = new Tone.Filter({ type: "lowpass", frequency: 20000, rolloff: -24 });
    
    // Dub/Techno FX
    this.delay = new Tone.FeedbackDelay("8n", 0.7); // Darker, higher feedback
    this.delay.wet.value = 0; // Off by default
    
    this.reverb = new Tone.Freeverb({ roomSize: 0.8, dampening: 5000 }); // More metallic/splasy
    this.reverb.wet.value = 0; // Off by default

    // Leftfield / Trance FX
    this.phaser = new Tone.Phaser({
      frequency: 0.5,
      octaves: 3,
      baseFrequency: 350
    });
    this.phaser.wet.value = 0;

    this.gate = new Tone.Tremolo({
      frequency: "16n",
      type: "square",
      depth: 1,
      spread: 0
    });
    this.gate.wet.value = 0;

    // Dub Siren
    this.sirenSynth = new Tone.Synth({
      oscillator: { type: "square" },
      envelope: { attack: 0.1, decay: 0.1, sustain: 1, release: 0.5 }
    }).connect(this.delay); // Route through delay and reverb!
    
    this.sirenLfo = new Tone.LFO({
      type: "sine",
      min: 400,
      max: 800,
      frequency: "8n"
    });
    this.sirenLfo.connect(this.sirenSynth.oscillator.frequency);

    this.player = new Tone.Player();
    this.player.chain(this.eq, this.filter, this.phaser, this.gate, this.delay, this.reverb, this.volumeNode);
  }

  public async loadTrack(url: string): Promise<void> {
    if (this.player.state === "started") {
      this.player.stop();
    }
    
    // Explicit GC of old buffer before loading new one
    if (this.player.buffer) {
      this.player.buffer.dispose();
    }
    
    await this.player.load(url);
    this.currentPositionOffset = 0;
    this.lastRateChangeTime = Tone.context.currentTime;
    await this.generatePeaks();
  }

  private async generatePeaks() {
    const buffer = this.player.buffer;
    if (!buffer) return;
    
    const data = buffer.getChannelData(0);
    // Send directly to metadata worker so we don't block the main thread
    try {
      const result = await metadataScanner.analyzeWaveform(data, buffer.duration, this.originalBpm);
      this.peaks = result.peaks;
      this.segments = result.segments;
    } catch (err) {
      console.error("Worker waveform analysis failed:", err);
    }
  }

  public play(): void {
    if (this.player.loaded) {
      this.lastRateChangeTime = Tone.context.currentTime;
      this.player.start(undefined, this.currentPositionOffset);
    }
  }

  public stop(): void {
    this.player.stop();
    this.currentPositionOffset = 0;
    this.lastRateChangeTime = 0;
  }

  public getCurrentTime(): number {
    if (this.player.state !== "started") {
      return this.currentPositionOffset;
    }
    return this.currentPositionOffset + (Tone.context.currentTime - this.lastRateChangeTime) * this.player.playbackRate;
  }

  public seek(time: number): void {
    if (this.player.loaded) {
      if (this.player.state === "started") {
        this.player.stop();
        this.currentPositionOffset = time;
        this.lastRateChangeTime = Tone.context.currentTime;
        this.player.start(undefined, time);
      } else {
        this.currentPositionOffset = time;
      }
    }
  }

  public setPlaybackRate(rate: number): void {
    if (this.player.state === "started") {
      const now = Tone.context.currentTime;
      this.currentPositionOffset += (now - this.lastRateChangeTime) * this.player.playbackRate;
      this.lastRateChangeTime = now;
    }
    this.player.playbackRate = rate;
    this.currentBpm = this.originalBpm * rate;
  }

  public setEq(band: 'high' | 'mid' | 'low', value: number): void {
    this.eq[band].setTargetAtTime(value, Tone.context.currentTime, 0.015);
  }

  public setFilterColor(value: number): void {
    // Value: -100 (LP) to 100 (HP). 0 is bypass.
    if (value === 0) {
      this.filter.type = "lowpass";
      this.filter.frequency.setTargetAtTime(20000, Tone.context.currentTime, 0.015);
    } else if (value < 0) {
      this.filter.type = "lowpass";
      const freq = this.mapLog(value + 100, 0, 100, 20, 20000);
      this.filter.frequency.setTargetAtTime(freq, Tone.context.currentTime, 0.015);
    } else {
      this.filter.type = "highpass";
      const freq = this.mapLog(value, 0, 100, 20, 20000);
      this.filter.frequency.setTargetAtTime(freq, Tone.context.currentTime, 0.015);
    }
  }

  private mapLog(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    const norm = (value - inMin) / (inMax - inMin);
    return outMin * Math.pow(outMax / outMin, norm);
  }

  // FX Bay Controls
  public setDelayState(isOn: boolean): void {
    this.delay.wet.setTargetAtTime(isOn ? 0.5 : 0, Tone.context.currentTime, 0.05);
  }

  public setDelayFeedback(value: number): void {
    this.delay.feedback.setTargetAtTime(value, Tone.context.currentTime, 0.05);
  }

  public setDelayTime(timeInSeconds: number): void {
    this.delay.delayTime.setTargetAtTime(timeInSeconds, Tone.context.currentTime, 0.05);
  }

  public setReverbState(isOn: boolean): void {
    this.reverb.wet.setTargetAtTime(isOn ? 0.5 : 0, Tone.context.currentTime, 0.05);
  }

  public setReverbSize(value: number): void {
    this.reverb.roomSize.setTargetAtTime(value, Tone.context.currentTime, 0.05);
  }

  // Phaser
  public setPhaserState(isOn: boolean): void {
    this.phaser.wet.setTargetAtTime(isOn ? 0.8 : 0, Tone.context.currentTime, 0.05);
  }

  public setPhaserRate(rateHz: number): void {
    this.phaser.frequency.setTargetAtTime(rateHz, Tone.context.currentTime, 0.05);
  }

  // Trance Gate
  private gateStarted: boolean = false;
  
  public setGateState(isOn: boolean): void {
    if (isOn && !this.gateStarted) {
      this.gate.start();
      this.gateStarted = true;
    }
    this.gate.wet.setTargetAtTime(isOn ? 1 : 0, Tone.context.currentTime, 0.05);
  }

  // Dub Siren
  public triggerSiren(isOn: boolean): void {
    if (isOn) {
      if (this.sirenLfo.state !== "started") {
        this.sirenLfo.start();
      }
      this.sirenSynth.triggerAttack("C4");
    } else {
      this.sirenSynth.triggerRelease();
      if (this.sirenLfo.state === "started") {
        setTimeout(() => {
          if (this.sirenLfo.state === "started") this.sirenLfo.stop();
        }, 1000); // Let release tail finish before stopping LFO
      }
    }
  }

  // Beat Roll / Slip Loop
  public setRoll(isActive: boolean, rate: number = 8): void { // rate e.g. 8 for 1/8th note
    if (!this.player.buffer || !this.player.loaded) return;
    
    if (isActive) {
      // Calculate beat length in seconds
      const beatLength = 60 / this.currentBpm;
      const rollLength = beatLength * (4 / rate); // 4/4 time signature
      
      const now = this.getCurrentTime();
      this.player.loopStart = now;
      this.player.loopEnd = now + rollLength;
      this.player.loop = true;
    } else {
      this.player.loop = false;
      this.player.loopStart = 0;
      this.player.loopEnd = this.player.buffer.duration;
    }
  }

  private updateVolume(): void {
    let channelDb = -Infinity;
    if (this.channelVolume > 0.01) {
      // Linear 0 to 1 mapping to dB
      // Use 20 * log10(gain)
      channelDb = 20 * Math.log10(this.channelVolume);
    }
    
    // Total DB limit to +12dB to prevent clipping
    let totalDb = channelDb + this.trackGainDb;
    if (totalDb > 12) totalDb = 12;
    if (totalDb < -100) totalDb = -100;
    
    // Use setTargetAtTime for extremely fast, continuous slider dragging.
    // It avoids bloating Tone.js's internal timeline event arrays compared to rampTo.
    this.volumeNode.volume.setTargetAtTime(totalDb, Tone.context.currentTime, 0.015);
  }

  public setChannelVolume(linearGain: number): void {
    this.channelVolume = linearGain;
    this.updateVolume();
  }

  public setTrackGainDb(db: number): void {
    if (isNaN(db) || !isFinite(db)) db = 0;
    this.trackGainDb = db;
    this.updateVolume();
  }
}

export class AudioEngine {
  private static instance: AudioEngine;
  public deckA: Deck;
  public deckB: Deck;
  public crossfader: Tone.CrossFade;

  private constructor() {
    // Initialize the master crossfader and route to hardware output
    this.crossfader = new Tone.CrossFade(0.5).toDestination();
    
    // Initialize Decks and connect to respective crossfader inputs
    this.deckA = new Deck('A', this.crossfader.a);
    this.deckB = new Deck('B', this.crossfader.b);
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  public setCrossfadeValue(value: number): void {
    // Value range: 0 (Deck A) to 1 (Deck B)
    this.crossfader.fade.setTargetAtTime(value, Tone.context.currentTime, 0.015);
  }
}
