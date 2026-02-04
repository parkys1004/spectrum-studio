import { Track, VisualizerSettings, VisualizerMode } from '../types';
import * as Muxer from 'mp4-muxer';
import { 
    drawBars, drawLine, drawCircle, 
    drawFilledWave, drawDualBars, drawRipple, 
    drawPixel, drawEqualizer, drawStarburst, drawButterfly, drawAurora, drawSpectrum
} from '../utils/drawUtils';
import { EffectRenderer } from '../utils/effectRenderer';
import { audioService } from './audioService';
import { GifController } from '../utils/gifUtils';
import { storageService } from './storageService';

// Polyfill definitions for WebCodecs types
declare class AudioEncoder {
  constructor(init: {
    output: (chunk: any, meta: any) => void;
    error: (error: any) => void;
  });
  configure(config: {
    codec: string;
    sampleRate: number;
    numberOfChannels: number;
    bitrate?: number;
  }): void;
  encode(data: AudioData): void;
  flush(): Promise<void>;
  close(): void;
  state: "configured" | "unconfigured" | "closed";
  encodeQueueSize: number;
}

declare class AudioData {
  constructor(init: {
    format: string;
    sampleRate: number;
    numberOfFrames: number;
    numberOfChannels: number;
    timestamp: number;
    data: BufferSource;
  });
  close(): void;
  duration: number; 
}

interface VideoEncoderWithState extends VideoEncoder {
    state: "configured" | "unconfigured" | "closed";
    encodeQueueSize: number;
}

class RenderService {
  private abortController: AbortController | null = null;
  private hasEncoderError = false;

