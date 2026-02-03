import React from 'react';
import { VisualizerSettings } from '../types';
import PropertyRow from './controls/PropertyRow';
import ColorRow from './controls/ColorRow';
import ImageUploadRow from './controls/ImageUploadRow';

interface EffectControlsProps {
  visualizerSettings: VisualizerSettings;
  onVisualizerChange: (newSettings: VisualizerSettings) => void;
}

const EffectControls: React.FC<EffectControlsProps> = ({ 
    visualizerSettings, 
    onVisualizerChange 
}) => {
  
  const handleVisualChange = (key: keyof VisualizerSettings, value: string | number | null) => {
    onVisualizerChange({ ...visualizerSettings, [key]: value });
  };

  const handleEffectParamChange = (key: keyof VisualizerSettings['effectParams'], value: number) => {
      onVisualizerChange({
          ...visualizerSettings,
          effectParams: {
              ...visualizerSettings.effectParams,
              [key]: value
          }
      });
  };

  const handleImageUpload = (key: 'backgroundImage' | 'logoImage' | 'stickerImage', file: File) => {
      const url = URL.createObjectURL(file);
      handleVisualChange(key, url);
  };

  return (
    <div className="flex flex-col min-h-full bg-[#121212]">
      {/* Visualizer Effects Section */}
      <div className="px-4 py-3 bg-black/20 border-b border-white/5 text-[10px] text-gray-400 font-bold uppercase tracking-[0.15em] flex items-center shadow-inner-light select-none">
         상세 설정 (PARAMETERS)
      </div>
      <div className="p-0">
         <ColorRow 
            label="테마 색상"
            value={visualizerSettings.color}
            onChange={(v) => handleVisualChange('color', v)}
         />
         <PropertyRow
            label="확대/축소"
            value={visualizerSettings.scale}
            min={0.1}
            max={5.0}
            step={0.01}
            onChange={(v) => handleVisualChange('scale', v)}
         />
         <PropertyRow
            label="가로 위치"
            value={visualizerSettings.positionX}
            min={-1000}
            max={1000}
            step={1}
            onChange={(v) => handleVisualChange('positionX', v)}
         />
         <PropertyRow
            label="세로 위치"
            value={visualizerSettings.positionY}
            min={-1000}
            max={1000}
            step={1}
            onChange={(v) => handleVisualChange('positionY', v)}
         />
         <PropertyRow
            label="선 두께/간격"
            value={visualizerSettings.lineThickness}
            min={1}
            max={20}
            step={1}
            onChange={(v) => handleVisualChange('lineThickness', v)}
            suffix="px"
         />
         <PropertyRow
            label="반응 감도"
            value={visualizerSettings.amplitude}
            min={0.1}
            max={5.0}
            step={0.05}
            onChange={(v) => handleVisualChange('amplitude', v)}
         />
         <PropertyRow
            label="부드러움"
            value={visualizerSettings.sensitivity}
            min={0.1}
            max={0.99}
            step={0.01}
            onChange={(v) => handleVisualChange('sensitivity', v)}
         />
      </div>

       {/* Effect Fine-Tuning Section */}
       <div className="px-4 py-3 bg-black/20 border-b border-white/5 border-t border-t-white/5 text-[10px] text-gray-400 font-bold uppercase tracking-[0.15em] shadow-inner-light select-none">
        효과 상세 설정 (FX DETAILS)
      </div>
      <div className="p-0">
        <PropertyRow
            label="속도 (SPEED)"
            value={visualizerSettings.effectParams.speed}
            min={0.1}
            max={3.0}
            step={0.1}
            onChange={(v) => handleEffectParamChange('speed', v)}
            suffix="x"
         />
         <PropertyRow
            label="밀도/강도"
            value={visualizerSettings.effectParams.intensity}
            min={0.1}
            max={3.0}
            step={0.1}
            onChange={(v) => handleEffectParamChange('intensity', v)}
            suffix="x"
         />
         <PropertyRow
            label="진동 세기"
            value={visualizerSettings.effectParams.shakeStrength}
            min={0.0}
            max={2.0}
            step={0.1}
            onChange={(v) => handleEffectParamChange('shakeStrength', v)}
         />
         <PropertyRow
            label="글리치 강도"
            value={visualizerSettings.effectParams.glitchStrength}
            min={0.0}
            max={2.0}
            step={0.1}
            onChange={(v) => handleEffectParamChange('glitchStrength', v)}
         />
      </div>

      {/* Assets Section */}
      <div className="px-4 py-3 bg-black/20 border-b border-white/5 border-t border-t-white/5 text-[10px] text-gray-400 font-bold uppercase tracking-[0.15em] shadow-inner-light select-none">
        오버레이 (OVERLAYS)
      </div>
      <div className="p-0">
        <ImageUploadRow 
            label="배경 이미지"
            currentImage={visualizerSettings.backgroundImage}
            onUpload={(file) => handleImageUpload('backgroundImage', file)}
            onRemove={() => handleVisualChange('backgroundImage', null)}
        />
        <ImageUploadRow 
            label="로고 / 워터마크"
            currentImage={visualizerSettings.logoImage}
            onUpload={(file) => handleImageUpload('logoImage', file)}
            onRemove={() => handleVisualChange('logoImage', null)}
        />
        {/* Logo Transformations (Only if logo exists) */}
        {visualizerSettings.logoImage && (
            <div className="bg-black/20 border-t border-dashed border-white/10 pb-2">
                 <div className="px-4 py-2 text-[9px] text-app-accent font-semibold flex items-center mb-1">
                    <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
                    로고 설정 (LOGO TRANSFORM)
                 </div>
                 <PropertyRow
                    label="로고 크기"
                    value={visualizerSettings.logoScale || 1.0}
                    min={0.1}
                    max={3.0}
                    step={0.01}
                    onChange={(v) => handleVisualChange('logoScale', v)}
                 />
                 <PropertyRow
                    label="가로 위치 %"
                    value={visualizerSettings.logoX ?? 95}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(v) => handleVisualChange('logoX', v)}
                    suffix="%"
                 />
                 <PropertyRow
                    label="세로 위치 %"
                    value={visualizerSettings.logoY ?? 5}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(v) => handleVisualChange('logoY', v)}
                    suffix="%"
                 />
            </div>
        )}

        <ImageUploadRow 
            label="스티커 / GIF"
            currentImage={visualizerSettings.stickerImage}
            onUpload={(file) => handleImageUpload('stickerImage', file)}
            onRemove={() => handleVisualChange('stickerImage', null)}
        />
        {/* Sticker Transformations (Only if sticker exists) */}
        {visualizerSettings.stickerImage && (
            <div className="bg-black/20 border-t border-dashed border-white/10 pb-2">
                 <div className="px-4 py-2 text-[9px] text-green-400 font-semibold flex items-center mb-1">
                    <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                    스티커 설정 (STICKER TRANSFORM)
                 </div>
                 <PropertyRow
                    label="스티커 크기"
                    value={visualizerSettings.stickerScale || 1.0}
                    min={0.1}
                    max={3.0}
                    step={0.01}
                    onChange={(v) => handleVisualChange('stickerScale', v)}
                 />
                 <PropertyRow
                    label="가로 위치 %"
                    value={visualizerSettings.stickerX ?? 50}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(v) => handleVisualChange('stickerX', v)}
                    suffix="%"
                 />
                 <PropertyRow
                    label="세로 위치 %"
                    value={visualizerSettings.stickerY ?? 50}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(v) => handleVisualChange('stickerY', v)}
                    suffix="%"
                 />
            </div>
        )}
      </div>

       <div className="mt-auto p-4 border-t border-white/5 bg-black/10">
        <button 
          onClick={() => {
              onVisualizerChange({ 
                  color: '#3ea6ff', 
                  lineThickness: 2, 
                  amplitude: 1.0, 
                  sensitivity: 0.85,
                  backgroundImage: null,
                  logoImage: null,
                  scale: 1.0,
                  positionX: 0,
                  positionY: 0,
                  logoScale: 1.0,
                  logoX: 95,
                  logoY: 5,
                  stickerImage: null,
                  stickerScale: 1.0,
                  stickerX: 50,
                  stickerY: 50,
                  effects: {
                    mirror: false,
                    pulse: false,
                    shake: false,
                    glitch: false,
                    snow: false,
                    rain: false,
                    raindrops: false,
                    particles: false,
                    fireworks: false,
                    starfield: false,
                    fog: false,
                    filmGrain: false,
                    vignette: false,
                    scanlines: false
                  },
                  effectParams: {
                      speed: 1.0,
                      intensity: 1.0,
                      shakeStrength: 1.0,
                      glitchStrength: 1.0
                  }
              });
          }}
          className="w-full py-2.5 text-xs bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-lg transition-all font-medium tracking-wide active:scale-95 shadow-lg"
        >
          모든 설정 초기화
        </button>
      </div>
    </div>
  );
};

export default EffectControls;