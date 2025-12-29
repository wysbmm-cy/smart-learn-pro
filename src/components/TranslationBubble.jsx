import React, { useState, useEffect, useRef } from 'react';
import { X, Copy, Check, Move } from 'lucide-react';

const TranslationBubble = ({ initialPosition, status, result, onClose }) => {
    const [copied, setCopied] = useState(false);

    // Drag State
    const [position, setPosition] = useState(initialPosition || { x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });
    const bubbleRef = useRef(null);

    // Update position if initialPosition changes (only when not dragging/already set?)
    // Actually, we usually want it to start at initialPosition and then be independent.
    useEffect(() => {
        if (initialPosition && !isDragging) {
            // Only update if it's a fresh mount or we want to force reset?
            // For now, let's strictly use internal state once mounted.
            // But wait, if props change, should it move?
            // Since we remount it for new selections (key change in parent?), we just init state.
        }
    }, []);

    const handleMouseDown = (e) => {
        // Only drag from header
        e.stopPropagation(); // Prevent closing
        setIsDragging(true);
        dragStartRef.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            setPosition({
                x: e.clientX - dragStartRef.current.x,
                y: e.clientY - dragStartRef.current.y
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    const handleCopy = () => {
        navigator.clipboard.writeText(result);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div
            ref={bubbleRef}
            className={`fixed z-50 bg-white/95 backdrop-blur-md text-slate-700 rounded-xl shadow-2xl border border-slate-200 w-80 flex flex-col transition-shadow ${isDragging ? 'cursor-grabbing shadow-3xl scale-[1.02]' : ''}`}
            // Use inline styles for position to avoid re-render lag
            style={{
                left: position.x,
                top: position.y,
                // Adjust to center horizontally on the point, sitting above using translate
                transform: 'translate(-50%, 10px)'
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* Draggable Header */}
            <div
                className={`flex justify-between items-center p-3 border-b border-slate-100 bg-slate-50/80 rounded-t-xl select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-2 text-blue-600">
                    <Move size={14} className="opacity-50" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                        {status === 'loading' ? 'Translating...' : 'AI Translation'}
                    </span>
                </div>
                <div className="flex gap-1" onMouseDown={e => e.stopPropagation()}>
                    {status === 'success' && (
                        <button
                            onClick={handleCopy}
                            className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Copy"
                        >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="p-4 text-sm leading-relaxed min-h-[60px] max-h-[300px] overflow-y-auto custom-scrollbar">
                {status === 'loading' ? (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-slate-500">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <div className="h-2 w-3/4 bg-slate-100 rounded animate-pulse"></div>
                        <div className="h-2 w-1/2 bg-slate-100 rounded animate-pulse"></div>
                    </div>
                ) : (
                    <p className="font-serif text-slate-800">{result}</p>
                )}
            </div>
        </div>
    );
};

export default TranslationBubble;
