import React, { useRef, useEffect, useState } from 'react';
import { Play, Pause, X, Music, Maximize2, Minimize2 } from 'lucide-react';
import { useApp } from '../context/AppContext';

const GlobalPlayer = () => {
    const { audioState, closeAudio, toggleAudioPlay } = useApp();
    const audioRef = useRef(null);
    const [rate, setRate] = useState(1.0);

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

    return (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
            <div className="bg-white/90 backdrop-blur-md border border-blue-100 shadow-2xl rounded-2xl p-4 flex items-center gap-4 w-80 md:w-96">

                {/* Icon/Art */}
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0">
                    <Music size={24} className="animate-pulse-slow" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-800 text-sm truncate">{audioState.file.name}</h4>
                    <p className="text-xs text-slate-500 truncate">Global Player Active</p>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={cycleSpeed}
                        className="text-xs font-bold text-slate-500 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors w-12 text-center"
                        title="Click to change speed"
                    >
                        {rate}x
                    </button>
                    <button
                        onClick={() => toggleAudioPlay(!audioState.isPlaying)}
                        className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-full transition-colors"
                    >
                        {audioState.isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                    </button>
                    <button
                        onClick={closeAudio}
                        className="p-2 hover:bg-slate-100 text-slate-400 hover:text-red-500 rounded-full transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Hidden Audio Element */}
                <audio
                    ref={audioRef}
                    src={audioState.file.url}
                    onPlay={handleAudioEvents}
                    onPause={handleAudioEvents}
                    onEnded={() => toggleAudioPlay(false)}
                    className="hidden"
                />
            </div>
        </div>
    );
};

export default GlobalPlayer;
