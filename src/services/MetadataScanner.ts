import { db } from './Database';
import type { TrackMetadata } from '../types/mixer';
import type { FileSystemFileHandle } from './FileManager';

export interface WaveformAnalysisResult {
  peaks: Float32Array;
  bandPeaks?: Float32Array;
  segments: import('../types/mixer').TrackSegment[];
  mfccs?: Float32Array;
  cens?: Float32Array;
}

interface ScanJob {
  jobId: string;
  type?: string;
  fileHandle?: FileSystemFileHandle;
  filePath?: string;
  rawFile?: File;
  existingId?: string;
  audioData?: Float32Array;
  duration?: number;
  bpm?: number;
  isPrecomputedPeaks?: boolean;
  resolve: (value: TrackMetadata & WaveformAnalysisResult) => void;
  reject: (reason?: unknown) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
}

class MetadataScanner {
  private worker: Worker;
  private queue: ScanJob[] = [];
  private activeJobs = new Map<string, ScanJob>();
  private isProcessing = false;
  private jobCounter = 0;
  // Maximum number of concurrent jobs sent to the worker
  private readonly MAX_CONCURRENT = 1;
  public DEBUG_MODE = false;

  constructor() {
    this.worker = new Worker(new URL('../workers/metadata.worker.ts', import.meta.url), {
      type: 'module'
    });

    this.worker.onmessage = this.handleWorkerMessage.bind(this);
    this.worker.onerror = this.handleWorkerError.bind(this);
  }

  private async handleWorkerMessage(e: MessageEvent) {
    const { jobId, success, metadata, peaks, bandPeaks, segments, mfccs, cens, error } = e.data;
    const job = this.activeJobs.get(jobId);
    
    if (job) {
      if (job.timeoutId) clearTimeout(job.timeoutId);
      this.activeJobs.delete(jobId);
      
      if (success) {
        if (job.type === 'analyze_waveform') {
          job.resolve({ peaks, bandPeaks, segments, mfccs, cens } as unknown as TrackMetadata & WaveformAnalysisResult);
        } else if (metadata) {
          try {
            // Save to IndexedDB
            const dbMetadata = { ...metadata };
            if (job.fileHandle) {
              dbMetadata.fileHandle = job.fileHandle;
            }
            // We don't want to store DOM nodes in IDB, but the worker doesn't return them anyway
            await db.tracks.put(dbMetadata);

            // Reattach handles for React UI memory
            metadata.fileHandle = job.fileHandle;
            metadata.rawFile = job.rawFile;

            job.resolve(metadata);
          } catch (dbError) {
            console.error("Failed to save metadata to DB:", dbError);
            job.reject(dbError);
          }
        }
      } else {
        job.reject(new Error(error || 'Worker parsing failed'));
      }
    }

    this.processNext();
  }

  private handleWorkerError(error: ErrorEvent) {
    console.error("Metadata worker error:", error);
    // On hard crash, reject all active jobs
    for (const [jobId, job] of this.activeJobs.entries()) {
      if (job.timeoutId) clearTimeout(job.timeoutId);
      job.reject(new Error("Worker crashed"));
      this.activeJobs.delete(jobId);
    }
    
    // Re-create the worker
    this.worker.terminate();
    this.worker = new Worker(new URL('../workers/metadata.worker.ts', import.meta.url), {
      type: 'module'
    });
    this.worker.onmessage = this.handleWorkerMessage.bind(this);
    this.worker.onerror = this.handleWorkerError.bind(this);
    
    this.processNext();
  }

