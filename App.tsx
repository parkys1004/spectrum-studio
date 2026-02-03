import React, { useState, useRef } from 'react';
import Playlist from './components/Playlist';
import Visualizer from './components/Visualizer';
import EffectControls from './components/EffectControls';
import PlayerControls from './components/PlayerControls';
import PresetPanel from './components/PresetPanel';
import Modal from './components/Modal';
import BentoBox from './components/layout/BentoBox';
import { VisualizerMode, VisualizerSettings } from './types';

// Custom Hooks
import { useLibrary } from './hooks/useLibrary';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useExporter } from './hooks/useExporter';

const App: React.FC = () => {
  // 1. Library & Data State
  const { 
      folders, tracks, currentFolderId, 
      setCurrentFolderId, setTracks,
      handleCreateFolder, handleFilesAdded, handleTrackMove, handleReorderTrack
  } = useLibrary();

  // 2. Visualizer Settings State (Central Source of Truth)
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>(VisualizerMode.BARS);
  const [visualizerSettings, setVisualizerSettings] = useState<VisualizerSettings>({
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

  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null);

  // 3. Audio Player Logic
  const audioPlayer = useAudioPlayer(
      tracks, 
      visualizerSettings, 
      setVisualizerSettings,
      false 
  );

  const exporter = useExporter(
      tracks, 
      audioPlayer.currentTrack, 
      audioPlayer.audioRef, 
      audioPlayer.setIsPlaying, 
      visualizerSettings, 
      visualizerMode
  );

  // Overwrite the simple boolean passed to hook with the real one for the UI blocking logic
  const isExporting = exporter.isExporting;

  return (
    <div className="min-h-screen bg-app-bg text-app-text font-sans selection:bg-app-accent selection:text-black flex flex-col h-screen overflow-hidden">
      
      <Modal 
        isOpen={exporter.showExportModal} 
        onClose={() => exporter.setShowExportModal(false)}
        onConfirm={exporter.startPlaylistExport}
        title="고속 미디어 내보내기"
        confirmText="고속 렌더링 시작"
      >
        {/* Modal Content */}
        <div className="space-y-4">
            <div className="flex items-start space-x-3">
                <div className="p-2 bg-purple-900/30 rounded-lg border border-purple-500/30">
                    <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                </div>
                <div>
                    <h4 className="font-bold text-gray-200">오프라인 고속 렌더링</h4>
                    <p className="text-gray-400 mt-1 leading-relaxed">
                        실시간 재생 없이 파일을 직접 처리하여 <span className="text-white font-bold">최대 10배 빠른 속도</span>로 영상을 생성합니다.
                    </p>
                </div>
            </div>
            
            <div className="bg-[#1f1f1f] p-3 rounded-lg border border-app-border text-xs text-gray-400 space-y-2">
                 <div className="flex justify-between items-center border-b border-gray-700 pb-2 mb-1">
                    <span>대상 트랙:</span>
                    <span className="text-gray-200">{exporter.exportStats.total} 개</span>
                </div>
                
                <div className="space-y-1">
                    <span className="block mb-1">해상도 설정:</span>
                    <label className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-[#333] rounded transition-colors">
                        <input 
                            type="radio" 
                            name="resolution" 
                            value="1080p" 
                            checked={exporter.exportResolution === '1080p'}
                            onChange={() => exporter.setExportResolution('1080p')}
                            className="text-app-accent focus:ring-app-accent"
                        />
                        <span className="text-gray-200">FHD 1080p (고화질)</span>
                        <span className="text-gray-500 text-[10px] ml-auto">1920x1080</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-[#333] rounded transition-colors">
                        <input 
                            type="radio" 
                            name="resolution" 
                            value="720p" 
                            checked={exporter.exportResolution === '720p'}
                            onChange={() => exporter.setExportResolution('720p')}
                            className="text-app-accent focus:ring-app-accent"
                        />
                        <span className="text-gray-200">HD 720p (빠름)</span>
                        <span className="text-gray-500 text-[10px] ml-auto">1280x720</span>
                    </label>
                </div>
            </div>
        </div>
      </Modal>

      {/* Main Grid Layout - 4 Column Structure (Grid 12) */}
      <div className="flex-1 p-3 grid grid-cols-1 lg:grid-cols-12 gap-3 overflow-hidden">
        
        {/* Column 1: Playlist (2/12) */}
        <BentoBox 
            className="col-span-1 lg:col-span-2 h-full order-1" 
            title="미디어"
        >
            <div className={`h-full ${isExporting ? "opacity-50 pointer-events-none" : ""}`}>
                <Playlist 
                  tracks={tracks}
                  folders={folders}
                  currentFolderId={currentFolderId}
                  currentTrackId={audioPlayer.currentTrack?.id || null}
                  onTrackSelect={audioPlayer.handleTrackSelect}
                  onFilesAdded={handleFilesAdded}
                  onCreateFolder={handleCreateFolder}
                  onNavigate={setCurrentFolderId}
                  onMoveTrack={handleTrackMove}
                  onReorderTrack={handleReorderTrack}
                />
            </div>
        </BentoBox>

        {/* Column 2: Presets & Effects (2/12) */}
        <BentoBox
            className="col-span-1 lg:col-span-2 h-full order-2"
            title="프리셋 & 효과"
        >
            <div className={`h-full ${isExporting ? "opacity-50 pointer-events-none" : ""}`}>
                <PresetPanel 
                    currentMode={visualizerMode}
                    onModeChange={setVisualizerMode}
                    settings={visualizerSettings}
                    onSettingsChange={setVisualizerSettings}
                />
            </div>
        </BentoBox>

        {/* Column 3: Visualizer + Timeline (5/12) */}
        <div className="col-span-1 lg:col-span-5 h-full flex flex-col gap-3 order-3 overflow-hidden">
            
            {/* Top: Visualizer */}
            <BentoBox 
                className="flex-1 min-h-0 bg-black border-app-accent/20 shadow-2xl relative group"
                title={isExporting ? `렌더링 상태` : `프로그램: ${audioPlayer.currentTrack ? audioPlayer.currentTrack.name : '대기 중'}`}
                headerRight={
                    <button 
                        onClick={isExporting ? exporter.cancelExport : exporter.triggerExportModal}
                        disabled={!audioPlayer.currentTrack && !isExporting}
                        className={`flex items-center space-x-2 px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all tracking-tight border shadow-md ${
                            isExporting 
                            ? 'bg-red-600 border-red-500 text-white animate-pulse' 
                            : 'bg-app-accent text-black border-blue-400 hover:bg-white hover:border-white'
                        }`}
                    >
                        <div className={`w-1.5 h-1.5 rounded-full ${isExporting ? 'bg-white' : 'bg-black'}`}></div>
                        <span>{isExporting ? '작업 취소' : '내보내기'}</span>
                    </button>
                }
            >
                {/* Visualizer Content */}
                <Visualizer 
                    ref={visualizerCanvasRef}
                    isPlaying={audioPlayer.isPlaying} 
                    mode={visualizerMode}
                    settings={visualizerSettings}
                />

                {/* Export Overlay */}
                {isExporting && (
                      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/90 pointer-events-none backdrop-blur-md">
                          <div className="w-[80%] max-w-[300px] flex flex-col items-center">
                              <div className="relative mb-6">
                                <div className="w-16 h-16 border-4 border-app-accent/30 rounded-full"></div>
                                <div className="w-16 h-16 border-4 border-app-accent border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
                              </div>
                              <h3 className="text-xl font-bold text-white mb-2 tracking-tight">렌더링 진행 중</h3>
                              <p className="text-sm text-gray-400 mb-6 text-center">{exporter.exportStats.phase}</p>
                              
                              {exporter.exportStats.total > 0 && (
                                <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden border border-gray-700">
                                    <div 
                                        className="bg-app-accent h-full rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(62,166,255,0.5)]" 
                                        style={{ width: `${(exporter.exportStats.current / exporter.exportStats.total) * 100}%` }}
                                    ></div>
                                </div>
                              )}
                              <p className="mt-3 text-[10px] text-gray-500 font-mono tracking-wider">
                                 PROCESSING {exporter.exportStats.current} / {exporter.exportStats.total}
                              </p>
                          </div>
                      </div>
                )}
            </BentoBox>

            {/* Bottom: Timeline (Fixed Height) */}
            <BentoBox 
                className="h-[280px] shrink-0" 
                title={`타임라인: ${audioPlayer.currentTrack ? audioPlayer.currentTrack.name : '없음'}`}
            >
                 <div className={`h-full ${isExporting ? 'opacity-50 pointer-events-none' : ''}`}>
                    <PlayerControls 
                        currentTrack={audioPlayer.currentTrack}
                        isPlaying={audioPlayer.isPlaying}
                        currentTime={audioPlayer.currentTime}
                        duration={audioPlayer.duration}
                        onPlayPause={audioPlayer.handlePlayPause}
                        onSeek={audioPlayer.handleSeek}
                        onNext={audioPlayer.handleNext}
                        onPrev={audioPlayer.handlePrev}
                        visualizerMode={visualizerMode}
                        onModeChange={setVisualizerMode}
                    />
                </div>
            </BentoBox>
        </div>

        {/* Column 4: Effect Controls (3/12) */}
        <BentoBox 
            className="col-span-1 lg:col-span-3 h-full order-4" 
            title="속성 (Properties)"
        >
             <div className={`h-full overflow-y-auto custom-scrollbar ${isExporting ? 'opacity-50 pointer-events-none' : ''}`}>
                <EffectControls 
                  visualizerSettings={visualizerSettings}
                  onVisualizerChange={setVisualizerSettings}
                />
            </div>
        </BentoBox>

      </div>
    </div>
  );
};

export default App;