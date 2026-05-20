// Polyfill window for music-metadata which checks for browser environments
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window = globalThis;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).module = { exports: {} };

import * as mm from 'music-metadata';
import type { TrackMetadata } from '../types/mixer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let essentia: any = null;

// Initialize Essentia WASM instance
async function initEssentia() {
  try {
    // @ts-expect-error essentia.js types
    const wasmImport = await import('essentia.js/dist/essentia-wasm.es.js');
    const EssentiaWASM = wasmImport.EssentiaWASM || wasmImport.default || wasmImport;
    
    // @ts-expect-error essentia.js types
    const coreImport = await import('essentia.js/dist/essentia.js-core.es.js');
    const EssentiaJS = coreImport.EssentiaJS || coreImport.default || coreImport;
    
    const wasmModule = await EssentiaWASM();
    essentia = new EssentiaJS(wasmModule, false);
    console.log("Essentia WASM loaded dynamically!");
  } catch (e) {
    console.warn("Failed to load Essentia WASM dynamically", e);
  }
}

initEssentia();

// Create a safe hash string based on path and size without relying on crypto.subtle
function generateId(filePath: string, size: number): string {
  try {
    return btoa(encodeURIComponent(`${filePath}_${size}`)).replace(/[/+=]/g, '');
  } catch {
    return `id_${Date.now()}_${size}`;
  }
}

import type { TrackSegment } from '../types/mixer';

function getColorForSegmentType(type: TrackSegment['type']): string {
  switch (type) {
    case 'intro': return '#3b82f6'; // Blue
    case 'verse': return '#22c55e'; // Green
    case 'chorus': return '#ef4444'; // Red
    case 'bridge': return '#eab308'; // Yellow
    case 'outro': return '#a855f7'; // Purple
    default: return '#64748b'; // Slate
  }
}

function analyzeSegmentsLogic(peaks: Float32Array, duration: number, originalBpm: number): TrackSegment[] {
  const numPeaks = peaks.length;
  const secondsPerPeak = duration / numPeaks;
  
  // 1. Smoothen the peaks (moving average) to get broader energy levels
  const smoothWindow = Math.ceil(4.0 / secondsPerPeak); // ~4 seconds window
  const smoothPeaks = new Float32Array(numPeaks);
  for (let i = 0; i < numPeaks; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - smoothWindow); j < Math.min(numPeaks, i + smoothWindow); j++) {
      sum += peaks[j];
      count++;
    }
    smoothPeaks[i] = sum / count;
  }

  // 2. Identify segments by applying thresholds
  const rawSegments: TrackSegment[] = [];
  let currentType: TrackSegment['type'] | null = null;
  let currentStart = 0;

  for (let i = 0; i < numPeaks; i++) {
    const val = smoothPeaks[i];
    let type: TrackSegment['type'];
    
    if (val < 0.25) {
      type = 'intro';
    } else if (val > 0.65) {
      type = 'chorus';
    } else if (val > 0.45) {
      type = 'bridge';
    } else {
      type = 'verse';
    }

    if (type !== currentType) {
      if (currentType !== null) {
        rawSegments.push({
          start: currentStart * secondsPerPeak,
          end: i * secondsPerPeak,
          type: currentType,
          color: getColorForSegmentType(currentType)
        });
      }
      currentType = type;
      currentStart = i;
    }
  }
  
  if (currentType !== null) {
    rawSegments.push({
      start: currentStart * secondsPerPeak,
      end: duration,
      type: currentType,
      color: getColorForSegmentType(currentType)
    });
  }

  // 3. Clean up
  if (rawSegments.length === 0) return [];
  
  const minDuration = 8.0;
  const cleaned: TrackSegment[] = [rawSegments[0]];
  
  for (let i = 1; i < rawSegments.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    const curr = rawSegments[i];
    
    if (curr.end - curr.start < minDuration) {
      prev.end = curr.end;
    } else {
      cleaned.push({ ...curr });
    }
  }
  
  const bpm = originalBpm > 0 ? originalBpm : 120;
  const phraseLength = (60 / bpm) * 32;
  const subdivided: TrackSegment[] = [];
  
  for (const seg of cleaned) {
    const segDur = seg.end - seg.start;
    if (segDur > phraseLength * 1.5) {
      const numPieces = Math.ceil(segDur / phraseLength);
      const actualPieceLen = segDur / numPieces;
      for (let k = 0; k < numPieces; k++) {
        subdivided.push({
          start: seg.start + k * actualPieceLen,
          end: seg.start + (k + 1) * actualPieceLen,
          type: seg.type,
          color: seg.color
        });
      }
    } else {
      subdivided.push(seg);
    }
  }
  
  const mixOutWindowStart = Math.max(duration / 2, duration - Math.min(180, duration * 0.35));
  let foundOutroDrop = false;
  
  for (let i = 0; i < subdivided.length; i++) {
    const seg = subdivided[i];
    if (seg.start >= mixOutWindowStart && seg.type !== 'chorus') {
      let hasChorusAfter = false;
      for (let j = i + 1; j < subdivided.length; j++) {
        if (subdivided[j].type === 'chorus') {
          hasChorusAfter = true;
          break;
        }
      }
      
      if (!hasChorusAfter) {
        seg.type = 'outro';
        seg.color = getColorForSegmentType('outro');
        for (let j = i + 1; j < subdivided.length; j++) {
           subdivided[j].type = 'outro';
           subdivided[j].color = getColorForSegmentType('outro');
        }
        foundOutroDrop = true;
        break; 
      }
    }
  }
  
  if (!foundOutroDrop && subdivided.length > 0) {
    const forcedPhrases = duration > 300 ? 4 : 2; 
    const forceOutroStart = Math.max(duration / 2, duration - phraseLength * forcedPhrases);
    for (let i = subdivided.length - 1; i >= 0; i--) {
      const seg = subdivided[i];
      if (seg.start >= forceOutroStart) {
        seg.type = 'outro';
        seg.color = getColorForSegmentType('outro');
      }
    }
  }

  return subdivided;
}

