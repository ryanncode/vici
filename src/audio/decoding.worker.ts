import { FLACDecoder } from '@wasm-audio-decoders/flac';
import { MPEGDecoder } from 'mpg123-decoder';
import { SharedRingBuffer } from './SharedRingBuffer';

// Initialize decoders
let flacDecoder: FLACDecoder | null = null;
let mp3Decoder: MPEGDecoder | null = null;

async function initDecoders() {
  if (!flacDecoder) {
    flacDecoder = new FLACDecoder();
    await flacDecoder.ready;
  }
  if (!mp3Decoder) {
    mp3Decoder = new MPEGDecoder();
    await mp3Decoder.ready;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const streams = new Map<string, any>();

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'INIT') {
    try {
      await initDecoders();
      self.postMessage({ type: 'INIT_DONE' });
    } catch (err) {
      self.postMessage({ type: 'INIT_ERROR', error: String(err) });
    }
  } else if (type === 'DECODE') {
    const { buffer, fileType, sharedBuffer, capacity } = payload;
    const ringBuffer = new SharedRingBuffer(capacity, sharedBuffer);

    try {
      await initDecoders();

      let peaks = new Float32Array();
      let bandPeaks = new Float32Array();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let leftChannel: any = new Float32Array();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rightChannel: any = new Float32Array();
      let duration = 0;
      let bufferLength = 0;

      let trackSampleRate = 44100;

      if (fileType === 'audio/flac' || fileType === 'flac') {
        const { l, r, p, bp, d, bl, sr } = await decodeFlac(buffer);
        leftChannel = l; rightChannel = r; peaks = p; bandPeaks = bp; duration = d; bufferLength = bl; trackSampleRate = sr;
      } else if (fileType === 'audio/mpeg' || fileType === 'audio/mp3' || fileType === 'mp3') {
        const { l, r, p, bp, d, bl, sr } = await decodeMp3(buffer);
        leftChannel = l; rightChannel = r; peaks = p; bandPeaks = bp; duration = d; bufferLength = bl; trackSampleRate = sr;
      } else if (fileType === 'audio/wav' || fileType === 'wav') {
        const { l, r, p, bp, d, bl, sr } = decodeWav(buffer);
        leftChannel = l; rightChannel = r; peaks = p; bandPeaks = bp; duration = d; bufferLength = bl; trackSampleRate = sr;
      } else {
        throw new Error(`Unsupported file type: ${fileType}`);
      }

      if (sharedBuffer) {
        // We decoded the arrays. We must now stream them to the ring buffer
        const streamState = {
          buffers: [leftChannel, rightChannel],
          ringBuffer,
          offset: 0,
          shouldStop: false
        };
        // Use a unique ID or generate one? Wait, DECODE needs deckId to manage streams!
        // AudioEngine sends deckId!
        const deckId = payload.deckId;
        if (streams.has(deckId)) streams.get(deckId).shouldStop = true;
        streams.set(deckId, streamState);
        pushInterleavedAsyncStateful(deckId);
        
        self.postMessage({ type: 'DECODE_DONE', deckId, peaks, bandPeaks, duration, bufferLength, trackSampleRate }, [peaks.buffer, bandPeaks.buffer]);
      } else {
        const deckId = payload.deckId;
        const leftClone = leftChannel.slice();
        const rightClone = rightChannel.slice();
        self.postMessage({ type: 'DECODE_DONE', deckId, peaks, bandPeaks, duration, bufferLength, leftChannel: leftClone, rightChannel: rightClone, trackSampleRate }, [peaks.buffer, bandPeaks.buffer, leftClone.buffer, rightClone.buffer]);
      }
    } catch (err) {
      self.postMessage({ type: 'DECODE_ERROR', deckId: payload.deckId, error: String(err) });
    }
  } else if (type === 'STREAM_DECODED') {
    const { deckId, buffers, sharedBuffer, capacity } = payload;
    const ringBuffer = new SharedRingBuffer(capacity, sharedBuffer);
    
    // Stop any existing stream for this deck
    if (streams.has(deckId)) {
      streams.get(deckId).shouldStop = true;
    }
    
    const streamState = {
      buffers,
      ringBuffer,
      offset: 0,
      shouldStop: false
    };
    streams.set(deckId, streamState);
    
    pushInterleavedAsyncStateful(deckId);
  } else if (type === 'SEEK_STREAM') {
    const { deckId, frame } = payload;
    const stream = streams.get(deckId);
    if (stream && stream.buffers) {
      const targetFrame = Math.floor(frame);
      stream.offset = targetFrame * stream.buffers.length; // * numChannels
      stream.ringBuffer.clear();
      
      if (stream.shouldStop) {
        stream.shouldStop = false;
        pushInterleavedAsyncStateful(deckId);
      }
    }
  }
};

