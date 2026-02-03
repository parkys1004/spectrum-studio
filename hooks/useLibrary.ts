import { useState, useEffect, useCallback } from 'react';
import { Folder, Track } from '../types';
import { storageService } from '../services/storageService';
import { audioService } from '../services/audioService';

export const useLibrary = () => {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Load Library on Mount
  useEffect(() => {
    const library = storageService.loadLibrary();
    if (library) {
      setFolders(library.folders);
      setTracks(library.tracks);
    }
  }, []);

  // Save Library on Changes
  useEffect(() => {
    if (folders.length > 0 || tracks.length > 0) {
        storageService.saveLibrary(folders, tracks);
    }
  }, [folders, tracks]);

  const handleCreateFolder = useCallback(() => {
    const name = prompt("폴더 이름을 입력하세요:", "새 모음");
    if (!name) return;
    
    const newFolder: Folder = {
      id: crypto.randomUUID(),
      name,
      parentId: currentFolderId,
      createdAt: Date.now()
    };
    setFolders(prev => [...prev, newFolder]);
  }, [currentFolderId]);

  const handleFilesAdded = useCallback(async (files: FileList) => {
    const newTracks: Track[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^/.]+$/, ""),
      artist: 'Unknown',
      duration: 0,
      url: URL.createObjectURL(file),
      file,
      folderId: currentFolderId
    }));

    setTracks((prev) => [...prev, ...newTracks]);
    
    for (const track of newTracks) {
        if (track.file) {
            storageService.saveFile(track.id, track.file);
            audioService.analyzeAudio(track.file as File).then((result) => {
                setTracks(prevTracks => prevTracks.map(t => {
                    if (t.id === track.id) {
                        return { ...t, mood: result.mood, moodColor: result.color };
                    }
                    return t;
                }));
            });
        }
    }
  }, [currentFolderId]);

  const handleTrackMove = useCallback((trackId: string, targetFolderId: string | null) => {
    setTracks(prev => prev.map(t => t.id === trackId ? { ...t, folderId: targetFolderId } : t));
  }, []);

  // New: Reorder Tracks
  const handleReorderTrack = useCallback((sourceTrackId: string, targetTrackId: string) => {
    setTracks(prev => {
        const sourceIndex = prev.findIndex(t => t.id === sourceTrackId);
        const targetIndex = prev.findIndex(t => t.id === targetTrackId);
        
        if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return prev;

        // Create new array copy
        const newTracks = [...prev];
        // Remove source track
        const [movedTrack] = newTracks.splice(sourceIndex, 1);
        
        // Find index of target in the modified array to insert before it
        // Note: We search again because indices might have shifted
        const newTargetIndex = newTracks.findIndex(t => t.id === targetTrackId);
        
        // Insert at new position (placing before the target)
        newTracks.splice(newTargetIndex, 0, movedTrack);
        
        return newTracks;
    });
  }, []);

  const handleDeleteTrack = useCallback(async (trackId: string) => {
      if (!window.confirm("정말 이 음악 파일을 삭제하시겠습니까?")) return;
      
      try {
          // 1. Remove from Storage
          await storageService.deleteFile(trackId);
          
          // 2. Remove from State
          setTracks(prev => prev.filter(t => t.id !== trackId));
          
          // 3. Clean up cache in audioService if it exists
          audioService.clearCache(trackId);
      } catch (e) {
          console.error("Failed to delete track:", e);
          alert("파일 삭제 중 오류가 발생했습니다.");
      }
  }, []);

  return {
    folders,
    tracks,
    currentFolderId,
    setCurrentFolderId,
    setTracks,
    handleCreateFolder,
    handleFilesAdded,
    handleTrackMove,
    handleReorderTrack,
    handleDeleteTrack
  };
};