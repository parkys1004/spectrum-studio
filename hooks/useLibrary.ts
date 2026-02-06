import { useState, useEffect, useCallback, useRef } from 'react';
import { Track } from '../types';
import { storageService } from '../services/storageService';
import { audioService } from '../services/audioService';

export const useLibrary = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  
  // Ref to track initialization status to prevent overwriting localStorage on mount
  const isInitialized = useRef(false);

  // Load Library on Mount
  useEffect(() => {
    const library = storageService.loadLibrary();
    if (library) {
      setTracks(library.tracks);
    }
    isInitialized.current = true;
  }, []);

  // Save Library on Changes
  useEffect(() => {
    // Only save if initialized. This allows saving empty arrays if the user deleted everything.
    if (isInitialized.current) {
        storageService.saveLibrary(tracks);
    }
  }, [tracks]);

  const handleFilesAdded = useCallback(async (files: FileList) => {
    const newTracks: Track[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^/.]+$/, ""),
      artist: 'Unknown',
      duration: 0,
      url: URL.createObjectURL(file),
      file,
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
  }, []);

  // Reorder Tracks
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
      try {
          // 1. Remove from Storage
          await storageService.deleteFile(trackId);
          
          // 2. Remove from State
          setTracks(prev => prev.filter(t => t.id !== trackId));

          // 3. Remove from Selection
          setSelectedTrackIds(prev => {
              const next = new Set(prev);
              next.delete(trackId);
              return next;
          });
          
          // 4. Clean up cache in audioService if it exists
          audioService.clearCache(trackId);
      } catch (e) {
          console.error("Failed to delete track:", e);
          alert("파일 삭제 중 오류가 발생했습니다.");
      }
  }, []);

  const handleClearLibrary = useCallback(async () => {
      try {
          // 1. Clear Storage
          await storageService.clearAllFiles();
          
          // 2. Clear State
          setTracks([]);
          setSelectedTrackIds(new Set());
          
          // 3. Clear Cache
          audioService.clearCache();
          
      } catch (e) {
          console.error("Failed to clear library:", e);
          alert("라이브러리 초기화 중 오류가 발생했습니다.");
      }
  }, []);

  const toggleTrackSelection = useCallback((trackId: string) => {
      setSelectedTrackIds(prev => {
          const next = new Set(prev);
          if (next.has(trackId)) {
              next.delete(trackId);
          } else {
              next.add(trackId);
          }
          return next;
      });
  }, []);

  const toggleSelectAll = useCallback(() => {
      if (tracks.length === 0) return;
      setSelectedTrackIds(prev => {
          // If currently all selected, deselect all. Otherwise, select all.
          if (prev.size === tracks.length) {
              return new Set();
          } else {
              return new Set(tracks.map(t => t.id));
          }
      });
  }, [tracks]);

  return {
    tracks,
    setTracks,
    selectedTrackIds,
    handleFilesAdded,
    handleReorderTrack,
    handleDeleteTrack,
    handleClearLibrary,
    toggleTrackSelection,
    toggleSelectAll
  };
};