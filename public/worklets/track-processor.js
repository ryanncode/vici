const CROSSINGS = 16;
const RESOLUTION = 128;
const sincTable = new Float32Array(CROSSINGS * RESOLUTION);

// Precompute Windowed Sinc Table (Blackman Window)
for (let i = 0; i < sincTable.length; i++) {
  const x = i / RESOLUTION;
  if (x === 0) {
    sincTable[i] = 1.0;
  } else {
    const piX = Math.PI * x;
    const sinc = Math.sin(piX) / piX;
    // Blackman window centered at 0, spanning -CROSSINGS to +CROSSINGS
    const windowX = x / CROSSINGS; // 0 to 1 over the right half
    // But we evaluate the window over the full width. Actually Blackman is typically 0 to 2*pi
    // Let's use a simpler Hann window for safety, extending from -CROSSINGS to CROSSINGS
    // Hann(n) = 0.5 * (1 - cos(2*pi*n/N)) where n is 0 to N.
    // For x from 0 to CROSSINGS, the mapped value is:
    const hann = 0.5 * (1.0 + Math.cos(Math.PI * x / CROSSINGS)); 
    sincTable[i] = sinc * hann;
  }
}

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
      
      // If we are pitching up, we must bandlimit to prevent aliasing.
      // E.g., if playbackRate is 1.5, we must stretch the sinc function by 1.5
      // to lowpass the signal below the new Nyquist frequency.
      const stretch = Math.max(1.0, this.playbackRate);
      
      for (let j = -CROSSINGS; j <= CROSSINGS; j++) {
        const tapIndex = index + j;
        if (tapIndex >= 0 && tapIndex < bufferLength) {
          // Distance from the precise playhead
          const x = (j - frac) / stretch;
          const absX = Math.abs(x);
          
          if (absX < CROSSINGS) {
            const tableIndex = absX * RESOLUTION;
            const idx1 = Math.floor(tableIndex);
            const idx2 = Math.min(idx1 + 1, sincTable.length - 1);
            const tFrac = tableIndex - idx1;
            
            // Linear interpolation of the Sinc table
            const weight = (sincTable[idx1] * (1 - tFrac) + sincTable[idx2] * tFrac) / stretch;
            sample += this.buffer[tapIndex] * weight;
          }
        }
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