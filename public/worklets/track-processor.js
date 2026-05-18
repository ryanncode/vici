if (typeof URL === 'undefined') {
  globalThis.URL = class URL { constructor() {} };
}

import Module from './wasm/audio-processor.js';

class TrackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffers = null;
    this.playhead = 0;
    this.playing = false;
    this.playbackRate = 1.0;
    this.keyLock = false;
    this.framesSinceLastReport = 0;
    this.wasmModule = null;
    this.resampler = null;
    this.bungee = null;
    
    this.inputPtr = null;
    this.outputPtr = null;
    this.inputCapacity = 0;
    this.outputCapacity = 0;

    this.port.onmessage = async (e) => {
      if (e.data.type === 'INIT_WASM') {
        const wasmBinary = e.data.wasmBinary;
        this.wasmModule = await Module({ wasmBinary });
        // Instantiate our C++ classes
        this.resampler = new this.wasmModule.Resampler();
        this.bungee = new this.wasmModule.BungeeStretcher(sampleRate);
        this.port.postMessage({ type: 'WASM_READY' });
      } else if (e.data.type === 'LOAD_TRACK') {
        // Here we expect full Float32Arrays for the track data
        this.buffers = e.data.buffers;
        if (!this.buffers && e.data.buffer) {
          this.buffers = [e.data.buffer, e.data.buffer];
        }
        this.playhead = 0;
        if (this.bungee) this.bungee.reset();
        console.log("TrackProcessor: LOAD_TRACK received. Buffer length:", this.buffers && this.buffers[0] ? this.buffers[0].length : 'null');
      } else if (e.data.type === 'PLAY') {
        this.playing = true;
      } else if (e.data.type === 'STOP') {
        this.playing = false;
      } else if (e.data.type === 'SEEK') {
        if (this.buffers) {
          this.playhead = e.data.value * sampleRate;
          if (this.bungee) this.bungee.reset();
          if (this.resampler) this.resampler.reset();
        }
      } else if (e.data.path === '/faust/pitch') {
        this.playbackRate = e.data.value;
      } else if (e.data.type === 'SET_KEY_LOCK') {
        this.keyLock = e.data.value;
      }
    };
  }

  ensureWasmBuffers(inputFrames, outputFrames) {
    if (!this.wasmModule) return false;
    const requiredInputBytes = inputFrames * 2 * 4; // 2 channels, 4 bytes per float
    if (!this.inputPtr || this.inputCapacity < requiredInputBytes) {
      if (this.inputPtr) this.wasmModule._free(this.inputPtr);
      this.inputPtr = this.wasmModule._malloc(requiredInputBytes);
      this.inputCapacity = requiredInputBytes;
    }
    const requiredOutputBytes = outputFrames * 2 * 4;
    if (!this.outputPtr || this.outputCapacity < requiredOutputBytes) {
      if (this.outputPtr) this.wasmModule._free(this.outputPtr);
      this.outputPtr = this.wasmModule._malloc(requiredOutputBytes);
      this.outputCapacity = requiredOutputBytes;
    }
    return true;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || !this.wasmModule) return true;
    
    const channelCount = output.length;
    
    if (!this.playing || !this.buffers || channelCount === 0 || (!this.resampler && !this.bungee)) {
      for (let channel = 0; channel < channelCount; channel++) {
        output[channel].fill(0);
      }
      return true;
    }

    const bufferLength = this.buffers[0].length;
    const outputFrames = output[0].length;
    
    if (this.playhead >= bufferLength) {
      this.playing = false;
      for (let channel = 0; channel < channelCount; channel++) {
        output[channel].fill(0);
      }
      return true;
    }

    // Determine how many input frames we need based on playback rate and key lock
    let ratio = Math.max(0.1, this.playbackRate);
    
    // We fetch a block of frames.
    // If keyLock is ON, we use Bungee time-stretching (tempo changes without pitch change).
    // If keyLock is OFF, we use standard Resampler (pitch and tempo change together).
    
    if (this.keyLock && this.bungee) {
      // Bungee logic: it stretches audio.
      // We need to feed it some frames. For simplicity, we feed exactly what we think it might need.
      // Actually, Bungee Stream handles its own buffering. We push interleaved data and pull interleaved data.
      // The wrapper in C++ `process_audio` takes input frames and outputs processed frames.
      // We pass the playhead to get input frames.
      
      const inputFramesNeeded = Math.ceil(outputFrames * ratio * 2); // A bit extra just in case
      let framesAvailable = Math.floor(bufferLength - this.playhead);
      const inputFrames = Math.min(inputFramesNeeded, framesAvailable);
      
      if (inputFrames <= 0) return true;

      this.ensureWasmBuffers(inputFrames, outputFrames);

      const memoryBuffer = this.wasmModule.wasmMemory.buffer;
      const inputHeap = new Float32Array(memoryBuffer, this.inputPtr, inputFrames * 2);
      for (let i = 0; i < inputFrames; i++) {
        const idx = Math.floor(this.playhead) + i;
        inputHeap[i * 2] = this.buffers[0][idx];
        inputHeap[i * 2 + 1] = this.buffers[1][idx];
      }

      // pitch is 1.0 (no pitch shift), speed is ratio (tempo stretch)
      const generated = this.bungee.process_audio(this.inputPtr, inputFrames, this.outputPtr, outputFrames, ratio, 1.0);

      const outputHeap = new Float32Array(memoryBuffer, this.outputPtr, generated * 2);
      for (let i = 0; i < generated; i++) {
        if (channelCount > 0) output[0][i] = outputHeap[i * 2];
        if (channelCount > 1) output[1][i] = outputHeap[i * 2 + 1];
      }
      for (let i = generated; i < outputFrames; i++) {
        if (channelCount > 0) output[0][i] = 0;
        if (channelCount > 1) output[1][i] = 0;
      }

      this.playhead += inputFrames; // approximate advance
    } else if (this.resampler) {
      // Standard resampler
      const CROSSINGS = 32;
      const baseFrames = Math.ceil(outputFrames * ratio);
      const inputFramesNeeded = baseFrames + CROSSINGS * 2;

      if (this.playhead >= bufferLength) return true;

      this.ensureWasmBuffers(inputFramesNeeded, outputFrames);

      const memoryBuffer = this.wasmModule.wasmMemory.buffer;
      const inputHeap = new Float32Array(memoryBuffer, this.inputPtr, inputFramesNeeded * 2);
      
      let startIdx = Math.floor(this.playhead) - CROSSINGS;

      for (let i = 0; i < inputFramesNeeded; i++) {
        const idx = startIdx + i;
        if (idx >= 0 && idx < bufferLength) {
          inputHeap[i * 2] = this.buffers[0][idx];
          inputHeap[i * 2 + 1] = this.buffers[1][idx];
        } else {
          inputHeap[i * 2] = 0;
          inputHeap[i * 2 + 1] = 0;
        }
      }

      const consumed = this.resampler.process_audio_simd(this.inputPtr, inputFramesNeeded, this.outputPtr, outputFrames, ratio);

      const outputHeap = new Float32Array(memoryBuffer, this.outputPtr, outputFrames * 2);
      for (let i = 0; i < outputFrames; i++) {
        if (channelCount > 0) output[0][i] = outputHeap[i * 2];
        if (channelCount > 1) output[1][i] = outputHeap[i * 2 + 1];
      }

      this.playhead = Math.floor(this.playhead) + consumed;
    }

    this.framesSinceLastReport += outputFrames;
    if (this.framesSinceLastReport >= sampleRate / 30) {
      this.port.postMessage({ type: 'TIME_UPDATE', value: this.playhead / sampleRate });
      this.framesSinceLastReport = 0;
    }

    return true;
  }
}

registerProcessor('track-processor', TrackProcessor);
