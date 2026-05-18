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

      if (fileType === 'audio/flac' || fileType === 'flac') {
        await decodeFlac(buffer, ringBuffer);
      } else if (fileType === 'audio/mpeg' || fileType === 'audio/mp3' || fileType === 'mp3') {
        await decodeMp3(buffer, ringBuffer);
      } else if (fileType === 'audio/wav' || fileType === 'wav') {
        decodeWav(buffer, ringBuffer);
      } else {
        throw new Error(`Unsupported file type: ${fileType}`);
      }

      self.postMessage({ type: 'DECODE_DONE' });
    } catch (err) {
      self.postMessage({ type: 'DECODE_ERROR', error: String(err) });
    }
  }
};

async function decodeFlac(buffer: ArrayBuffer, ringBuffer: SharedRingBuffer) {
  if (!flacDecoder) throw new Error("FLAC decoder not initialized");
  
  const uint8Array = new Uint8Array(buffer);
  const result = await flacDecoder.decode(uint8Array);
  
  pushInterleaved(result.channelData, ringBuffer);
}

async function decodeMp3(buffer: ArrayBuffer, ringBuffer: SharedRingBuffer) {
  if (!mp3Decoder) throw new Error("MP3 decoder not initialized");
  
  const uint8Array = new Uint8Array(buffer);
  const result = await mp3Decoder.decode(uint8Array);
  
  pushInterleaved(result.channelData, ringBuffer);
}

function decodeWav(buffer: ArrayBuffer, ringBuffer: SharedRingBuffer) {
  const dataView = new DataView(buffer);
  
  let offset = 0;
  if (dataView.getUint32(offset, false) !== 0x52494646) throw new Error("Not a RIFF file");
  offset += 4;
  /* const fileSize = */ dataView.getUint32(offset, true);
  offset += 4;
  if (dataView.getUint32(offset, false) !== 0x57415645) throw new Error("Not a WAVE file");
  offset += 4;

  let bitDepth = 16;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset < buffer.byteLength) {
    const chunkId = dataView.getUint32(offset, false);
    offset += 4;
    const chunkSize = dataView.getUint32(offset, true);
    offset += 4;

    if (chunkId === 0x666D7420) { // 'fmt '
      // numChannels = dataView.getUint16(offset + 2, true);
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
  const floats = new Float32Array(numSamples);

  if (bitDepth === 16) {
    for (let i = 0; i < numSamples; i++) {
      const int16 = dataView.getInt16(dataOffset + i * 2, true);
      floats[i] = int16 < 0 ? int16 / 32768 : int16 / 32767;
    }
  } else if (bitDepth === 24) {
    for (let i = 0; i < numSamples; i++) {
      const b0 = dataView.getUint8(dataOffset + i * 3);
      const b1 = dataView.getUint8(dataOffset + i * 3 + 1);
      const b2 = dataView.getInt8(dataOffset + i * 3 + 2);
      const int24 = (b2 << 16) | (b1 << 8) | b0;
      floats[i] = int24 / 8388608.0;
    }
  } else if (bitDepth === 32) {
    for (let i = 0; i < numSamples; i++) {
      const int32 = dataView.getInt32(dataOffset + i * 4, true);
      floats[i] = int32 / 2147483648.0;
    }
  } else {
    throw new Error(`Unsupported WAV bit depth: ${bitDepth}`);
  }

  pushToRingBufferBlocking(floats, ringBuffer);
}

function pushInterleaved(channelData: Float32Array[], ringBuffer: SharedRingBuffer) {
  const numChannels = channelData.length;
  const numSamplesPerChannel = channelData[0].length;
  const interleaved = new Float32Array(numSamplesPerChannel * numChannels);

  for (let c = 0; c < numChannels; c++) {
    const channel = channelData[c];
    for (let i = 0; i < numSamplesPerChannel; i++) {
      interleaved[i * numChannels + c] = channel[i];
    }
  }

  pushToRingBufferBlocking(interleaved, ringBuffer);
}

function pushToRingBufferBlocking(data: Float32Array, ringBuffer: SharedRingBuffer) {
  let offset = 0;
  const chunkSize = 4096;

  while (offset < data.length) {
    const end = Math.min(offset + chunkSize, data.length);
    const chunk = data.subarray(offset, end);
    
    let written = 0;
    while (written === 0) {
      written = ringBuffer.push(chunk);
      if (written === 0) {
        // Yield or busy wait
        // In a true implementation, Atomics.wait should be used to sleep the worker
        // if the buffer is full, preventing CPU spin.
      }
    }
    
    offset += written;
    
    if (written < chunk.length) {
       offset -= (chunk.length - written);
    }
  }
}
