import React from 'react';
import { X, Copy, Check } from 'lucide-react';
import { useState } from 'react';

const TranslationBubble = ({ position, status, result, onClose }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(result);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div
            className="fixed z-50 bg-white/95 backdrop-blur-md text-slate-700 rounded-xl shadow-xl p-4 w-72 border border-slate-200 animate-fade-in-up"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
                left: position.x,
                top: position.y,
                transform: 'translate(-50%, 10px)'
            }}
        >
            {/* Header / Actions */}
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                    {status === 'loading' ? 'AI Translating...' : 'Translation'}
                </span>
                <div className="flex gap-2">
                    {status === 'success' && (
                        <button
                            onClick={handleCopy}
                            className="text-slate-400 hover:text-blue-500 transition-colors"
                            title="Copy"
                        >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="text-sm leading-relaxed min-h-[40px]">
                {status === 'loading' ? (
                    <div className="flex items-center gap-2 text-slate-500">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                ) : (
                    <p className="font-serif">{result}</p>
                )}
            </div>

            {/* Arrow pointing up */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 translate-y-[1px] border-8 border-transparent border-b-white/95 filter drop-shadow-[0_-2px_1px_rgba(0,0,0,0.05)]"></div>
        </div>
    );
};

export default TranslationBubble;
