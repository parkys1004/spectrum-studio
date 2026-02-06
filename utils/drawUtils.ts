import { VisualizerSettings } from '../types';

// Helper to create rainbow gradient for strokes/fills
const createRainbowGradient = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, width: number, height: number, horizontal: boolean = true) => {
    const gradient = horizontal 
        ? ctx.createLinearGradient(0, 0, width, 0)
        : ctx.createLinearGradient(0, height, 0, 0); // Bottom up
    
    gradient.addColorStop(0, '#ff0000');
    gradient.addColorStop(0.15, '#ff7f00');
    gradient.addColorStop(0.3, '#ffff00');
    gradient.addColorStop(0.45, '#00ff00');
    gradient.addColorStop(0.6, '#0000ff');
    gradient.addColorStop(0.75, '#4b0082');
    gradient.addColorStop(1, '#9400d3');
    return gradient;
};

// 1. Classic Bars
export const drawBars = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
  const gap = settings.lineThickness;
  const meaningfulBufferLength = Math.floor(bufferLength * 0.6);
  const barWidth = Math.max(2, ((width / meaningfulBufferLength) * 2.5) - gap); 
  let x = 0;
  const isRainbow = settings.color === 'rainbow';

  for (let i = 0; i < bufferLength; i++) {
    const val = data[i];
    const barHeight = Math.max(4, (val / 255) * height * settings.amplitude);

    let fillStyle: string | CanvasGradient;
    
    if (isRainbow) {
        const hue = (i / meaningfulBufferLength) * 360;
        fillStyle = `hsl(${hue}, 100%, 50%)`;
    } else {
        const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
        gradient.addColorStop(0, settings.color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        fillStyle = gradient;
    }
    
    ctx.fillStyle = fillStyle;
    ctx.fillRect(x, height - barHeight, barWidth, barHeight);

    x += barWidth + gap; 
    if (x > width) break;
  }
};

// 2. Waveform Line
export const drawLine = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
  ctx.lineWidth = settings.lineThickness;
  
  const isRainbow = settings.color === 'rainbow';
  if (isRainbow) {
      ctx.strokeStyle = createRainbowGradient(ctx, width, height);
      ctx.shadowColor = 'rgba(255,255,255,0.5)';
  } else {
      ctx.strokeStyle = settings.color;
      ctx.shadowColor = settings.color;
  }
  
  ctx.shadowBlur = settings.lineThickness * 2;
  ctx.beginPath();

  const sliceWidth = width * 1.0 / bufferLength;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const v = (data[i] - 128) / 128.0;
    const y = (height / 2) + (v * (height / 2) * settings.amplitude);

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);

    x += sliceWidth;
  }
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
};

// 3. Circular Bars
export const drawCircle = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 4;
  const isRainbow = settings.color === 'rainbow';

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 10, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; 
  ctx.lineWidth = 1;
  ctx.stroke();

  const barsToDraw = 180;
  const step = Math.floor(bufferLength / barsToDraw);

  ctx.lineWidth = settings.lineThickness;
  ctx.lineCap = 'round';
  
  if (!isRainbow) {
      ctx.strokeStyle = settings.color;
      ctx.shadowBlur = settings.lineThickness;
      ctx.shadowColor = settings.color;
  } else {
      ctx.shadowBlur = 0;
  }

  for (let i = 0; i < barsToDraw; i++) {
    const value = data[i * step] || 0;
    const scaledValue = (value / 255) * (radius) * settings.amplitude;

    const rad = (Math.PI * 2) * (i / barsToDraw) - (Math.PI / 2);
    const rOuter = radius + Math.max(5, scaledValue);

    if (isRainbow) {
        const hue = (i / barsToDraw) * 360;
        ctx.strokeStyle = `hsl(${hue}, 100%, 50%)`;
        ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
        ctx.shadowBlur = settings.lineThickness;
    }

    ctx.beginPath();
    ctx.moveTo(centerX + Math.cos(rad) * radius, centerY + Math.sin(rad) * radius);
    ctx.lineTo(centerX + Math.cos(rad) * rOuter, centerY + Math.sin(rad) * rOuter);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
};

