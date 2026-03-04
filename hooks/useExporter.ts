import React, { useState, useRef, useEffect } from "react";
import { Track, VisualizerSettings, VisualizerMode } from "../types";
import { renderService } from "../services/renderService";

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
  visualizerMode: VisualizerMode | null,
) => {
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportStats, setExportStats] = useState<ExportStats>({
    current: 0,
    total: 0,
    phase: "",
  });
  const [exportFormat, setExportFormat] = useState<"mp4" | "webm">("mp4");

  const isExportingRef = useRef(isExporting);
  useEffect(() => {
    isExportingRef.current = isExporting;
  }, [isExporting]);

  // Prevent accidental tab closure during export
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isExportingRef.current) {
        e.preventDefault();
        e.returnValue = ""; // Legacy standard for Chrome
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const triggerExportModal = () => {
    if (tracks.length === 0) {
      alert("내보낼 트랙이 없습니다.");
      return;
    }

    setExportStats({
      current: 0,
      total: tracks.length,
      phase: "준비 중...",
    });
    setExportFormat("mp4");
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

    // 2. Ask for File Save Location (Direct-to-Disk or OPFS)
    let fileHandle: any = null;
    let useOPFS = false;
    let useInMemoryFallback = false;
    const filename = `SpectrumStudio_Export_${Date.now()}.${exportFormat}`;

    if ("showSaveFilePicker" in window) {
      try {
        fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: exportFormat === "mp4" ? "MP4 Video File" : "WebM Video File",
              accept: exportFormat === "mp4" ? { "video/mp4": [".mp4"] } : { "video/webm": [".webm"] },
            },
          ],
        });
      } catch (err: any) {
        // User cancelled the picker
        if (err.name === "AbortError") return;
        console.warn("File picker failed:", err);
      }
    }

    // Fallback to OPFS (Origin Private File System) if File Picker failed (e.g. in iframe)
    if (!fileHandle && navigator.storage && navigator.storage.getDirectory) {
      try {
        const dir = await navigator.storage.getDirectory();
        fileHandle = await dir.getFileHandle(filename, { create: true });
        useOPFS = true;
        console.log("Using OPFS for direct-to-disk export");
      } catch (err) {
        console.warn("OPFS failed:", err);
      }
    }

    if (!fileHandle) {
       useInMemoryFallback = true;
    }

    if (useInMemoryFallback) {
       const proceed = window.confirm(
         "현재 환경(미리보기 창 또는 브라우저 호환성)에서는 하드디스크 직접 저장 기능을 사용할 수 없습니다.\n\n" +
         "대신 '메모리 렌더링' 방식으로 계속 진행하시겠습니까?\n" +
         "(주의: 30분 이상의 긴 영상은 브라우저 메모리 부족으로 렌더링 도중 튕길 수 있습니다.)"
       );
       if (!proceed) return;
    }

    // 3. Close Modal & Start Process
    setShowExportModal(false);
    setIsExporting(true);

    try {
      const result = await renderService.renderPlaylist(
        tracks,
        visualizerSettings,
        visualizerMode,
        visualizerSettings.resolution || "1080p",
        exportFormat,
        (current, total, phase) => {
          setExportStats({ current, total, phase });
        },
        fileHandle
      );

      if (result && result.url) {
        // Fallback for browsers without File System Access API (in-memory render)
        triggerAutoDownload(result.url, result.filename);
        setTimeout(() => URL.revokeObjectURL(result.url), 60000);
      } else if (fileHandle) {
        if (useOPFS) {
          // Extract file from OPFS and trigger download
          setExportStats({ current: 1, total: 1, phase: "파일 다운로드 준비 중..." });
          const file = await fileHandle.getFile();
          const url = URL.createObjectURL(file);
          triggerAutoDownload(url, filename);
          
          // Cleanup OPFS after a delay to ensure download starts
          setTimeout(async () => {
            URL.revokeObjectURL(url);
            try {
              const dir = await navigator.storage.getDirectory();
              await dir.removeEntry(filename);
            } catch (e) {
              console.warn("Failed to cleanup OPFS file", e);
            }
          }, 60000);
        } else {
          // Direct-to-disk via showSaveFilePicker completed successfully
          alert("파일 저장이 완료되었습니다.");
        }
      }
    } catch (e: any) {
      console.error("Export Fatal Error:", e);
      alert(`렌더링 중 오류가 발생했습니다: ${e.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const triggerAutoDownload = (url: string, filename: string) => {
    const a = document.createElement("a");
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
    exportFormat,
    setExportFormat,
    triggerExportModal,
    startPlaylistExport,
    cancelExport,
  };
};
