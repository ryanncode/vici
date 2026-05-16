import * as Tone from 'tone';

export class Deck {
  public player: Tone.Player;
  public volumeNode: Tone.Volume;
  public eq: Tone.EQ3;
  public filter: Tone.Filter;
  public delay: Tone.FeedbackDelay;
  public reverb: Tone.Freeverb;
  public id: 'A' | 'B';
  private lastRateChangeTime: number = 0;
  private currentPositionOffset: number = 0;
  public originalBpm: number = 120;
  public currentBpm: number = 120;

  constructor(id: 'A' | 'B', outputNode: Tone.InputNode) {
    this.id = id;
    this.volumeNode = new Tone.Volume(0).connect(outputNode);
    this.eq = new Tone.EQ3(0, 0, 0);
    this.filter = new Tone.Filter({ type: "lowpass", frequency: 20000, rolloff: -24 });
    
    // Dub/Techno FX
    this.delay = new Tone.FeedbackDelay("8n", 0.5);
    this.delay.wet.value = 0; // Off by default
    
    this.reverb = new Tone.Freeverb({ roomSize: 0.7, dampening: 3000 });
    this.reverb.wet.value = 0; // Off by default

    this.player = new Tone.Player();
    this.player.chain(this.eq, this.filter, this.delay, this.reverb, this.volumeNode);
    this.player.fadeIn = 0.1;
    this.player.fadeOut = 0.1;
  }

  public async loadTrack(url: string): Promise<void> {
    await this.player.load(url);
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