self.onmessage = async (e: MessageEvent<{ type?: string, jobId: string, file?: File, filePath?: string, existingId?: string, audioData?: Float32Array, duration?: number, bpm?: number, isPrecomputedPeaks?: boolean }>) => {
  const data = e.data;
  
  if (data.type === 'analyze_waveform') {
    const { jobId, audioData, duration, bpm, isPrecomputedPeaks } = data;
    try {
      if (!audioData || !duration) throw new Error("Missing audio data for waveform analysis");
      
      let peaks: Float32Array;
      if (isPrecomputedPeaks) {
        peaks = audioData;
      } else {
        const numPeaks = 1000;
        const blockSize = Math.floor(audioData.length / numPeaks);
        peaks = new Float32Array(numPeaks);
        
        for (let i = 0; i < numPeaks; i++) {
          let sum = 0;
          const start = i * blockSize;
          const end = start + blockSize;
          for (let j = start; j < end; j++) {
            sum += Math.abs(audioData[j]);
          }
          peaks[i] = sum / blockSize;
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
      }

      // Generate 3-band peaks for coloring (Low, Mid, High interleaved)
      let bandPeaks = new Float32Array(0);
      if (!isPrecomputedPeaks) {
        const numPeaks = 1000;
        const blockSize = Math.floor(audioData.length / numPeaks);
        bandPeaks = new Float32Array(numPeaks * 3);
        
        let lp_y = 0;
        let hp_y = 0;
        let hp_x = 0;
        
        const fs = 44100; // Assume 44.1kHz for roughly accurate cutoff
        // Lowpass Alpha for 250Hz
        const alpha_low = 1 / (1 + fs / (2 * Math.PI * 250));
        // Highpass Alpha for 2.5kHz (Note: formula is 1 / (1 + 2pi*fc/fs))
        const alpha_high = 1 / (1 + (2 * Math.PI * 2500) / fs);
        
        let maxL = 0, maxM = 0, maxH = 0;
        
        for (let i = 0; i < numPeaks; i++) {
          let sumL = 0, sumM = 0, sumH = 0;
          const start = i * blockSize;
          const end = start + blockSize;
          
          for (let j = start; j < end; j++) {
            const sample = audioData[j];
            lp_y += alpha_low * (sample - lp_y);
            hp_y = alpha_high * (hp_y + sample - hp_x);
            hp_x = sample;
            
            const mid = sample - lp_y - hp_y;
            
            sumL += Math.abs(lp_y);
            sumM += Math.abs(mid);
            sumH += Math.abs(hp_y);
          }
          
          bandPeaks[i*3] = sumL / blockSize;
          bandPeaks[i*3 + 1] = sumM / blockSize;
          bandPeaks[i*3 + 2] = sumH / blockSize;
          
          if (bandPeaks[i*3] > maxL) maxL = bandPeaks[i*3];
          if (bandPeaks[i*3+1] > maxM) maxM = bandPeaks[i*3+1];
          if (bandPeaks[i*3+2] > maxH) maxH = bandPeaks[i*3+2];
        }
        
        if (maxL > 0 || maxM > 0 || maxH > 0) {
          for (let i = 0; i < numPeaks; i++) {
            bandPeaks[i*3] /= (maxL || 1);
            bandPeaks[i*3+1] /= (maxM || 1);
            bandPeaks[i*3+2] /= (maxH || 1);
          }
        }
      }

      const segments = analyzeSegmentsLogic(peaks, duration, bpm || 120);
      
      // Feature extraction using Essentia.js WebAssembly
      let mfccs = new Float32Array(0);
      let cens = new Float32Array(0);
      let extractedBpm = bpm;
      let firstBeatOffset = 0;
      let chromaKey = '';
      
      try {
        if (essentia && audioData.length > 0 && !isPrecomputedPeaks) {
          // Downsample or use raw audio data for feature extraction
          // For Essentia, we typically need to convert Float32Array to their vector type
          const audioVector = essentia.arrayToVector(audioData);
          
          try {
            // 1. Spectral Flux / Transient Detection & Periodicity Estimation (BPM)
            // Using PercivalBpmEstimator or RhythmExtractor2013
            const rhythmResult = essentia.RhythmExtractor2013(audioVector);
            if (rhythmResult && rhythmResult.bpm) {
              extractedBpm = rhythmResult.bpm;
              // Get ticks (beat locations in seconds)
              const ticks = essentia.vectorToArray(rhythmResult.ticks);
              
              // 2. Phase Alignment (firstBeatOffset)
              // Look for the first major transient (e.g., kick drum) within the first 15 seconds
              if (ticks && ticks.length > 0) {
                const first15SecTicks = ticks.filter((t: number) => t < 15.0);
                if (first15SecTicks.length > 0) {
                   firstBeatOffset = first15SecTicks[0];
                }
              }
            }
            
            // 3. Harmonic Pitch Class Profile (Chroma / Key Detection)
            // Simplified Key detection
            const keyResult = essentia.KeyExtractor(audioVector);
            if (keyResult && keyResult.key && keyResult.scale) {
               chromaKey = `${keyResult.key} ${keyResult.scale}`;
            }
          } finally {
            // Free WebAssembly memory!
            if (audioVector) {
              audioVector.delete();
            }
          }
          
          // 4. Extract CENS and MFCCs (mocked for now to avoid huge memory allocation until needed)
          // But Essentia can compute these via MFCC and Chromagram CENS algorithms.
          const numFrames = Math.floor(duration * 10);
          mfccs = new Float32Array(numFrames * 13);
          cens = new Float32Array(numFrames * 12);
        }
      } catch (e) {
        console.warn('Essentia.js extraction failed', e);
      }
      
      self.postMessage({ 
        jobId, 
        success: true, 
        peaks, 
        bandPeaks, 
        segments, 
        mfccs, 
        cens,
        firstBeatOffset,
        extractedBpm,
        chromaKey
      }, [mfccs.buffer, cens.buffer]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      self.postMessage({ jobId, success: false, error: errorMessage });
    }
    return;
  }

  // Fallback to existing metadata extraction
  const { jobId, file, filePath, existingId } = data;
  try {
    if (!file) throw new Error("No file provided to worker");

    // Generate our ID hash
    const id = existingId || generateId(filePath || file.name, file.size);
    
    // Check if we need to parse metadata
    const metadata = await mm.parseBlob(file, { duration: true, skipCovers: false });
    
    let albumArt: Blob | undefined;
    if (metadata.common.picture && metadata.common.picture.length > 0) {
      const pic = metadata.common.picture[0];
      albumArt = new Blob([new Uint8Array(pic.data)], { type: pic.format });
    }

    let replayGain: number | undefined = undefined;
    if (metadata.common.replaygain_track_gain !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rg: any = metadata.common.replaygain_track_gain;
      if (typeof rg === 'number') {
        replayGain = rg;
      } else if (typeof rg === 'string') {
        const match = rg.match(/([+-]?[\d.]+)/);
        if (match && match[1]) replayGain = parseFloat(match[1]);
      } else if (rg && typeof rg === 'object' && rg.ratio !== undefined) {
        // Handle music-metadata IRatio type
        replayGain = rg.ratio;
        // If it's something like -6 dB, it might be in description
        if (rg.description && typeof rg.description === 'string') {
          const match = rg.description.match(/([+-]?[\d.]+)/);
          if (match && match[1]) replayGain = parseFloat(match[1]);
        }
      }
    }
    
    const trackMetadata: TrackMetadata = {
      id,
      filePath: filePath || file.name,
      fileName: file.name,
      title: metadata.common.title || file.name.replace(/\.[^/.]+$/, ""),
      artist: metadata.common.artist || "Unknown Artist",
      album: metadata.common.album,
      year: metadata.common.year,
      genre: metadata.common.genre ? metadata.common.genre.join(", ") : undefined,
      bpm: metadata.common.bpm || 120, // Default to 120 if no BPM tag is found
      key: metadata.common.key,
      fileType: metadata.format.container || file.name.split('.').pop()?.toUpperCase(),
      bitrate: metadata.format.bitrate,
      duration: metadata.format.duration || 0,
      replayGain,
      isScanned: true,
      albumArt
    };
    
    self.postMessage({ jobId, success: true, metadata: trackMetadata });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    self.postMessage({ jobId, success: false, error: errorMessage });
  }
};
