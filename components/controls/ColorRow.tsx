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
    <div className="flex items-center py-3 px-4 select-none">
        <div className="w-20 text-xs text-gray-500 font-bold uppercase tracking-wider truncate shrink-0">{label}</div>
        <div className="flex-1 mx-3 flex justify-end">
            <div className="relative overflow-hidden w-full h-8 rounded-lg bg-app-bg shadow-neu-pressed cursor-pointer p-1">
                 <div className="w-full h-full rounded bg-transparent relative overflow-hidden">
                    <input 
                        type="color" 
                        value={value} 
                        onChange={(e) => onChange(e.target.value)}
                        className="absolute -top-4 -left-4 w-[200%] h-[300%] cursor-pointer p-0 border-0 opacity-0"
                    />
                    <div className="w-full h-full rounded shadow-sm" style={{ backgroundColor: value }}></div>
                 </div>
            </div>
        </div>
        <div className="w-14 text-right text-gray-400 font-mono text-xs uppercase ml-2">{value}</div>
    </div>
);

export default ColorRow;