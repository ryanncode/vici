import * as Tone from 'tone';

export class Deck {
  public player: Tone.Player;
  public volumeNode: Tone.Volume;
  public eq: Tone.EQ3;
  public filter: Tone.Filter;
  public id: 'A' | 'B';
  private startTime: number = 0;
  private pauseTime: number = 0;
  public originalBpm: number = 120;
  public currentBpm: number = 120;

  constructor(id: 'A' | 'B', outputNode: Tone.InputNode) {
    this.id = id;
    this.volumeNode = new Tone.Volume(0).connect(outputNode);
    this.eq = new Tone.EQ3(0, 0, 0);
    this.filter = new Tone.Filter({ type: "lowpass", frequency: 20000, rolloff: -24 });
    this.player = new Tone.Player();
    this.player.chain(this.eq, this.filter, this.volumeNode);
    this.player.fadeIn = 0.1;
    this.player.fadeOut = 0.1;
  }

  public async loadTrack(url: string): Promise<void> {
    await this.player.load(url);
  }

  public play(): void {
    if (this.player.loaded) {
      this.startTime = Tone.context.currentTime - this.pauseTime;
      this.player.start(undefined, this.pauseTime);
    }
  }

  public stop(): void {
    this.player.stop();
    this.startTime = 0;
    this.pauseTime = 0;
  }

  public getCurrentTime(): number {
    if (this.player.state !== "started") {
      return this.pauseTime;
    }
    return (Tone.context.currentTime - this.startTime) * this.player.playbackRate;
  }

  public seek(time: number): void {
    if (this.player.loaded) {
      if (this.player.state === "started") {
        this.player.stop();
        this.startTime = Tone.context.currentTime - (time / this.player.playbackRate);
        this.player.start(undefined, time);
      } else {
        this.pauseTime = time;
      }
    }
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

  public setBpmSync(targetBpm: number): void {
    if (this.originalBpm === 0) return;
    this.currentBpm = targetBpm;
    this.player.playbackRate = targetBpm / this.originalBpm;
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