  async renderPlaylist(
    tracks: Track[], 
    visualizerSettings: VisualizerSettings,
    visualizerMode: VisualizerMode,
    resolution: '1080p' | '720p',
    onProgress: (current: number, total: number, phase: string) => void,
    writableStream: FileSystemWritableFileStream | null = null
  ): Promise<{ url: string, filename: string } | null> {
    
    this.abortController = new AbortController();
    this.hasEncoderError = false;
    const signal = this.abortController.signal;

    if (tracks.length === 0) throw new Error("No tracks to render");

    // 1. Load Audio Buffers
    const decodedBuffers: AudioBuffer[] = [];
    onProgress(0, tracks.length, "오디오 리소스 로딩 중...");

    let totalDuration = 0;
    
    // Sequential loading to prevent memory spikes with large files
    for (let i = 0; i < tracks.length; i++) {
        if (signal.aborted) throw new Error("Render Aborted");
        onProgress(i, tracks.length, `오디오 디코딩 중 (${i + 1}/${tracks.length})...`);
        
        let fileToDecode: File | Blob | undefined = tracks[i].file;
        if (!fileToDecode) {
            try {
                const blob = await storageService.getFile(tracks[i].id);
                if (blob) fileToDecode = blob;
            } catch (e) {
                console.warn(`Failed to retrieve file for track ${tracks[i].id}`);
            }
        }

        if (fileToDecode) {
             const buffer = await audioService.getAudioBuffer(fileToDecode, tracks[i].id);
             if (buffer) {
                 decodedBuffers.push(buffer);
                 totalDuration += buffer.duration;
             }
        }
    }

    if (decodedBuffers.length === 0 || totalDuration === 0) {
        throw new Error("렌더링할 유효한 오디오 데이터가 없습니다.");
    }

    // 2. Setup Offline Context
    const sampleRate = 48000;
    const frameCount = Math.ceil(sampleRate * totalDuration);
    if (!frameCount || frameCount <= 0) throw new Error("오디오 길이 계산 오류");

    // Important: Use offline context for faster-than-realtime mixing
    const offlineCtx = new OfflineAudioContext(2, frameCount, sampleRate);
    
    let offset = 0;
    decodedBuffers.forEach(buf => {
        const source = offlineCtx.createBufferSource();
        source.buffer = buf;
        source.connect(offlineCtx.destination);
        source.start(offset);
        offset += buf.duration;
    });

    // 3. Setup Muxer & Encoders
    const width = resolution === '1080p' ? 1920 : 1280;
    const height = resolution === '1080p' ? 1080 : 720;
    const fps = 30;
    
    // Optimization: Adjusted bitrates. 
    // Visualizers compress well (black BG). 12Mbps is overkill. 
    // 8Mbps for 1080p, 4Mbps for 720p is high quality enough and faster to write.
    const bitrate = resolution === '1080p' ? 8_000_000 : 4_000_000; 

    let muxerTarget: any;
    if (writableStream) {
        muxerTarget = new Muxer.FileSystemWritableFileStreamTarget(writableStream);
    } else {
        muxerTarget = new Muxer.ArrayBufferTarget();
    }

    const muxer = new Muxer.Muxer({
        target: muxerTarget,
        video: { codec: 'avc', width, height },
        audio: { codec: 'aac', sampleRate, numberOfChannels: 2 },
        // Use 'in-memory' fastStart for RAM target to ensure MOOV atom is at start (better compatibility)
        // For streaming, we rely on the stream capability.
        fastStart: writableStream ? false : 'in-memory' 
    });

    const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => { 
            console.error("VideoEncoder Error", e); 
            this.hasEncoderError = true; 
        }
    }) as VideoEncoderWithState;

    // Codec Selection Logic
    const is1080p = width > 1280 || height > 720;
    // Main profile (avc1.4d00xx) is widely supported and efficient
    const mainCodec = `avc1.4d002a`; 

    const encoderConfig: any = {
        codec: mainCodec,
        width, 
        height, 
        bitrate, 
        framerate: fps,
        hardwareAcceleration: 'prefer-hardware', // Critical for speed
        bitrateMode: 'variable', // VBR is usually faster and better for visualizers
        latencyMode: 'quality' // 'realtime' might skip frames, 'quality' is better for offline render
    };

    try {
        videoEncoder.configure(encoderConfig);
    } catch (e) {
        console.warn("Preferred config failed, falling back to baseline", e);
        videoEncoder.configure({
            codec: 'avc1.42001f', // Baseline fallback
            width, height, bitrate, framerate: fps,
            hardwareAcceleration: 'no-preference'
        });
    }

    const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => { 
            console.error("AudioEncoder Error", e); 
            this.hasEncoderError = true; 
        }
    });

    audioEncoder.configure({
        codec: 'mp4a.40.2', sampleRate, numberOfChannels: 2, bitrate: 192_000
    });

    // 4. Setup Visualization Environment
    const analyser = offlineCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = visualizerSettings.sensitivity;
    
    offset = 0;
    decodedBuffers.forEach(buf => {
        const source = offlineCtx.createBufferSource();
        source.buffer = buf;
        source.connect(analyser);
        source.start(offset);
        offset += buf.duration;
    });

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { 
        alpha: false, 
        desynchronized: true // Small speedup
    })!;
    
    const effectRenderer = new EffectRenderer();
    effectRenderer.resize(width, height);

    // --- Load Assets (Async) ---
    // Parallelize asset loading
    const [bgBitmap, logoBitmap, stickerBitmapRaw] = await Promise.all([
        visualizerSettings.backgroundImage ? fetch(visualizerSettings.backgroundImage).then(r => r.blob()).then(createImageBitmap).catch(() => null) : Promise.resolve(null),
        visualizerSettings.logoImage ? fetch(visualizerSettings.logoImage).then(r => r.blob()).then(createImageBitmap).catch(() => null) : Promise.resolve(null),
        visualizerSettings.stickerImage ? fetch(visualizerSettings.stickerImage).then(r => r.blob()).catch(() => null) : Promise.resolve(null)
    ]);

    const gifController = new GifController();
    let stickerBitmap: ImageBitmap | null = null;
    
    if (visualizerSettings.stickerImage && stickerBitmapRaw) {
        try {
            // Re-create blob URL if needed or pass blob directly if GifController supported it (it expects string url currently)
             await gifController.load(visualizerSettings.stickerImage);
             if(!gifController.isLoaded) {
                 stickerBitmap = await createImageBitmap(stickerBitmapRaw);
             }
        } catch(e) {}
    }

    // 5. Render Processor
    const totalFrames = Math.ceil(totalDuration * fps);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    // Queue limits for backpressure
    const ENCODE_QUEUE_HIGH_WATER_MARK = 30; 
    const ENCODE_QUEUE_LOW_WATER_MARK = 10;
    let startTime = 0;

    const renderSpectrum = (context: OffscreenCanvasRenderingContext2D, w: number, h: number) => {
         switch (visualizerMode) {
            case VisualizerMode.BARS: drawBars(context, dataArray, dataArray.length, w, h, visualizerSettings); break;
            case VisualizerMode.WAVE: drawLine(context, dataArray, dataArray.length, w, h, visualizerSettings); break;
            case VisualizerMode.CIRCULAR: drawCircle(context, dataArray, dataArray.length, w, h, visualizerSettings); break;
            case VisualizerMode.FILLED: drawFilledWave(context, dataArray, dataArray.length, w, h, visualizerSettings); break;
            case VisualizerMode.DUAL_BARS: drawDualBars(context, dataArray, dataArray.length, w, h, visualizerSettings); break;
            case VisualizerMode.RIPPLE: drawRipple(context, dataArray, dataArray.length, w, h, visualizerSettings); break;
            case VisualizerMode.PIXEL: drawPixel(context, dataArray, dataArray.length, w, h, visualizerSettings); break;
            case VisualizerMode.EQUALIZER: drawEqualizer(context, dataArray, dataArray.length, w, h, visualizerSettings); break;
            case VisualizerMode.STARBURST: drawStarburst(context, dataArray, dataArray.length, w, h, visualizerSettings); break;
            case VisualizerMode.BUTTERFLY: drawButterfly(context, dataArray, dataArray.length, w, h, visualizerSettings); break;
            case VisualizerMode.AURORA: drawAurora(context, dataArray, dataArray.length, w, h, visualizerSettings); break;
            case VisualizerMode.SPECTRUM: drawSpectrum(context, dataArray, dataArray.length, w, h, visualizerSettings); break;
            default: drawBars(context, dataArray, dataArray.length, w, h, visualizerSettings);
         }
    };

    try {
        const processFrame = async (i: number) => {
            if (signal.aborted || this.hasEncoderError) return;

            // --- Backpressure Control (Wait for GPU to catch up) ---
            if (videoEncoder.encodeQueueSize > ENCODE_QUEUE_HIGH_WATER_MARK) {
                // Poll until queue drops below low water mark
                await new Promise<void>(resolve => {
                    const check = () => {
                        if (videoEncoder.encodeQueueSize < ENCODE_QUEUE_LOW_WATER_MARK) resolve();
                        else setTimeout(check, 5); // 5ms poll
                    };
                    check();
                });
            }
            
            // UI Update Throttling
            if (i % 30 === 0) { // Update more frequently (every 1s of video)
                const elapsed = (performance.now() - startTime) / 1000;
                let speedInfo = "";
                if (elapsed > 1.0) {
                    const processedDuration = i / fps;
                    const speed = (processedDuration / elapsed).toFixed(1);
                    speedInfo = ` (🚀 x${speed})`;
                }
                const percent = Math.round((i/totalFrames)*100);
                onProgress(i, totalFrames, `렌더링 중... ${percent}%${speedInfo}`);
                
                // Yield to event loop to keep UI responsive
                await new Promise(r => setTimeout(r, 0));
            }

            // --- Audio Analysis ---
            const time = i / fps;
            // Note: We use suspend() on offlineCtx to get data at specific times.
            // Frequency data depends on where the context playhead is.
            // Since we are stepping offlineCtx manually, getByteFrequencyData works correctly for that timestamp.

            if (visualizerMode === VisualizerMode.WAVE || visualizerMode === VisualizerMode.FILLED) {
                analyser.getByteTimeDomainData(dataArray);
            } else {
                analyser.getByteFrequencyData(dataArray);
            }

            // Beat Detection
            let bassEnergy = 0;
            if (visualizerMode !== VisualizerMode.WAVE && visualizerMode !== VisualizerMode.FILLED) {
                // Optimization: Unroll loop for small iteration
                bassEnergy = (dataArray[0] + dataArray[1] + dataArray[2] + dataArray[3] + dataArray[4]) / 5;
            } else {
                let sum = 0;
                // Sample down for beat detection speed
                const step = 4;
                for(let k=0; k<dataArray.length; k+=step) sum += Math.abs(dataArray[k] - 128);
                bassEnergy = (sum / (dataArray.length/step)) * 2; 
            }
            const isBeat = bassEnergy > 200;
            
            // --- Logic Update ---
            effectRenderer.update(isBeat, bassEnergy, visualizerSettings.effectParams);

            // --- Drawing ---
            // Clear with opaque black (faster than clearRect + fill)
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);
            
            ctx.save();

            // Global Transformations
            if (visualizerSettings.effects.shake && isBeat) {
                const s = visualizerSettings.effectParams.shakeStrength || 1;
                ctx.translate((Math.random()-0.5)*20*s, (Math.random()-0.5)*20*s);
            }
            if (visualizerSettings.effects.pulse) {
                 const zoom = 1.0 + (bassEnergy/255)*0.1;
                 ctx.translate(width/2, height/2);
                 ctx.scale(zoom, zoom);
                 ctx.translate(-width/2, -height/2);
            }

            // Background
            if (bgBitmap) {
                 const r = bgBitmap.width / bgBitmap.height;
                 const cr = width / height;
                 let dw, dh, ox, oy;
                 if (cr > r) { dw = width; dh = width/r; ox=0; oy=(height-dh)/2; }
                 else { dw = height*r; dh = height; ox=(width-dw)/2; oy=0; }
                 ctx.drawImage(bgBitmap, ox, oy, dw, dh);
                 ctx.fillStyle = 'rgba(0,0,0,0.3)';
                 ctx.fillRect(0,0,width,height);
            }

            // Spectrum
            ctx.save();
            ctx.translate(width/2, height/2);
            ctx.translate(visualizerSettings.positionX, visualizerSettings.positionY);
            ctx.scale(visualizerSettings.scale, visualizerSettings.scale);
            
            if (visualizerSettings.effects.mirror) {
                ctx.save(); 
                ctx.translate(0, -height/2); 
                renderSpectrum(ctx, width / 2, height);
                ctx.restore();
                
                ctx.save(); 
                ctx.scale(-1, 1); 
                ctx.translate(0, -height/2); 
                ctx.globalCompositeOperation = 'screen'; 
                renderSpectrum(ctx, width / 2, height);
                ctx.restore();
            } else {
                ctx.translate(-width/2, -height/2);
                renderSpectrum(ctx, width, height);
            }
            ctx.restore();

            // Logo
            if (logoBitmap) {
                const base = Math.min(width,height)*0.15;
                const dw = base * visualizerSettings.logoScale;
                const dh = dw / (logoBitmap.width/logoBitmap.height);
                const x = (width-dw)*(visualizerSettings.logoX/100);
                const y = (height-dh)*(visualizerSettings.logoY/100);
                ctx.globalAlpha = 0.9;
                ctx.drawImage(logoBitmap, x, y, dw, dh);
                ctx.globalAlpha = 1.0;
            }

            // Sticker
            let sImg = gifController.isLoaded ? gifController.getFrame(time*1000) as ImageBitmap : stickerBitmap;
            if (sImg) {
                const base = Math.min(width,height)*0.15;
                const dw = base * visualizerSettings.stickerScale;
                const dh = dw / (sImg.width/sImg.height);
                const x = (width-dw)*(visualizerSettings.stickerX/100);
                const y = (height-dh)*(visualizerSettings.stickerY/100);
                ctx.drawImage(sImg, x, y, dw, dh);
            }

            effectRenderer.draw(ctx, visualizerSettings.effects);

            // Glitch Effect (Post-processing)
            if (visualizerSettings.effects.glitch && isBeat) {
                const glStr = visualizerSettings.effectParams.glitchStrength || 1.0;
                const sliceHeight = Math.random() * 50 + 10;
                const sliceY = Math.random() * height;
                const offset = (Math.random() - 0.5) * 40 * glStr;
                try {
                    ctx.drawImage(canvas, 0, sliceY, width, sliceHeight, offset, sliceY, width, sliceHeight);
                    ctx.fillStyle = `rgba(255, 0, 0, ${0.2 * glStr})`;
                    ctx.fillRect(0, sliceY, width, 5);
                } catch(e) {}
            }

            ctx.restore(); 

            // Create VideoFrame
            // NOTE: 'duration' is optional but helpful for the encoder
            const frame = new VideoFrame(canvas, { 
                timestamp: i * (1_000_000 / fps),
                duration: 1_000_000 / fps
            });
            
            try {
                // Keyframe insertion: Every 2 seconds (60 frames)
                const keyFrame = i % 60 === 0;
                videoEncoder.encode(frame, { keyFrame });
            } catch(e) {
                console.error("Frame encoding failed", e);
                this.hasEncoderError = true;
            }
            frame.close();

            // Scheduling
            // To ensure AnalyserNode has correct data, we must advance the OfflineAudioContext
            if (i + 1 < totalFrames) {
                const nextTime = (i + 1) / fps;
                // suspend() allows us to pause rendering at a specific time, 
                // read the analyser data, draw the frame, then resume.
                offlineCtx.suspend(nextTime)
                    .then(() => processFrame(i + 1))
                    .catch(err => console.warn("Suspend scheduling failed:", err));
            }

            try {
                offlineCtx.resume();
            } catch(e) {
                // Resume might fail if context is already closed or running, ignore safely
            }
        };

        // --- Start Rendering Loop ---
        startTime = performance.now();
        onProgress(0, totalFrames, "영상 프레임 렌더링 중...");

        // Kickoff
        offlineCtx.suspend(0).then(() => processFrame(0));
        
        // This promise resolves when the *Audio* rendering is fully complete.
        // The processFrame recursion handles the Video/Canvas part in sync with the audio clock.
        const renderedBuffer = await offlineCtx.startRendering();

        // --- Finalization ---
        onProgress(totalFrames, totalFrames, "비디오 인코딩 정리 중 (Finalizing)...");
        
        if (!this.hasEncoderError) {
             await videoEncoder.flush();
        }
        videoEncoder.close();

        onProgress(totalFrames, totalFrames, "오디오 트랙 병합 및 저장 중...");
        
        // Encode Audio
        const interleavedAudio = this.interleaveAudio(renderedBuffer);
        const audioData = new AudioData({
            format: 'f32', 
            sampleRate,
            numberOfFrames: renderedBuffer.length,
            numberOfChannels: 2,
            timestamp: 0,
            data: interleavedAudio
        });
        
        if (!this.hasEncoderError) {
             audioEncoder.encode(audioData);
             audioData.close();
             await audioEncoder.flush();
        }
        audioEncoder.close();

        muxer.finalize();

        // Cleanup
        if(bgBitmap) bgBitmap.close();
        if(logoBitmap) logoBitmap.close();
        if(stickerBitmap) stickerBitmap.close();
        gifController.dispose();

        // Return Result
        if (writableStream) {
            return null;
        }

        const { buffer } = (muxer.target as Muxer.ArrayBufferTarget);
        const blob = new Blob([buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        return { url, filename: `SpectrumStudio_Export_${Date.now()}.mp4` };

    } catch (e) {
        console.error("Rendering Process Failed", e);
        throw e;
    }
  }

  // Optimized Audio Interleaving
  private interleaveAudio(buffer: AudioBuffer): Float32Array {
      const numChannels = buffer.numberOfChannels;
      const length = buffer.length;
      const result = new Float32Array(length * numChannels);
      
      // Get all channel data pointers first to avoid method calls in loop
      const channels = [];
      for(let i=0; i<numChannels; i++) channels.push(buffer.getChannelData(i));

      // Standard interleaving: [L, R, L, R...]
      // Optimized for write locality
      let ptr = 0;
      for (let i = 0; i < length; i++) {
          for (let ch = 0; ch < numChannels; ch++) {
              result[ptr++] = channels[ch][i];
          }
      }
      return result;
  }

  cancel() {
      if (this.abortController) this.abortController.abort();
  }
}

export const renderService = new RenderService();