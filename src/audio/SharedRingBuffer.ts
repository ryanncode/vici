/**
 * A lock-free, single-producer, single-consumer ring buffer utilizing SharedArrayBuffer.
 * Designed for passing Float32Array PCM data from a background decoding Web Worker
 * directly into the AudioWorklet real-time thread without JavaScript garbage collection.
 */
export class SharedRingBuffer {
  private sab: SharedArrayBuffer;
  private state: Int32Array;
  private buffer: Float32Array;
  private capacity: number;

  // State indices in Int32Array
  private static readonly WRITE_PTR = 0;
  private static readonly READ_PTR = 1;

  constructor(capacity: number, existingSab?: SharedArrayBuffer) {
    this.capacity = capacity;
    
    // Calculate total size: 2 ints for state (8 bytes) + capacity floats (capacity * 4 bytes)
    const stateBytes = 2 * Int32Array.BYTES_PER_ELEMENT;
    const bufferBytes = capacity * Float32Array.BYTES_PER_ELEMENT;
    
    if (existingSab) {
      this.sab = existingSab;
    } else {
      this.sab = new SharedArrayBuffer(stateBytes + bufferBytes);
    }

    this.state = new Int32Array(this.sab, 0, 2);
    this.buffer = new Float32Array(this.sab, stateBytes, capacity);
  }

  public getSharedBuffer(): SharedArrayBuffer {
    return this.sab;
  }

  /**
   * Pushes data into the ring buffer. (Producer)
   * @param data The Float32Array data to push
   * @returns number of elements successfully written
   */
  public push(data: Float32Array): number {
    const writePtr = Atomics.load(this.state, SharedRingBuffer.WRITE_PTR);
    const readPtr = Atomics.load(this.state, SharedRingBuffer.READ_PTR);

    const available = this.capacity - (writePtr - readPtr);
    if (available <= 0) return 0;

    const toWrite = Math.min(data.length, available);
    
    // Write in chunks to handle wrap-around
    const writeIndex = writePtr % this.capacity;
    const firstChunk = Math.min(toWrite, this.capacity - writeIndex);
    
    this.buffer.set(data.subarray(0, firstChunk), writeIndex);
    
    if (firstChunk < toWrite) {
      this.buffer.set(data.subarray(firstChunk, toWrite), 0);
    }

    Atomics.store(this.state, SharedRingBuffer.WRITE_PTR, writePtr + toWrite);
    return toWrite;
  }

  /**
   * Pulls data from the ring buffer. (Consumer)
   * @param output The Float32Array to read into
   * @returns number of elements successfully read
   */
  public pull(output: Float32Array): number {
    const writePtr = Atomics.load(this.state, SharedRingBuffer.WRITE_PTR);
    const readPtr = Atomics.load(this.state, SharedRingBuffer.READ_PTR);

    const available = writePtr - readPtr;
    if (available <= 0) return 0;

    const toRead = Math.min(output.length, available);
    
    const readIndex = readPtr % this.capacity;
    const firstChunk = Math.min(toRead, this.capacity - readIndex);

    output.set(this.buffer.subarray(readIndex, readIndex + firstChunk), 0);
    
    if (firstChunk < toRead) {
      output.set(this.buffer.subarray(0, toRead - firstChunk), firstChunk);
    }

    Atomics.store(this.state, SharedRingBuffer.READ_PTR, readPtr + toRead);
    return toRead;
  }

  public getAvailableRead(): number {
    const writePtr = Atomics.load(this.state, SharedRingBuffer.WRITE_PTR);
    const readPtr = Atomics.load(this.state, SharedRingBuffer.READ_PTR);
    return writePtr - readPtr;
  }

  public getAvailableWrite(): number {
    return this.capacity - this.getAvailableRead();
  }

  public clear(): void {
    Atomics.store(this.state, SharedRingBuffer.WRITE_PTR, 0);
    Atomics.store(this.state, SharedRingBuffer.READ_PTR, 0);
  }
}
