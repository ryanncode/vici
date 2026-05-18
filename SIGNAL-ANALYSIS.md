# Vici Audio Engine: Signal Analysis and DSP Architecture

This document presents a meticulous, step-by-step breakdown of the Vici audio engine. The architecture adheres strictly to canonical DSP literature and Linear Time-Invariant (LTI) philosophies to guarantee a mathematically sound, bit-transparent, and mastering-grade playback system.

---

## 1. High-Level Signal Flow Graph

The audio signal is decoded from file bytes to PCM frames, pushed into cross-thread memory, streamed into the Web Audio API, resampled via C++ WebAssembly SIMD, processed by Faust DSP nodes, and safely mixed in the master bus.

```mermaid
graph TD
    A[File Decoder Worker] -->|Float32 PCM| B(SharedRingBuffer)
    B -->|128-frame Pull| C{TrackProcessor AudioWorklet}
    C -->|Pitch/Time Stretch| D[WASM C++ Resampler]
    D -->|AudioWorklet Output| E(Faust DSP Node)
    E -->|EQ / FX| F(Master Gain Node)
    F -->|Summing| G(Headroom Gain Node)
    G --> H[Faust Lookahead Peak Limiter]
    H --> I((AudioContext Destination))
```

---

## 2. Decoding & Cross-Thread Streaming

The system must transport hundreds of megabytes of raw PCM float data from the background decoding worker to the high-priority `AudioWorklet` real-time thread without triggering main-thread garbage collection (GC) or frame underruns.

### 2.1 Web Worker Decoding (`decoding.worker.ts`)
Audio files are loaded as `ArrayBuffer` objects and passed to a background Web Worker. Depending on the format (`mp3`, `flac`, `wav`), the appropriate WebAssembly decoder decodes the audio into raw `Float32Array` PCM channel arrays (left and right).

Once decoded, the worker utilizes `pushInterleavedAsyncStateful(deckId)` to stream the PCM data into a ring buffer. The worker multiplexes the channels into an interleaved `Float32Array` in chunks of `4096` samples. 
```javascript
// Interleaving math
for (let i = 0; i < chunkSize; i += numChannels) {
  const frameIndex = Math.floor((startOffset + i) / numChannels);
  chunk[i] = stream.buffers[0][frameIndex];
  chunk[i+1] = stream.buffers[1][frameIndex];
}
```
If the ring buffer fills up, a `setTimeout` of `5ms` yields the thread, providing a steady, backpressured stream.

### 2.2 Lock-Free Shared Ring Buffer (`SharedRingBuffer.ts`)
Vici utilizes a lock-free **Shared Ring Buffer** built on top of `SharedArrayBuffer` and `Atomics` to pass data across thread boundaries safely.
Memory is explicitly allocated as:
- `Int32Array(sab, 0, 2)`: Two 32-bit integers acting as the **Write Pointer** (`WRITE_PTR`) and **Read Pointer** (`READ_PTR`).
- `Float32Array(sab, 8, capacity)`: The actual circular buffer containing the audio frames.

Because `Atomics.load` and `Atomics.store` are used to update the read/write pointers, the producer and consumer threads never race. 
When writing, the pointer wraps around the buffer strictly using modulo arithmetic:
```javascript
const available = this.capacity - (writePtr - readPtr);
const writeIndex = writePtr % this.capacity;
const firstChunk = Math.min(toWrite, this.capacity - writeIndex);
```
If the write crosses the boundary of the `Float32Array`, it is split into two `set()` operations, maintaining contiguous stream logic.

### 2.3 AudioWorklet Consumption & Local Buffering (`track-processor.js`)
Inside the `AudioWorkletProcessor`, the `pull()` method extracts interleaved PCM frames into a `tempBuffer` of up to `4096` samples.
However, DSP algorithms like the Sinc Resampler require fetching samples backward in time (e.g., `-32` frames before the current playhead) and fetching samples ahead. 

