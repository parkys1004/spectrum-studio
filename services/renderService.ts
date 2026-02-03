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
    onProgress: (current: number, total: number, phase: string) => void
  ): Promise<{ url: string, filename: string }> {
    
    this.abortController = new AbortController();
    this.hasEncoderError = false;
    const signal = this.abortController.signal;

    if (tracks.length === 0) throw new Error("No tracks to render");

    // 1. Load Audio Buffers
    const decodedBuffers: AudioBuffer[] = [];
    onProgress(0, tracks.length, "오디오 리소스 로딩 중...");

    let totalDuration = 0;
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

    if (decodedBuffers.length === 0) throw new Error("렌더링할 오디오 데이터가 없습니다.");

    // 2. Setup Offline Context
    const sampleRate = 48000;
    const offlineCtx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalDuration), sampleRate);
    
    // Schedule tracks sequentially
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
    // Slight increase in bitrate for 1080p to compensate for faster encoding profiles
    const bitrate = resolution === '1080p' ? 12_000_000 : 6_000_000; 

    const muxer = new Muxer.Muxer({
        target: new Muxer.ArrayBufferTarget(),
        video: { codec: 'avc', width, height },
        audio: { codec: 'aac', sampleRate, numberOfChannels: 2 },
        fastStart: 'in-memory'
    });

    const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => { 
            console.error("VideoEncoder Error", e); 
            this.hasEncoderError = true; 
        }
    }) as VideoEncoderWithState;

    // OPTIMIZATION: Use Baseline profile for speed and prefer hardware acceleration.
    // Dynamic Level Selection:
    // Level 3.1 (1f) -> max 1280x720 @ 30fps
    // Level 4.2 (2a) -> max 1920x1080 @ 60fps
    const is1080p = width > 1280 || height > 720;
    const codecLevel = is1080p ? '2a' : '1f';
    const baselineCodec = `avc1.4200${codecLevel}`;
    const mainCodec = `avc1.4d00${codecLevel}`; // Fallback

    const encoderConfig: any = {
        codec: baselineCodec, // Baseline Profile
        width, 
        height, 
        bitrate, 
        framerate: fps,
        hardwareAcceleration: 'prefer-hardware', // FORCE HARDWARE
        bitrateMode: 'constant', // CBR is often faster/predictable
        latencyMode: 'realtime' // Hint for speed
    };

    try {
        videoEncoder.configure(encoderConfig);
    } catch (e) {
        console.warn("Hardware/Baseline config failed, falling back to standard config", e);
        videoEncoder.configure({
            codec: mainCodec, // Main Profile Fallback
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
    
    // Re-schedule tracks for analyser (separate connection)
    offset = 0;
    decodedBuffers.forEach(buf => {
        const source = offlineCtx.createBufferSource();
        source.buffer = buf;
        source.connect(analyser);
        source.start(offset);
        offset += buf.duration;
    });

    const canvas = new OffscreenCanvas(width, height);
    // OPTIMIZATION: alpha: false and desynchronized: true for faster blitting
    const ctx = canvas.getContext('2d', { 
        alpha: false, 
        desynchronized: true,
        willReadFrequently: false // We are writing mostly
    })!;
    
    const effectRenderer = new EffectRenderer();
    effectRenderer.resize(width, height);

    // --- Load Assets (Async) ---
    let bgBitmap: ImageBitmap | null = null;
    if (visualizerSettings.backgroundImage) {
        try {
            const r = await fetch(visualizerSettings.backgroundImage);
            bgBitmap = await createImageBitmap(await r.blob());
        } catch(e) {}
    }
    
    let logoBitmap: ImageBitmap | null = null;
    if (visualizerSettings.logoImage) {
        try {
            const r = await fetch(visualizerSettings.logoImage);
            logoBitmap = await createImageBitmap(await r.blob());
        } catch(e) {}
    }

    const gifController = new GifController();
    let stickerBitmap: ImageBitmap | null = null;
    if (visualizerSettings.stickerImage) {
        try {
            await gifController.load(visualizerSettings.stickerImage);
            if(!gifController.isLoaded) {
                 const r = await fetch(visualizerSettings.stickerImage);
                 stickerBitmap = await createImageBitmap(await r.blob());
            }
        } catch(e) {}
    }

    // 5. Render Processor (Lookahead Scheduling)
    const totalFrames = Math.ceil(totalDuration * fps);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    // LOOKAHEAD: Increase buffer to ensure we always have work ready for the GPU
    const LOOKAHEAD = 30; 
    
    // Track start time for speed calculation
    let startTime = 0;

    // Modified to accept dimensions exactly like Visualizer.tsx
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

            // OPTIMIZATION: Backpressure Check
            if (videoEncoder.encodeQueueSize > 60) {
                await new Promise(r => setTimeout(r, 1));
            }
            
            // OPTIMIZATION: Yield to UI less frequently
            if (i % 120 === 0) {
                const elapsed = (performance.now() - startTime) / 1000;
                let speedInfo = "";
                if (elapsed > 1.0) {
                    const processedDuration = i / fps;
                    const speed = (processedDuration / elapsed).toFixed(1);
                    speedInfo = ` (🚀 x${speed} 배속)`;
                }
                onProgress(i, totalFrames, `렌더링 진행률 ${Math.round((i/totalFrames)*100)}%${speedInfo}`);
                await new Promise(r => setTimeout(r, 0));
            }

            // --- Analysis ---
            const time = i / fps;
            if (visualizerMode === VisualizerMode.WAVE || visualizerMode === VisualizerMode.FILLED) {
                analyser.getByteTimeDomainData(dataArray);
            } else {
                analyser.getByteFrequencyData(dataArray);
            }

            let bassEnergy = 0;
            if (visualizerMode !== VisualizerMode.WAVE && visualizerMode !== VisualizerMode.FILLED) {
                for(let k=0; k<10; k++) bassEnergy += dataArray[k];
                bassEnergy /= 10;
            } else {
                let sum = 0;
                for(let k=0; k<dataArray.length; k++) sum += Math.abs(dataArray[k] - 128);
                bassEnergy = (sum / dataArray.length) * 2; 
            }
            const isBeat = bassEnergy > 200;
            effectRenderer.update(isBeat, bassEnergy, visualizerSettings.effectParams);

            // --- Drawing ---
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);
            ctx.save();

            // Effect: Shake
            if (visualizerSettings.effects.shake && isBeat) {
                const s = visualizerSettings.effectParams.shakeStrength || 1;
                ctx.translate((Math.random()-0.5)*20*s, (Math.random()-0.5)*20*s);
            }
            // Effect: Pulse
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

            // Visualizer Spectrum - Exact Logic Mirroring Visualizer.tsx
            ctx.save();
            ctx.translate(width/2, height/2);
            ctx.translate(visualizerSettings.positionX, visualizerSettings.positionY);
            ctx.scale(visualizerSettings.scale, visualizerSettings.scale);
            
            if (visualizerSettings.effects.mirror) {
                // Draw Left Half
                ctx.save(); 
                ctx.translate(0, -height/2); 
                renderSpectrum(ctx, width / 2, height); // Pass width/2 to match Visualizer.tsx
                ctx.restore();
                
                // Draw Right Half (Mirrored)
                ctx.save(); 
                ctx.scale(-1, 1); 
                ctx.translate(0, -height/2); 
                ctx.globalCompositeOperation = 'screen'; 
                renderSpectrum(ctx, width / 2, height); // Pass width/2 to match Visualizer.tsx
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

            // Sticker / GIF
            let sImg = gifController.isLoaded ? gifController.getFrame(time*1000) as ImageBitmap : stickerBitmap;
            if (sImg) {
                const base = Math.min(width,height)*0.15;
                const dw = base * visualizerSettings.stickerScale;
                const dh = dw / (sImg.width/sImg.height);
                const x = (width-dw)*(visualizerSettings.stickerX/100);
                const y = (height-dh)*(visualizerSettings.stickerY/100);
                ctx.drawImage(sImg, x, y, dw, dh);
            }

            // Particle Effects
            effectRenderer.draw(ctx, visualizerSettings.effects);

            // Glitch Effect
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

            // Encode Video Frame
            const frame = new VideoFrame(canvas, { timestamp: i * (1_000_000 / fps) });
            try {
                videoEncoder.encode(frame, { keyFrame: i % 60 === 0 });
            } catch(e) {
                console.error("Frame encoding failed", e);
                this.hasEncoderError = true;
            }
            frame.close();

            // CRITICAL: LOOKAHEAD SCHEDULING
            if (i + LOOKAHEAD < totalFrames) {
                const nextTime = (i + LOOKAHEAD) / fps;
                offlineCtx.suspend(nextTime)
                    .then(() => processFrame(i + LOOKAHEAD))
                    .catch(err => console.warn("Suspend scheduling failed, possibly finished:", err));
            }

            // Advance Context
            try {
                offlineCtx.resume();
            } catch(e) {
                // Ignore resume errors at the very end
            }
        };

        // --- Execution Start ---
        startTime = performance.now();
        onProgress(0, totalFrames, "영상 프레임 렌더링 중...");

        // 1. Initial Schedule: Queue up the first few frames (Lookahead buffer)
        const initLimit = Math.min(totalFrames, LOOKAHEAD);
        for (let i = 0; i < initLimit; i++) {
            offlineCtx.suspend(i / fps)
                .then(() => processFrame(i))
                .catch(err => console.warn("Initial suspend failed:", err));
        }

        // 2. Start Audio Engine
        const renderedBuffer = await offlineCtx.startRendering();

        // 3. Audio Completed - Finalize
        // At this point, audio mixing is DONE. We are waiting for Video Encoder to flush.
        onProgress(totalFrames, totalFrames, "비디오 인코딩 정리 중 (Finalizing)...");
        
        if (!this.hasEncoderError) {
             await videoEncoder.flush();
        } else {
             console.warn("Skipping flush due to encoder error, finalizing partial video.");
        }
        videoEncoder.close();

        onProgress(totalFrames, totalFrames, "최종 파일 생성 중...");
        
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

        const { buffer } = muxer.target;
        const blob = new Blob([buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        
        return { url, filename: `SpectrumStudio_Export_${Date.now()}.mp4` };

    } catch (e) {
        console.error("Rendering Process Failed", e);
        throw e;
    }
  }

  // Helper: Interleave Audio (Planar LLLL RRRR -> Interleaved LRLRLRLR)
  private interleaveAudio(buffer: AudioBuffer): Float32Array {
      const numChannels = buffer.numberOfChannels;
      const length = buffer.length;
      const result = new Float32Array(length * numChannels);
      
      for (let i = 0; i < numChannels; i++) {
          const channelData = buffer.getChannelData(i);
          for (let j = 0; j < length; j++) {
              result[j * numChannels + i] = channelData[j];
          }
      }
      return result;
  }

  cancel() {
      if (this.abortController) this.abortController.abort();
  }
}

export const renderService = new RenderService();