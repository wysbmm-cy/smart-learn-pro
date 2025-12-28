import React, { useState, useEffect, useRef } from 'react';

const SplitPane = ({ left, right, initialLeftWidth = 300, minLeftWidth = 200, maxLeftWidth = 600 }) => {
    const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
    const [isDragging, setIsDragging] = useState(false);
    const splitPaneRef = useRef(null);

    const handleMouseDown = (e) => {
        setIsDragging(true);
        e.preventDefault(); // Prevent text selection
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            if (!splitPaneRef.current) return;

            const containerRect = splitPaneRef.current.getBoundingClientRect();
            // Calculate new width relative to container left
            let newWidth = e.clientX - containerRect.left;

            // Clamp width
            if (newWidth < minLeftWidth) newWidth = minLeftWidth;
            if (newWidth > maxLeftWidth) newWidth = maxLeftWidth;
            if (newWidth > containerRect.width - 100) newWidth = containerRect.width - 100; // Keep right pane visible

            setLeftWidth(newWidth);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none'; // Disable selection globally while dragging
        } else {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isDragging, minLeftWidth, maxLeftWidth]);

    return (
        <div ref={splitPaneRef} className="flex h-full w-full overflow-hidden relative">
            {/* Left Pane */}
            <div
                style={{ width: leftWidth }}
                className="h-full shrink-0 overflow-hidden relative border-r border-white/5 bg-slate-900/40 backdrop-blur-md transition-none"
            >
                {left}
            </div>

            {/* Resizer Handle */}
            <div
                onMouseDown={handleMouseDown}
                className={`w-1.5 hover:w-2 -ml-0.5 z-50 cursor-col-resize flex items-center justify-center transition-colors group
                    ${isDragging ? 'bg-violet-600' : 'bg-transparent hover:bg-violet-500/50'}`}
            >
                {/* Visual Handle Line */}
                <div className={`w-0.5 h-8 rounded-full transition-colors ${isDragging ? 'bg-violet-300' : 'bg-slate-700 group-hover:bg-violet-400'}`} />
            </div>

            {/* Right Pane */}
            <div className="flex-1 h-full overflow-hidden min-w-0 bg-transparent">
                {right}
            </div>

            {/* Drag Overlay to prevent iframe capturing if any */}
            {isDragging && <div className="absolute inset-0 z-[9999] cursor-col-resize" />}
        </div>
    );
};

export default SplitPane;
