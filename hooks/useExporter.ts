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
    visualizerMode: VisualizerMode
) => {
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStats, setExportStats] = useState<ExportStats>({ current: 0, total: 0, phase: '' });
  const [exportResolution, setExportResolution] = useState<'1080p' | '720p'>('1080p');

  // Ref to track export status for breaking loops if needed (though usually handled by state)
  const isExportingRef = useRef(isExporting);
  useEffect(() => {
      isExportingRef.current = isExporting;
  }, [isExporting]);

  const triggerExportModal = () => {
    if (!currentTrack) {
        alert("내보낼 트랙이 없습니다.");
        return;
    }
    const contextTracks = tracks.filter(t => t.folderId === currentTrack.folderId);
    if (contextTracks.length === 0) return;

    setExportStats({
        current: 0,
        total: contextTracks.length,
        phase: '준비 중...'
    });
    setExportResolution('1080p');
    setShowExportModal(true);
  };

  const startPlaylistExport = async () => {
      setShowExportModal(false);
      if (!currentTrack) return;

      if (audioRef.current) {
          audioRef.current.pause();
      }
      setIsPlaying(false);

      const contextTracks = tracks.filter(t => t.folderId === currentTrack.folderId);
      setIsExporting(true);
      
      try {
          const { url, filename } = await renderService.renderPlaylist(
              contextTracks,
              visualizerSettings,
              visualizerMode,
              exportResolution,
              (current, total, phase) => {
                  setExportStats({ current, total, phase });
              }
          );

          if (url) {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
      } catch (e) {
          console.error(e);
          alert("렌더링 중 오류가 발생했습니다.");
      } finally {
          setIsExporting(false);
      }
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