function pushInterleavedAsyncStateful(deckId: string) {
  const stream = streams.get(deckId);
  if (!stream || !stream.buffers || !stream.ringBuffer) return;

  const numChannels = stream.buffers.length;
  const numSamplesPerChannel = stream.buffers[0].length;
  
  const chunkSize = 4096;
  const chunk = new Float32Array(chunkSize);

  function pushNextChunk() {
    if (stream.shouldStop) return;
    
    if (stream.offset >= numSamplesPerChannel * numChannels) {
      stream.shouldStop = true;
      self.postMessage({ type: 'STREAM_DONE', deckId });
      return;
    }

    const startOffset = stream.offset;
    let samplesToWrite = 0;
    
    for (let i = 0; i < chunkSize; i += numChannels) {
      const frameIndex = Math.floor((startOffset + i) / numChannels);
      if (frameIndex >= numSamplesPerChannel) break;
      
      for (let c = 0; c < numChannels; c++) {
        chunk[i + c] = stream.buffers[c][frameIndex];
      }
      samplesToWrite += numChannels;
    }

    const dataToPush = chunk.subarray(0, samplesToWrite);
    const written = stream.ringBuffer.push(dataToPush);

    if (written > 0) {
      stream.offset += written;
    }

    setTimeout(pushNextChunk, written > 0 ? 0 : 5);
  }

  pushNextChunk();
}

async function decodeFlac(buffer: ArrayBuffer) {
  if (!flacDecoder) throw new Error("FLAC decoder not initialized");
  
  const uint8Array = new Uint8Array(buffer);
  const result = await flacDecoder.decode(uint8Array);

  const { p, bp, d, bl } = generatePeaksAndMetadata(result.channelData, result.sampleRate);
  
  return {
    l: result.channelData[0],
    r: result.channelData.length > 1 ? result.channelData[1] : result.channelData[0],
    p, bp, d, bl,
    sr: result.sampleRate
  };
}

async function decodeMp3(buffer: ArrayBuffer) {
  if (!mp3Decoder) throw new Error("MP3 decoder not initialized");
  
  const uint8Array = new Uint8Array(buffer);
  const result = await mp3Decoder.decode(uint8Array);

  const { p, bp, d, bl } = generatePeaksAndMetadata(result.channelData, result.sampleRate);
  
  return {
    l: result.channelData[0],
    r: result.channelData.length > 1 ? result.channelData[1] : result.channelData[0],
    p, bp, d, bl,
    sr: result.sampleRate
  };
}

function generatePeaksAndMetadata(channelData: Float32Array[], sampleRate: number) {
  const leftChannel = channelData[0];
  const numPeaks = 1000;
  const blockSize = Math.floor(leftChannel.length / numPeaks);
  const peaks = new Float32Array(numPeaks);
  const bandPeaks = new Float32Array(numPeaks * 3);
  
  const fs = sampleRate || 44100;
  // Lowpass Alpha for 250Hz
  const alpha_low = 1 / (1 + fs / (2 * Math.PI * 250));
  // Highpass Alpha for 2.5kHz (Note: formula is 1 / (1 + 2pi*fc/fs))
  const alpha_high = 1 / (1 + (2 * Math.PI * 2500) / fs);
  
  let lp_y = 0;
  let hp_y = 0;
  let hp_x = 0;
  let maxL = 0, maxM = 0, maxH = 0;
  
  for (let i = 0; i < numPeaks; i++) {
    let sum = 0;
    let sumL = 0, sumM = 0, sumH = 0;
    
    const start = i * blockSize;
    const end = Math.min(start + blockSize, leftChannel.length);
    for (let j = start; j < end; j++) {
      const sample = leftChannel[j];
      sum += Math.abs(sample);
      
      lp_y += alpha_low * (sample - lp_y);
      hp_y = alpha_high * (hp_y + sample - hp_x);
      hp_x = sample;
      
      const mid = sample - lp_y - hp_y;
      
      sumL += Math.abs(lp_y);
      sumM += Math.abs(mid);
      sumH += Math.abs(hp_y);
    }
    peaks[i] = sum / (end - start);
    
    bandPeaks[i*3] = sumL / (end - start);
    bandPeaks[i*3 + 1] = sumM / (end - start);
    bandPeaks[i*3 + 2] = sumH / (end - start);
    
    if (bandPeaks[i*3] > maxL) maxL = bandPeaks[i*3];
    if (bandPeaks[i*3+1] > maxM) maxM = bandPeaks[i*3+1];
    if (bandPeaks[i*3+2] > maxH) maxH = bandPeaks[i*3+2];
  }
  
  let max = 0;
  for (let i = 0; i < numPeaks; i++) {
    if (peaks[i] > max) max = peaks[i];
  }
  if (max > 0) {
    for (let i = 0; i < numPeaks; i++) {
      peaks[i] = peaks[i] / max;
    }
  }
  
  if (maxL > 0 || maxM > 0 || maxH > 0) {
    for (let i = 0; i < numPeaks; i++) {
      bandPeaks[i*3] /= (maxL || 1);
      bandPeaks[i*3+1] /= (maxM || 1);
      bandPeaks[i*3+2] /= (maxH || 1);
    }
  }

  return {
    p: peaks,
    bp: bandPeaks,
    d: leftChannel.length / sampleRate,
    bl: leftChannel.length
  };
}

