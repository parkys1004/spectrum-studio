import React, { useState, useRef, useEffect } from 'react';
import { Track, VisualizerSettings, VisualizerMode } from '../types';
import { renderService } from '../services/renderService';

interface ExportStats {
    current: number;
    total: number;
    phase: string;
}

export const useExporter = (
    tracks: Track[],
    currentTrack: Track | null,
    audioRef: React.RefObject<HTMLAudioElement>,
    setIsPlaying: (playing: boolean) => void,
    visualizerSettings: VisualizerSettings,
    visualizerMode: VisualizerMode | null
) => {
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStats, setExportStats] = useState<ExportStats>({ current: 0, total: 0, phase: '' });
  const [exportResolution, setExportResolution] = useState<'1080p' | '720p'>('1080p');
  
  const isExportingRef = useRef(isExporting);
  useEffect(() => {
      isExportingRef.current = isExporting;
  }, [isExporting]);

  // Prevent accidental tab closure during export
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isExportingRef.current) {
        e.preventDefault();
        e.returnValue = ''; // Legacy standard for Chrome
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const triggerExportModal = () => {
    if (tracks.length === 0) {
        alert("내보낼 트랙이 없습니다.");
        return;
    }

    setExportStats({
        current: 0,
        total: tracks.length,
        phase: '준비 중...'
    });
    setExportResolution('1080p');
    setShowExportModal(true);
  };

  const startPlaylistExport = async () => {
      // 1. Pause Audio & Setup
      if (audioRef.current) {
          audioRef.current.pause();
      }
      setIsPlaying(false);

      if (tracks.length === 0) {
          alert("내보낼 트랙이 없습니다.");
          return;
      }
      
      // 2. Close Modal & Start Process
      setShowExportModal(false);
      setIsExporting(true);

      try {
          // ALWAYS Render to Memory first. This avoids 0-byte file issues caused by stream interruptions.
          const result = await renderService.renderPlaylist(
              tracks,
              visualizerSettings,
              visualizerMode,
              exportResolution,
              (current, total, phase) => {
                  setExportStats({ current, total, phase });
              }
          );

          if (result && result.url) {
                // Once rendering is fully complete and successful, trigger the download/save.
                // Try modern Save File Picker first
                if ('showSaveFilePicker' in window) {
                    try {
                        const handle = await (window as any).showSaveFilePicker({
                            suggestedName: result.filename,
                            types: [{
                                description: 'MP4 Video File',
                                accept: { 'video/mp4': ['.mp4'] },
                            }],
                        });
                        const writable = await handle.createWritable();
                        const response = await fetch(result.url);
                        await response.body?.pipeTo(writable);
                        alert("파일 저장이 완료되었습니다.");
                    } catch (err: any) {
                        if (err.name !== 'AbortError') {
                            // Fallback to auto download if picker fails or isn't supported in context
                            triggerAutoDownload(result.url, result.filename);
                        }
                    }
                } else {
                    // Fallback for browsers without File System Access API
                    triggerAutoDownload(result.url, result.filename);
                }
                
                // Cleanup URL after a minute
                setTimeout(() => URL.revokeObjectURL(result.url), 60000);
          }

      } catch (e: any) {
          console.error("Export Fatal Error:", e);
          alert(`렌더링 중 오류가 발생했습니다: ${e.message}`);
      } finally {
          setIsExporting(false);
      }
  };

  const triggerAutoDownload = (url: string, filename: string) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
  };

  const cancelExport = () => {
      renderService.cancel();
      setIsExporting(false);
  };

  return {
    isExporting,
    showExportModal,
    setShowExportModal,
    exportStats,
    exportResolution,
    setExportResolution,
    triggerExportModal,
    startPlaylistExport,
    cancelExport
  };
};