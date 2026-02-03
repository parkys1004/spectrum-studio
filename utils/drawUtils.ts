import { VisualizerSettings } from '../types';

// 1. Classic Bars
export const drawBars = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings) => {
  const gap = settings.lineThickness;
  const meaningfulBufferLength = Math.floor(bufferLength * 0.6);
  const barWidth = Math.max(2, ((width / meaningfulBufferLength) * 2.5) - gap); 
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const val = data[i];
    const barHeight = Math.max(4, (val / 255) * height * settings.amplitude);

    const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
    gradient.addColorStop(0, settings.color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(x, height - barHeight, barWidth, barHeight);

    x += barWidth + gap; 
    if (x > width) break;
  }
};

// 2. Waveform Line
export const drawLine = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings) => {
  ctx.lineWidth = settings.lineThickness;
  ctx.strokeStyle = settings.color;
  ctx.shadowBlur = settings.lineThickness * 2;
  ctx.shadowColor = settings.color;
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
export const drawCircle = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings) => {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 4;

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius - 10, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; 
  ctx.lineWidth = 1;
  ctx.stroke();

  const barsToDraw = 180;
  const step = Math.floor(bufferLength / barsToDraw);

  ctx.strokeStyle = settings.color;
  ctx.lineWidth = settings.lineThickness;
  ctx.lineCap = 'round';
  ctx.shadowBlur = settings.lineThickness;
  ctx.shadowColor = settings.color;

  for (let i = 0; i < barsToDraw; i++) {
    const value = data[i * step] || 0;
    const scaledValue = (value / 255) * (radius) * settings.amplitude;

    const rad = (Math.PI * 2) * (i / barsToDraw) - (Math.PI / 2);
    const rOuter = radius + Math.max(5, scaledValue);

    ctx.beginPath();
    ctx.moveTo(centerX + Math.cos(rad) * radius, centerY + Math.sin(rad) * radius);
    ctx.lineTo(centerX + Math.cos(rad) * rOuter, centerY + Math.sin(rad) * rOuter);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
};

// 4. Filled Wave (Mountain)
export const drawFilledWave = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings) => {
    ctx.beginPath();
    ctx.moveTo(0, height);
    
    const sliceWidth = width / bufferLength;
    let x = 0;
    
    // Smooth curve
    for (let i = 0; i < bufferLength; i++) {
        // Use Frequency data but map to 0-height
        const val = data[i];
        const y = height - ((val / 255) * height * settings.amplitude);
        
        // Quad curve for smoothness
        if (i === 0) ctx.lineTo(x, y);
        else {
             const prevX = x - sliceWidth;
             const prevY = height - ((data[i-1] / 255) * height * settings.amplitude);
             const cx = (prevX + x) / 2;
             const cy = (prevY + y) / 2;
             ctx.quadraticCurveTo(prevX, prevY, cx, cy);
        }
        x += sliceWidth;
    }
    
    ctx.lineTo(width, height);
    ctx.closePath();
    
    ctx.fillStyle = settings.color;
    ctx.globalAlpha = 0.6;
    ctx.fill();
    ctx.globalAlpha = 1.0;
    
    // Top Line
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
};

// 5. Dual Bars (Mirrored vertically)
export const drawDualBars = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings) => {
    const centerY = height / 2;
    const gap = settings.lineThickness;
    const meaningfulBufferLength = Math.floor(bufferLength * 0.5);
    const barWidth = Math.max(2, ((width / meaningfulBufferLength) * 2) - gap); 
    
    let x = 0;
    ctx.fillStyle = settings.color;

    for (let i = 0; i < meaningfulBufferLength; i++) {
        const val = data[i];
        const barHeight = (val / 255) * (height / 2) * settings.amplitude;
        
        // Draw Top
        ctx.fillRect(x, centerY - barHeight, barWidth, barHeight);
        // Draw Bottom
        ctx.fillRect(x, centerY, barWidth, barHeight);
        
        x += barWidth + gap;
    }
};

// 6. Ripple (Concentric Circles)
export const drawRipple = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.max(width, height) / 2;
    
    ctx.lineWidth = settings.lineThickness;
    ctx.strokeStyle = settings.color;
    
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
            
            ctx.beginPath();
            ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
            ctx.stroke();
        }
    }
    ctx.globalAlpha = 1.0;
};

// 7. Pixel (Retro Blocks)
export const drawPixel = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings) => {
    const gap = 2;
    const blockSize = settings.lineThickness * 4; // Larger blocks
    const cols = Math.floor(width / (blockSize + gap));
    const step = Math.floor(bufferLength / cols);
    
    ctx.fillStyle = settings.color;
    
    for (let i = 0; i < cols; i++) {
        const val = data[i * step];
        const barHeight = (val / 255) * height * settings.amplitude;
        const numBlocks = Math.floor(barHeight / (blockSize + gap));
        
        const x = i * (blockSize + gap);
        
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
export const drawEqualizer = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings) => {
    const gapX = settings.lineThickness;
    const gapY = 2;
    const meaningfulBufferLength = Math.floor(bufferLength * 0.6);
    const barWidth = Math.max(4, ((width / meaningfulBufferLength) * 2.5) - gapX);
    
    const segmentHeight = 5;
    
    let x = 0;
    
    for (let i = 0; i < meaningfulBufferLength; i++) {
        const val = data[i];
        const barHeight = (val / 255) * height * settings.amplitude;
        const segments = Math.floor(barHeight / (segmentHeight + gapY));
        
        for (let j = 0; j < segments; j++) {
            const y = height - ((j + 1) * (segmentHeight + gapY));
            
            // Color gradient simulation logic based on height
            if (j > 30) ctx.fillStyle = '#ef4444'; // Red peak
            else if (j > 20) ctx.fillStyle = '#f59e0b'; // Amber mid
            else ctx.fillStyle = settings.color; // Base color
            
            ctx.fillRect(x, y, barWidth, segmentHeight);
        }
        
        x += barWidth + gapX;
        if (x > width) break;
    }
};

// 9. Starburst (Radial Lines)
export const drawStarburst = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(width, height) / 2;
    
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
            
            ctx.strokeStyle = settings.color;
            ctx.shadowBlur = amp * 10;
            ctx.shadowColor = settings.color;
            
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
export const drawButterfly = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = Math.min(width, height) / 3;
    
    ctx.strokeStyle = settings.color;
    ctx.lineWidth = settings.lineThickness;
    ctx.shadowBlur = 5;
    ctx.shadowColor = settings.color;
    
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
export const drawAurora = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings) => {
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
export const drawSpectrum = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, data: Uint8Array, bufferLength: number, width: number, height: number, settings: VisualizerSettings) => {
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
            
            // Center Dot (Only once at j=0? No, standard center-out)
            
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