function decodeWav(buffer: ArrayBuffer) {
  const dataView = new DataView(buffer);
  
  let offset = 0;
  if (dataView.getUint32(offset, false) !== 0x52494646) throw new Error("Not a RIFF file");
  offset += 4;
  /* const fileSize = */ dataView.getUint32(offset, true);
  offset += 4;
  if (dataView.getUint32(offset, false) !== 0x57415645) throw new Error("Not a WAVE file");
  offset += 4;

  let bitDepth = 16;
  let sampleRate = 44100;
  let numChannels = 2;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset < buffer.byteLength) {
    const chunkId = dataView.getUint32(offset, false);
    offset += 4;
    const chunkSize = dataView.getUint32(offset, true);
    offset += 4;

    if (chunkId === 0x666D7420) { // 'fmt '
      numChannels = dataView.getUint16(offset + 2, true);
      sampleRate = dataView.getUint32(offset + 4, true);
      bitDepth = dataView.getUint16(offset + 14, true);
    } else if (chunkId === 0x64617461) { // 'data'
      dataOffset = offset;
      dataSize = chunkSize;
      break;
    }
    offset += chunkSize;
  }

  if (dataOffset === 0) throw new Error("No data chunk found in WAV");

  const numSamples = dataSize / (bitDepth / 8);
  const frames = numSamples / numChannels;
  
  const leftChannel = new Float32Array(frames);
  const rightChannel = new Float32Array(frames);

  if (bitDepth === 16) {
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < numChannels; c++) {
        const int16 = dataView.getInt16(dataOffset + (i * numChannels + c) * 2, true);
        const val = int16 < 0 ? int16 / 32768 : int16 / 32767;
        if (c === 0) leftChannel[i] = val;
        else if (c === 1) rightChannel[i] = val;
      }
    }
  } else if (bitDepth === 24) {
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < numChannels; c++) {
        const b0 = dataView.getUint8(dataOffset + (i * numChannels + c) * 3);
        const b1 = dataView.getUint8(dataOffset + (i * numChannels + c) * 3 + 1);
        const b2 = dataView.getInt8(dataOffset + (i * numChannels + c) * 3 + 2);
        const int24 = (b2 << 16) | (b1 << 8) | b0;
        const val = int24 / 8388608.0;
        if (c === 0) leftChannel[i] = val;
        else if (c === 1) rightChannel[i] = val;
      }
    }
  } else if (bitDepth === 32) {
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < numChannels; c++) {
        const int32 = dataView.getInt32(dataOffset + (i * numChannels + c) * 4, true);
        const val = int32 / 2147483648.0;
        if (c === 0) leftChannel[i] = val;
        else if (c === 1) rightChannel[i] = val;
      }
    }
  } else {
    throw new Error(`Unsupported WAV bit depth: ${bitDepth}`);
  }
  
  if (numChannels === 1) {
     for (let i = 0; i < frames; i++) rightChannel[i] = leftChannel[i];
  }

  const { p, bp, d, bl } = generatePeaksAndMetadata([leftChannel, rightChannel], sampleRate);

  return {
    l: leftChannel,
    r: rightChannel,
    p, bp, d, bl,
    sr: sampleRate
  };
}
