import React, { useRef, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Play, Pause, X, Music, Maximize2, Minimize2, GripHorizontal, Repeat } from 'lucide-react';
import { useApp } from '../context/AppContext';

const GlobalPlayer = () => {
    const { audioState, closeAudio, toggleAudioPlay } = useApp();
    const audioRef = useRef(null);
    const [rate, setRate] = useState(1.0);
    const [loop, setLoop] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);

    // Progress State
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const progressRef = useRef(null);

    // Draggable State
    const [position, setPosition] = useState(() => ({
        x: Math.max(12, window.innerWidth - 356),
        y: Math.max(72, window.innerHeight - 220)
    }));
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    // Format time helper
    const formatTime = (seconds) => {
        if (!seconds || isNaN(seconds)) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    // Handle Window Resize to keep in bounds (basic)
    useEffect(() => {
        const handleResize = () => {
            // Optional: reset or clamp position
            setPosition(prev => ({
                x: Math.min(Math.max(12, prev.x), Math.max(12, window.innerWidth - 80)),
                y: Math.min(Math.max(72, prev.y), Math.max(72, window.innerHeight - 96))
            }));
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Drag Handlers
    const dragStartPosition = useRef({ x: 0, y: 0 });

    const startDrag = (clientX, clientY) => {
        setIsDragging(true);
        dragStartPosition.current = { x: clientX, y: clientY };
        dragOffset.current = {
            x: clientX - position.x,
            y: clientY - position.y
        };
    };

    const handleMouseDown = (e) => {
        startDrag(e.clientX, e.clientY);
    };

    const handleTouchStart = (e) => {
        const touch = e.touches?.[0];
        if (!touch) return;
        startDrag(touch.clientX, touch.clientY);
    };

    useEffect(() => {
        const moveTo = (clientX, clientY) => {
            if (!isDragging) return;
            setPosition({
                x: Math.min(Math.max(12, clientX - dragOffset.current.x), Math.max(12, window.innerWidth - 80)),
                y: Math.min(Math.max(72, clientY - dragOffset.current.y), Math.max(72, window.innerHeight - 96))
            });
        };

        const handleMouseMove = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            moveTo(e.clientX, e.clientY);
        };

        const handleTouchMove = (e) => {
            if (!isDragging) return;
            const touch = e.touches?.[0];
            if (!touch) return;
            e.preventDefault();
            moveTo(touch.clientX, touch.clientY);
        };

        const handleMouseUp = (e) => {
            setIsDragging(false);
        };

        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.addEventListener('touchmove', handleTouchMove, { passive: false });
            document.addEventListener('touchend', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.removeEventListener('touchmove', handleTouchMove);
            document.removeEventListener('touchend', handleMouseUp);
        };
    }, [isDragging]);

    // Handle Expand safely (only if not dragged)
    const handleExpandClick = (e) => {
        const dist = Math.hypot(e.clientX - dragStartPosition.current.x, e.clientY - dragStartPosition.current.y);
        if (dist < 5) {
            setIsMinimized(false);
            // Auto-adjust if off-screen when expanding
            const playerWidth = 340; // Approx w-80 + padding
            if (position.x + playerWidth > window.innerWidth) {
                setPosition(p => ({ ...p, x: Math.max(10, window.innerWidth - playerWidth - 20) }));
            }
            if (position.y + 200 > window.innerHeight) {
                setPosition(p => ({ ...p, y: Math.max(10, window.innerHeight - 200 - 20) }));
            }
        }
    };

    // Cycle speed
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.playbackRate = rate;
        }
    }, [rate]);

    const cycleSpeed = () => {
        const speeds = [0.9, 1.0, 1.1, 1.25, 1.5];
        const idx = speeds.indexOf(rate);
        const next = speeds[(idx + 1) % speeds.length];
        setRate(next);
    };

    // Sync React state with HTML5 Audio state
    useEffect(() => {
        if (audioRef.current) {
            if (audioState.isPlaying) {
                audioRef.current.play().catch(e => console.log("Play interrupted", e));
            } else {
                audioRef.current.pause();
            }
        }
    }, [audioState.isPlaying]);

    useEffect(() => {
        if (!audioRef.current || !audioState.file?.url) return;
        audioRef.current.load();
        setCurrentTime(0);
        setDuration(0);
        if (audioState.isPlaying) {
            audioRef.current.play().catch(e => console.log("Play interrupted", e));
        }
    }, [audioState.file?.url]);

    // Update state when audio ends or pauses naturally
    const handleAudioEvents = (e) => {
        if (e.type === 'pause') toggleAudioPlay(false);
        if (e.type === 'play') toggleAudioPlay(true);
    };

    // Progress update handler
    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    // Duration loaded handler
    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
        }
    };

    // Seek handler
    const handleProgressClick = (e) => {
        if (!progressRef.current || !audioRef.current || !duration) return;
        const rect = progressRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = clickX / rect.width;
        const newTime = percentage * duration;
        audioRef.current.currentTime = newTime;
        setCurrentTime(newTime);
    };

    if (!audioState.file) return null;

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return ReactDOM.createPortal(
        <div
            className="fixed z-[9999] transition-shadow"
            style={{
                left: position.x,
                top: position.y,
                cursor: isDragging ? 'grabbing' : 'auto',
                touchAction: 'none'
            }}
        >
            {/* Hidden Audio Element */}
            <audio
                ref={audioRef}
                src={audioState.file.url}
                loop={loop}
                onPlay={handleAudioEvents}
                onPause={handleAudioEvents}
                onEnded={() => {
                    if (!loop) toggleAudioPlay(false);
                }}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                className="hidden"
            />

            {isMinimized ? (
                // Minimized "Floating Ball"
                <div
                    className="relative group"
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleTouchStart}
                    onClick={handleExpandClick} // Handle click logic here
                >
                    <div className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center border-2 border-white cursor-grab active:cursor-grabbing hover:scale-105 transition-transform ${audioState.isPlaying ? 'bg-gradient-to-r from-blue-500 to-indigo-600 animate-spin-slow' : 'bg-phy-glassHeavy'
                        }`}>
                        <Music size={24} className="text-white" />
                    </div>

                    {/* Hover Actions for Minimized */}
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-phy-glassHeavy text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        点击展开
                    </div>
                </div>
            ) : (
                // Expanded Player Card
                <div className="bg-phy-glassHeavy backdrop-blur-xl border border-phy-border shadow-2xl rounded-2xl p-3 flex flex-col gap-2 w-[min(calc(100vw-24px),20rem)] shadow-phy-accentGlass/10">

                    {/* Drag Handle & Header */}
                    <div
                        className="flex items-center justify-between border-b border-phy-border pb-2 cursor-grab active:cursor-grabbing"
                        onMouseDown={handleMouseDown}
                        onTouchStart={handleTouchStart}
                    >
                        <div className="text-phy-muted">
                            <GripHorizontal size={16} />
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setIsMinimized(true)}
                                className="p-1 hover:bg-phy-glass/20 rounded text-phy-muted hover:text-phy-text"
                                title="最小化"
                            >
                                <Minimize2 size={16} />
                            </button>
                            <button
                                onClick={closeAudio}
                                className="p-1 hover:bg-red-500/20 rounded text-phy-muted hover:text-red-400"
                                title="关闭"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Art */}
                        <div className={`w-10 h-10 bg-gradient-to-br from-phy-accent to-phy-accent/60 rounded-lg flex items-center justify-center text-white shadow-md shrink-0 ${audioState.isPlaying ? 'animate-pulse' : ''}`}>
                            <Music size={20} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-phy-text text-xs truncate">{audioState.file.name}</h4>
                            <p className="text-[10px] text-phy-muted truncate">音频播放器</p>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="px-1">
                        <div
                            ref={progressRef}
                            className="h-1.5 w-full bg-phy-bg border border-phy-border rounded-full cursor-pointer group relative"
                            onClick={handleProgressClick}
                        >
                            <div
                                className="h-full bg-phy-accent rounded-full transition-all duration-150 relative"
                                style={{ width: `${progress}%` }}
                            >
                                {/* Drag Handle Dot */}
                                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-phy-bg border-2 border-phy-accent rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        </div>
                        {/* Time Display */}
                        <div className="flex justify-between text-[10px] text-phy-muted mt-1 font-mono">
                            <span>{formatTime(currentTime)}</span>
                            <span>{formatTime(duration)}</span>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-around bg-phy-bg/40 rounded-xl p-1 border border-phy-border">
                        <button
                            onClick={cycleSpeed}
                            className="text-[10px] font-bold text-phy-muted hover:text-phy-accent px-2 py-1 transition-colors"
                        >
                            {rate}x
                        </button>

                        <button
                            onClick={() => toggleAudioPlay(!audioState.isPlaying)}
                            className="p-1.5 bg-phy-glass border border-phy-border text-phy-accent rounded-full hover:scale-105 active:scale-95 transition-all"
                        >
                            {audioState.isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                        </button>

                        <button
                            onClick={() => setLoop(prev => !prev)}
                            className={`p-1.5 rounded-full border transition-all ${
                                loop
                                    ? 'bg-phy-accent text-white border-phy-accent shadow-sm shadow-phy-accent/20'
                                    : 'bg-phy-glass border-phy-border text-phy-muted hover:text-phy-accent'
                            }`}
                            title={loop ? '关闭循环' : '循环播放'}
                        >
                            <Repeat size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
};

export default GlobalPlayer;

