import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, X, Music, Maximize2, Minimize2, GripHorizontal } from 'lucide-react';
import { useApp } from '../context/AppContext';

const GlobalPlayer = () => {
    const { audioState, closeAudio, toggleAudioPlay } = useApp();
    const audioRef = useRef(null);
    const [rate, setRate] = useState(1.0);
    const [isMinimized, setIsMinimized] = useState(false);

    // Draggable State
    const [position, setPosition] = useState({ x: window.innerWidth - 340, y: window.innerHeight - 150 });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    // Handle Window Resize to keep in bounds (basic)
    useEffect(() => {
        const handleResize = () => {
            // Optional: reset or clamp position
            setPosition(prev => ({
                x: Math.min(prev.x, window.innerWidth - 100),
                y: Math.min(prev.y, window.innerHeight - 100)
            }));
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Drag Handlers
    const handleMouseDown = (e) => {
        setIsDragging(true);
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            e.preventDefault(); // Prevent selection
            setPosition({
                x: e.clientX - dragOffset.current.x,
                y: e.clientY - dragOffset.current.y
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


    // Sync playback rate
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

    // Update state when audio ends or pauses naturally
    const handleAudioEvents = (e) => {
        if (e.type === 'pause') toggleAudioPlay(false);
        if (e.type === 'play') toggleAudioPlay(true);
    };

    if (!audioState.file) return null;

    // Initial position effect (center-ish right if first load)
    // We used default state, so no effect needed.

    return (
        <div
            className="fixed z-[100] transition-shadow"
            style={{
                left: position.x,
                top: position.y,
                cursor: isDragging ? 'grabbing' : 'auto'
            }}
        >
            {/* Hidden Audio Element */}
            <audio
                ref={audioRef}
                src={audioState.file.url}
                onPlay={handleAudioEvents}
                onPause={handleAudioEvents}
                onEnded={() => toggleAudioPlay(false)}
                className="hidden"
            />

            {isMinimized ? (
                // Minimized "Floating Ball"
                <div
                    className="relative group"
                    onMouseDown={handleMouseDown}
                >
                    <div className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center border-2 border-white cursor-grab active:cursor-grabbing hover:scale-105 transition-transform ${audioState.isPlaying ? 'bg-gradient-to-r from-blue-500 to-indigo-600 animate-spin-slow' : 'bg-slate-800'
                        }`}>
                        <Music size={24} className="text-white" />
                    </div>

                    {/* Hover Actions for Minimized */}
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                        Double click to expand
                    </div>

                    {/* Quick controls on hover/click? Simplest is expand button overlaid or just click to expand. */}
                    <button
                        onClick={() => setIsMinimized(false)}
                        className="absolute inset-0 w-full h-full rounded-full z-10"
                        title="Expand Player"
                    />
                </div>
            ) : (
                // Expanded Player Card
                <div className="bg-white/90 backdrop-blur-md border border-blue-100 shadow-2xl rounded-2xl p-3 flex flex-col gap-2 w-80 shadow-blue-500/20">

                    {/* Drag Handle & Header */}
                    <div
                        className="flex items-center justify-between border-b border-slate-100 pb-2 cursor-grab active:cursor-grabbing"
                        onMouseDown={handleMouseDown}
                    >
                        <div className="text-slate-400">
                            <GripHorizontal size={16} />
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setIsMinimized(true)}
                                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
                                title="Minimize"
                            >
                                <Minimize2 size={16} />
                            </button>
                            <button
                                onClick={closeAudio}
                                className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500"
                                title="Close"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Art */}
                        <div className={`w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-lg flex items-center justify-center text-white shadow-md shrink-0 ${audioState.isPlaying ? 'animate-pulse' : ''}`}>
                            <Music size={20} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-slate-800 text-xs truncate scroll-m-2">{audioState.file.name}</h4>
                            <p className="text-[10px] text-slate-500 truncate">Audio Player</p>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-around bg-slate-50 rounded-xl p-1 mt-1">
                        <button
                            onClick={cycleSpeed}
                            className="text-[10px] font-bold text-slate-500 hover:text-blue-600 px-2 py-1 transition-colors"
                        >
                            {rate}x
                        </button>

                        <button
                            onClick={() => toggleAudioPlay(!audioState.isPlaying)}
                            className="p-1.5 bg-white shadow-sm border border-slate-200 text-blue-600 rounded-full hover:scale-105 active:scale-95 transition-all"
                        >
                            {audioState.isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                        </button>

                        <div className="w-8" /> {/* Spacer for symmetry */}
                    </div>
                </div>
            )}
        </div>
    );
};

export default GlobalPlayer;
