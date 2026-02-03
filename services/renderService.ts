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
    const bitrate = resolution === '1080p' ? 10_000_000 : 5_000_000;

    const muxer = new Muxer.Muxer({
        target: new Muxer.ArrayBufferTarget(),
        video: { codec: 'avc', width, height },
        audio: { codec: 'aac', sampleRate, numberOfChannels: 2 },
        fastStart: 'in-memory'
    });

    const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => { console.error("VideoEncoder Error", e); this.hasEncoderError = true; }
    }) as VideoEncoderWithState;

    // Codec configuration with fallback
    try {
        videoEncoder.configure({
            codec: resolution === '1080p' ? 'avc1.4d002a' : 'avc1.4d001f', // Main/High
            width, height, bitrate, framerate: fps,
        });
    } catch (e) {
        videoEncoder.configure({
            codec: 'avc1.42001f', // Baseline
            width, height, bitrate, framerate: fps,
        });
    }

    const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => { console.error("AudioEncoder Error", e); this.hasEncoderError = true; }
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
    const ctx = canvas.getContext('2d', { alpha: false })!;
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

    // 5. Render Processor (Recursive)
    const totalFrames = Math.ceil(totalDuration * fps);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
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
        // Recursive Frame Processor
        // This pattern ensures we schedule the next suspend ONLY when we are currently suspended at 'time'.
        // This prevents the audio context from running ahead of our frames.
        const processFrame = async (i: number) => {
            if (signal.aborted || this.hasEncoderError) return;

            // Backpressure Control (Async wait while Context is paused)
            if (videoEncoder.encodeQueueSize > 15) {
                await new Promise(r => setTimeout(r, 10));
            }
            
            // UI Yield
            if (i % 30 === 0) {
                onProgress(i, totalFrames, `렌더링 진행률 ${Math.round((i/totalFrames)*100)}%`);
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

            // Visualizer Spectrum
            ctx.save();
            ctx.translate(width/2, height/2);
            ctx.translate(visualizerSettings.positionX, visualizerSettings.positionY);
            ctx.scale(visualizerSettings.scale, visualizerSettings.scale);
            
            if (visualizerSettings.effects.mirror) {
                ctx.save(); ctx.translate(0, -height/2); renderSpectrum(ctx); ctx.restore();
                ctx.save(); ctx.scale(-1, 1); ctx.translate(0, -height/2); ctx.globalCompositeOperation = 'screen'; renderSpectrum(ctx); ctx.restore();
            } else {
                ctx.translate(-width/2, -height/2);
                renderSpectrum(ctx);
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
            videoEncoder.encode(frame, { keyFrame: i % 60 === 0 });
            frame.close();

            // CRITICAL: Schedule NEXT suspend BEFORE resuming current
            if (i < totalFrames - 1) {
                offlineCtx.suspend((i + 1) / fps).then(() => processFrame(i + 1));
            }

            // Advance Context
            offlineCtx.resume();
        };

        // --- Execution Start ---
        onProgress(0, totalFrames, "영상 프레임 렌더링 중...");

        // 1. Schedule first frame at 0
        offlineCtx.suspend(0).then(() => processFrame(0));

        // 2. Start Audio Engine (This returns promise resolving when audio completes)
        const renderedBuffer = await offlineCtx.startRendering();

        // 3. Audio Completed - Finalize
        onProgress(totalFrames, totalFrames, "오디오 믹싱 완료 대기 중...");
        
        await videoEncoder.flush();
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
        audioEncoder.encode(audioData);
        audioData.close();
        await audioEncoder.flush();
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
