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
      
      let fileHandle: FileSystemFileHandle | null = null;
      let writableStream: FileSystemWritableFileStream | null = null;

      try {
          // 1. Try to open File Save Picker (Direct Disk Streaming)
          // This bypasses RAM limits by writing directly to disk
          if ('showSaveFilePicker' in window) {
              try {
                  fileHandle = await (window as any).showSaveFilePicker({
                      suggestedName: `SpectrumStudio_Export_${Date.now()}.mp4`,
                      types: [{
                          description: 'MP4 Video File',
                          accept: { 'video/mp4': ['.mp4'] },
                      }],
                  });
                  writableStream = await fileHandle!.createWritable();
              } catch (pickerError) {
                  // User cancelled picker
                  console.info("Export cancelled by user");
                  setIsExporting(false);
                  return;
              }
          } else {
              console.warn("File System Access API not supported. Falling back to in-memory rendering (Size limited).");
          }

          // 2. Start Rendering
          const result = await renderService.renderPlaylist(
              contextTracks,
              visualizerSettings,
              visualizerMode,
              exportResolution,
              (current, total, phase) => {
                  setExportStats({ current, total, phase });
              },
              writableStream // Pass stream if available
          );

          // 3. Handle Completion
          if (writableStream) {
               // Stream mode: File is already saved.
               // Just notify user (maybe play a sound or show a toast in future)
               console.log("Export completed to disk");
          } else if (result && result.url) {
               // Legacy mode: Download Blob
                const a = document.createElement('a');
                a.href = result.url;
                a.download = result.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(result.url);
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