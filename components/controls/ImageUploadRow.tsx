import React, { useRef } from 'react';

interface ImageUploadRowProps {
    label: string;
    currentImage: string | null;
    onUpload: (file: File) => void;
    onRemove: () => void;
}

const ImageUploadRow: React.FC<ImageUploadRowProps> = ({
    label,
    currentImage,
    onUpload,
    onRemove
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <div className="flex items-center py-4 border-b border-white/5 group hover:bg-white/[0.02] px-4 transition-colors select-none">
            <div className="w-20 text-[10px] text-gray-500 font-bold uppercase tracking-wider truncate shrink-0">{label}</div>
            <div className="flex-1 mx-4 flex justify-end items-center space-x-2">
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*"
                    onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                            onUpload(e.target.files[0]);
                        }
                    }}
                />
                {currentImage ? (
                    <>
                        <div className="px-2 py-1 rounded bg-green-500/10 border border-green-500/30 text-[9px] text-green-400 font-bold uppercase tracking-wider shadow-[0_0_10px_rgba(34,197,94,0.1)]">
                            적용됨
                        </div>
                        <button 
                            onClick={onRemove}
                            className="w-6 h-6 flex items-center justify-center bg-red-500/10 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-full transition-all"
                            title="삭제"
                        >
                           <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                    </>
                ) : (
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide bg-[#222] hover:bg-[#333] hover:text-white text-gray-400 border border-gray-700 rounded-md transition-all"
                    >
                        이미지 선택
                    </button>
                )}
            </div>
        </div>
    );
};

export default ImageUploadRow;