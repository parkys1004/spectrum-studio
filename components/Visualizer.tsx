import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { audioService } from '../services/audioService';
import { VisualizerMode, VisualizerSettings } from '../types';
import { 
    drawBars, drawLine, drawCircle, 
    drawFilledWave, drawDualBars, drawRipple, 
    drawPixel, drawEqualizer, drawStarburst, drawButterfly 
} from '../utils/drawUtils';
import { EffectRenderer } from '../utils/effectRenderer';
import { GifController } from '../utils/gifUtils';

interface VisualizerProps {
  isPlaying: boolean;
  mode: VisualizerMode;
  settings: VisualizerSettings;
}

const Visualizer = forwardRef<HTMLCanvasElement, VisualizerProps>(({ isPlaying, mode, settings }, ref) => {
  const internalCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  
  // Time tracking for pausing animations
  const lastTimeRef = useRef<number>(0);
  const animationTimeRef = useRef<number>(0);
  
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const logoImageRef = useRef<HTMLImageElement | null>(null);
  const stickerImageRef = useRef<HTMLImageElement | null>(null);
  
  // Helper for animated GIFs
  const gifControllerRef = useRef<GifController>(new GifController());

  const effectRendererRef = useRef<EffectRenderer>(new EffectRenderer());

  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  useImperativeHandle(ref, () => internalCanvasRef.current!, []);

  useEffect(() => {
    if (settings.backgroundImage) {
        const img = new Image();
        img.src = settings.backgroundImage;
        bgImageRef.current = img;
    } else {
        bgImageRef.current = null;
    }
  }, [settings.backgroundImage]);

  useEffect(() => {
    if (settings.logoImage) {
        const img = new Image();
        img.src = settings.logoImage;
        logoImageRef.current = img;
    } else {
        logoImageRef.current = null;
    }
  }, [settings.logoImage]);

  useEffect(() => {
    if (settings.stickerImage) {
        // Load for static fallback
        const img = new Image();
        img.src = settings.stickerImage;
        stickerImageRef.current = img;

        // Load for animation
        gifControllerRef.current.load(settings.stickerImage);
    } else {
        stickerImageRef.current = null;
        gifControllerRef.current.dispose();
    }
  }, [settings.stickerImage]);

  // Cleanup GIF resources on unmount
  useEffect(() => {
      return () => {
          gifControllerRef.current.dispose();
      }
  }, []);

  // Enforce fixed 1080p resolution for consistency
  useEffect(() => {
      if (internalCanvasRef.current) {
          internalCanvasRef.current.width = 1920;
          internalCanvasRef.current.height = 1080;
      }
  }, []);

  useEffect(() => {
    // Reset frame time tracker on play/pause toggle or mount
    lastTimeRef.current = 0;

    const render = (time: number) => {
      const canvas = internalCanvasRef.current;
      if (!canvas) {
        animationRef.current = requestAnimationFrame(render);
        return;
      }

      // --- Time Management for Pausing ---
      if (lastTimeRef.current === 0) {
          lastTimeRef.current = time;
      }
      const deltaTime = time - lastTimeRef.current;
      lastTimeRef.current = time;

      if (isPlaying) {
          animationTimeRef.current += deltaTime;
      }
      // -----------------------------------

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const currentSettings = settingsRef.current;
      
      effectRendererRef.current.resize(width, height);

      // --- Data Collection for Effects ---
      let dataArray: Uint8Array;
      let bufferLength: number;
      
      // Use waveform data for WAVE and FILLED modes, frequency for others
      if (mode === VisualizerMode.WAVE || mode === VisualizerMode.FILLED) {
         dataArray = audioService.getWaveformData(); 
      } else {
         dataArray = audioService.getFrequencyData();
      }
      bufferLength = dataArray.length;

      // Calculate Bass Energy for Beat Detection (first 10 bins)
      let bassEnergy = 0;
      if (mode !== VisualizerMode.WAVE && mode !== VisualizerMode.FILLED) {
          for(let i=0; i<10; i++) bassEnergy += dataArray[i];
          bassEnergy /= 10;
      } else {
          // Approximate volume for Wave
          let sum = 0;
          for(let i=0; i<bufferLength; i++) sum += Math.abs(dataArray[i] - 128);
          bassEnergy = (sum / bufferLength) * 2; 
      }
      
      // CRITICAL CHANGE: Force 0 energy if paused to stop reactive effects (Pulse, Shake, Glitch)
      if (!isPlaying) {
          bassEnergy = 0;
      }

      const isBeat = bassEnergy > 200; // Threshold

      // Update Effects State - Only update physics if playing (Freeze when paused)
      if (isPlaying) {
          effectRendererRef.current.update(isBeat, bassEnergy, currentSettings.effectParams);
      }

      // --- 1. Background Clear & Draw ---
      ctx.save();
      
      // Effect: Shake
      if (currentSettings.effects.shake && isBeat) {
          const strength = currentSettings.effectParams.shakeStrength || 1.0;
          const shakeX = (Math.random() - 0.5) * 20 * strength;
          const shakeY = (Math.random() - 0.5) * 20 * strength;
          ctx.translate(shakeX, shakeY);
      }

      // Effect: Beat Pulse (Zoom Center)
      if (currentSettings.effects.pulse) {
          const zoom = 1.0 + (bassEnergy / 255) * 0.1; // Max 10% zoom
          ctx.translate(width/2, height/2);
          ctx.scale(zoom, zoom);
          ctx.translate(-width/2, -height/2);
      }

      if (bgImageRef.current && bgImageRef.current.complete) {
          const img = bgImageRef.current;
          const imgRatio = img.width / img.height;
          const canvasRatio = width / height;
          let drawWidth, drawHeight, offsetX, offsetY;

          if (canvasRatio > imgRatio) {
              drawWidth = width;
              drawHeight = width / imgRatio;
              offsetX = 0;
              offsetY = (height - drawHeight) / 2;
          } else {
              drawWidth = height * imgRatio;
              drawHeight = height;
              offsetX = (width - drawWidth) / 2;
              offsetY = 0;
          }
          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.fillRect(0, 0, width, height);
      } else {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, width, height);
      }

      // --- 2. Draw Visualizer ---
      
      const renderSpectrum = (renderWidth: number, renderHeight: number) => {
          switch (mode) {
            case VisualizerMode.BARS:
                drawBars(ctx, dataArray, bufferLength, renderWidth, renderHeight, currentSettings);
                break;
            case VisualizerMode.WAVE:
                drawLine(ctx, dataArray, bufferLength, renderWidth, renderHeight, currentSettings);
                break;
            case VisualizerMode.CIRCULAR:
                drawCircle(ctx, dataArray, bufferLength, renderWidth, renderHeight, currentSettings);
                break;
            case VisualizerMode.FILLED:
                drawFilledWave(ctx, dataArray, bufferLength, renderWidth, renderHeight, currentSettings);
                break;
            case VisualizerMode.DUAL_BARS:
                drawDualBars(ctx, dataArray, bufferLength, renderWidth, renderHeight, currentSettings);
                break;
            case VisualizerMode.RIPPLE:
                drawRipple(ctx, dataArray, bufferLength, renderWidth, renderHeight, currentSettings);
                break;
            case VisualizerMode.PIXEL:
                drawPixel(ctx, dataArray, bufferLength, renderWidth, renderHeight, currentSettings);
                break;
            case VisualizerMode.EQUALIZER:
                drawEqualizer(ctx, dataArray, bufferLength, renderWidth, renderHeight, currentSettings);
                break;
            case VisualizerMode.STARBURST:
                drawStarburst(ctx, dataArray, bufferLength, renderWidth, renderHeight, currentSettings);
                break;
            case VisualizerMode.BUTTERFLY:
                drawButterfly(ctx, dataArray, bufferLength, renderWidth, renderHeight, currentSettings);
                break;
            default:
                drawBars(ctx, dataArray, bufferLength, renderWidth, renderHeight, currentSettings);
                break;
          }
      };

      ctx.save();
      // Apply User Transform
      ctx.translate(width / 2, height / 2);
      ctx.translate(currentSettings.positionX, currentSettings.positionY);
      ctx.scale(currentSettings.scale, currentSettings.scale);
      
      // Effect: Mirror (Symmetric Visualizer)
      if (currentSettings.effects.mirror) {
          ctx.save();
          ctx.translate(0, -height/2); 
          renderSpectrum(width / 2, height);
          ctx.restore();

          ctx.save();
          ctx.scale(-1, 1); 
          ctx.translate(0, -height/2); 
          renderSpectrum(width / 2, height);
          ctx.restore();
      } else {
          ctx.translate(-width/2, -height/2);
          renderSpectrum(width, height);
      }
      
      ctx.restore(); // End User Transform

      // --- 3. Draw Logo ---
      if (logoImageRef.current && logoImageRef.current.complete) {
          const img = logoImageRef.current;
          const logoScale = currentSettings.logoScale || 1.0;
          const baseSize = Math.min(width, height) * 0.15;
          const drawWidth = baseSize * logoScale;
          const aspectRatio = img.width / img.height;
          const drawHeight = drawWidth / aspectRatio;

          const posXPercent = currentSettings.logoX ?? 95;
          const posYPercent = currentSettings.logoY ?? 5;
          
          const x = (width - drawWidth) * (posXPercent / 100);
          const y = (height - drawHeight) * (posYPercent / 100);

          ctx.shadowBlur = 0;
          ctx.globalAlpha = 0.9;
          ctx.drawImage(img, x, y, drawWidth, drawHeight);
          ctx.globalAlpha = 1.0;
      }

      // --- 4. Draw Sticker/GIF Overlay ---
      // Prioritize animated GIF controller if loaded, otherwise fall back to static image
      let stickerSource: CanvasImageSource | null = null;
      let sAspectRatio = 1.0;
      let sWidth = 0;
      let sHeight = 0;

      if (gifControllerRef.current.isLoaded) {
          // Use Accumulated Animation Time instead of Absolute Time
          const frame = gifControllerRef.current.getFrame(animationTimeRef.current);
          if (frame) {
              stickerSource = frame;
              sWidth = frame.width;
              sHeight = frame.height;
              sAspectRatio = sWidth / sHeight;
          }
      } else if (stickerImageRef.current && stickerImageRef.current.complete) {
          stickerSource = stickerImageRef.current;
          sWidth = stickerImageRef.current.width;
          sHeight = stickerImageRef.current.height;
          sAspectRatio = sWidth / sHeight;
      }

      if (stickerSource) {
          const stickerScale = currentSettings.stickerScale || 1.0;
          const baseSize = Math.min(width, height) * 0.15;
          const drawWidth = baseSize * stickerScale;
          const drawHeight = drawWidth / sAspectRatio;

          const posXPercent = currentSettings.stickerX ?? 50;
          const posYPercent = currentSettings.stickerY ?? 50;
          
          const x = (width - drawWidth) * (posXPercent / 100);
          const y = (height - drawHeight) * (posYPercent / 100);

          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1.0;
          ctx.drawImage(stickerSource, x, y, drawWidth, drawHeight);
      }

      // --- 5. Draw Atmospheric Effects ---
      // We always DRAW the effects so they don't disappear, but they won't move because we didn't call update() above.
      effectRendererRef.current.draw(ctx, currentSettings.effects);

      // Effect: Glitch (Post-processing - MUST BE LAST)
      if (currentSettings.effects.glitch && isBeat) {
           const glStr = currentSettings.effectParams.glitchStrength || 1.0;
           const sliceHeight = Math.random() * 50 + 10;
           const sliceY = Math.random() * height;
           const offset = (Math.random() - 0.5) * 40 * glStr;
           
           try {
               // Grab a slice and draw it offset
               ctx.drawImage(canvas, 
                   0, sliceY, width, sliceHeight, 
                   offset, sliceY, width, sliceHeight
               );
               
               // Random color channel shift (simple red overlay)
               ctx.fillStyle = `rgba(255, 0, 0, ${0.2 * glStr})`;
               ctx.fillRect(0, sliceY, width, 5);
           } catch (e) {
               // Ignore drawImage self-reference errors if any
           }
      }

      ctx.restore(); // Restore Background/Shake context

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [mode, isPlaying]);

  return (
    <div ref={containerRef} className="w-full h-full bg-black flex items-center justify-center p-4">
        <div className="relative w-full aspect-video shadow-2xl bg-black overflow-hidden ring-1 ring-white/10 max-h-full max-w-full">
            <canvas ref={internalCanvasRef} className="w-full h-full block" />
            
            {/* Minimal Overlay */}
            <div className="absolute top-4 right-4 pointer-events-none z-10 opacity-50">
                <span className="text-[10px] text-white font-mono tracking-widest uppercase shadow-black drop-shadow-md">
                    {mode}
                </span>
            </div>
        </div>
    </div>
  );
});

export default Visualizer;