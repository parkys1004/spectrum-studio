import { Track, VisualizerSettings, VisualizerMode } from '../types';
import * as Muxer from 'mp4-muxer';
import { 
    drawBars, drawLine, drawCircle, 
    drawFilledWave, drawDualBars, drawRipple, 
    drawPixel, drawEqualizer, drawStarburst, drawButterfly 
} from '../utils/drawUtils';
import { EffectRenderer } from '../utils/effectRenderer';
import { audioService } from './audioService';
import { GifController } from '../utils/gifUtils';
import { storageService } from './storageService';

// Polyfill definitions for WebCodecs Audio types
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

// Polyfill for VideoEncoder state
interface VideoEncoderWithState extends VideoEncoder {
    state: "configured" | "unconfigured" | "closed";
    encodeQueueSize: number;
}

class RenderService {
  private abortController: AbortController | null = null;
  private hasEncoderError: boolean = false;

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

    // 1. Load all audio buffers
    const decodedBuffers: AudioBuffer[] = [];
    
    onProgress(0, tracks.length, "오디오 디코딩 준비 중...");

    let totalDuration = 0;
    for (let i = 0; i < tracks.length; i++) {
        if (signal.aborted) throw new Error("Render Aborted");
        onProgress(i, tracks.length, `오디오 디코딩 중 (${i + 1}/${tracks.length})...`);
        
        let buffer: AudioBuffer | null = null;
        let fileToDecode: File | Blob | undefined = tracks[i].file;

        // CRITICAL FIX: If file object is missing (e.g. after refresh), try to load from IndexedDB
        if (!fileToDecode) {
            try {
                const blob = await storageService.getFile(tracks[i].id);
                if (blob) fileToDecode = blob;
            } catch (e) {
                console.warn(`Failed to retrieve file from storage for track ${tracks[i].id}`, e);
            }
        }

        if (fileToDecode) {
             buffer = await audioService.getAudioBuffer(fileToDecode, tracks[i].id);
        }
        
        if (buffer) {
            decodedBuffers.push(buffer);
            totalDuration += buffer.duration;
        } else {
            // Explicit error to prevent infinite hanging
            throw new Error(`트랙 '${tracks[i].name}'의 파일을 찾을 수 없습니다. (IndexedDB 확인 필요)`);
        }
    }

    if (decodedBuffers.length === 0) throw new Error("오디오 파일을 불러올 수 없습니다.");
    if (totalDuration === 0) throw new Error("총 재생 시간이 0입니다.");

    // 2. Setup OfflineAudioContext
    const sampleRate = 48000;
    const offlineCtx = new OfflineAudioContext(2, sampleRate * totalDuration, sampleRate);
    
    let offset = 0;
    decodedBuffers.forEach(buf => {
        const source = offlineCtx.createBufferSource();
        source.buffer = buf;
        source.connect(offlineCtx.destination);
        source.start(offset);
        offset += buf.duration;
    });

    // 3. Setup Video Encoder & Muxer
    const width = resolution === '1080p' ? 1920 : 1280;
    const height = resolution === '1080p' ? 1080 : 720;
    const fps = 30;
    // Optimize bitrate: 8Mbps for 1080p is sufficient for web export
    const bitrate = resolution === '1080p' ? 8_000_000 : 4_000_000; 

    const muxer = new Muxer.Muxer({
        target: new Muxer.ArrayBufferTarget(),
        video: {
            codec: 'avc',
            width,
            height
        },
        audio: {
            codec: 'aac',
            sampleRate: sampleRate,
            numberOfChannels: 2
        },
        fastStart: 'in-memory' 
    });