To satisfy this, the Worklet maintains a `localBuffer` (`131072` interleaved floats) that acts as a local circular cache. 
When pulling from the `SharedRingBuffer`, it places frames into the `localBuffer` at `expectedPullFrame % localCapacity`:
```javascript
const globalFrame = Math.floor(this.expectedPullFrame + i);
const idx = (globalFrame % this.localCapacity) * 2;
this.localBuffer[idx] = tempBuffer[i * 2];
this.localBuffer[idx + 1] = tempBuffer[i * 2 + 1];
```
When the C++ WASM resampler requests input frames, the `getFrame(idx)` function securely maps the requested absolute track index to the local circular buffer, preventing out-of-bounds reads and enabling instantaneous `CROSSINGS` look-behinds.

---

## 3. WebAssembly DSP Core (Resampler)

The core playback engine (`src/wasm/resampler.cpp`) resolves sample-rate discrepancies and performs real-time pitch shifting using WebAssembly Relaxed SIMD instructions.

### 3.1 Resolving the Sample Rate Matrix (`track-processor.js`)
Before the C++ WebAssembly core can process audio, the `AudioWorklet` must calculate the precise fractional `ratio` that dictates the speed at which the playhead consumes the ring buffer. This ratio is governed by two simultaneous factors:
1. **The DJ Pitch Fader (`this.playbackRate`):** The musical speed selected by the user (e.g., `1.0` for 0%, `1.08` for +8%).
2. **The Hardware Sample Rate Discrepancy:** The difference between the source file's decoded sample rate and the host OS's AudioContext hardware sample rate.

```javascript
const sampleRateRatio = (this.trackSampleRate || sampleRate) / sampleRate;
ratio *= sampleRateRatio;
```
Because modern Web Audio contexts frequently default to **48kHz** (standard for video and OS mixers), while the vast majority of consumer MP3s and FLACs are mastered at **44.1kHz** (CD quality), the `sampleRateRatio` evaluates to exactly `44100 / 48000 = 0.91875`. 
This means that even when a DJ is playing a track at exactly 0% pitch (`playbackRate = 1.0`), the resampler is engaged 100% of the time, continuously upsampling the audio stream at a constant ratio of `0.91875`. This makes the perfection of the Sinc Resampler critical, as it touches every single frame of audio regardless of the pitch fader's position.

### 3.2 The 2D Polyphase FIR Filter Bank
To change sample rates and perform time stretching without introducing aliasing, the architecture dictates a **Polyphase Finite Impulse Response (FIR) filter bank**. 

Our implementation utilizes a 64-tap, 512-phase 2D filter bank structure. Instead of a highly oversampled 1D table indexed by absolute distance (which introduces non-contiguous memory lookups and scalar math in the inner SIMD loop), the 2D topology stores pre-calculated weights sequentially in memory:
`sincTables[NUM_BANKS][RESOLUTION][CROSSINGS * 2]`

Where:
- `NUM_BANKS = 64` (Pre-calculated banks for different pitch stretch ratios up to 2.0x)
- `RESOLUTION = 512` (Fractional phase offsets per sample)
- `CROSSINGS = 32` (A total of 64 FIR taps for high-quality low-pass cutoff)

### 3.2 Mathematical Definition of the Windowed Sinc
For each tap $j$ and fractional phase offset $f_{offset}$, the unnormalized weight is calculated using the continuous Sinc function bounded by a Kaiser window:

$$ Sinc(x) = \frac{\sin(\pi x)}{\pi x} $$
$$ Kaiser(x, \beta) = \frac{I_0\left(\beta \sqrt{1 - \left(\frac{x}{N/2}\right)^2}\right)}{I_0(\beta)} $$
$$ W(x) = Sinc\left(\frac{x}{stretch}\right) \cdot Kaiser\left(\frac{x}{stretch}, \beta\right) \cdot \frac{1}{stretch} $$

Where $I_0$ is the zeroth-order modified Bessel function of the first kind, $\beta = 9.0$ for optimal side-lobe attenuation, and $stretch = \max(1.0, pitch\_ratio)$ manages the low-pass cutoff frequency during upsampling.

### 3.3 Strict Phase-Independent Gain Normalization
A critical vulnerability of discrete time-variant resamplers is **Amplitude Modulation (AM)**. If the discrete sum of the windowed Sinc coefficients fluctuates at different sub-sample offsets, the DSP node dynamically amplifies or attenuates the signal sample-by-sample, generating high-frequency sidebands (crunchy aliasing) and low-frequency masking (muddled sub-bass).

