// @ts-nocheck
import { Track, VisualizerSettings, VisualizerMode } from '../types';
// @ts-ignore
import * as Muxer from 'mp4-muxer';
import { 
    drawBars, drawLine, drawCircle, 
    drawDualBars, drawRipple, 
    drawPixel, drawEqualizer, drawStarburst, drawButterfly, drawAurora, drawSpectrum, drawDotWave, drawLedBars,
    drawFluid, drawParticleSpectrum, drawJellyWave, drawPulseCircles, drawFlowerPetals
} from '../utils/drawUtils';
import { EffectRenderer } from '../utils/effectRenderer';
import { audioService } from './audioService';
import { GifController } from '../utils/gifUtils';
import { storageService } from './storageService';

// --- VERCEL BUILD FIX START ---
// TypeScript compiler may fail if these types are not known in the build environment.
// We explicitly declare them here to bypass build errors.

declare class VideoFrame {
  constructor(image: CanvasImageSource, init?: { timestamp: number; duration?: number });
  close(): void;
  readonly timestamp: number;
  readonly duration: number | null;
  readonly displayWidth: number;
  readonly displayHeight: number;
}

declare class VideoEncoder {
  constructor(init: {
    output: (chunk: any, meta: any) => void;
    error: (error: any) => void;
  });
  configure(config: {
    codec: string;
    width: number;
    height: number;
    bitrate?: number;
    framerate?: number;
    hardwareAcceleration?: 'no-preference' | 'prefer-hardware' | 'prefer-software';
    avc?: { format: string };
  }): void;
  encode(frame: VideoFrame, options?: { keyFrame: boolean }): void;
  flush(): Promise<void>;
  close(): void;
  readonly state: "configured" | "unconfigured" | "closed";
  readonly encodeQueueSize: number;
}

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
  readonly state: "configured" | "unconfigured" | "closed";
  readonly encodeQueueSize: number;
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
  readonly duration: number; 
}
// --- VERCEL BUILD FIX END ---

interface VideoEncoderWithState extends VideoEncoder {
    state: "configured" | "unconfigured" | "closed";
    encodeQueueSize: number;
}

class RenderService {
  private abortController: AbortController | null = null;
  private hasEncoderError = false;

  // Helper to wait for encoder queue to drain (Backpressure)
  private async waitForQueue(encoder: { encodeQueueSize: number }, limit: number) {
      if (encoder.encodeQueueSize > limit) {
          await new Promise<void>(resolve => {
              const checkInterval = setInterval(() => {
                  if (encoder.encodeQueueSize < limit / 2) {
                      clearInterval(checkInterval);
                      resolve();
                  }
              }, 10);
          });
      }
  }

  async renderPlaylist(
    tracks: Track[], 
    visualizerSettings: VisualizerSettings,
    visualizerMode: VisualizerMode | null,
    resolution: '1080p' | '720p',
    onProgress: (current: number, total: number, phase: string) => void
  ): Promise<{ url: string, filename: string } | null> {
    
    this.abortController = new AbortController();
    this.hasEncoderError = false;
    const signal = this.abortController.signal;

    // Safety check for Muxer
    if (typeof Muxer === 'undefined' && !(window as any).Muxer) {
         throw new Error("MP4 Muxer 라이브러리가 로드되지 않았습니다. 네트워크 상태를 확인하거나 새로고침 해주세요.");
    }

    if (tracks.length === 0) throw new Error("No tracks to render");

    // 1. Load Audio Buffers (Parallelized Batch Loading)
    const decodedBuffers: (AudioBuffer | null)[] = new Array(tracks.length).fill(null);
    let totalDuration = 0;
    
    const BATCH_SIZE = 4; // Process 4 tracks at a time
    let processedCount = 0;

    onProgress(0, tracks.length, "오디오 리소스 분석 중...");

    for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
        if (signal.aborted) throw new Error("Render Aborted");

        const batch = tracks.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (track, batchIndex) => {
            const globalIndex = i + batchIndex;
            let fileToDecode = track.file;
            
            if (!fileToDecode) {
                try {
                    const blob = await storageService.getFile(track.id);
                    if (blob) fileToDecode = blob;
                } catch (e) {
                    console.warn(`Failed to retrieve file for track ${track.id}`);
                }
            }

            if (fileToDecode) {
                 try {
                    const buffer = await audioService.getAudioBuffer(fileToDecode, track.id);
                    if (buffer) {
                        decodedBuffers[globalIndex] = buffer;
                    }
                 } catch(e) {
                     console.error(`Error decoding track ${track.name}`, e);
                 }
            }
        });

