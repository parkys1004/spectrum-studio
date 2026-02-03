import React, { useRef, useState } from 'react';
import { Track, Folder } from '../types';

interface PlaylistProps {
  tracks: Track[];
  folders: Folder[];
  currentFolderId: string | null;
  currentTrackId: string | null;
  onTrackSelect: (track: Track) => void;
  onFilesAdded: (files: FileList) => void;
  onCreateFolder: () => void;
  onNavigate: (folderId: string | null) => void;
  onMoveTrack: (trackId: string, folderId: string | null) => void;
  onReorderTrack: (sourceId: string, targetId: string) => void;
}

const Playlist: React.FC<PlaylistProps> = ({ 
    tracks, 
    folders, 
    currentFolderId, 
    currentTrackId, 
    onTrackSelect, 
    onFilesAdded,
    onCreateFolder,
    onNavigate,
    onMoveTrack,
    onReorderTrack
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter items for current view
  const currentFolders = folders.filter(f => f.parentId === currentFolderId);
  const currentTracks = tracks.filter(t => t.folderId === currentFolderId);

  const currentFolder = folders.find(f => f.id === currentFolderId);

  // Drag and Drop State
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, trackId: string) => {
      e.dataTransfer.setData('trackId', trackId);
      setDraggedTrackId(trackId);
      e.dataTransfer.effectAllowed = "move";
      // Optional: Set a custom drag image or style here
  };

  const handleDropOnFolder = (e: React.DragEvent, folderId: string | null) => {
      e.preventDefault();
      e.stopPropagation(); // Critical: Prevent bubbling to parent drop zones
      const trackId = e.dataTransfer.getData('trackId');
      if (trackId) {
          onMoveTrack(trackId, folderId);
      }
      setDraggedTrackId(null);
  };

  const handleDropOnTrack = (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const sourceId = e.dataTransfer.getData('trackId');
      
      // If we are dropping a track onto another track (and they are different)
      if (sourceId && sourceId !== targetId) {
          onReorderTrack(sourceId, targetId);
      }
      setDraggedTrackId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
  };

  const IconButton = ({ onClick, icon, label }: { onClick: () => void, icon: React.ReactNode, label: string }) => (
      <button 
        onClick={onClick}
        className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-2 bg-white/5 hover:bg-white/10 active:bg-white/5 border border-white/5 hover:border-white/20 rounded-lg transition-all duration-200 group"
        title={label}
      >
        <span className="text-gray-400 group-hover:text-white transition-colors">{icon}</span>
      </button>
  );

  return (
    <div className="flex flex-col h-full bg-[#121212]">
      {/* Luxurious Toolbar */}
      <div className="p-2 border-b border-white/5 flex space-x-2 bg-black/20 backdrop-blur-sm">
        <IconButton 
            onClick={onCreateFolder}
            label="새 폴더"
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>}
        />
        <IconButton 
            onClick={() => fileInputRef.current?.click()}
            label="파일 가져오기"
            icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>}
        />
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="audio/*" 
          multiple 
          onChange={(e) => e.target.files && onFilesAdded(e.target.files)}
        />
      </div>

      {/* Breadcrumbs */}
      <div className="px-4 py-2.5 bg-black/10 border-b border-white/5 text-[10px] flex items-center space-x-1.5 text-app-textMuted overflow-hidden whitespace-nowrap shadow-inner-light">
        <span 
            className={`cursor-pointer transition-colors px-1.5 py-0.5 rounded ${!currentFolderId ? 'bg-white/10 text-white font-bold' : 'hover:bg-white/5 hover:text-white'}`}
            onClick={() => onNavigate(null)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDropOnFolder(e, null)}
        >
            최상위 (ROOT)
        </span>
        {currentFolder && (
            <>
                <span className="text-white/20">/</span>
                <span className="text-white font-bold truncate bg-white/10 px-1.5 py-0.5 rounded">
                    {currentFolder.name}
                </span>
            </>
        )}
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-0.5">
          {/* Back Button */}
          {currentFolderId && (
              <div 
                  className="group flex items-center px-3 py-2 rounded-lg text-app-textMuted hover:text-white hover:bg-white/5 cursor-pointer transition-colors border border-transparent hover:border-white/5"
                  onClick={() => onNavigate(currentFolder?.parentId || null)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnFolder(e, currentFolder?.parentId || null)}
              >
                  <svg className="w-4 h-4 mr-3 opacity-50 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="currentColor"><path d="M11.67 3.87L9.9 2.1 0 12l9.9 9.9 1.77-1.77L3.54 12z"/></svg>
                  <span className="text-xs font-medium tracking-wide">.. (상위 폴더)</span>
              </div>
          )}

          {/* Folders */}
          {currentFolders.map(folder => (
              <div 
                  key={folder.id}
                  onDoubleClick={() => onNavigate(folder.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnFolder(e, folder.id)}
                  className="group flex items-center px-3 py-2 rounded-lg text-gray-300 hover:text-yellow-100 hover:bg-white/5 cursor-pointer transition-all border border-transparent hover:border-white/5"
              >
                  <svg className="w-4 h-4 mr-3 text-yellow-600 group-hover:text-yellow-400 transition-colors drop-shadow-sm" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                  <span className="text-xs font-medium tracking-wide flex-1">{folder.name}</span>
              </div>
          ))}

          {/* Tracks */}
          {currentTracks.map((track) => {
              const isActive = track.id === currentTrackId;
              const isDragging = draggedTrackId === track.id;

              return (
                <div 
                  key={track.id} 
                  onClick={() => onTrackSelect(track)}
                  draggable
                  onDragStart={(e) => handleDragStart(e, track.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnTrack(e, track.id)}
                  className={`group flex items-center px-3 py-2.5 rounded-lg cursor-pointer transition-all border ${
                    isActive 
                      ? 'bg-gradient-to-r from-app-accent/10 to-transparent border-app-accent/20 text-white' 
                      : 'border-transparent hover:bg-white/5 hover:border-white/5 text-gray-400 hover:text-gray-200'
                  } ${isDragging ? 'opacity-50 dashed border-gray-500' : ''}`}
                >
                   {/* Drag Handle Indicator (visible on hover) */}
                   <div className="mr-2 opacity-0 group-hover:opacity-30 cursor-grab active:cursor-grabbing">
                       <svg width="6" height="10" viewBox="0 0 6 10" fill="currentColor">
                           <circle cx="1" cy="1" r="1" />
                           <circle cx="1" cy="5" r="1" />
                           <circle cx="1" cy="9" r="1" />
                           <circle cx="5" cy="1" r="1" />
                           <circle cx="5" cy="5" r="1" />
                           <circle cx="5" cy="9" r="1" />
                       </svg>
                   </div>

                   {/* Status Dot */}
                   <div className={`w-1.5 h-1.5 rounded-full mr-3 shrink-0 transition-all duration-300 ${
                       isActive 
                       ? 'bg-app-accent shadow-[0_0_8px_rgba(62,166,255,0.8)] scale-110' 
                       : 'bg-gray-700 group-hover:bg-gray-500'
                   }`}></div>
                   
                   <span className="text-xs font-medium tracking-wide truncate flex-1 opacity-90">{track.name}</span>
                   
                   {/* Audio Wave Icon (Decoration) */}
                   {isActive && (
                       <div className="flex space-x-0.5 ml-2 items-end h-3">
                           <div className="w-0.5 bg-app-accent animate-[bounce_1s_infinite] h-2"></div>
                           <div className="w-0.5 bg-app-accent animate-[bounce_1.2s_infinite] h-3"></div>
                           <div className="w-0.5 bg-app-accent animate-[bounce_0.8s_infinite] h-1.5"></div>
                       </div>
                   )}
                </div>
              );
          })}

          {currentFolders.length === 0 && currentTracks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 opacity-30 text-center">
                  <svg className="w-8 h-8 mb-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                  <p className="text-[10px] uppercase tracking-widest text-gray-400">미디어 파일 없음</p>
              </div>
          )}
      </div>
      
      {/* Footer Status */}
      <div className="px-4 py-2 border-t border-white/5 text-[9px] text-gray-500 bg-black/30 flex justify-between tracking-wider font-mono">
        <span>항목 수: {currentFolders.length + currentTracks.length}</span>
        <span>대기 중</span>
      </div>
    </div>
  );
};

export default Playlist;