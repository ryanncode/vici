class TrackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = null;
    this.playhead = 0;
    this.playing = false;
    this.playbackRate = 1.0;
    this.framesSinceLastReport = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'LOAD_TRACK') {
        this.buffer = e.data.buffer;
        this.playhead = 0;
        console.log("TrackProcessor: LOAD_TRACK received. Buffer length:", this.buffer ? this.buffer.length : 'null');
      } else if (e.data.type === 'PLAY') {
        this.playing = true;
        console.log("TrackProcessor: PLAY received.");
      } else if (e.data.type === 'STOP') {
        this.playing = false;
      } else if (e.data.type === 'SEEK') {
        if (this.buffer) {
          this.playhead = e.data.value * sampleRate;
        }
      } else if (e.data.path === '/faust/pitch') {
        this.playbackRate = e.data.value;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output) return true;
    
    const channelCount = output.length;
    
    if (!this.playing || !this.buffer || channelCount === 0) {
      for (let channel = 0; channel < channelCount; channel++) {
        const outChannel = output[channel];
        for (let i = 0; i < outChannel.length; i++) {
          outChannel[i] = 0;
        }
      }
      return true;
    }

    const bufferLength = this.buffer.length;

    for (let i = 0; i < output[0].length; i++) {
      if (this.playhead >= bufferLength) {
        this.playing = false;
        break;
      }

      const index = Math.floor(this.playhead);
      const frac = this.playhead - index;
      
      let sample = 0;
      if (index + 1 < bufferLength) {
        sample = this.buffer[index] * (1 - frac) + this.buffer[index + 1] * frac;
      } else {
        sample = this.buffer[index];
      }

      for (let channel = 0; channel < channelCount; channel++) {
        output[channel][i] = sample;
      }

      this.playhead += this.playbackRate;
    }

    this.framesSinceLastReport += output[0].length;
    if (this.framesSinceLastReport >= sampleRate / 30) { // report 30 times a second
      this.port.postMessage({ type: 'TIME_UPDATE', value: this.playhead / sampleRate });
      this.framesSinceLastReport = 0;
    }

    return true;
  }
}

registerProcessor('track-processor', TrackProcessor);