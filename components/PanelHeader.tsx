import React from 'react';

interface PanelHeaderProps {
    title: string;
    active?: boolean;
    rightElement?: React.ReactNode;
}

export const PanelHeader: React.FC<PanelHeaderProps> = ({ 
    title, 
    active = true, 
    rightElement 
}) => (
  <div className="h-10 min-h-[40px] flex items-center px-4 select-none border-b border-white/5 bg-gradient-to-r from-white/[0.03] to-transparent">
    <div className="flex items-center space-x-2.5">
      {/* LED Indicator */}
      <div className={`relative w-1.5 h-1.5 rounded-full transition-all duration-500 ${active ? 'bg-app-accent shadow-[0_0_8px_rgba(62,166,255,0.8)]' : 'bg-gray-700'}`}>
         {active && <div className="absolute inset-0 rounded-full bg-app-accent animate-ping opacity-20"></div>}
      </div>
      
      {/* Title */}
      <span className="text-[11px] font-bold text-gray-300 tracking-[0.1em] uppercase opacity-80 text-shadow-sm">
        {title}
      </span>
    </div>
    <div className="flex-1 flex justify-end items-center h-full pl-4">
      {rightElement}
    </div>
  </div>
);

export default PanelHeader;