import React from 'react';
import { VisualizerMode, VisualizerSettings } from '../types';

interface PresetPanelProps {
    currentMode: VisualizerMode;
    onModeChange: (mode: VisualizerMode) => void;
    settings: VisualizerSettings;
    onSettingsChange: (newSettings: VisualizerSettings) => void;
}

const PresetPanel: React.FC<PresetPanelProps> = ({
    currentMode,
    onModeChange,
    settings,
    onSettingsChange
}) => {

    const toggleEffect = (key: keyof VisualizerSettings['effects']) => {
        onSettingsChange({
            ...settings,
            effects: {
                ...settings.effects,
                [key]: !settings.effects[key]
            }
        });
    };

    const SpectrumButton = ({ mode, label, icon }: { mode: VisualizerMode, label: string, icon: React.ReactNode }) => {
        const isActive = currentMode === mode;
        return (
            <button
                onClick={() => onModeChange(mode)}
                className={`relative w-full aspect-square rounded-lg border flex flex-col items-center justify-center space-y-1.5 transition-all duration-300 group overflow-hidden ${
                    isActive
                        ? 'bg-app-accent/10 border-app-accent/40 shadow-[0_0_10px_rgba(62,166,255,0.1)]'
                        : 'bg-white/[0.03] border-white/5 hover:border-white/10 hover:bg-white/[0.06]'
                }`}
                title={label}
            >
                {/* Active Indicator Glow */}
                {isActive && <div className="absolute inset-0 bg-app-accent/5 blur-xl"></div>}

                <div className={`relative z-10 transition-colors duration-300 transform scale-75 ${isActive ? 'text-app-accent' : 'text-gray-500 group-hover:text-gray-300'}`}>
                    {icon}
                </div>
                {/* Optional: Hide label on very small buttons or use tiny font */}
                <span className={`relative z-10 text-[7px] font-bold uppercase tracking-wider transition-colors duration-300 truncate w-full px-1 text-center ${isActive ? 'text-white' : 'text-gray-600 group-hover:text-gray-400'}`}>
                    {label}
                </span>
                
                {/* Bottom line for active */}
                {isActive && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-app-accent shadow-[0_0_8px_rgba(62,166,255,1)]"></div>}
            </button>
        );
    };

    const EffectButton = ({ active, label, onClick, icon }: { active: boolean, label: string, onClick: () => void, icon?: React.ReactNode }) => (
        <button
            onClick={onClick}
            className={`relative w-full aspect-[4/3] rounded-lg border flex flex-col items-center justify-center p-2 transition-all duration-300 group ${
                active
                    ? 'bg-purple-500/10 border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.15)]'
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'
            }`}
            title={label}
        >
             {/* Active Dot */}
             <div className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full transition-all duration-300 ${active ? 'bg-purple-400 shadow-[0_0_5px_rgba(192,132,252,0.8)]' : 'bg-gray-700'}`}></div>

             <div className={`mb-1 transition-colors ${active ? 'text-purple-300' : 'text-gray-500 group-hover:text-gray-400'}`}>
                 {icon || <div className="w-5 h-5 bg-current opacity-20 rounded-sm"></div>}
             </div>
             
             <span className={`text-[8px] font-medium tracking-wide text-center leading-tight ${active ? 'text-purple-100' : 'text-gray-500 group-hover:text-gray-300'}`}>
                {label}
            </span>
        </button>
    );

    return (
        <div className="flex flex-col h-full bg-[#121212] overflow-y-auto custom-scrollbar">
            
            {/* 1. Spectrum Types */}
            <div className="p-3">
                <div className="flex items-center mb-3 opacity-70">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                    <span className="mx-3 text-[9px] font-bold text-gray-400 uppercase tracking-widest">시각화 (MODES)</span>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                </div>
                
                {/* 5 Columns Grid for Compact Layout */}
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                    <SpectrumButton 
                        mode={VisualizerMode.BARS} 
                        label="BARS" 
                        icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M4 9h4v11H4zM10 4h4v16h-4zM16 13h4v7h-4z"/></svg>}
                    />
                    <SpectrumButton 
                        mode={VisualizerMode.WAVE} 
                        label="WAVE" 
                        icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s3-7 6-7 6 7 8 7 8-7 8-7 6 7 6 7" strokeLinecap="round"/></svg>}
                    />
                    <SpectrumButton 
                        mode={VisualizerMode.CIRCULAR} 
                        label="CIRCLE" 
                        icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="7"/><path d="M12 5v2M12 17v2M5 12h2M17 12h2"/></svg>}
                    />
                     <SpectrumButton 
                        mode={VisualizerMode.FILLED} 
                        label="FILLED" 
                        icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M2 19h20v2H2z"/><path d="M2 12s3-5 6-5 6 5 8 5 8-5 8-5v12H2z" opacity="0.7"/></svg>}
                    />
                     <SpectrumButton 
                        mode={VisualizerMode.DUAL_BARS} 
                        label="DUAL" 
                        icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M4 10h4v4H4zM10 6h4v12h-4zM16 11h4v2h-4z"/></svg>}
                    />
                     <SpectrumButton 
                        mode={VisualizerMode.RIPPLE} 
                        label="RIPPLE" 
                        icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" opacity="0.6"/><circle cx="12" cy="12" r="10" opacity="0.3"/></svg>}
                    />
                     <SpectrumButton 
                        mode={VisualizerMode.PIXEL} 
                        label="PIXEL" 
                        icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="14" width="4" height="4"/><rect x="10" y="8" width="4" height="4"/><rect x="10" y="14" width="4" height="4"/><rect x="16" y="10" width="4" height="4"/><rect x="16" y="14" width="4" height="4"/></svg>}
                    />
                     <SpectrumButton 
                        mode={VisualizerMode.EQUALIZER} 
                        label="EQUALIZER" 
                        icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="12" width="4" height="2"/><rect x="4" y="15" width="4" height="2"/><rect x="4" y="18" width="4" height="2"/><rect x="10" y="9" width="4" height="2"/><rect x="10" y="12" width="4" height="2"/><rect x="10" y="15" width="4" height="2"/><rect x="10" y="18" width="4" height="2"/><rect x="16" y="15" width="4" height="2"/><rect x="16" y="18" width="4" height="2"/></svg>}
                    />
                    <SpectrumButton 
                        mode={VisualizerMode.STARBURST} 
                        label="BURST" 
                        icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>}
                    />
                    <SpectrumButton 
                        mode={VisualizerMode.BUTTERFLY} 
                        label="WINGS" 
                        icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 12c0-3 2-6 6-6s4 2 4 6-2 6-4 6-6-3-6-6z" /><path d="M12 12c0-3-2-6-6-6s-4 2-4 6 2 6 4 6 6-3 6-6z" /></svg>}
                    />
                </div>
            </div>

            {/* 2. Video Effects */}
            <div className="p-3 pt-0">
                <div className="flex items-center mb-3 mt-1 opacity-70">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                    <span className="mx-3 text-[9px] font-bold text-gray-400 uppercase tracking-widest">효과 (FX)</span>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                    {/* Transform Group */}
                     <EffectButton 
                        active={settings.effects.mirror} 
                        label="좌우 대칭" 
                        onClick={() => toggleEffect('mirror')} 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18M5 9l-3 3 3 3M19 9l3 3-3 3"/></svg>}
                    />
                    <EffectButton 
                        active={settings.effects.pulse} 
                        label="비트 줌" 
                        onClick={() => toggleEffect('pulse')} 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>}
                    />
                    <EffectButton 
                        active={settings.effects.shake} 
                        label="화면 진동" 
                        onClick={() => toggleEffect('shake')} 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h2M20 12h2M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>}
                    />
                    
                    {/* Atmosphere Group */}
                    <EffectButton 
                        active={settings.effects.snow} 
                        label="눈 (Snow)" 
                        onClick={() => toggleEffect('snow')} 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>}
                    />
                     <EffectButton 
                        active={settings.effects.rain} 
                        label="비 (Rain)" 
                        onClick={() => toggleEffect('rain')} 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 2v6M12 2v8M16 2v5M8 14v4M12 16v4M16 12v4"/></svg>}
                    />
                     <EffectButton 
                        active={settings.effects.raindrops} 
                        label="창문 빗방울" 
                        onClick={() => toggleEffect('raindrops')} 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>}
                    />
                    <EffectButton 
                        active={settings.effects.particles} 
                        label="부유 먼지" 
                        onClick={() => toggleEffect('particles')} 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="4" cy="4" r="1"/><circle cx="12" cy="10" r="1"/><circle cx="20" cy="5" r="1"/><circle cx="8" cy="18" r="1"/><circle cx="18" cy="16" r="1"/></svg>}
                    />
                    <EffectButton 
                        active={settings.effects.fireworks} 
                        label="불꽃놀이" 
                        onClick={() => toggleEffect('fireworks')} 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.2 16.2l2.8 2.8M4.9 19.1l2.8-2.8M16.2 7.8l2.8-2.8"/></svg>}
                    />
                    <EffectButton 
                        active={settings.effects.starfield} 
                        label="별밤" 
                        onClick={() => toggleEffect('starfield')} 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>}
                    />
                    <EffectButton 
                        active={settings.effects.fog} 
                        label="안개" 
                        onClick={() => toggleEffect('fog')} 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 15h14M3 18h18M7 12h10M9 9h6"/></svg>}
                    />
                    
                    {/* Overlay Group */}
                    <EffectButton 
                        active={settings.effects.filmGrain} 
                        label="필름 그레인" 
                        onClick={() => toggleEffect('filmGrain')} 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><path d="M6 6h.01M10 6h.01M14 6h.01M18 6h.01M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M10 14h.01M14 14h.01M18 14h.01"/></svg>}
                    />
                    <EffectButton 
                        active={settings.effects.vignette} 
                        label="비네팅" 
                        onClick={() => toggleEffect('vignette')} 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6" strokeDasharray="4 4"/></svg>}
                    />
                     <EffectButton 
                        active={settings.effects.scanlines} 
                        label="스캔라인" 
                        onClick={() => toggleEffect('scanlines')} 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 4h20M2 8h20M2 12h20M2 16h20M2 20h20"/></svg>}
                    />
                    <EffectButton 
                        active={settings.effects.glitch} 
                        label="글리치" 
                        onClick={() => toggleEffect('glitch')} 
                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14h6M14 14h6M4 10h4M12 10h8M4 18h16M4 6h16"/></svg>}
                    />
                </div>
            </div>
            
            <div className="mt-auto p-3 border-t border-white/5 bg-black/20 text-center">
                 <p className="text-[9px] text-gray-600 font-mono tracking-wide">POST-PROCESSING READY</p>
            </div>
        </div>
    );
};

export default PresetPanel;