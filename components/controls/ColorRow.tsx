import React from 'react';

interface ColorRowProps {
    label: string;
    value: string;
    onChange: (val: string) => void;
}

const ColorRow: React.FC<ColorRowProps> = ({
    label,
    value,
    onChange
}) => (
    <div className="flex items-center py-4 border-b border-white/5 group hover:bg-white/[0.02] px-4 transition-colors select-none">
        <div className="w-20 text-[10px] text-gray-500 font-bold uppercase tracking-wider truncate shrink-0">{label}</div>
        <div className="flex-1 mx-4 flex justify-end">
            <div className="relative overflow-hidden w-full h-8 rounded-lg border border-white/10 bg-black shadow-inner cursor-pointer hover:border-white/30 transition-colors">
                 <input 
                    type="color" 
                    value={value} 
                    onChange={(e) => onChange(e.target.value)}
                    className="absolute -top-4 -left-4 w-[200%] h-[300%] cursor-pointer p-0 border-0"
                 />
            </div>
        </div>
        <div className="w-16 text-right text-gray-400 font-mono text-[10px] uppercase ml-2 opacity-50">{value}</div>
    </div>
);

export default ColorRow;