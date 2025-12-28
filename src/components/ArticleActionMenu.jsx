import React from 'react';
import { Languages, BookmarkPlus, X } from 'lucide-react';

const ArticleActionMenu = ({ position, text, onTranslate, onSave, onClose }) => {
    if (!text) return null;

    return (
        <div
            className="fixed z-50 bg-slate-900/90 backdrop-blur-md text-white rounded-xl shadow-xl flex items-center p-2 gap-2 animate-fade-in-up"
            style={{
                left: position.x,
                top: position.y,
                transform: 'translate(-50%, -100%) translateY(-10px)'
            }}
        >
            <button
                onClick={onTranslate}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 rounded-lg transition-colors text-xs font-bold"
            >
                <Languages size={14} className="text-blue-400" />
                Translate
            </button>
            <div className="w-[1px] h-4 bg-white/20"></div>
            <button
                onClick={onSave}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/10 rounded-lg transition-colors text-xs font-bold"
            >
                <BookmarkPlus size={14} className="text-purple-400" />
                Save
            </button>
            <div className="w-[1px] h-4 bg-white/20"></div>
            <button
                onClick={onClose}
                className="p-1 hover:bg-white/20 rounded-full transition-colors text-slate-400 hover:text-white"
            >
                <X size={12} />
            </button>

            {/* Arrow */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900/90"></div>
        </div>
    );
};

export default ArticleActionMenu;
