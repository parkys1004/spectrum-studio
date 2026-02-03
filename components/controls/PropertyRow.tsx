import React, { useRef, useState, useEffect, useCallback } from 'react';

interface PropertyRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  suffix?: string;
}

const PropertyRow: React.FC<PropertyRowProps> = ({ 
  label, 
  value, 
  min, 
  max, 
  step = 0.01,
  onChange, 
  suffix = "" 
}) => {
  // Precision helper for display
  const precision = step < 0.1 ? 2 : (step < 1 ? 1 : 0);
  
  // Local state for immediate UI feedback (60fps smooth)
  const [localValue, setLocalValue] = useState(value ?? 0);
  
  // Interaction states to prevent prop syncing conflicts
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Refs for throttling and calculation
  const valueRef = useRef(value ?? 0);
  const rafRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startValRef = useRef(0);

  // Sync local state when external prop value changes, BUT ONLY IF not currently interacting
  useEffect(() => {
      // If user is dragging, ignore parent updates to prevent jitter/fighting
      if (isDraggingSlider || isScrubbing) return;

      if (value !== undefined && value !== null && Math.abs(value - valueRef.current) > 0.0001) {
          setLocalValue(value);
          valueRef.current = value;
      }
  }, [value, isDraggingSlider, isScrubbing]);

  // Clean up RAF on unmount
  useEffect(() => {
      return () => {
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
  }, []);

  // Throttled Parent Update using requestAnimationFrame
  const updateParentThrottled = useCallback((newValue: number) => {
      valueRef.current = newValue;
      
      if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(() => {
              onChange(valueRef.current);
              rafRef.current = null;
          });
      }
  }, [onChange]);

  // Immediate Parent Update (Commit) - Used on Drag End
  const updateParentImmediate = useCallback((newValue: number) => {
      if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
      }
      valueRef.current = newValue;
      onChange(newValue);
  }, [onChange]);

  // --- Slider Logic ---

  const handleSliderDown = () => {
      setIsDraggingSlider(true);
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = parseFloat(e.target.value);
      setLocalValue(newVal); // Immediate UI update
      updateParentThrottled(newVal); // Throttled app update
  };

  const handleSliderUp = (e: React.PointerEvent | React.TouchEvent | React.KeyboardEvent) => {
      setIsDraggingSlider(false);
      updateParentImmediate(localValue);
  };

  // --- Number Scrubbing Logic (using Pointer Capture) ---

  const handleScrubDown = (e: React.PointerEvent) => {
      // Only Left Click
      if (e.pointerType === 'mouse' && e.button !== 0) return;

      e.preventDefault();
      const target = e.currentTarget as HTMLDivElement;
      
      // Critical: Lock pointer events to this element even if mouse moves outside
      target.setPointerCapture(e.pointerId);

      setIsScrubbing(true);
      startXRef.current = e.clientX;
      startValRef.current = localValue;
      
      // Visual feedback
      document.body.style.cursor = 'ew-resize';
  };

  const handleScrubMove = (e: React.PointerEvent) => {
      if (!isScrubbing) return;
      e.preventDefault();

      const currentX = e.clientX;
      const deltaX = currentX - startXRef.current;
      
      let multiplier = 1;
      const range = max - min;
      
      // Dynamic sensitivity based on range size
      if (range > 1000) multiplier = 1;      // Large range (e.g., position)
      else if (range > 100) multiplier = 0.5;
      else if (range <= 5) multiplier = 0.01; // Tiny range (e.g., amplitude)
      else multiplier = 0.05;

      const change = deltaX * multiplier;
      let newValue = startValRef.current + change;
      
      // Clamp
      newValue = Math.max(min, Math.min(max, newValue));
      
      // Snap to step if needed (optional, keeping it smooth usually feels better)
      if (step > 0) {
         newValue = Math.round(newValue / step) * step;
      }
      
      setLocalValue(newValue);
      updateParentThrottled(newValue);
  };

  const handleScrubUp = (e: React.PointerEvent) => {
      if (!isScrubbing) return;
      
      setIsScrubbing(false);
      const target = e.currentTarget as HTMLDivElement;
      target.releasePointerCapture(e.pointerId);
      
      updateParentImmediate(localValue);
      document.body.style.cursor = '';
  };

  return (
    <div className="flex items-center py-4 border-b border-white/5 group hover:bg-white/[0.02] px-4 transition-colors select-none">
      <div className="w-20 text-[10px] text-gray-500 font-bold uppercase tracking-wider truncate shrink-0">{label}</div>
      <div className="flex-1 mx-4 flex items-center relative h-8">
          {/* Native Range Slider */}
          <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={localValue}
              onPointerDown={handleSliderDown}
              onChange={handleSliderChange}
              onPointerUp={handleSliderUp}
              onKeyUp={(e) => { if(e.key === 'ArrowLeft' || e.key === 'ArrowRight') handleSliderUp(e); }}
              className="w-full h-full opacity-100 relative z-10 touch-none cursor-pointer" 
          />
      </div>
      
      {/* Number Display with Scrubbing */}
      <div 
          className={`w-16 text-right transition-colors touch-none select-none ${isScrubbing ? 'text-app-accent cursor-ew-resize' : 'text-gray-400 hover:text-white cursor-ew-resize'}`}
          onPointerDown={handleScrubDown}
          onPointerMove={handleScrubMove}
          onPointerUp={handleScrubUp}
          onPointerCancel={handleScrubUp} // Handle Alt-Tab or interruptions
          title="드래그하여 정밀 조정"
      >
          <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border transition-colors inline-block min-w-[32px] text-center ${
              isScrubbing 
              ? 'bg-app-accent/20 border-app-accent' 
              : 'bg-white/5 border-white/10 group-hover:border-white/20'
          }`}>
              {localValue.toFixed(precision)}{suffix}
          </span>
      </div>
    </div>
  );
};

export default PropertyRow;