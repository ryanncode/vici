const CROSSINGS = 16;
const RESOLUTION = 1024;
const sincTable = new Float32Array(CROSSINGS * RESOLUTION);

// Zeroth-order modified Bessel function of the first kind
function besselI0(x) {
  let sum = 1.0;
  let term = 1.0;
  const x2_4 = (x * x) / 4.0;
  for (let k = 1; k <= 20; k++) {
    term *= x2_4 / (k * k);
    sum += term;
    if (term < 1e-12 * sum) break;
  }
  return sum;
}

const BETA = 9.0; // Kaiser window beta parameter (determines stopband attenuation)
const I0_BETA = besselI0(BETA);

// Precompute Windowed Sinc Table (Kaiser Window)
for (let i = 0; i < sincTable.length; i++) {
  const x = i / RESOLUTION;
  if (x === 0) {
    sincTable[i] = 1.0;
  } else {
    const piX = Math.PI * x;
    const sinc = Math.sin(piX) / piX;
    
    // Kaiser window evaluated from 0 to CROSSINGS
    // w(x) = I0(beta * sqrt(1 - (x/CROSSINGS)^2)) / I0(beta)
    const xRatio = x / CROSSINGS;
    let kaiser = 0;
    if (xRatio < 1.0) {
      kaiser = besselI0(BETA * Math.sqrt(1.0 - xRatio * xRatio)) / I0_BETA;
    }
    
    sincTable[i] = sinc * kaiser;
  }
}

class TrackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffers = null;
    this.playhead = 0;
    this.playing = false;
    this.playbackRate = 1.0;
    this.framesSinceLastReport = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'LOAD_TRACK') {
        this.buffers = e.data.buffers;
        if (!this.buffers && e.data.buffer) {
          this.buffers = [e.data.buffer, e.data.buffer];
        }
        this.playhead = 0;
        console.log("TrackProcessor: LOAD_TRACK received. Buffer length:", this.buffers && this.buffers[0] ? this.buffers[0].length : 'null');
      } else if (e.data.type === 'PLAY') {
        this.playing = true;
        console.log("TrackProcessor: PLAY received.");
      } else if (e.data.type === 'STOP') {
        this.playing = false;
      } else if (e.data.type === 'SEEK') {
        if (this.buffers) {
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
    
    if (!this.playing || !this.buffers || channelCount === 0) {
      for (let channel = 0; channel < channelCount; channel++) {
        const outChannel = output[channel];
        for (let i = 0; i < outChannel.length; i++) {
          outChannel[i] = 0;
        }
      }
      return true;
    }

    const bufferLength = this.buffers[0].length;

    for (let i = 0; i < output[0].length; i++) {
      if (this.playhead >= bufferLength) {
        this.playing = false;
        break;
      }

      const index = Math.floor(this.playhead);
      const frac = this.playhead - index;
      
      let sampleL = 0;
      let sampleR = 0;
      
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
            sampleL += this.buffers[0][tapIndex] * weight;
            sampleR += this.buffers[1][tapIndex] * weight;
          }
        }
      }

      if (channelCount > 0) output[0][i] = sampleL;
      if (channelCount > 1) output[1][i] = sampleR;

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