        await Promise.all(batchPromises);
        processedCount += batch.length;
        onProgress(Math.min(processedCount, tracks.length), tracks.length, `오디오 고속 디코딩 중 (${Math.min(processedCount, tracks.length)}/${tracks.length})...`);
    }

    // Filter out failed decodes and calculate duration
    const validBuffers = decodedBuffers.filter((b): b is AudioBuffer => b !== null);
    totalDuration = validBuffers.reduce((acc, b) => acc + b.duration, 0);

    if (validBuffers.length === 0 || totalDuration === 0) {
        throw new Error("렌더링할 유효한 오디오 데이터가 없습니다.");
    }

    // 2. Setup Offline Context
    const sampleRate = 44100;
    const frameCount = Math.ceil(sampleRate * totalDuration);
    
    if (totalDuration > 3600) {
        throw new Error("총 재생 시간이 너무 깁니다. 1시간 이내로 트랙을 구성해주세요.");
    }

    let offlineCtx: OfflineAudioContext;
    try {
        offlineCtx = new OfflineAudioContext(2, frameCount, sampleRate);
    } catch (e) {
        throw new Error("메모리 부족으로 오디오 처리를 시작할 수 없습니다. 트랙 수를 줄여 다시 시도해주세요.");
    }
    
    let offset = 0;
    validBuffers.forEach(buf => {
        const source = offlineCtx.createBufferSource();
        source.buffer = buf;
        source.connect(offlineCtx.destination);
        source.start(offset);
        offset += buf.duration;
    });

    // 3. Setup Muxer & Encoders (FORCE IN-MEMORY)
    const width = resolution === '1080p' ? 1920 : 1280;
    const height = resolution === '1080p' ? 1080 : 720;
    const fps = 30;
    const bitrate = resolution === '1080p' ? 6_000_000 : 3_000_000;

    let muxerTarget: any;
    // Always use ArrayBufferTarget for stability
    if (Muxer.ArrayBufferTarget) {
        muxerTarget = new Muxer.ArrayBufferTarget();
    } else {
        muxerTarget = new (Muxer as any).ArrayBufferTarget();
    }

    const MuxerClass = Muxer.Muxer || (Muxer as any).Muxer;
    if (!MuxerClass) throw new Error("Muxer library init failed");

    // FORCE 'fastStart: in-memory'
    // This ensures the MP4 MOOV atom is written correctly at the start of the file structure in memory
    // preventing 0-byte or unplayable files.
    const muxer = new MuxerClass({
        target: muxerTarget,
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

    const codecConfig = {
        codec: 'avc1.4d002a', // Main Profile, Level 4.2
        width, 
        height, 
        bitrate, 
        framerate: fps,
        hardwareAcceleration: 'prefer-hardware' as const
    };

    try {
        videoEncoder.configure(codecConfig);
    } catch (e) {
        console.warn("Hardware config failed, trying generic AVC", e);
        videoEncoder.configure({
            codec: 'avc1.42002a', 
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
        codec: 'mp4a.40.2', 
        sampleRate, 
        numberOfChannels: 2, 
        bitrate: 128_000 
    });

    // 4. Setup Visualization Environment
    const analyser = offlineCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = visualizerSettings.sensitivity;
    
    offset = 0;
    validBuffers.forEach(buf => {
        const source = offlineCtx.createBufferSource();
        source.buffer = buf;
        source.connect(analyser);
        source.start(offset);
        offset += buf.duration;
    });

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d', { 
        alpha: false, 
        desynchronized: true 
    })!;
    
    const effectRenderer = new EffectRenderer();
    effectRenderer.resize(width, height);

    // --- Load Assets (Async) ---
    const loadImage = async (url: string | null): Promise<ImageBitmap | null> => {
        if (!url) return null;
        try {
            const resp = await fetch(url);
            const blob = await resp.blob();
            return await createImageBitmap(blob);
        } catch (e) {
            console.warn(`Failed to load image asset: ${url}`, e);
            return null;
        }
    };

    const [bgBitmap, logoBitmap, stickerBitmapRaw] = await Promise.all([
        loadImage(visualizerSettings.backgroundImage),
        loadImage(visualizerSettings.logoImage),
        visualizerSettings.stickerImage ? fetch(visualizerSettings.stickerImage).then(r => r.blob()).catch(() => null) : Promise.resolve(null)
    ]);

    const gifController = new GifController();
    let stickerBitmap: ImageBitmap | null = null;
    
    if (visualizerSettings.stickerImage && stickerBitmapRaw) {
        try {
             await gifController.load(visualizerSettings.stickerImage);
             if(!gifController.isLoaded) {
                 stickerBitmap = await createImageBitmap(stickerBitmapRaw);
             }
        } catch(e) {}
    }

    // 5. Render Processor
    const totalFrames = Math.ceil(totalDuration * fps);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let startTime = 0;

    const renderSpectrum = (context: OffscreenCanvasRenderingContext2D, w: number, h: number, timestamp: number) => {
         if (!visualizerMode) return;
         switch (visualizerMode) {
            case VisualizerMode.BARS: drawBars(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            case VisualizerMode.WAVE: drawLine(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            case VisualizerMode.CIRCULAR: drawCircle(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            case VisualizerMode.DUAL_BARS: drawDualBars(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            case VisualizerMode.RIPPLE: drawRipple(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            case VisualizerMode.PIXEL: drawPixel(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            case VisualizerMode.EQUALIZER: drawEqualizer(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            case VisualizerMode.STARBURST: drawStarburst(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            case VisualizerMode.BUTTERFLY: drawButterfly(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            case VisualizerMode.AURORA: drawAurora(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            case VisualizerMode.SPECTRUM: drawSpectrum(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            case VisualizerMode.DOT_WAVE: drawDotWave(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            case VisualizerMode.LED_BARS: drawLedBars(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            case VisualizerMode.FLUID: drawFluid(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            case VisualizerMode.PARTICLES: drawParticleSpectrum(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            case VisualizerMode.JELLY_WAVE: drawJellyWave(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            case VisualizerMode.PULSE_CIRCLES: drawPulseCircles(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            case VisualizerMode.FLOWER_PETALS: drawFlowerPetals(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp); break;
            default: drawBars(context, dataArray, dataArray.length, w, h, visualizerSettings, timestamp);
         }
    };

    try {
        const processFrame = async (i: number) => {
            if (signal.aborted || this.hasEncoderError) return;

            await this.waitForQueue(videoEncoder, 60);
            
            if (i % 30 === 0) { 
                const elapsed = (performance.now() - startTime) / 1000;
                let speedInfo = "";
                if (elapsed > 1.0) {
                    const processedDuration = i / fps;
                    const speed = (processedDuration / elapsed).toFixed(1);
                    speedInfo = ` (🚀 x${speed})`;
                }
                const percent = Math.round((i/totalFrames)*100);
                onProgress(i, totalFrames, `렌더링 중... ${percent}%${speedInfo}`);
                await new Promise(r => setTimeout(r, 0));
            }

            const timeSeconds = i / fps;
            const timeMs = timeSeconds * 1000;

            if (visualizerMode === VisualizerMode.WAVE || visualizerMode === VisualizerMode.FLUID || visualizerMode === VisualizerMode.JELLY_WAVE) {
                analyser.getByteTimeDomainData(dataArray);
            } else {
                analyser.getByteFrequencyData(dataArray);
            }

            let bassEnergy = 0;
            if (visualizerMode !== VisualizerMode.WAVE && visualizerMode !== VisualizerMode.FLUID && visualizerMode !== VisualizerMode.JELLY_WAVE) {
                bassEnergy = (dataArray[0] + dataArray[1] + dataArray[2] + dataArray[3] + dataArray[4]) / 5;
            } else {
                let sum = 0;
                const step = 4;
                for(let k=0; k<dataArray.length; k+=step) sum += Math.abs(dataArray[k] - 128);
                bassEnergy = (sum / (dataArray.length/step)) * 2; 
            }
            const isBeat = bassEnergy > 200;
            
            const fixedDeltaTime = 1.0 / fps;
            effectRenderer.update(isBeat, bassEnergy, visualizerSettings.effectParams, fixedDeltaTime);

            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);
            
            ctx.save();
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
                renderSpectrum(ctx, width / 2, height, timeMs);
                ctx.restore();
                
                ctx.save(); 
                ctx.scale(-1, 1); 
                ctx.translate(0, -height/2); 
                ctx.globalCompositeOperation = 'screen'; 
                renderSpectrum(ctx, width / 2, height, timeMs);
                ctx.restore();
            } else {
                ctx.translate(-width/2, -height/2);
                renderSpectrum(ctx, width, height, timeMs);
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
            let sImg = gifController.isLoaded ? gifController.getFrame(timeMs) as ImageBitmap : stickerBitmap;
            if (sImg) {
                const base = Math.min(width,height)*0.15;
                const dw = base * visualizerSettings.stickerScale;
                const dh = dw / (sImg.width/sImg.height);
                const x = (width-dw)*(visualizerSettings.stickerX/100);
                const y = (height-dh)*(visualizerSettings.stickerY/100);
                ctx.drawImage(sImg, x, y, dw, dh);
            }

            effectRenderer.draw(ctx, visualizerSettings.effects);

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

            const frame = new VideoFrame(canvas, { 
                timestamp: i * (1_000_000 / fps),
                duration: 1_000_000 / fps
            });
            
            try {
                const keyFrame = i % 60 === 0;
                videoEncoder.encode(frame, { keyFrame });
            } catch(e) {
                console.error("Frame encoding failed", e);
            }
            frame.close();

            if (i + 1 < totalFrames) {
                const nextTime = (i + 1) / fps;
                offlineCtx.suspend(nextTime)
                    .then(() => processFrame(i + 1))
                    .catch(err => console.warn("Suspend scheduling failed:", err));
            }

            try {
                offlineCtx.resume();
            } catch(e) {}
        };

        // --- Start Rendering ---
        startTime = performance.now();
        onProgress(0, totalFrames, "영상 프레임 렌더링 중...");

        offlineCtx.suspend(0).then(() => processFrame(0));
        
        const renderedBuffer = await offlineCtx.startRendering();

        // --- Finalize Video ---
        onProgress(totalFrames, totalFrames, "비디오 인코딩 정리 중...");
        try {
            await videoEncoder.flush();
        } catch(e) {
            console.warn("Video flush warning:", e);
        }
        videoEncoder.close();

        // --- Chunked Audio Encoding ---
        onProgress(totalFrames, totalFrames, "오디오 트랙 처리 및 저장 중...");
        
        const CHUNK_DURATION_SEC = 0.5;
        const chunkFrames = Math.floor(sampleRate * CHUNK_DURATION_SEC);
        const totalAudioFrames = renderedBuffer.length;

        const leftChannel = renderedBuffer.getChannelData(0);
        const rightChannel = renderedBuffer.getChannelData(1);

        for (let i = 0; i < totalAudioFrames; i += chunkFrames) {
            if (this.hasEncoderError) break;
            
            await this.waitForQueue(audioEncoder, 20);

            const framesToEncode = Math.min(chunkFrames, totalAudioFrames - i);
            
            const chunkBuffer = new Float32Array(framesToEncode * 2);
            for (let j = 0; j < framesToEncode; j++) {
                chunkBuffer[j * 2] = leftChannel[i + j];
                chunkBuffer[j * 2 + 1] = rightChannel[i + j];
            }

            try {
                const audioData = new AudioData({
                    format: 'f32',
                    sampleRate: sampleRate,
                    numberOfFrames: framesToEncode,
                    numberOfChannels: 2,
                    timestamp: (i / sampleRate) * 1_000_000,
                    data: chunkBuffer
                });
                
                audioEncoder.encode(audioData);
                audioData.close();
            } catch(e) {
                console.error("Audio Chunk Encoding Error:", e);
            }
            
            if (i % (chunkFrames * 5) === 0) {
                 await new Promise(r => setTimeout(r, 0));
            }
        }
        
        try {
            await audioEncoder.flush();
        } catch (e) {
            console.warn("Audio flush warning:", e);
        }
        audioEncoder.close();

        try {
            muxer.finalize();
        } catch (e) {
            console.error("Muxer finalize error", e);
            throw new Error("파일 생성 마무리 단계에서 오류가 발생했습니다.");
        }

        if(bgBitmap) bgBitmap.close();
        if(logoBitmap) logoBitmap.close();
        if(stickerBitmap) stickerBitmap.close();
        gifController.dispose();

        // Retrieve the complete file buffer from memory
        const { buffer } = (muxer.target as any); 
        if (!buffer || buffer.byteLength === 0) {
            throw new Error("생성된 파일 크기가 0바이트입니다. 메모리 부족 또는 인코딩 오류일 수 있습니다.");
        }

        const blob = new Blob([buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        
        // Return valid blob URL to be saved by the UI
        return { url, filename: `SpectrumStudio_Export_${Date.now()}.mp4` };

    } catch (e) {
        console.error("Rendering Process Failed", e);
        try { videoEncoder.close(); } catch {}
        try { audioEncoder.close(); } catch {}
        throw e;
    }
  }

  cancel() {
      if (this.abortController) this.abortController.abort();
  }
}

export const renderService = new RenderService();