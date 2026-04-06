import React, { useState, useEffect, useRef } from 'react';

const SplitPane = ({
    left,
    right,
    initialLeftWidth = 350,
    minLeftWidth = 250,
    maxLeftWidth = 600,
    onLeftWidthChange = null,
    mobileCollapsible = false,
    mobileCollapsedDefault = false,
    mobileToggleLabel = 'Left Panel',
    mobileLeftMaxHeight = '40vh',
    leftClassName = "bg-slate-900/40 backdrop-blur-md border-r border-phy-border",
    rightClassName = "bg-slate-900/10"
}) => {
    const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
    const [isDragging, setIsDragging] = useState(false);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [mobileLeftOpen, setMobileLeftOpen] = useState(!mobileCollapsedDefault);
    const containerRef = useRef(null);

    // Handle Window Resize
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!isMobile) {
            setMobileLeftOpen(true);
            return;
        }
        setMobileLeftOpen(!mobileCollapsedDefault);
    }, [isMobile, mobileCollapsedDefault]);

    const handleMouseDown = (e) => {
        if (isMobile) return; // Disable drag on mobile
        setIsDragging(true);
        e.preventDefault();
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            if (containerRef.current) {
                const containerRect = containerRef.current.getBoundingClientRect();
                let newWidth = e.clientX - containerRect.left;

                if (newWidth < minLeftWidth) newWidth = minLeftWidth;
                if (newWidth > maxLeftWidth) newWidth = maxLeftWidth;

                // Constraint to container width
                if (newWidth > containerRect.width - 100) newWidth = containerRect.width - 100;

                setLeftWidth(newWidth);
                if (typeof onLeftWidthChange === 'function') {
                    onLeftWidthChange(newWidth);
                }
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
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
    }, [isDragging, minLeftWidth, maxLeftWidth, onLeftWidthChange]);

    return (
        <div
            ref={containerRef}
            className={`w-full h-full flex ${isMobile ? 'flex-col' : 'flex-row'} overflow-hidden relative`}
        >
            {isMobile && mobileCollapsible && (
                <div className="shrink-0 border-b border-phy-border bg-phy-glassHeavy px-3 py-2">
                    <button
                        onClick={() => setMobileLeftOpen((v) => !v)}
                        className="w-full text-xs font-bold border border-phy-border rounded-lg px-3 py-2 text-phy-text bg-phy-glass hover:bg-phy-glassHover transition-colors"
                    >
                        {mobileLeftOpen ? `收起${mobileToggleLabel}` : `展开${mobileToggleLabel}`}
                    </button>
                </div>
            )}
            {/* Left Pane */}
            <div
                style={{
                    width: isMobile ? '100%' : leftWidth,
                    height: isMobile ? ((mobileCollapsible && !mobileLeftOpen) ? '0px' : mobileLeftMaxHeight) : '100%',
                    maxHeight: isMobile ? ((mobileCollapsible && !mobileLeftOpen) ? '0px' : mobileLeftMaxHeight) : undefined
                }}
                className={`shrink-0 overflow-hidden relative z-10 transition-all duration-150 ${leftClassName} ${isMobile && (!mobileCollapsible || mobileLeftOpen) ? 'border-b' : ''}`}
            >
                {left}
            </div>

            {/* Resizer Handle */}
            {!isMobile && (
                <div
                    onMouseDown={handleMouseDown}
                    className={`w-1.5 hover:w-2 -ml-0.5 z-50 cursor-col-resize flex items-center justify-center transition-colors group
                        ${isDragging ? 'bg-violet-600' : 'bg-transparent hover:bg-violet-500/50'}`}
                >
                    <div className={`w-0.5 h-8 rounded-full transition-colors ${isDragging ? 'bg-violet-300' : 'bg-slate-400/50 group-hover:bg-violet-400'}`} />
                </div>
            )}

            {/* Right Pane */}
            <div className={`flex-1 min-w-0 h-full overflow-hidden relative ${rightClassName}`}>
                {right}
            </div>

            {/* Drag Overlay */}
            {isDragging && <div className="absolute inset-0 z-[9999] cursor-col-resize" />}
        </div>
    );
};

export default SplitPane;
