if (typeof URL === 'undefined') {
  globalThis.URL = class URL { constructor() {} };
}

import Module from './wasm/audio-processor.js';

// SharedRingBuffer implementation for the worklet side (Consumer)
class WorkletSharedRingBuffer {
  constructor(capacity, sab) {
    this.capacity = capacity;
    this.sab = sab;
    this.state = new Int32Array(sab, 0, 2);
    this.buffer = new Float32Array(sab, 8, capacity);
    this.WRITE_PTR = 0;
    this.READ_PTR = 1;
  }

  getAvailableRead() {
    const writePtr = Atomics.load(this.state, this.WRITE_PTR);
    const readPtr = Atomics.load(this.state, this.READ_PTR);
    return writePtr - readPtr;
  }

  pull(output) {
    const writePtr = Atomics.load(this.state, this.WRITE_PTR);
    const readPtr = Atomics.load(this.state, this.READ_PTR);

    const available = writePtr - readPtr;
    if (available <= 0) return 0;

    const toRead = Math.min(output.length, available);
    
    const readIndex = readPtr % this.capacity;
    const firstChunk = Math.min(toRead, this.capacity - readIndex);

    output.set(this.buffer.subarray(readIndex, readIndex + firstChunk), 0);
    
    if (firstChunk < toRead) {
      output.set(this.buffer.subarray(0, toRead - firstChunk), firstChunk);
    }

    Atomics.store(this.state, this.READ_PTR, readPtr + toRead);
    return toRead;
  }
}

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
    this.inputHeap = null;
    this.outputHeap = null;

    this.bufferLength = 0;
    this.trackSampleRate = sampleRate;
    this.ringBuffer = null;
    this.localBuffer = null; // We maintain a local circular buffer for CROSSINGS and seeking
    this.localCapacity = 4194304; // 2^22, ~87 seconds, totally eliminates 27-second 131072 buffer wrap overflow
    this.localMask = this.localCapacity - 1;
    this.expectedPullFrame = 0;
    this.isStreaming = false;
    this.fullBuffer = null;

    this.port.onmessage = async (e) => {
      if (e.data.type === 'INIT_WASM') {
        try {
          this.wasmModule = await Module();
          // Instantiate our C++ classes
          this.resampler = new this.wasmModule.Resampler();
          this.bungee = new this.wasmModule.BungeeStretcher(sampleRate);
          this.port.postMessage({ type: 'WASM_READY' });
        } catch (err) {
          console.error("Failed to initialize WASM module in track-processor:", err);
          this.port.postMessage({ type: 'WASM_ERROR', error: err.message });
        }
      } else if (e.data.type === 'LOAD_TRACK') {
        this.isStreaming = true;
        this.fullBuffer = null;
        this.ringBuffer = new WorkletSharedRingBuffer(e.data.capacity, e.data.sharedBuffer);
        this.bufferLength = e.data.bufferLength || 0;
        this.trackSampleRate = e.data.trackSampleRate || sampleRate;
        this.localBuffer = new Float32Array(this.localCapacity * 2);
        this.playhead = 0;
        this.expectedPullFrame = 0;
        if (this.bungee) this.bungee.reset();
        console.log("TrackProcessor: LOAD_TRACK stream connected.");
      } else if (e.data.type === 'LOAD_TRACK_FULL') {
        this.isStreaming = false;
        this.ringBuffer = null;
        this.localBuffer = null;
        this.fullBuffer = [e.data.leftChannel, e.data.rightChannel];
        this.bufferLength = e.data.bufferLength || 0;
        this.trackSampleRate = e.data.trackSampleRate || sampleRate;
        this.playhead = 0;
        if (this.bungee) this.bungee.reset();
        console.log("TrackProcessor: LOAD_TRACK_FULL static buffer connected.");
      } else if (e.data.type === 'PLAY') {
        this.playing = true;
      } else if (e.data.type === 'STOP') {
        this.playing = false;
      } else if (e.data.type === 'SEEK') {
        if (this.isStreaming && this.ringBuffer) {
          this.playhead = e.data.value * this.trackSampleRate;
          this.expectedPullFrame = this.playhead;
          this.port.postMessage({ type: 'SEEK_STREAM', frame: this.playhead });
          if (this.bungee) this.bungee.reset();
          if (this.resampler) this.resampler.reset();
        } else if (!this.isStreaming && this.fullBuffer) {
          this.playhead = e.data.value * this.trackSampleRate;
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
    let recreateInputHeap = false;
    let recreateOutputHeap = false;

    const requiredInputBytes = inputFrames * 2 * 4; // 2 channels, 4 bytes per float
    if (!this.inputPtr || this.inputCapacity < requiredInputBytes) {
      if (this.inputPtr) this.wasmModule._free(this.inputPtr);
      this.inputPtr = this.wasmModule._malloc(requiredInputBytes);
      this.inputCapacity = requiredInputBytes;
      recreateInputHeap = true;
    }
    const requiredOutputBytes = outputFrames * 2 * 4;
    if (!this.outputPtr || this.outputCapacity < requiredOutputBytes) {
      if (this.outputPtr) this.wasmModule._free(this.outputPtr);
      this.outputPtr = this.wasmModule._malloc(requiredOutputBytes);
      this.outputCapacity = requiredOutputBytes;
      recreateOutputHeap = true;
    }

    const memoryBuffer = this.wasmModule.HEAPF32 ? this.wasmModule.HEAPF32.buffer : this.wasmModule.wasmMemory.buffer;
    if (recreateInputHeap || !this.inputHeap || this.inputHeap.buffer !== memoryBuffer) {
      this.inputHeap = new Float32Array(memoryBuffer, this.inputPtr, this.inputCapacity / 4);
    }
    if (recreateOutputHeap || !this.outputHeap || this.outputHeap.buffer !== memoryBuffer) {
      this.outputHeap = new Float32Array(memoryBuffer, this.outputPtr, this.outputCapacity / 4);
    }
    return true;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || !this.wasmModule) return true;
    
    const channelCount = output.length;
    
    if (!this.playing || (!this.isStreaming && !this.fullBuffer) || (this.isStreaming && !this.ringBuffer) || channelCount === 0 || (!this.resampler && !this.bungee)) {
      for (let channel = 0; channel < channelCount; channel++) {
        output[channel].fill(0);
      }
      return true;
    }

    const bufferLength = this.bufferLength;
    const outputFrames = output[0].length;
    
    if (this.playhead >= bufferLength) {
      this.playing = false;
      for (let channel = 0; channel < channelCount; channel++) {
        output[channel].fill(0);
      }
      return true;
    }

    if (this.isStreaming) {
      // Limit pulling so we don't overwrite localBuffer data that the playhead hasn't reached yet
      const maxAhead = this.localCapacity - 8192; // keep safe margin
      const framesAhead = this.expectedPullFrame - this.playhead;
      
      let maxPullFrames = 4096;
      if (framesAhead + maxPullFrames > maxAhead) {
        maxPullFrames = Math.max(0, Math.floor(maxAhead - framesAhead));
      }
      
      if (maxPullFrames > 0) {
        const tempBuffer = new Float32Array(maxPullFrames * 2); // stereo interleaved
        const pulledSamples = this.ringBuffer.pull(tempBuffer);
        const pulledFrames = pulledSamples / 2;
        
        for (let i = 0; i < pulledFrames; i++) {
          const globalFrame = Math.floor(this.expectedPullFrame + i);
          const idx = (globalFrame & this.localMask) * 2;
          this.localBuffer[idx] = tempBuffer[i * 2];
          this.localBuffer[idx + 1] = tempBuffer[i * 2 + 1];
        }
        this.expectedPullFrame += pulledFrames;
      }
    }

    const getFrame = (idx) => {
      idx = Math.floor(idx);
      if (idx < 0 || idx >= bufferLength) return [0, 0];
      if (this.isStreaming) {
        if (idx < this.expectedPullFrame - this.localCapacity || idx >= this.expectedPullFrame) return [0, 0]; // underrun
        const lidx = (idx & this.localMask) * 2;
        return [this.localBuffer[lidx], this.localBuffer[lidx + 1]];
      } else {
        return [this.fullBuffer[0][idx], this.fullBuffer[1][idx]];
      }
    };

    // Determine how many input frames we need based on playback rate and key lock
    let ratio = Math.max(0.1, this.playbackRate);
    
    // Correct for sample rate mismatch between track and hardware AudioContext
    const sampleRateRatio = (this.trackSampleRate || sampleRate) / sampleRate;
    ratio *= sampleRateRatio;
    
    // We fetch a block of frames.
    if (this.keyLock && this.bungee) {
      const inputFramesNeeded = Math.ceil(outputFrames * ratio * 2);
      let framesAvailable = Math.floor(bufferLength - this.playhead);
      const inputFrames = Math.min(inputFramesNeeded, framesAvailable);
      
      if (inputFrames <= 0) return true;

      this.ensureWasmBuffers(inputFrames, outputFrames);

      for (let i = 0; i < inputFrames; i++) {
        const idx = Math.floor(this.playhead) + i;
        const frame = getFrame(idx);
        this.inputHeap[i * 2] = frame[0];
        this.inputHeap[i * 2 + 1] = frame[1];
      }

      const generated = this.bungee.process_audio(this.inputPtr, inputFrames, this.outputPtr, outputFrames, ratio, 1.0);

      for (let i = 0; i < generated; i++) {
        if (channelCount > 0) {
          let val = this.outputHeap[i * 2];
          if (val !== val || val > 10.0 || val < -10.0) val = 0;
          output[0][i] = val;
        }
        if (channelCount > 1) {
          let val = this.outputHeap[i * 2 + 1];
          if (val !== val || val > 10.0 || val < -10.0) val = 0;
          output[1][i] = val;
        }
      }
      for (let i = generated; i < outputFrames; i++) {
        if (channelCount > 0) output[0][i] = 0;
        if (channelCount > 1) output[1][i] = 0;
      }

      this.playhead += inputFrames;
    } else if (this.resampler) {
      const CROSSINGS = 32;
      const baseFrames = Math.ceil(outputFrames * ratio);
      const inputFramesNeeded = baseFrames + CROSSINGS * 2;

      if (this.playhead >= bufferLength) return true;

      this.ensureWasmBuffers(inputFramesNeeded, outputFrames);

      let startIdx = Math.floor(this.playhead) - CROSSINGS;

      for (let i = 0; i < inputFramesNeeded; i++) {
        const idx = startIdx + i;
        const frame = getFrame(idx);
        this.inputHeap[i * 2] = frame[0];
        this.inputHeap[i * 2 + 1] = frame[1];
      }

      const consumed = this.resampler.process_audio_simd(this.inputPtr, inputFramesNeeded, this.outputPtr, outputFrames, ratio);

      for (let i = 0; i < outputFrames; i++) {
        if (channelCount > 0) {
          let val = this.outputHeap[i * 2];
          if (val !== val || val > 10.0 || val < -10.0) val = 0;
          output[0][i] = val;
        }
        if (channelCount > 1) {
          let val = this.outputHeap[i * 2 + 1];
          if (val !== val || val > 10.0 || val < -10.0) val = 0;
          output[1][i] = val;
        }
      }

      this.playhead = Math.floor(this.playhead) + consumed;
    }

    this.framesSinceLastReport += outputFrames;
    // Report playhead position at ~120Hz for buttery smooth UI rendering
    if (this.framesSinceLastReport >= sampleRate / 120) {
      this.port.postMessage({ type: 'TIME_UPDATE', value: this.playhead / this.trackSampleRate });
      this.framesSinceLastReport = 0;
    }

    return true;
  }
}

registerProcessor('track-processor', TrackProcessor);