  private processNext() {
    if (this.queue.length === 0 || this.activeJobs.size >= this.MAX_CONCURRENT) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const job = this.queue.shift();
    if (job) {
      this.activeJobs.set(job.jobId, job);
      
      const executeJob = async () => {
        if (this.DEBUG_MODE) console.log(`[Queue] Starting execution for job ${job.jobId}`);
        try {
          if (job.type === 'analyze_waveform') {
            job.timeoutId = setTimeout(() => {
              job.reject(new Error("Worker timed out while analyzing waveform"));
              this.activeJobs.delete(job.jobId);
              this.worker.terminate();
              this.worker = new Worker(new URL('../workers/metadata.worker.ts', import.meta.url), { type: 'module' });
              this.worker.onmessage = this.handleWorkerMessage.bind(this);
              this.worker.onerror = this.handleWorkerError.bind(this);
              this.processNext();
            }, 30000); // Allow more time for large waveforms

            // Copy data and transfer it to avoid main thread stall
            const clonedAudio = new Float32Array(job.audioData!);
            this.worker.postMessage({
              type: 'analyze_waveform',
              jobId: job.jobId,
              audioData: clonedAudio,
              duration: job.duration,
              bpm: job.bpm,
              isPrecomputedPeaks: job.isPrecomputedPeaks
            }, [clonedAudio.buffer]);
            return;
          }

          if (this.DEBUG_MODE) console.log(`[Queue] Awaiting fileHandle.getFile() for ${job.filePath}`);
          const file = job.rawFile || (job.fileHandle ? await job.fileHandle.getFile() : null);
          if (this.DEBUG_MODE) console.log(`[Queue] getFile() complete for ${job.filePath}. File object valid: ${!!file}`);
          
          if (!file) {
            throw new Error("No file or file handle provided");
          }

          if (this.DEBUG_MODE) console.log(`[Queue] Setting watchdog timeout for ${job.jobId}`);
          job.timeoutId = setTimeout(() => {
            if (this.DEBUG_MODE) console.error(`[Queue] WATCHDOG TIMEOUT FIRED for job ${job.jobId}`);
            job.reject(new Error("Worker timed out while scanning file"));
            this.activeJobs.delete(job.jobId);
            
            this.worker.terminate();
            this.worker = new Worker(new URL('../workers/metadata.worker.ts', import.meta.url), { type: 'module' });
            this.worker.onmessage = this.handleWorkerMessage.bind(this);
            this.worker.onerror = this.handleWorkerError.bind(this);
            
            this.processNext();
          }, 10000);

          if (this.DEBUG_MODE) console.log(`[Queue] Posting message to worker for ${job.jobId}`);
          this.worker.postMessage({
            jobId: job.jobId,
            file: file,
            filePath: job.filePath,
            existingId: job.existingId
          });
        } catch (error) {
          if (this.DEBUG_MODE) console.error("[Queue] Execution error for job:", job.jobId, error);
          job.reject(error);
          this.activeJobs.delete(job.jobId);
          this.processNext();
        }
      };

      executeJob();
      
      // Attempt to start another one if max concurrent allows
      this.processNext();
    }
  }

  public async analyzeWaveform(peaksOrAudio: Float32Array, duration: number, bpm: number, isPrecomputedPeaks = false): Promise<WaveformAnalysisResult> {
    return new Promise((resolve, reject) => {
      this.jobCounter = (this.jobCounter + 1) % 1000000;
      const jobId = `job_wf_${Date.now()}_${this.jobCounter}`;

      this.queue.push({
        jobId,
        type: 'analyze_waveform',
        audioData: peaksOrAudio,
        duration,
        bpm,
        isPrecomputedPeaks,
        // We'll pack the flag onto the job object or just handle it. We can add a property to the job.
        resolve: resolve as unknown as (value: TrackMetadata & WaveformAnalysisResult) => void,
        reject
      });
      // Need to add `isPrecomputedPeaks` to the job. Let's do that cleanly.

      this.processNext();
    });
  }

  public async scanFileHandle(fileHandle?: FileSystemFileHandle, filePath?: string, rawFile?: File, existingId?: string): Promise<TrackMetadata> {
    return new Promise((resolve, reject) => {
      this.jobCounter = (this.jobCounter + 1) % 1000000;
      const jobId = `job_${Date.now()}_${this.jobCounter}`;

      this.queue.push({
        jobId,
        fileHandle,
        filePath,
        rawFile,
        existingId,
        resolve,
        reject
      });

      if (!this.isProcessing || this.activeJobs.size < this.MAX_CONCURRENT) {
        this.processNext();
      }
    });
  }
}

export const metadataScanner = new MetadataScanner();
