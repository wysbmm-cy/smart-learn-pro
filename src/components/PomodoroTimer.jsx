import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Coffee, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

const TomatoIcon = ({ size = 20, className }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
        xmlns="http://www.w3.org/2000/svg"
    >
        <path d="M12 2C9 2 6 3 6 3C6 3 4 5 5 7C5 7 2 11 2 15C2 19.4183 6.47715 23 12 23C17.5228 23 22 19.4183 22 15C22 11 19 7 19 7C20 5 18 3 18 3C18 3 15 2 12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 6C12 6 13.5 4 16 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 6C12 6 10.5 4 8 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const PomodoroTimer = () => {
    const { settings } = useApp();
    const [timeLeft, setTimeLeft] = useState(settings.pomodoroFocus * 60);
    const [isActive, setIsActive] = useState(false);
    const [mode, setMode] = useState('focus'); // 'focus' | 'break'
    const [isMinimized, setIsMinimized] = useState(false);

    const intervalRef = useRef(null);

    // Reset when settings change, but only if not active to avoid disrupting
    useEffect(() => {
        if (!isActive) {
            setTimeLeft((mode === 'focus' ? settings.pomodoroFocus : settings.pomodoroBreak) * 60);
        }
    }, [settings.pomodoroFocus, settings.pomodoroBreak, mode]);

    useEffect(() => {
        if (isActive && timeLeft > 0) {
            intervalRef.current = setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0) {
            // Timer Finished
            setIsActive(false);
            clearInterval(intervalRef.current);

            // Notification (Visual or Web API)
            if (Notification.permission === "granted") {
                new Notification(mode === 'focus' ? "专注完成！休息一下吧。" : "休息结束！准备开始专注。");
            } else if (Notification.permission !== "denied") {
                Notification.requestPermission();
            }

            // Auto switch mode? Or wait for user. Let's wait.
            // But we can play a sound here if we had one.
        }

        return () => clearInterval(intervalRef.current);
    }, [isActive, timeLeft, mode]);

    // Check if enabled
    if (!settings.showPomodoro) return null;

    const toggleTimer = () => setIsActive(!isActive);

    const resetTimer = () => {
        setIsActive(false);
        setTimeLeft((mode === 'focus' ? settings.pomodoroFocus : settings.pomodoroBreak) * 60);
    };

    const switchMode = () => {
        const newMode = mode === 'focus' ? 'break' : 'focus';
        setMode(newMode);
        setIsActive(false);
        setTimeLeft((newMode === 'focus' ? settings.pomodoroFocus : settings.pomodoroBreak) * 60);
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const progress = 1 - (timeLeft / ((mode === 'focus' ? settings.pomodoroFocus : settings.pomodoroBreak) * 60));

    // Minimized View
    if (isMinimized) {
        return (
            <button
                onClick={() => setIsMinimized(false)}
                className="fixed bottom-6 left-6 z-50 bg-white/90 backdrop-blur shadow-lg border border-slate-200 rounded-full w-12 h-12 flex items-center justify-center text-slate-600 hover:scale-110 transition-transform hover:text-red-500"
            >
                {isActive ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
                            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={mode === 'focus' ? '#ef4444' : '#10b981'} strokeWidth="3" strokeDasharray={`${progress * 100}, 100`} />
                        </svg>
                        <span className="text-[10px] font-bold">{Math.ceil(timeLeft / 60)}</span>
                    </div>
                ) : (
                    mode === 'focus' ? <TomatoIcon size={24} className="text-red-500" /> : <Coffee size={20} className="text-green-500" />
                )}
            </button>
        );
    }

    return (
        <div className="fixed bottom-6 left-6 z-50 animate-fade-in-up">
            <div className={`bg-white/90 backdrop-blur-md border border-slate-200 shadow-2xl rounded-2xl p-4 w-64 transition-all ${isActive ? (mode === 'focus' ? 'ring-2 ring-red-500/20' : 'ring-2 ring-green-500/20') : ''}`}>

                {/* Header */}
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg ${mode === 'focus' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                            {mode === 'focus' ? <TomatoIcon size={18} /> : <Coffee size={16} />}
                        </div>
                        <span className="text-sm font-bold text-slate-700">
                            {mode === 'focus' ? '专注模式' : '休息时间'}
                        </span>
                    </div>
                    <div className="flex gap-1">
                        <button onClick={() => setIsMinimized(true)} className="p-1 hover:bg-slate-100 rounded text-slate-400">
                            <ChevronDown size={16} />
                        </button>
                    </div>
                </div>

                {/* Timer Display */}
                <div className="text-center mb-4">
                    <div className={`text-4xl font-mono font-bold tracking-wider ${mode === 'focus' ? 'text-red-600' : 'text-green-600'}`}>
                        {formatTime(timeLeft)}
                    </div>
                    {/* Progress Bar */}
                    <div className="h-1.5 w-full bg-slate-100 rounded-full mt-2 overflow-hidden">
                        <div
                            className={`h-full transition-all duration-1000 ${mode === 'focus' ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${progress * 100}%` }}
                        />
                    </div>
                </div>

                {/* Controls */}
                <div className="flex justify-between items-center bg-slate-50 p-2 rounded-xl">
                    <button
                        onClick={toggleTimer}
                        className={`p-3 rounded-lg shadow-sm transition-all text-white flex-1 flex justify-center ${isActive
                            ? 'bg-amber-500 hover:bg-amber-600'
                            : (mode === 'focus' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600')}`}
                    >
                        {isActive ? <Pause size={20} /> : <Play size={20} />}
                    </button>

                    <button
                        onClick={resetTimer}
                        className="p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors mx-1"
                        title="重置"
                    >
                        <RotateCcw size={18} />
                    </button>

                    <button
                        onClick={switchMode}
                        className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200 bg-white"
                        title="切换模式 (Switch Mode)"
                    >
                        {mode === 'focus' ? '休息' : '专注'}
                    </button>
                </div>

            </div>
        </div>
    );
};

export default PomodoroTimer;
