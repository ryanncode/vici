const CROSSINGS = 32;
const RESOLUTION = 512; // Increased for higher fidelity within banks
const NUM_BANKS = 64;   // 64 discrete pitch steps between 1.0 and 2.0
const MAX_PITCH = 2.0;

// Flattened 2D Array: [NUM_BANKS][CROSSINGS * RESOLUTION]
const sincTables = new Float32Array(NUM_BANKS * CROSSINGS * RESOLUTION);

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

// Precompute Polyphase Filter Banks
for (let bank = 0; bank < NUM_BANKS; bank++) {
  // Calculate the stretch factor for this specific bank
  const stretch = 1.0 + (bank / (NUM_BANKS - 1)) * (MAX_PITCH - 1.0);
  const bankOffset = bank * CROSSINGS * RESOLUTION;

  for (let i = 0; i < CROSSINGS * RESOLUTION; i++) {
    const x = i / RESOLUTION;
    
    // We apply the stretch factor directly to the evaluation coordinates
    const stretchedX = x / stretch;
    
    if (stretchedX === 0) {
      sincTables[bankOffset + i] = 1.0 / stretch;
    } else {
      const piX = Math.PI * stretchedX;
      const sinc = Math.sin(piX) / piX;
      
      const xRatio = stretchedX / CROSSINGS;
      let kaiser = 0;
      if (xRatio < 1.0) {
        kaiser = besselI0(BETA * Math.sqrt(1.0 - xRatio * xRatio)) / I0_BETA;
      }
      
      // Store the pre-scaled gain weight to eliminate division in the process loop
      sincTables[bankOffset + i] = (sinc * kaiser) / stretch;
    }
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

    // 1. Determine which filter bank to use based on current playback rate
    const stretch = Math.max(1.0, this.playbackRate);
    
    // Map the stretch factor to the nearest bank index (0 to NUM_BANKS - 1)
    let bankIndex = Math.round(((stretch - 1.0) / (MAX_PITCH - 1.0)) * (NUM_BANKS - 1));
    
    // Clamp the index to prevent out-of-bounds memory access
    bankIndex = Math.max(0, Math.min(NUM_BANKS - 1, bankIndex));
    
    // Set the pointer offset for our 1D Float32Array
    const bankOffset = bankIndex * CROSSINGS * RESOLUTION;

    for (let i = 0; i < output[0].length; i++) {
      if (this.playhead >= bufferLength) {
        this.playing = false;
        break;
      }

      const index = Math.floor(this.playhead);
      const frac = this.playhead - index;
      
      let sampleL = 0;
      let sampleR = 0;
      
      for (let j = -CROSSINGS; j <= CROSSINGS; j++) {
        const tapIndex = index + j;
        
        if (tapIndex >= 0 && tapIndex < bufferLength) {
          // Calculate raw distance without dynamic stretching division
          const x = j - frac;
          const absX = Math.abs(x);
          
          // Ensure we don't read past the bounds of our pre-stretched window
          if (absX < (CROSSINGS * stretch)) {
            const tableIndex = absX * RESOLUTION;
            const idx1 = Math.floor(tableIndex);
            const idx2 = Math.min(idx1 + 1, (CROSSINGS * RESOLUTION) - 1);
            const tFrac = tableIndex - idx1;
            
            // Linear interpolation between points in the selected polyphase bank
            const weight1 = sincTables[bankOffset + idx1];
            const weight2 = sincTables[bankOffset + idx2];
            const finalWeight = weight1 * (1 - tFrac) + weight2 * tFrac;
            
            sampleL += this.buffers[0][tapIndex] * finalWeight;
            sampleR += this.buffers[1][tapIndex] * finalWeight;
          }
        }
      }

      // Write out the samples
      if (channelCount > 0) output[0][i] = sampleL;
      if (channelCount > 1) output[1][i] = sampleR;

      this.playhead += this.playbackRate;
    }

    this.framesSinceLastReport += output[0].length;
    if (this.framesSinceLastReport >= sampleRate / 30) {
      this.port.postMessage({ type: 'TIME_UPDATE', value: this.playhead / sampleRate });
      this.framesSinceLastReport = 0;
    }

    return true;
  }
}

registerProcessor('track-processor', TrackProcessor);