    const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => {
            console.error("VideoEncoder error", e);
            this.hasEncoderError = true;
        }
    }) as VideoEncoderWithState;

    const codecString = resolution === '1080p' ? 'avc1.4d002a' : 'avc1.4d001f'; 

    try {
        videoEncoder.configure({
            codec: codecString, 
            width,
            height,
            bitrate,
            framerate: fps,
            // 'default' balances speed and size
        });
    } catch (e) {
        console.warn("High profile AVC not supported, falling back to baseline", e);
        try {
            videoEncoder.configure({
                codec: 'avc1.42001f',
                width,
                height,
                bitrate,
                framerate: fps,
            });
        } catch (e2) {
             throw new Error("이 브라우저에서는 비디오 인코딩을 지원하지 않습니다.");
        }
    }

    const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => {
            console.error("AudioEncoder error", e);
            this.hasEncoderError = true;
        }
    });

    try {
        audioEncoder.configure({
            codec: 'mp4a.40.2',
            sampleRate,
            numberOfChannels: 2,
            bitrate: 192000
        });
    } catch (e) {
        throw new Error("오디오 인코딩을 지원하지 않습니다.");
    }

    // 4. Setup Analysis and Visuals
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
    const ctx = canvas.getContext('2d', { alpha: false })!; 

    // Instantiate Effect Renderer
    const effectRenderer = new EffectRenderer();
    effectRenderer.resize(width, height);

    // Load assets
    let bgBitmap: ImageBitmap | null = null;
    if (visualizerSettings.backgroundImage) {
        try {
            const resp = await fetch(visualizerSettings.backgroundImage);
            const blob = await resp.blob();
            bgBitmap = await createImageBitmap(blob);
        } catch (e) {}
    }

    let logoBitmap: ImageBitmap | null = null;
    if (visualizerSettings.logoImage) {
        try {
            const resp = await fetch(visualizerSettings.logoImage);
            const blob = await resp.blob();
            logoBitmap = await createImageBitmap(blob);
        } catch (e) {}
    }

    const gifController = new GifController();
    let stickerBitmap: ImageBitmap | null = null;
    
    if (visualizerSettings.stickerImage) {
        try {
            await gifController.load(visualizerSettings.stickerImage);
            if (!gifController.isLoaded) {
                 const resp = await fetch(visualizerSettings.stickerImage);
                 const blob = await resp.blob();
                 stickerBitmap = await createImageBitmap(blob);
            }
        } catch (e) {}
    }

    // 5. Render Loop with High-Speed Batch Optimization
    const totalFrames = Math.ceil(totalDuration * fps);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    // Process frames in batches to avoid blocking UI but maximize throughput
    const MAX_QUEUE_SIZE = 20; 
    const UI_YIELD_INTERVAL = 30; // Yield to UI every 30 frames (approx 1 sec of video)

    const renderSpectrum = (context: OffscreenCanvasRenderingContext2D) => {
         switch (visualizerMode) {
            case VisualizerMode.BARS: drawBars(context, dataArray, dataArray.length, width, height, visualizerSettings); break;
            case VisualizerMode.WAVE: drawLine(context, dataArray, dataArray.length, width, height, visualizerSettings); break;
            case VisualizerMode.CIRCULAR: drawCircle(context, dataArray, dataArray.length, width, height, visualizerSettings); break;
            case VisualizerMode.FILLED: drawFilledWave(context, dataArray, dataArray.length, width, height, visualizerSettings); break;
            case VisualizerMode.DUAL_BARS: drawDualBars(context, dataArray, dataArray.length, width, height, visualizerSettings); break;
            case VisualizerMode.RIPPLE: drawRipple(context, dataArray, dataArray.length, width, height, visualizerSettings); break;
            case VisualizerMode.PIXEL: drawPixel(context, dataArray, dataArray.length, width, height, visualizerSettings); break;
            case VisualizerMode.EQUALIZER: drawEqualizer(context, dataArray, dataArray.length, width, height, visualizerSettings); break;
            case VisualizerMode.STARBURST: drawStarburst(context, dataArray, dataArray.length, width, height, visualizerSettings); break;
            case VisualizerMode.BUTTERFLY: drawButterfly(context, dataArray, dataArray.length, width, height, visualizerSettings); break;
            default: drawBars(context, dataArray, dataArray.length, width, height, visualizerSettings);
         }
    };
    
    try {
        onProgress(0, totalFrames, "영상 고속 렌더링 중...");

        for (let i = 0; i < totalFrames; i++) {
            // Signal Check
            if (signal.aborted || this.hasEncoderError) return { url: '', filename: '' };

            const time = i / fps;
            
            // Suspend at specific time to extract data without real-time playback
            // This is the key to high-speed rendering
            await offlineCtx.suspend(time);

            // Flow Control: Prevent memory explosion
            if (i % 10 === 0 && videoEncoder.encodeQueueSize > MAX_QUEUE_SIZE) {
                // Wait until queue drains partially
                await new Promise<void>(resolve => {
                    const checkQueue = () => {
                        if (this.hasEncoderError || signal.aborted) { resolve(); return; }
                        if (videoEncoder.encodeQueueSize <= MAX_QUEUE_SIZE / 2) {
                            resolve();
                        } else {
                            setTimeout(checkQueue, 1); // Fast poll
                        }
                    };
                    checkQueue();
                });
            }

            // Yield to UI periodically to prevent "Page Unresponsive"
            if (i % UI_YIELD_INTERVAL === 0) {
                 onProgress(i, totalFrames, `영상 렌더링 중 (${Math.round(i/totalFrames*100)}%)...`);
                 await new Promise(r => setTimeout(r, 0)); 
            }

            // --- Get Audio Data ---
            if (visualizerMode === VisualizerMode.WAVE || visualizerMode === VisualizerMode.FILLED) {
                analyser.getByteTimeDomainData(dataArray);
            } else {
                analyser.getByteFrequencyData(dataArray);
            }

            // --- Logic Updates ---
            const bufferLength = dataArray.length;
            let bassEnergy = 0;
            if (visualizerMode !== VisualizerMode.WAVE && visualizerMode !== VisualizerMode.FILLED) {
                for(let k=0; k<10; k++) bassEnergy += dataArray[k];
                bassEnergy /= 10;
            } else {
                let sum = 0;
                for(let k=0; k<bufferLength; k++) sum += Math.abs(dataArray[k] - 128);
                bassEnergy = (sum / bufferLength) * 2; 
            }
            const isBeat = bassEnergy > 200;

            effectRenderer.update(isBeat, bassEnergy, visualizerSettings.effectParams);

            // --- DRAWING ---
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, width, height);

            ctx.save();

            // Shake
            if (visualizerSettings.effects.shake && isBeat) {
                const strength = visualizerSettings.effectParams.shakeStrength || 1.0;
                ctx.translate((Math.random() - 0.5) * 20 * strength, (Math.random() - 0.5) * 20 * strength);
            }

            // Pulse
            if (visualizerSettings.effects.pulse) {
                const zoom = 1.0 + (bassEnergy / 255) * 0.1;
                ctx.translate(width/2, height/2);
                ctx.scale(zoom, zoom);
                ctx.translate(-width/2, -height/2);
            }

            // Background
            if (bgBitmap) {
                const imgRatio = bgBitmap.width / bgBitmap.height;
                const canvasRatio = width / height;
                let dw, dh, ox, oy;
                if (canvasRatio > imgRatio) {
                    dw = width; dh = width / imgRatio; ox = 0; oy = (height - dh) / 2;
                } else {
                    dw = height * imgRatio; dh = height; ox = (width - dw) / 2; oy = 0;
                }
                ctx.drawImage(bgBitmap, ox, oy, dw, dh);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.fillRect(0, 0, width, height);
            }

            // Spectrum
            ctx.save();
            ctx.translate(width / 2, height / 2);
            ctx.translate(visualizerSettings.positionX, visualizerSettings.positionY);
            ctx.scale(visualizerSettings.scale, visualizerSettings.scale);

            if (visualizerSettings.effects.mirror) {
                ctx.save(); ctx.translate(-width/2, -height/2); renderSpectrum(ctx); ctx.restore();
                ctx.save(); ctx.scale(-1, 1); ctx.translate(-width/2, -height/2); ctx.globalCompositeOperation = 'screen'; renderSpectrum(ctx); ctx.restore();
            } else {
                ctx.translate(-width/2, -height/2);
                renderSpectrum(ctx);
            }
            ctx.restore();

            // Logo
            if (logoBitmap) {
                const baseSize = Math.min(width, height) * 0.15;
                const dw = baseSize * (visualizerSettings.logoScale || 1.0);
                const dh = dw / (logoBitmap.width / logoBitmap.height);
                const x = (width - dw) * ((visualizerSettings.logoX ?? 95) / 100);
                const y = (height - dh) * ((visualizerSettings.logoY ?? 5) / 100);
                ctx.globalAlpha = 0.9;
                ctx.drawImage(logoBitmap, x, y, dw, dh);
                ctx.globalAlpha = 1.0;
            }

            // Sticker
            let sSource: ImageBitmap | null = null;
            if (gifController.isLoaded) {
                sSource = gifController.getFrame(time * 1000) as ImageBitmap;
            } else if (stickerBitmap) {
                sSource = stickerBitmap;
            }

            if (sSource) {
                const baseSize = Math.min(width, height) * 0.15;
                const dw = baseSize * (visualizerSettings.stickerScale || 1.0);
                const dh = dw / (sSource.width / sSource.height);
                const x = (width - dw) * ((visualizerSettings.stickerX ?? 50) / 100);
                const y = (height - dh) * ((visualizerSettings.stickerY ?? 50) / 100);
                ctx.drawImage(sSource, x, y, dw, dh);
            }

            // Effects
            effectRenderer.draw(ctx, visualizerSettings.effects);

            // Glitch
            if (visualizerSettings.effects.glitch && isBeat) {
                const glStr = visualizerSettings.effectParams.glitchStrength || 1.0;
                const sh = Math.random() * 50 + 10;
                const sy = Math.random() * height;
                ctx.drawImage(canvas, 0, sy, width, sh, (Math.random() - 0.5) * 40 * glStr, sy, width, sh);
                ctx.fillStyle = `rgba(255, 0, 0, ${0.2 * glStr})`;
                ctx.fillRect(0, sy, width, 5);
            }

            ctx.restore();

            // Encode Video
            const frame = new VideoFrame(canvas, { timestamp: time * 1_000_000 }); 
            videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
            frame.close();

            // Advance audio clock
            offlineCtx.resume();
        }

        // Render Audio Mix
        const renderedBuffer = await offlineCtx.startRendering();
        
        onProgress(totalFrames, totalFrames, "오디오 인코딩 및 저장 중...");
        
        // Finalize Video
        if (videoEncoder.state === 'configured') await videoEncoder.flush();
        if (this.hasEncoderError) throw new Error("Video Encoding failed");

        // Encode Audio
        if (audioEncoder.state === 'configured') {
            await this.encodeAudioAsync(audioEncoder, renderedBuffer);
            await audioEncoder.flush();
        }

        muxer.finalize();
        
        const { buffer } = muxer.target;
        const blob = new Blob([buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        
        // Cleanup
        if (bgBitmap) bgBitmap.close();
        if (logoBitmap) logoBitmap.close();
        if (stickerBitmap) stickerBitmap.close();
        gifController.dispose();
        
        return { url, filename: `HighSpeed_Export_${resolution}_${Date.now()}.mp4` };
    } catch (err) {
        console.error("Rendering failed", err);
        throw err;
    }
  }

  // Optimized Audio Encoder with better yielding
  private async encodeAudioAsync(encoder: AudioEncoder, buffer: AudioBuffer) {
      if (encoder.state !== 'configured') return;

      const data = buffer.getChannelData(0); 
      const dataR = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : data;
      
      const sampleRate = buffer.sampleRate;
      const numberOfFrames = buffer.length;
      
      const chunkSize = 1024; 
      const format = 'f32-planar';
      
      // Process chunks
      for (let i = 0; i < numberOfFrames; i += chunkSize) {
          if (encoder.state !== 'configured') break;

          // Backpressure & Yielding
          // Check frequently (every 100 chunks ~ 2 sec of audio)
          if (i % (chunkSize * 100) === 0) {
               if (encoder.encodeQueueSize > 50) {
                  await new Promise(r => setTimeout(r, 10));
               } else {
                  // Allow UI update
                  await new Promise(r => setTimeout(r, 0));
               }
          }

          const length = Math.min(chunkSize, numberOfFrames - i);
          const timestamp = Math.round((i / sampleRate) * 1_000_000);
          
          const channel0 = new Float32Array(length);
          const channel1 = new Float32Array(length);
          channel0.set(data.subarray(i, i + length));
          channel1.set(dataR.subarray(i, i + length));
          
          const totalSize = length * 4 * 2; 
          const dataBuffer = new ArrayBuffer(totalSize);
          const dataView = new Float32Array(dataBuffer);
          dataView.set(channel0, 0);
          dataView.set(channel1, length);

          const audioData = new AudioData({
              format,
              sampleRate,
              numberOfFrames: length,
              numberOfChannels: 2,
              timestamp,
              data: dataBuffer
          });
          
          encoder.encode(audioData);
          audioData.close();
      }
  }

  cancel() {
      if (this.abortController) this.abortController.abort();
  }
}

export const renderService = new RenderService();