To mathematically eliminate this, the engine strictly bounds the state of every fractional phase independently during initialization:

$$ Gain_{phase} = \sum_{j=-32}^{31} W(j - f_{offset}) $$
$$ W_{normalized}(j) = \frac{W(j)}{Gain_{phase}} $$

This rigorous normalization guarantees that the DC gain of the FIR filter is locked perfectly to **$1.0$ ($0$ dB)** across the entire interpolation cycle. 

### 3.4 SIMD Inner Loop Execution
In `process_audio_simd`, the costly `std::abs()` scalar distance calculations are bypassed. The fractional phase `frac` determines the integer phases `r1` and `r2`, and the interpolation factor `tFrac`.
The 64 weights are sequentially loaded directly from the `sincTables` array and processed four-at-a-time using `wasm_f32x4_mul` and `wasm_f32x4_add`.

---

## 4. Faust DSP Ecosystem (`engine.dsp`)

The interleaved Web Audio output from the WASM resampler is routed into a dynamically compiled Faust WebAssembly node (`FaustMonoDspGenerator`). 

### 4.1 3-Band Isolator (Linkwitz-Riley Crossovers)
The DJ EQ utilizes a true 3-Band Isolator built from Linkwitz-Riley 4th order (24dB/octave) crossovers. 
By cascading two 2nd-order Butterworth filters (`fi.lowpass(2, f) : fi.lowpass(2, f)`), the crossover points at **150Hz** and **6500Hz** provide a perfectly flat magnitude sum.
This completely eliminates the mid-range mud and harsh "presence" zone boosting that plagued earlier biquad shelving designs.

### 4.2 State-Variable DJ Filter
The dual Low-Pass / High-Pass filter uses a State-Variable Filter (SVF) topology with a dynamic Q-factor that increases as the filter is pushed further from the center detent, providing resonance without internal feedback explosion:
$ Q = 0.707 + (|c| \cdot 1.5) $
Crucially, the signal is routed **100% wet** at all times. Sweeping the filter strictly modulates the cutoff frequency (`hp_freq` or `lp_freq`). Crossfading between a phase-shifted SVF signal and a dry signal (parallel comb filtering) has been mathematically eliminated to protect sub-bass integrity.

### 4.3 Modulating and Time-Variant FX
For modulating and time-variant effects (Delay, Phaser, Reverb, Roll), the control parameters (e.g., Delay Time, Phaser Rate) are heavily smoothed at the sample rate using Faust's `si.smoo` functions. This applies a one-pole lowpass filter to the UI control signals, preventing zipper noise and aliasing artifacts when DJ knobs are swept aggressively.

The processing chain topology is explicitly defined as:
`process = eq : delay_fx : reverb_fx : phaser_fx : roll_fx : gate_fx : siren_fx : compressor_fx : dj_filter : *(volume), *(volume);`

---

## 5. Master Mix Bus (`AudioEngine.ts`)

The sum of Deck A and Deck B exits the Faust ecosystem and enters the final Web Audio API graph.

### 5.1 Explicit Gain Staging
To prevent digital clipping caused by summing two uncorrelated 0dBFS tracks, the Master bus relies on explicit headroom allocation (defaulting to $-3$ dB) via the `headroomGainNode`.
$$ Gain_{linear} = 10^{\frac{Headroom_{dB}}{20}} $$

### 5.2 Faust Lookahead Peak Limiter
Standard Web Audio components like the `DynamicsCompressorNode` introduce hidden makeup gain, pumping, and envelope delays that ruin the transient response of electronic dance music. Previously, Vici relied on a zero-latency `WaveShaperNode` to soft-clip peaks. However, squaring off waveforms mathematically injects high-frequency odd harmonics, resulting in a harsh, "hot" top-end.

To counter this, the `WaveShaperNode` has been entirely removed from `AudioEngine.ts`. Instead, the DSP chain concludes inside Faust with a true digital lookahead peak limiter. Unlike character compressors (such as the UREI 1176 models which induce their own harmonic saturation), this limiter guarantees mastering-grade transparency. It utilizes a 2ms delay line on the audio signal while an amplitude envelope (`an.amp_follower_ar`) tracks the undelayed peaks with a 0.5ms attack and 50ms release. If the envelope exceeds the 0.98 linear ceiling, the calculated gain reduction is applied to the delayed signal perfectly in time, preventing DAC wrapping without squaring off individual waveform cycles or generating odd-harmonic distortion.

