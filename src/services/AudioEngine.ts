import * as Tone from 'tone';

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
    }).start();
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
    }).start();
    this.sirenLfo.connect(this.sirenSynth.oscillator.frequency);

    this.player = new Tone.Player();
    this.player.chain(this.eq, this.filter, this.phaser, this.gate, this.delay, this.reverb, this.volumeNode);
    this.player.fadeIn = 0.1;
    this.player.fadeOut = 0.1;
  }

  public async loadTrack(url: string): Promise<void> {
    await this.player.load(url);
    this.currentPositionOffset = 0;
    this.lastRateChangeTime = Tone.context.currentTime;
    this.generatePeaks();
  }

  private generatePeaks() {
    const buffer = this.player.buffer;
    if (!buffer) return;
    
    // Generate ~1000 peaks
    const numPeaks = 1000;
    const data = buffer.getChannelData(0);
    const blockSize = Math.floor(data.length / numPeaks);
    this.peaks = new Float32Array(numPeaks);
    
    for (let i = 0; i < numPeaks; i++) {
      let sum = 0;
      const start = i * blockSize;
      const end = start + blockSize;
      for (let j = start; j < end; j++) {
        sum += Math.abs(data[j]);
      }
      this.peaks[i] = sum / blockSize;
    }
    
    // Normalize peaks
    let max = 0;
    for (let i = 0; i < numPeaks; i++) {
      if (this.peaks[i] > max) max = this.peaks[i];
    }
    if (max > 0) {
      for (let i = 0; i < numPeaks; i++) {
        this.peaks[i] = this.peaks[i] / max;
      }
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
    this.eq[band].value = value;
  }

  public setFilterColor(value: number): void {
    // Value: -100 (LP) to 100 (HP). 0 is bypass.
    if (value === 0) {
      this.filter.type = "lowpass";
      this.filter.frequency.value = 20000;
    } else if (value < 0) {
      this.filter.type = "lowpass";
      const freq = this.mapLog(value + 100, 0, 100, 20, 20000);
      this.filter.frequency.value = freq;
    } else {
      this.filter.type = "highpass";
      const freq = this.mapLog(value, 0, 100, 20, 20000);
      this.filter.frequency.value = freq;
    }
  }

  private mapLog(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    const norm = (value - inMin) / (inMax - inMin);
    return outMin * Math.pow(outMax / outMin, norm);
  }

  // FX Bay Controls
  public setDelayState(isOn: boolean): void {
    this.delay.wet.value = isOn ? 0.5 : 0;
  }

  public setDelayFeedback(value: number): void {
    this.delay.feedback.value = value;
  }

  public setDelayTime(timeInSeconds: number): void {
    this.delay.delayTime.value = timeInSeconds;
  }

  public setReverbState(isOn: boolean): void {
    this.reverb.wet.value = isOn ? 0.5 : 0;
  }

  public setReverbSize(value: number): void {
    this.reverb.roomSize.value = value;
  }

  // Phaser
  public setPhaserState(isOn: boolean): void {
    this.phaser.wet.value = isOn ? 0.8 : 0;
  }

  public setPhaserRate(rateHz: number): void {
    this.phaser.frequency.value = rateHz;
  }

  // Trance Gate
  public setGateState(isOn: boolean): void {
    this.gate.wet.value = isOn ? 1 : 0;
  }

  // Dub Siren
  public triggerSiren(isOn: boolean): void {
    if (isOn) {
      this.sirenSynth.triggerAttack("C4");
    } else {
      this.sirenSynth.triggerRelease();
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
    
    this.volumeNode.volume.rampTo(totalDb, 0.05);
  }

  public setChannelVolume(linearGain: number): void {
    this.channelVolume = linearGain;
    this.updateVolume();
  }

  public setTrackGainDb(db: number): void {
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
    this.crossfader.fade.value = value;
  }
}
