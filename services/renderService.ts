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
    const bitrate = resolution === '1080p' ? 12_000_000 : 6_000_000; 

    // CHOOSE TARGET: Disk Stream or In-Memory ArrayBuffer
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
        // Use 'in-memory' fastStart even for streaming if we want MOOV at start.
        // Or false for MOOV at end (streaming friendly). 
        // For reliability with large files, we'll let Muxer handle it.
        fastStart: writableStream ? false : 'in-memory' 
    });

    const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => { 
            console.error("VideoEncoder Error", e); 
            this.hasEncoderError = true; 
        }
    }) as VideoEncoderWithState;

    const is1080p = width > 1280 || height > 720;
    const codecLevel = is1080p ? '2a' : '1f';
    const baselineCodec = `avc1.4200${codecLevel}`;
    const mainCodec = `avc1.4d00${codecLevel}`;

    const encoderConfig: any = {
        codec: baselineCodec,
        width, 
        height, 
        bitrate, 
        framerate: fps,
        hardwareAcceleration: 'prefer-hardware',
        bitrateMode: 'constant',
        latencyMode: 'realtime'
    };

    try {
        videoEncoder.configure(encoderConfig);
    } catch (e) {
        console.warn("Hardware/Baseline config failed, falling back to standard config", e);
        videoEncoder.configure({
            codec: mainCodec, 
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
    const ctx = canvas.getContext('2d', { 
        alpha: false, 
        desynchronized: true,
        willReadFrequently: false 
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

    // 5. Render Processor
    const totalFrames = Math.ceil(totalDuration * fps);
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const LOOKAHEAD = 30; 
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

            if (videoEncoder.encodeQueueSize > 60) {
                await new Promise(r => setTimeout(r, 1));
            }
            
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

            // Visualizer
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

            const frame = new VideoFrame(canvas, { timestamp: i * (1_000_000 / fps) });
            try {
                videoEncoder.encode(frame, { keyFrame: i % 60 === 0 });
            } catch(e) {
                console.error("Frame encoding failed", e);
                this.hasEncoderError = true;
            }
            frame.close();

            if (i + LOOKAHEAD < totalFrames) {
                const nextTime = (i + LOOKAHEAD) / fps;
                offlineCtx.suspend(nextTime)
                    .then(() => processFrame(i + LOOKAHEAD))
                    .catch(err => console.warn("Suspend scheduling failed, possibly finished:", err));
            }

            try {
                offlineCtx.resume();
            } catch(e) {}
        };

        startTime = performance.now();
        onProgress(0, totalFrames, "영상 프레임 렌더링 중...");

        const initLimit = Math.min(totalFrames, LOOKAHEAD);
        for (let i = 0; i < initLimit; i++) {
            offlineCtx.suspend(i / fps)
                .then(() => processFrame(i))
                .catch(err => console.warn("Initial suspend failed:", err));
        }

        const renderedBuffer = await offlineCtx.startRendering();

        onProgress(totalFrames, totalFrames, "비디오 인코딩 정리 중 (Finalizing)...");
        
        if (!this.hasEncoderError) {
             await videoEncoder.flush();
        } else {
             console.warn("Skipping flush due to encoder error, finalizing partial video.");
        }
        videoEncoder.close();

        onProgress(totalFrames, totalFrames, "최종 파일 저장 중...");
        
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

        if(bgBitmap) bgBitmap.close();
        if(logoBitmap) logoBitmap.close();
        if(stickerBitmap) stickerBitmap.close();
        gifController.dispose();

        // If streaming to disk, we don't return a URL.
        if (writableStream) {
            return null;
        }

        // If memory mode, return Blob URL
        const { buffer } = (muxer.target as Muxer.ArrayBufferTarget);
        const blob = new Blob([buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(blob);
        return { url, filename: `SpectrumStudio_Export_${Date.now()}.mp4` };

    } catch (e) {
        console.error("Rendering Process Failed", e);
        throw e;
    }
  }

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