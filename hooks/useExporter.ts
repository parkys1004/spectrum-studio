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
  
  // New state for pre-picked file handle
  const [exportFileHandle, setExportFileHandle] = useState<any>(null);
  const [exportFileName, setExportFileName] = useState<string>('');

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
    setExportFileHandle(null);
    setExportFileName('');
    setShowExportModal(true);
  };

  const pickExportLocation = async () => {
      if ('showSaveFilePicker' in window) {
          try {
              const handle = await (window as any).showSaveFilePicker({
                  suggestedName: `SpectrumStudio_Export_${Date.now()}.mp4`,
                  types: [{
                      description: 'MP4 Video File',
                      accept: { 'video/mp4': ['.mp4'] },
                  }],
              });
              setExportFileHandle(handle);
              setExportFileName(handle.name);
          } catch (e: any) {
              if (e.name !== 'AbortError') {
                  console.error("File picker error:", e);
                  alert("파일 위치 선택 중 오류가 발생했습니다.");
              }
          }
      } else {
          alert("이 브라우저는 파일 시스템 접근 API를 지원하지 않습니다. 렌더링 시작 시 일반 다운로드로 처리됩니다.");
      }
  };

  const startPlaylistExport = async () => {
      if (!currentTrack) return;

      // 1. Pause Audio & Setup
      if (audioRef.current) {
          audioRef.current.pause();
      }
      setIsPlaying(false);

      const contextTracks = tracks.filter(t => t.folderId === currentTrack.folderId);
      
      let fileHandle = exportFileHandle;
      let writableStream: any = null;

      // 2. Resolve File Handle & Stream (Before closing modal)
      // This ensures user activation is preserved and errors can be shown in context
      if ('showSaveFilePicker' in window) {
          try {
              if (!fileHandle) {
                  fileHandle = await (window as any).showSaveFilePicker({
                      suggestedName: `SpectrumStudio_Export_${Date.now()}.mp4`,
                      types: [{
                          description: 'MP4 Video File',
                          accept: { 'video/mp4': ['.mp4'] },
                      }],
                  });
              }

              if (fileHandle) {
                  // Attempt to create writable immediately to verify permission/capability
                  writableStream = await fileHandle.createWritable();
              }
          } catch (error: any) {
              if (error.name === 'AbortError') {
                  // User cancelled the picker, just stop the process.
                  // Do NOT close the modal, let them try again.
                  return;
              }
              console.error("Export setup failed:", error);
              alert("파일 저장 설정 중 오류가 발생했습니다. 권한을 확인해주세요.");
              return;
          }
      }

      // 3. Close Modal & Start Process
      setShowExportModal(false);
      setIsExporting(true);

      try {
          const result = await renderService.renderPlaylist(
              contextTracks,
              visualizerSettings,
              visualizerMode,
              exportResolution,
              (current, total, phase) => {
                  setExportStats({ current, total, phase });
              },
              writableStream
          );

          if (writableStream) {
               console.log("Export completed to disk");
          } else if (result && result.url) {
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
          setExportFileHandle(null);
          setExportFileName('');
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
    cancelExport,
    pickExportLocation,
    exportFileName
  };
};