// 5. Dual Bars (Mirrored vertically)
export const drawDualBars = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
    const centerY = height / 2;
    const gap = settings.lineThickness;
    const meaningfulBufferLength = Math.floor(bufferLength * 0.5);
    const barWidth = Math.max(2, ((width / meaningfulBufferLength) * 2) - gap); 
    const isRainbow = settings.color === 'rainbow';
    
    let x = 0;
    
    if (!isRainbow) ctx.fillStyle = settings.color;

    for (let i = 0; i < meaningfulBufferLength; i++) {
        const val = data[i];
        const barHeight = (val / 255) * (height / 2) * settings.amplitude;
        
        if (isRainbow) {
            const hue = (i / meaningfulBufferLength) * 360;
            ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        }

        // Draw Top
        ctx.fillRect(x, centerY - barHeight, barWidth, barHeight);
        // Draw Bottom
        ctx.fillRect(x, centerY, barWidth, barHeight);
        
        x += barWidth + gap;
    }
};

// 6. Ripple (Concentric Circles)
export const drawRipple = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.max(width, height) / 2;
    const isRainbow = settings.color === 'rainbow';
    
    ctx.lineWidth = settings.lineThickness;
    if (!isRainbow) ctx.strokeStyle = settings.color;
    
    // Draw 10-20 concentric circles based on frequency bands
    const bands = 20;
    const step = Math.floor(bufferLength / bands);
    
    for (let i = 0; i < bands; i++) {
        const val = data[i * step];
        const scale = (val / 255) * settings.amplitude;
        
        if (scale > 0.1) {
            const r = (i / bands) * maxRadius;
            // Modulate opacity and thickness by amplitude
            ctx.globalAlpha = Math.min(1, scale);
            ctx.lineWidth = settings.lineThickness * scale * 3;
            
            if (isRainbow) {
                const hue = (i / bands) * 360;
                ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`;
            }

            ctx.beginPath();
            ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    ctx.globalAlpha = 1.0;
};

// 7. Pixel (Retro Blocks)
export const drawPixel = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
    const gap = 2;
    const blockSize = settings.lineThickness * 4; // Larger blocks
    const cols = Math.floor(width / (blockSize + gap));
    const step = Math.floor(bufferLength / cols);
    const isRainbow = settings.color === 'rainbow';
    
    if (!isRainbow) ctx.fillStyle = settings.color;
    
    for (let i = 0; i < cols; i++) {
        const val = data[i * step];
        const barHeight = (val / 255) * height * settings.amplitude;
        const numBlocks = Math.floor(barHeight / (blockSize + gap));
        
        const x = i * (blockSize + gap);
        
        if (isRainbow) {
            const hue = (i / cols) * 360;
            ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
        }

        for (let j = 0; j < numBlocks; j++) {
            const y = height - (j * (blockSize + gap)) - blockSize;
            
            // Variate opacity for retro fade effect
            ctx.globalAlpha = 0.5 + (j / numBlocks) * 0.5;
            ctx.fillRect(x, y, blockSize, blockSize);
        }
    }
    ctx.globalAlpha = 1.0;
};

// 8. Equalizer (Segmented LED)
export const drawEqualizer = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
    const gapX = settings.lineThickness;
    const gapY = 2;
    const meaningfulBufferLength = Math.floor(bufferLength * 0.6);
    const barWidth = Math.max(4, ((width / meaningfulBufferLength) * 2.5) - gapX);
    const isRainbow = settings.color === 'rainbow';
    
    const segmentHeight = 5;
    
    let x = 0;
    
    for (let i = 0; i < meaningfulBufferLength; i++) {
        const val = data[i];
        const barHeight = (val / 255) * height * settings.amplitude;
        const segments = Math.floor(barHeight / (segmentHeight + gapY));
        
        const rainbowHue = (i / meaningfulBufferLength) * 360;

        for (let j = 0; j < segments; j++) {
            const y = height - ((j + 1) * (segmentHeight + gapY));
            
            if (isRainbow) {
                // If rainbow, use spectrum horizontally
                ctx.fillStyle = `hsl(${rainbowHue}, 100%, 60%)`;
            } else {
                // Color gradient simulation logic based on height
                if (j > 30) ctx.fillStyle = '#ef4444'; // Red peak
                else if (j > 20) ctx.fillStyle = '#f59e0b'; // Amber mid
                else ctx.fillStyle = settings.color; // Base color
            }
            
            ctx.fillRect(x, y, barWidth, segmentHeight);
        }
        
        x += barWidth + gapX;
        if (x > width) break;
    }
};

// 9. Starburst (Radial Lines)
export const drawStarburst = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2;
    const isRainbow = settings.color === 'rainbow';
    
    const lines = 64; // Fixed number of rays
    const step = Math.floor(bufferLength / lines);
    
    ctx.lineWidth = settings.lineThickness;
    ctx.lineCap = 'round';
    
    for (let i = 0; i < lines; i++) {
        const val = data[i * step];
        const amp = (val / 255) * settings.amplitude;
        
        if (amp > 0.05) {
            const angle = (Math.PI * 2 * i) / lines;
            const len = amp * maxRadius;
            
            const xStart = centerX + Math.cos(angle) * 20; // Inner offset
            const yStart = centerY + Math.sin(angle) * 20;
            
            const xEnd = centerX + Math.cos(angle) * (20 + len);
            const yEnd = centerY + Math.sin(angle) * (20 + len);
            
            if (isRainbow) {
                const hue = (i / lines) * 360;
                ctx.strokeStyle = `hsl(${hue}, 100%, 60%)`;
                ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;
            } else {
                ctx.strokeStyle = settings.color;
                ctx.shadowColor = settings.color;
            }

            ctx.shadowBlur = amp * 10;
            
            ctx.beginPath();
            ctx.moveTo(xStart, yStart);
            ctx.lineTo(xEnd, yEnd);
            ctx.stroke();
            
            // Draw tip dot
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(xEnd, yEnd, settings.lineThickness, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.shadowBlur = 0;
};

// 10. Butterfly (Mirrored Polar)
export const drawButterfly = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = Math.min(width, height) / 3;
    const isRainbow = settings.color === 'rainbow';
    
    if (isRainbow) {
        // For butterfly, single stroke is hard to rainbow-ize without gradient
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, 'red');
        gradient.addColorStop(0.2, 'orange');
        gradient.addColorStop(0.4, 'yellow');
        gradient.addColorStop(0.6, 'green');
        gradient.addColorStop(0.8, 'blue');
        gradient.addColorStop(1, 'violet');
        ctx.strokeStyle = gradient;
        ctx.shadowColor = 'rgba(255,255,255,0.5)';
    } else {
        ctx.strokeStyle = settings.color;
        ctx.shadowColor = settings.color;
    }

    ctx.lineWidth = settings.lineThickness;
    ctx.shadowBlur = 5;
    
    ctx.beginPath();
    const points = 100;
    const step = Math.floor(bufferLength / points);
    
    // Draw right wing
    for (let i = 0; i <= points; i++) {
        const val = data[i * step];
        const r = (0.5 + (val / 255) * settings.amplitude) * scale;
        const theta = (i / points) * Math.PI; // 0 to PI
        
        // Butterfly parametric-ish modification
        const x = centerX + r * Math.sin(theta) * Math.cos(theta * 2); 
        const y = centerY - r * Math.cos(theta); // Upward orientation
        
        if (i===0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Draw left wing (mirrored X)
    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
        const val = data[i * step];
        const r = (0.5 + (val / 255) * settings.amplitude) * scale;
        const theta = (i / points) * Math.PI; 
        
        const x = centerX - (r * Math.sin(theta) * Math.cos(theta * 2)); // Negative X offset
        const y = centerY - r * Math.cos(theta);
        
        if (i===0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
};

// 11. Aurora (Rainbow Spectrum Wave)
// Always Rainbow - ignores settings.color usually, but logic is self-contained.
export const drawAurora = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
    const centerY = height / 2;
    
    // Create Rainbow Gradient (Red -> Violet)
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0.0, '#ff3333'); // Red
    gradient.addColorStop(0.16, '#ffaa33'); // Orange
    gradient.addColorStop(0.33, '#ffff33'); // Yellow
    gradient.addColorStop(0.50, '#33ff33'); // Green
    gradient.addColorStop(0.66, '#33ffff'); // Cyan
    gradient.addColorStop(0.83, '#3333ff'); // Blue
    gradient.addColorStop(1.0, '#aa33ff'); // Violet

    // Settings
    const smoothingStep = Math.max(1, Math.floor(bufferLength / 128)); // Reduce points for smoother curve
    
    // Function to draw one side (up or down)
    const drawSide = (flip: boolean, opacity: number) => {
        ctx.fillStyle = gradient;
        ctx.globalAlpha = opacity;
        
        ctx.beginPath();
        ctx.moveTo(0, centerY);

        let px = 0;
        let py = centerY;
        
        const sliceWidth = width / (bufferLength / smoothingStep);
        let x = 0;

        for (let i = 0; i < bufferLength; i += smoothingStep) {
            const val = data[i];
            // Amplitude scaling
            const barHeight = (val / 255) * (height / 2.5) * settings.amplitude;
            
            const targetX = x;
            const targetY = flip ? centerY + barHeight : centerY - barHeight;

            if (i === 0) {
                ctx.moveTo(targetX, targetY);
            } else {
                // Quadratic curve for smooth peaks
                const cx = (px + targetX) / 2;
                const cy = (py + targetY) / 2;
                ctx.quadraticCurveTo(px, py, cx, cy);
            }

            px = targetX;
            py = targetY;
            x += sliceWidth;
        }

        ctx.lineTo(width, centerY);
        ctx.closePath();
        ctx.fill();
        
        // Optional: White line on top for definition
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.stroke();
    };

    // Draw Top
    drawSide(false, 0.9);
    
    // Draw Bottom (Reflection)
    drawSide(true, 0.4);

    ctx.globalAlpha = 1.0;
};

// 12. Spectrum (Center-Out Rainbow Dots)
// Always Rainbow
export const drawSpectrum = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
    const centerY = height / 2;
    const meaningfulBufferLength = Math.floor(bufferLength * 0.7); // Drop high freq silence
    
    // Determine bar size
    const gapX = 4;
    // Calculate optimal bar width to fill screen
    const availableWidth = width;
    // Calculate how many bars we can fit with minimum width
    const minBarWidth = 6;
    let barWidth = Math.max(minBarWidth, (availableWidth / meaningfulBufferLength) - gapX);
    
    // Recalculate how many items to skip if bars are too dense
    const itemsToDraw = Math.floor(availableWidth / (barWidth + gapX));
    const step = Math.ceil(meaningfulBufferLength / itemsToDraw);

    const dotSize = barWidth;
    const gapY = 3;
    
    let x = (width - (itemsToDraw * (barWidth + gapX))) / 2; // Center horizontally
    
    // Pre-set shadow to avoid context switching cost inside loop if possible, 
    // but color changes per bar so we must set it.
    ctx.shadowBlur = 8;

    for (let i = 0; i < meaningfulBufferLength; i += step) {
        if (x > width) break;
        
        const val = data[i];
        if (val < 5) { 
            x += barWidth + gapX; 
            continue; 
        }

        const amplitude = (val / 255) * (height / 2.2) * settings.amplitude;
        
        // Color mapping: Pink(340) -> Blue -> Green -> Yellow(40)
        // Map i (0 to meaningfulBufferLength) to Hue (340 to 40)
        const percent = i / meaningfulBufferLength;
        const hue = Math.floor(340 - (percent * 300)); // Use integer for slightly faster string concat
        
        const color = `hsl(${hue}, 100%, 60%)`;
        ctx.fillStyle = color;
        ctx.shadowColor = color; // Reuse calculated color

        const numDots = Math.floor(amplitude / (dotSize + gapY));
        
        // Draw Dots Center-Out
        for (let j = 0; j < numDots; j++) {
            const yOffset = j * (dotSize + gapY);
            
            // Top
            ctx.beginPath();
            ctx.arc(x + dotSize/2, centerY - yOffset - dotSize/2, dotSize/2, 0, Math.PI*2);
            ctx.fill();
            
            // Bottom (Mirror)
            ctx.beginPath();
            ctx.arc(x + dotSize/2, centerY + yOffset + dotSize/2, dotSize/2, 0, Math.PI*2);
            ctx.fill();
        }
        
        x += barWidth + gapX;
    }
    ctx.shadowBlur = 0;
};

// 13. Dot Wave (Horizontal Dots)
// Always Rainbow
export const drawDotWave = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
    const centerY = height / 2;
    const meaningfulLength = Math.floor(bufferLength * 0.75);
    const gapX = 4;
    const dotSize = Math.max(2, (width / meaningfulLength) - gapX);
    const gapY = 4;
    
    let x = (width - (meaningfulLength * (dotSize + gapX))) / 2;
    if (x < 0) x = 0;

    for (let i = 0; i < meaningfulLength; i++) {
        const val = data[i];
        if (x > width) break;

        // Rainbow gradient x-axis
        const hue = (i / meaningfulLength) * 360;
        ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
        
        if (val > 10) {
            const amplitude = (val / 255) * height * settings.amplitude * 0.8;
            const numDots = Math.floor(amplitude / (dotSize + gapY));
            
            // Draw center dot
            ctx.beginPath();
            ctx.arc(x + dotSize/2, centerY, dotSize/2, 0, Math.PI*2);
            ctx.fill();

            // Draw vertically expanding dots
            for (let j = 1; j <= numDots / 2; j++) {
                const offset = j * (dotSize + gapY);
                
                // Up
                ctx.beginPath();
                ctx.arc(x + dotSize/2, centerY - offset, dotSize/2, 0, Math.PI*2);
                ctx.fill();
                
                // Down
                ctx.beginPath();
                ctx.arc(x + dotSize/2, centerY + offset, dotSize/2, 0, Math.PI*2);
                ctx.fill();
            }
        }
        x += dotSize + gapX;
    }
};

// 14. LED Bars (Segmented Rainbow)
// Always Rainbow
export const drawLedBars = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
    const meaningfulLength = Math.floor(bufferLength * 0.7);
    const gapX = 4;
    const barWidth = Math.max(4, (width / meaningfulLength) - gapX);
    const segmentHeight = 6;
    const gapY = 2;

    let x = (width - (meaningfulLength * (barWidth + gapX))) / 2;
    if (x < 0) x = 0;

    for (let i = 0; i < meaningfulLength; i++) {
        if (x > width) break;
        
        const val = data[i];
        
        // Gradient Color (Purple -> Red -> Yellow -> Green -> Blue)
        const hue = 320 - ((i / meaningfulLength) * 280); 
        ctx.fillStyle = `hsl(${hue}, 100%, 55%)`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = `hsl(${hue}, 100%, 55%)`;

        const barHeight = (val / 255) * height * settings.amplitude * 0.8;
        const numSegments = Math.floor(barHeight / (segmentHeight + gapY));

        for (let j = 0; j < numSegments; j++) {
            const y = height - (j * (segmentHeight + gapY)) - 10; // padding bottom
            
            // Manual Rounded Rect
            ctx.beginPath();
            const r = 2;
            const bw = barWidth;
            const sh = segmentHeight;
            
            ctx.moveTo(x + r, y - sh);
            ctx.lineTo(x + bw - r, y - sh);
            ctx.quadraticCurveTo(x + bw, y - sh, x + bw, y - sh + r);
            ctx.lineTo(x + bw, y - r);
            ctx.quadraticCurveTo(x + bw, y, x + bw - r, y);
            ctx.lineTo(x + r, y);
            ctx.quadraticCurveTo(x, y, x, y - r);
            ctx.lineTo(x, y - sh + r);
            ctx.quadraticCurveTo(x, y - sh, x + r, y - sh);
            ctx.fill();
        }
        
        x += barWidth + gapX;
    }
    ctx.shadowBlur = 0;
};

// 15. Fluid (Gradient Fluid)
export const drawFluid = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
    // Smoother stepping for fluid look
    const step = Math.ceil(bufferLength / 32); 
    const sliceWidth = width / (bufferLength / step);
    const isRainbow = settings.color === 'rainbow';
    
    let gradient: CanvasGradient;
    
    // Create Vibrant Gradient
    if (isRainbow) {
        gradient = createRainbowGradient(ctx, width, height, false); // Vertical
    } else {
        gradient = ctx.createLinearGradient(0, height * 0.2, 0, height);
        gradient.addColorStop(0, settings.color);
        gradient.addColorStop(0.3, '#33ccff'); // Cyan mid
        gradient.addColorStop(0.7, '#9933ff'); // Violet mid
        gradient.addColorStop(1, '#ff33aa');   // Pink end
    }
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, height);

    let x = 0;
    let prevX = 0;
    let prevY = height;

    for(let i = 0; i < bufferLength; i += step) {
        const val = data[i];
        // Logarithmic scaling for better "hills"
        const amp = Math.pow(val / 255.0, 1.5) * height * settings.amplitude;
        const y = height - amp;
        
        if (i === 0) {
            ctx.lineTo(x, y);
        } else {
             // Cubic Bezier for ultra smooth liquid look
             const cp1x = prevX + (x - prevX) / 2;
             const cp1y = prevY;
             const cp2x = prevX + (x - prevX) / 2;
             const cp2y = y;
             ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
        }
        
        prevX = x;
        prevY = y;
        x += sliceWidth;
    }
    
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1.0;
    
    // Top highlight line
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ffffff';
    ctx.stroke();
    ctx.shadowBlur = 0;
};

// 16. Particle Spectrum (Cute Pastel Version)
// Always Pastel Rainbow (Fixed Palette)
export const drawParticleSpectrum = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
    const meaningfulLength = Math.floor(bufferLength * 0.7);
    const numParticles = 150; // High count for "dust" effect
    const time = timestamp / 1000;

    // Cute Pastel Palette
    const colors = [
        '#FF9AA2', '#FFB7B2', '#FFDAC1', '#E2F0CB', '#B5EAD7', '#C7CEEA', '#FFF5BA', '#FF99CC', '#99CCFF'
    ];

    for (let i = 0; i < numParticles; i++) {
        // Map to frequency data
        // Distribute particles across frequency range
        const dataIndex = Math.floor((i / numParticles) * meaningfulLength);
        const val = data[dataIndex] || 0;
        const normalizedVal = val / 255;
        const amp = normalizedVal * settings.amplitude;

        // Base Visibility threshold
        if (amp < 0.05) continue;

        // Position Logic
        // X: Base position + Sine wave drift
        const seed = i * 123.456; // Pseudo-random seed based on index
        const xBase = (i / numParticles) * width;
        const driftX = Math.sin(time + seed) * 30;
        let x = xBase + driftX;

        // Wrap X
        if (x < 0) x += width;
        if (x > width) x -= width;

        // Y: Float Upwards + Beat Lift
        const speed = 20 + (i % 10) * 10;
        const yBase = (time * speed + seed * 100) % (height + 100);
        let y = height + 50 - yBase;

        // Beat interaction: Loud sounds push particles up momentarily
        y -= Math.pow(amp, 2) * 100;

        // Appearance
        const size = (2 + (i % 4) * 2) + (amp * 10); // Base size + Audio reaction
        const color = colors[i % colors.length];

        ctx.globalAlpha = 0.4 + (amp * 0.6); // Beat controls opacity

        // Draw Particle
        ctx.beginPath();
        // Shape variation: mostly circles, some stars or diamonds could be cute but circle is safest "cute" shape
        ctx.arc(x, y, size, 0, Math.PI * 2);
        
        ctx.fillStyle = color;
        ctx.fill();

        // Optional: Cute "Glow" or "Halo" for loud particles
        if (amp > 0.6) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.stroke();
        }

        // Decor: Small white dot for shine
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(x - size * 0.3, y - size * 0.3, size * 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1.0;
    }
};

// 17. Jelly Wave (New)
export const drawJellyWave = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
    const time = timestamp / 2000; // Slow time
    const centerY = height / 2;
    const isRainbow = settings.color === 'rainbow';

    // Use a subset of data for smoother curve
    const step = Math.floor(bufferLength / 20); 
    
    // Draw 3 layers for depth
    for(let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        
        const layerOffset = layer * 30; // Vertical separation
        const phaseOffset = layer * 2; // Different wiggle phase
        const colorAlpha = 0.3 + (layer * 0.15);
        
        ctx.moveTo(0, height); // Start bottom left

        let firstPoint = true;
        let prevX = 0;
        let prevY = height;

        for(let i = 0; i <= bufferLength; i += step) {
            const x = (i / bufferLength) * width;
            
            // Audio data
            const val = data[i] || 0;
            // Soft dampening
            const audioAmp = (val / 255) * height * 0.4 * settings.amplitude;
            
            // Jelly Sine Wave
            // Add time-based sine wave for the "Jelly" wobble
            // Frequency varies slightly across width
            const jelly = Math.sin((i / bufferLength) * 4 + time + phaseOffset) * 40;
            const jelly2 = Math.cos((i / bufferLength) * 9 - time * 2) * 20;

            const y = height - (audioAmp + jelly + jelly2) - 100 + layerOffset;

            if (firstPoint) {
                ctx.lineTo(x, y);
                firstPoint = false;
            } else {
                const cx = (prevX + x) / 2;
                const cy = (prevY + y) / 2;
                ctx.quadraticCurveTo(prevX, prevY, cx, cy);
            }
            
            prevX = x;
            prevY = y;
        }
        
        ctx.lineTo(width, prevY);
        ctx.lineTo(width, height);
        ctx.closePath();

        if (isRainbow) {
            const gradient = createRainbowGradient(ctx, width, height, true);
            ctx.fillStyle = gradient;
        } else {
            ctx.fillStyle = settings.color;
        }
        
        ctx.globalAlpha = colorAlpha;
        ctx.fill();
        
        // Shiny top edge
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
};

// 18. Pulse Circles (Heartbeat)
export const drawPulseCircles = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Calculate Bass Energy for the main pulse
    let bass = 0;
    for(let i=0; i<10; i++) bass += data[i];
    bass = bass / 10; // 0-255
    
    const normBass = bass / 255;
    const scale = settings.amplitude;
    const isRainbow = settings.color === 'rainbow';
    
    // Base radius roughly matches the potential logo size (approx 15% of screen)
    // We add a bit of padding so it surrounds the logo
    const baseRadius = Math.min(width, height) * 0.18; 
    
    const circles = 4;
    
    ctx.lineWidth = settings.lineThickness;
    
    for (let i = 0; i < circles; i++) {
        // Echo effect: Outer circles expand more but with delay simulation
        const offset = i * 25; // Gap between rings
        const expansion = normBass * (height * 0.15) * scale; // Expansion amount
        
        // Inner circle moves instantly, outer circles lag slightly in visual magnitude
        const r = baseRadius + offset + (expansion * (1 + i * 0.3)); 
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
        
        // Opacity fades for outer rings
        // Dynamic opacity based on beat
        const beatAlpha = 0.5 + (normBass * 0.5);
        const layerAlpha = Math.max(0, 1 - (i / circles));
        const alpha = beatAlpha * layerAlpha;
        
        if (isRainbow) {
            const hue = (i / circles) * 360; // Just gradient rings
            const beatHue = (timestamp / 10) % 360; // Rotating colors
            ctx.strokeStyle = `hsl(${beatHue + (i * 30)}, 100%, 60%)`;
        } else {
            ctx.strokeStyle = settings.color;
        }
        
        // Dynamic width: Loud = Thicker
        ctx.lineWidth = settings.lineThickness * (1 + (normBass * (1 - i/circles)));
        
        ctx.globalAlpha = alpha;
        ctx.stroke();
        ctx.closePath();
    }
    ctx.globalAlpha = 1.0;
};

// 19. Flower Petals (New)
export const drawFlowerPetals = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings, timestamp: number = 0) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2.5;
    const time = timestamp / 2000; // Slow rotation

    const isRainbow = settings.color === 'rainbow';
    
    // Number of petals - fewer for a defined flower look
    const numPetals = 24;
    const step = Math.floor(bufferLength / numPetals);
    
    // Calculate Bass for Center Pulse
    let bass = 0;
    for(let i=0; i<10; i++) bass += data[i];
    bass = bass / 10; 
    const normBass = bass / 255;
    
    // Rotate the whole flower slowly
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(time); 
    
    // Draw Petals
    for (let i = 0; i < numPetals; i++) {
        // Get frequency data for this petal
        // Average a small chunk for stability
        let val = 0;
        for(let k=0; k<step; k++) val += data[i*step + k] || 0;
        val /= step;
        
        const amp = (val / 255) * settings.amplitude;
        
        // Skip tiny petals
        if (amp < 0.05) continue;
        
        const angle = (Math.PI * 2 * i) / numPetals;
        const petalLen = maxRadius * amp;
        const petalWidth = (Math.PI * 2 * maxRadius) / numPetals * 0.6; // Width at widest point
        
        // Base Radius (Pistil size)
        const rBase = 30 + (normBass * 20); 
        
        // Tip Coordinate
        const tipX = Math.cos(angle) * (rBase + petalLen);
        const tipY = Math.sin(angle) * (rBase + petalLen);
        
        // Base Coordinates (slightly offset for width)
        // We actually want a bezier curve: Base -> Control Point 1 -> Tip -> Control Point 2 -> Base
        
        // Calculate control points for "fat" petals
        const cpAngleLeft = angle - (Math.PI * 2 / numPetals) * 0.5;
        const cpAngleRight = angle + (Math.PI * 2 / numPetals) * 0.5;
        
        const cpDist = rBase + (petalLen * 0.5);
        
        const cp1x = Math.cos(cpAngleLeft) * cpDist;
        const cp1y = Math.sin(cpAngleLeft) * cpDist;
        
        const cp2x = Math.cos(cpAngleRight) * cpDist;
        const cp2y = Math.sin(cpAngleRight) * cpDist;
        
        const baseX = Math.cos(angle) * rBase;
        const baseY = Math.sin(angle) * rBase;
        
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        // Left curve
        ctx.quadraticCurveTo(cp1x, cp1y, tipX, tipY);
        // Right curve
        ctx.quadraticCurveTo(cp2x, cp2y, baseX, baseY);
        
        // Color
        if (isRainbow) {
            const hue = (i / numPetals) * 360;
            ctx.fillStyle = `hsla(${hue}, 100%, 60%, 0.8)`;
            ctx.strokeStyle = `hsl(${hue}, 100%, 80%)`;
        } else {
            ctx.fillStyle = settings.color;
            ctx.globalAlpha = 0.8;
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        }
        
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
    
    // Draw Center (Pistil)
    ctx.beginPath();
    const centerRadius = 25 + (normBass * 15);
    ctx.arc(0, 0, centerRadius, 0, Math.PI * 2);
    
    if (isRainbow) {
        ctx.fillStyle = '#fff';
    } else {
        ctx.fillStyle = '#fff'; // White center usually looks best or yellow
    }
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'white';
    ctx.fill();
    
    // Stamen dots
    ctx.fillStyle = '#333';
    ctx.shadowBlur = 0;
    for(let i=0; i<5; i++) {
        const a = (i/5) * Math.PI * 2 + time * 2;
        const r = centerRadius * 0.5;
        ctx.beginPath();
        ctx.arc(Math.cos(a)*r, Math.sin(a)*r, 2, 0, Math.PI*2);
        ctx.fill();
    }
    
    ctx.restore();
};