
import React from 'react';
import { Sparkles } from 'lucide-react';

const SelectionActionBtn = ({ data, onReanalyze }) => {
    if (!data) return null;

    return (
        <div
            style={{
                top: data.y - 40, // Float above selection
                left: data.x
            }}
            className="fixed z-[100] transform -translate-x-1/2 animate-in fade-in zoom-in duration-200"
        >
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onReanalyze(data.text);
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-lg hover:shadow-indigo-500/30 transition-all font-medium text-xs whitespace-nowrap"
            >
                <Sparkles size={14} className="animate-pulse" />
                重新批注选段
            </button>
        </div>
    );
};

export default SelectionActionBtn;
