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
    // Don't clear handle if it's already set? Better to clear to avoid stale handles across sessions
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
              if (e.name === 'AbortError') return;

              // Handle SecurityError (iframe restriction)
              if (e.name === 'SecurityError' || e.message?.includes('Cross origin')) {
                  alert("현재 환경(iframe 등)에서는 파일 위치 미리 선택이 지원되지 않습니다. 렌더링 완료 후 자동으로 다운로드됩니다.");
                  setExportFileHandle(null);
                  setExportFileName('');
                  return;
              }

              console.error("File picker error:", e);
              alert("파일 위치 선택 중 오류가 발생했습니다.");
          }
      } else {
          alert("이 브라우저는 파일 시스템 접근 API를 지원하지 않습니다. 렌더링 시작 시 일반 다운로드로 처리됩니다.");
      }
  };

  // Helper to verify permissions for existing handles
  const verifyPermission = async (fileHandle: any, readWrite: boolean) => {
    try {
        const options = { mode: readWrite ? 'readwrite' : 'read' };
        if ((await fileHandle.queryPermission(options)) === 'granted') return true;
        if ((await fileHandle.requestPermission(options)) === 'granted') return true;
        return false;
    } catch (e) {
        console.warn("Permission verification failed:", e);
        return false;
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
      if (contextTracks.length === 0) {
          alert("내보낼 트랙이 없습니다.");
          return;
      }
      
      let fileHandle = exportFileHandle;
      let writableStream: any = null;

      // 2. Resolve File Handle & Stream (Before closing modal)
      if ('showSaveFilePicker' in window) {
          try {
              // A. Try reusing existing handle
              if (fileHandle) {
                  const hasPermission = await verifyPermission(fileHandle, true);
                  if (hasPermission) {
                      writableStream = await fileHandle.createWritable();
                  } else {
                      fileHandle = null; // Permission denied/lost
                  }
              }

              // B. If no valid stream yet, try asking user
              if (!writableStream) {
                  fileHandle = await (window as any).showSaveFilePicker({
                      suggestedName: `SpectrumStudio_Export_${Date.now()}.mp4`,
                      types: [{
                          description: 'MP4 Video File',
                          accept: { 'video/mp4': ['.mp4'] },
                      }],
                  });

                  if (fileHandle) {
                      writableStream = await fileHandle.createWritable();
                  }
              }
          } catch (error: any) {
              if (error.name === 'AbortError') {
                  return; // User cancelled
              }
              // For SecurityError (iframe) or others, log and fallback to memory render (writableStream = null)
              console.warn("FileSystemAccess API failed, proceeding with in-memory render:", error);
              writableStream = null;
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
                // Manual download fallback
                const a = document.createElement('a');
                a.href = result.url;
                a.download = result.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(result.url);
          }

      } catch (e: any) {
          console.error("Export Fatal Error:", e);
          alert(`렌더링 중 오류가 발생했습니다: ${e.message}`);
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