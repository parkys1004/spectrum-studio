import React from 'react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    confirmText?: string;
    children?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ 
    isOpen, 
    onClose, 
    onConfirm, 
    title, 
    confirmText = "확인",
    children 
}) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-[#1a1a1a] w-[450px] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] rounded-xl flex flex-col overflow-hidden transform transition-all scale-100">
                
                {/* Header */}
                <div className="px-5 py-4 border-b border-white/5 bg-gradient-to-r from-white/[0.03] to-transparent flex justify-between items-center">
                    <h3 className="text-sm font-bold text-gray-100 tracking-wide uppercase">{title}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 text-sm text-gray-300 bg-[#121212]">
                    {children}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 bg-[#161616] border-t border-white/5 flex justify-end space-x-3">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white border border-white/10 hover:border-white/20 rounded-lg hover:bg-white/5 transition-all"
                    >
                        취소
                    </button>
                    <button 
                        onClick={onConfirm}
                        className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-lg shadow-lg shadow-blue-500/20 transition-all transform hover:translate-y-px"
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Modal;