---

## 6. Sources of Intentional (and Unintentional) Signal Coloration

While the engine is architected for strict mathematical transparency, there are specific nodes and states where the audio is inherently "colored." It is critical to document these boundaries so mastering engineers understand exactly what alters the bit-perfect stream.

### 6.1 Isolator Flat Magnitude Summation
In the Faust DSP block, the DJ EQ relies on Linkwitz-Riley crossovers. An inherent property of LR4 crossovers is that they introduce a 360-degree phase shift at the crossover point. While not strictly "zero-phase", the bands sum to a perfect all-pass filter. When the EQ sliders are at exactly **0.0 dB** (linear gain = 1.0), the magnitude response is mathematically perfectly flat.

### 6.2 DJ Filter Hard Bypassing
The State-Variable Filter (SVF) introduces significant phase shift due to its LTI topology. To ensure the track remains pristine when the DJ filter knob is centered, the routing logic utilizes an explicit boolean bypass:
```faust
is_bypass = (is_lp == 0) & (is_hp == 0);
l_filt = (l * is_bypass) + (l_lp * is_lp) + (l_hp * is_hp);
```
When the knob is exactly centered, the SVF calculation is discarded and the filter block becomes a pure bit-perfect multiplication by `1.0`.

### 6.3 Limiter Gain Reduction
As defined in Section 5.2, the signal is protected by a peak limiter. If the summation of Deck A and Deck B exceeds 0 dBFS, the limiter engages. Unlike the previous WaveShaper which injected immediate THD, the limiter reduces the gain envelope mathematically. However, extreme volume pushing will inherently compress the dynamic range of the master bus, altering the crest factor.

### 6.4 Key Lock (Master Tempo) Phase Smearing
The most significant degradation of audio quality occurs when the user enables **Key Lock**.
When `keyLock = false`, audio is routed through the mathematically perfect 2D Polyphase FIR Sinc Resampler (Section 3).
When `keyLock = true`, the `track-processor.js` completely bypasses the Sinc resampler and routes the PCM frames into `BungeeStretcher` (`src/wasm/resampler.cpp`). 
```javascript
if (this.keyLock && this.bungee) {
    const generated = this.bungee.process_audio(...);
} else if (this.resampler) {
    const consumed = this.resampler.process_audio_simd(...);
}
```
`Bungee` is a time-stretching algorithm (often utilizing phase vocoder or granular synthesis techniques). These algorithms are inherently non-linear and time-variant. They must chop the audio into overlapping FFT frames or grains, shift them, and crossfade them back together. 
Activating Key Lock will immediately and permanently:
- Smear the transient response (softening drum hits).
- Introduce pre-ringing and phase incoherence in the sub-bass frequencies.
- Introduce metallic/flanging artifacts in the high frequencies.

**Conclusion:** For absolute mastering-grade playback, Key Lock must be disabled, the EQs must be centered at `0.0`, and the master bus must not exceed `-0.17 dBFS`.

---

## 7. DSP Verification Pipeline (`dsp-test.html`)

To objectively guarantee the integrity of the math outlined above, Vici features a standalone DSP verification pipeline located at `public/dsp-test.html`.

Running the test suite instantiates the `FaustMonoDspGenerator` inside a dedicated `AudioContext` isolated from UI render loops.
1. **Impulse Response Test:** Fires a Dirac Delta impulse (`1.0` followed by `0.0`) through the engine. An embedded `AnalyserNode` performs a Fast Fourier Transform (FFT) and plots the exact Frequency Response curve onto an HTML Canvas. This mathematically proves the perfectly flat magnitude summation of the Linkwitz-Riley Isolator crossovers.
2. **THD Sine Test:** Fires a pure 1kHz Sine Wave at +12dB into the engine to aggressively trigger the peak limiter. The FFT spectrum analysis visualizes the noise floor, proving the elimination of the odd-harmonic distortion (3kHz, 5kHz) that plagued the earlier WebAudio WaveShaper architecture.
