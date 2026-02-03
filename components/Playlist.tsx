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
  onDeleteTrack: (trackId: string) => void;
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
    onReorderTrack,
    onDeleteTrack
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
  };

  const handleDropOnFolder = (e: React.DragEvent, folderId: string | null) => {
      e.preventDefault();
      e.stopPropagation(); 
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
        className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-app-bg shadow-neu-btn hover:text-app-accent active:shadow-neu-pressed transition-all duration-200 group text-app-text"
        title={label}
      >
        <span className="transition-colors">{icon}</span>
      </button>
  );

  return (
    <div className="flex flex-col h-full bg-app-bg">
      {/* Toolbar */}
      <div className="p-4 pb-2 flex space-x-3">
        <IconButton 
            onClick={onCreateFolder}
            label="새 폴더"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>}
        />
        <IconButton 
            onClick={() => fileInputRef.current?.click()}
            label="파일 가져오기"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>}
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
      <div className="px-5 py-3 text-xs flex items-center space-x-2 text-app-textMuted overflow-hidden whitespace-nowrap">
        <span 
            className={`cursor-pointer transition-all px-2 py-1 rounded-lg ${!currentFolderId ? 'bg-app-bg shadow-neu-pressed text-app-accent font-bold' : 'hover:text-app-text'}`}
            onClick={() => onNavigate(null)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDropOnFolder(e, null)}
        >
            ROOT
        </span>
        {currentFolder && (
            <>
                <span className="opacity-30">/</span>
                <span className="font-bold truncate bg-app-bg px-2 py-1 rounded-lg shadow-neu-pressed text-app-text">
                    {currentFolder.name}
                </span>
            </>
        )}
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Back Button */}
          {currentFolderId && (
              <div 
                  className="group flex items-center px-4 py-3 rounded-xl bg-app-bg text-app-textMuted hover:text-app-text cursor-pointer transition-all shadow-neu-flat hover:translate-y-px active:shadow-neu-pressed"
                  onClick={() => onNavigate(currentFolder?.parentId || null)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnFolder(e, currentFolder?.parentId || null)}
              >
                  <svg className="w-5 h-5 mr-3 opacity-50" viewBox="0 0 24 24" fill="currentColor"><path d="M11.67 3.87L9.9 2.1 0 12l9.9 9.9 1.77-1.77L3.54 12z"/></svg>
                  <span className="text-sm font-bold tracking-wide">.. (상위)</span>
              </div>
          )}

          {/* Folders */}
          {currentFolders.map(folder => (
              <div 
                  key={folder.id}
                  onDoubleClick={() => onNavigate(folder.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnFolder(e, folder.id)}
                  className="group flex items-center px-4 py-3 rounded-xl bg-app-bg text-app-text cursor-pointer transition-all shadow-neu-flat hover:shadow-neu-pressed"
              >
                  <div className="p-1.5 rounded-full bg-app-bg shadow-neu-thin mr-3 text-yellow-500">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
                  </div>
                  <span className="text-sm font-bold tracking-wide flex-1">{folder.name}</span>
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
                  className={`group flex items-center px-4 py-3 rounded-xl cursor-pointer transition-all ${
                    isActive 
                      ? 'bg-app-bg shadow-neu-pressed text-app-accent' 
                      : 'bg-app-bg shadow-neu-flat text-app-text hover:-translate-y-px'
                  } ${isDragging ? 'opacity-50 dashed border-gray-400' : ''}`}
                >
                   {/* Drag Handle */}
                   <div className="mr-3 opacity-0 group-hover:opacity-30 cursor-grab active:cursor-grabbing text-gray-400">
                       <svg width="8" height="12" viewBox="0 0 6 10" fill="currentColor">
                           <circle cx="1" cy="1" r="1" />
                           <circle cx="1" cy="5" r="1" />
                           <circle cx="1" cy="9" r="1" />
                           <circle cx="5" cy="1" r="1" />
                           <circle cx="5" cy="5" r="1" />
                           <circle cx="5" cy="9" r="1" />
                       </svg>
                   </div>

                   {/* Status Indicator */}
                   <div className={`w-2.5 h-2.5 rounded-full mr-3 shrink-0 transition-all duration-300 ${
                       isActive 
                       ? 'bg-app-accent shadow-[0_0_8px_rgba(139,92,246,0.6)]' 
                       : 'bg-gray-300 shadow-neu-thin'
                   }`}></div>
                   
                   <span className="text-sm font-medium tracking-wide truncate flex-1">{track.name}</span>
                   
                   {/* Audio Wave Animation */}
                   {isActive && (
                       <div className="flex space-x-0.5 ml-2 items-end h-3">
                           <div className="w-0.5 bg-app-accent animate-[bounce_1s_infinite] h-2 rounded-full"></div>
                           <div className="w-0.5 bg-app-accent animate-[bounce_1.2s_infinite] h-3 rounded-full"></div>
                           <div className="w-0.5 bg-app-accent animate-[bounce_0.8s_infinite] h-1.5 rounded-full"></div>
                       </div>
                   )}

                   {/* Delete Button */}
                   <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTrack(track.id);
                        }}
                        className="ml-3 p-2 rounded-full text-gray-400 hover:text-red-500 hover:shadow-neu-pressed transition-all opacity-0 group-hover:opacity-100"
                        title="삭제"
                        aria-label="Delete track"
                   >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                   </button>
                </div>
              );
          })}

          {currentFolders.length === 0 && currentTracks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 opacity-40 text-center">
                  <div className="p-4 rounded-full bg-app-bg shadow-neu-flat mb-3">
                     <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                  </div>
                  <p className="text-xs uppercase tracking-widest text-app-textMuted">비어 있음</p>
              </div>
          )}
      </div>
      
      {/* Footer Status */}
      <div className="px-5 py-3 border-t border-white/40 text-[11px] text-app-textMuted flex justify-between tracking-wider font-mono">
        <span>ITEMS: {currentFolders.length + currentTracks.length}</span>
        <span>READY</span>
      </div>
    </div>
  );
};

export default Playlist;