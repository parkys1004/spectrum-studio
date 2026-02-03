import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Track, VisualizerMode } from '../types';
import { audioService } from '../services/audioService';

interface PlayerControlsProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onNext: () => void;
  onPrev: () => void;
  visualizerMode: VisualizerMode;
  onModeChange: (mode: VisualizerMode) => void;
}

const PlayerControls: React.FC<PlayerControlsProps> = ({
  currentTrack,
  isPlaying,
  currentTime,
  duration,
  onPlayPause,
  onSeek,
  onNext,
  onPrev
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);

  // Generate Waveform when track changes
  useEffect(() => {
    let isCancelled = false;
    setAudioBuffer(null);

    const loadWaveform = async () => {
      if (!currentTrack || !currentTrack.file) return;
      
      // Use Cached Buffer retrieval with ID
      const buffer = await audioService.getAudioBuffer(currentTrack.file, currentTrack.id);
      if (!isCancelled) {
        setAudioBuffer(buffer);
      }
    };

    loadWaveform();

    return () => { isCancelled = true; };
  }, [currentTrack?.id, currentTrack?.file]); 

  // Draw Waveform
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !timelineRef.current) return;

    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (!audioBuffer) {
        if (currentTrack) {
             ctx.fillStyle = '#4b5563';
             ctx.font = '12px Pretendard';
             ctx.fillText("파형 분석 중...", 10, height / 2 + 4);
        }
        return;
    }

    const data = audioBuffer.getChannelData(0); 
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    // Stylish Green Waveform
    ctx.fillStyle = '#10b981'; 
    ctx.beginPath();

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }

      const yMin = (1 + min) * amp;
      const yMax = (1 + max) * amp;
      
      ctx.fillRect(i, yMin, 1, Math.max(1, yMax - yMin));
    }
  }, [audioBuffer, currentTrack]);

  // --- Interaction Logic ---

  const handleSeek = useCallback((clientX: number) => {
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    onSeek(percentage * duration);
  }, [duration, onSeek]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    handleSeek(e.clientX);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        handleSeek(e.clientX);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleSeek]);


  const formatTimeCode = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30); 
    return (
      <div className="flex space-x-0.5 text-base">
        <span>{mins.toString().padStart(2, '0')}</span>
        <span className="opacity-50">:</span>
        <span>{secs.toString().padStart(2, '0')}</span>
        <span className="opacity-50">:</span>
        <span className="text-gray-400">{frames.toString().padStart(2, '0')}</span>
      </div>
    );
  };

  const playheadPercent = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-[#121212] select-none">
      
      {/* Timeline Control Bar */}
      <div className="h-14 border-b border-white/5 flex items-center px-4 bg-black/30 justify-between backdrop-blur-md">
        
        {/* Timecode */}
        <div className="font-mono text-app-accent font-bold tracking-widest bg-black/40 px-3 py-1 rounded border border-white/5 shadow-inner">
           {formatTimeCode(currentTime)}
        </div>
        
        {/* Transport Controls */}
        <div className="flex items-center space-x-6 relative z-10">
            <button onClick={onPrev} className="text-gray-500 hover:text-white transition-colors transform active:scale-95" title="이전">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            
            {/* Play Button - Metallic/Glass Look */}
            <button 
                onClick={onPlayPause} 
                className="w-12 h-12 rounded-full bg-gradient-to-b from-white to-gray-300 hover:from-white hover:to-white text-black transition-all flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.2)] hover:shadow-[0_0_20px_rgba(62,166,255,0.4)] active:scale-95 border border-white" 
                title={isPlaying ? "일시정지" : "재생"}
            >
                {isPlaying ? (
                     <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                ) : (
                     <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="ml-1"><path d="M8 5v14l11-7z"/></svg>
                )}
            </button>
            
            <button onClick={onNext} className="text-gray-500 hover:text-white transition-colors transform active:scale-95" title="다음">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
        </div>

        {/* Right Side Tools */}
        <div className="flex space-x-3 text-gray-600 opacity-60">
             <div className="w-2 h-2 rounded-full bg-gray-600"></div>
             <div className="w-2 h-2 rounded-full bg-gray-600"></div>
             <div className="w-2 h-2 rounded-full bg-gray-600"></div>
        </div>
      </div>

      {/* Main Timeline Area */}
      <div className="flex-1 flex overflow-hidden bg-[#0a0a0a]">
         {/* Track Headers */}
         <div className="w-16 md:w-24 bg-[#141414] border-r border-white/5 flex flex-col pt-6 z-10 shadow-lg">
            <div className="h-10 border-b border-white/5 flex items-center px-3 bg-[#181818]">
                <div className="w-full flex items-center justify-between text-[10px] font-bold">
                    <span className="text-blue-400">비디오 1</span>
                    <div className="w-2 h-2 rounded-sm bg-gray-800 border border-gray-700"></div>
                </div>
            </div>
            <div className="h-20 border-b border-white/5 flex items-center px-3 bg-[#1a1a1a]">
                <div className="w-full flex items-center justify-between text-[10px] font-bold">
                    <span className="text-green-400">오디오 1</span>
                    <div className="flex space-x-1">
                         <span className="w-3.5 h-3.5 bg-[#222] border border-gray-700 rounded text-[8px] flex items-center justify-center text-gray-400">M</span>
                         <span className="w-3.5 h-3.5 bg-[#222] border border-gray-700 rounded text-[8px] flex items-center justify-center text-gray-400">S</span>
                    </div>
                </div>
            </div>
         </div>

         {/* Tracks & Ruler */}
         <div 
            className="flex-1 flex flex-col relative overflow-hidden cursor-crosshair" 
            ref={timelineRef}
            onMouseDown={handleMouseDown}
         >
            
            {/* Ruler - Precise Technical Look */}
            <div className="h-6 bg-[#111] border-b border-white/5 flex items-end relative overflow-hidden select-none">
                <div className="absolute bottom-0 w-full h-full flex justify-between px-2">
                    {Array.from({length: 50}).map((_, i) => (
                        <div key={i} className={`w-px ${i % 5 === 0 ? 'h-3 bg-gray-500' : 'h-1.5 bg-gray-800'}`}></div>
                    ))}
                </div>
            </div>

            {/* Playhead */}
            <div 
                className="absolute top-0 bottom-0 w-px bg-red-500 z-30 pointer-events-none transition-none shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                style={{ left: `${playheadPercent}%` }}
            >
                <div className="w-3 h-3 -ml-1.5 bg-red-500 absolute top-0 transform rotate-45 -translate-y-1.5 shadow-md border border-red-400"></div>
            </div>

            {/* V1 Track (Video) - Empty Placeholder */}
            <div className="h-10 border-b border-white/5 relative bg-[#0d0d0d] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjMTExIiAvPgo8cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMjIyIiAvPgo8L3N2Zz4=')] opacity-50">
            </div>

            {/* A1 Track (Audio) - Waveform */}
            <div className="h-20 border-b border-white/5 relative bg-[#111] p-1">
                {currentTrack && (
                    <div className="h-full w-full bg-[#064e3b] border border-[#059669] rounded-md overflow-hidden relative group shadow-md">
                        {/* Real Waveform Canvas */}
                        <canvas ref={waveformCanvasRef} className="w-full h-full absolute inset-0 block opacity-90"></canvas>

                        {/* Text Overlay */}
                        <div className="absolute top-1 left-2 z-10 pointer-events-none">
                            <span className="text-[9px] text-green-100 font-bold bg-black/50 px-2 py-0.5 rounded backdrop-blur-sm border border-white/10 shadow-sm">
                                {currentTrack.name}
                            </span>
                        </div>

                        {/* Hover Sheen */}
                        <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                    </div>
                )}
            </div>
            
            {/* Empty Space */}
            <div className="flex-1 bg-[#0a0a0a] pointer-events-none"></div>
         </div>
      </div>
    </div>
  );
};

export default PlayerControls;