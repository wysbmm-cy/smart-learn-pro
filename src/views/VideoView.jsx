import React, { useState, useEffect, useRef } from 'react';
import SplitPane from '../components/SplitPane';
import BilibiliPlayer from '../components/video/BilibiliPlayer';
import { useApp } from '../context/AppContext';
import { Search, Sparkles, BookOpen, ChevronRight, PlayCircle, Layers, FileText, Mic, Square, Loader2, History, Clock, Trash2, X } from 'lucide-react';
import { transcribeAudio } from '../services/ai';
import { saveVideoHistory, getVideoHistory, deleteVideoHistory } from '../services/db';

const VideoView = () => {
    const {
        settings,
        currentArticle,
        setCurrentArticle,
        isAnalyzeLoading,
        toggleChat,
        saveToNotes
    } = useApp();

    const [url, setUrl] = useState('');
    const [inputUrl, setInputUrl] = useState('');
    const [quickNote, setQuickNote] = useState(() => localStorage.getItem('draft_video_note') || '');

    // Persist draft
    useEffect(() => {
        localStorage.setItem('draft_video_note', quickNote);
    }, [quickNote]);

    // History State
    const [history, setHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);

    // Audio / AI Hearing State
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    // Load History on Mount
    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        try {
            const list = await getVideoHistory();
            setHistory(list);
        } catch (e) {
            console.error("Failed to load video history", e);
        }
    };

    const handleLoadVideo = async () => {
        if (!inputUrl) return;
        setUrl(inputUrl);

        // Save to History
        // Try to extract title or use URL as fallback if we can't get metadata in V1
        const record = {
            url: inputUrl,
            title: `Bilibili Video (${inputUrl.slice(-12)})`, // Simple fallback title
            lastWatched: Date.now()
        };
        await saveVideoHistory(record);
        loadHistory();
    };

    const handleHistoryClick = (hist) => {
        setInputUrl(hist.url);
        setUrl(hist.url);
        setShowHistory(false);
    };

    const handleDeleteHistory = async (e, histUrl) => {
        e.stopPropagation();
        if (window.confirm("Remove from history?")) {
            await deleteVideoHistory(histUrl);
            loadHistory();
        }
    };

    const startRecording = async () => {
        try {
            // Prefer system audio (screen share audio) for clearer pickup, fallback to mic if needed
            let stream;
            try {
                // Ask for system audio (display media) - User must select the tab or screen and check "Share Audio"
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: true, // Required to get audio in most browsers
                    audio: true
                });
            } catch (err) {
                // Fallback to mic if user cancels screen share
                console.warn("System audio capture cancelled, falling back to mic...", err);
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }

            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = handleRecordingStop;
            mediaRecorder.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Audio Error:", err);
            toast.error("无法录制音频。请允许麦克风或系统音频访问权限。");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop()); // Stop screen share
            setIsRecording(false);
        }
    };

    const handleRecordingStop = async () => {
        setIsTranscribing(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        try {
            const text = await transcribeAudio(new File([audioBlob], "video_clip.webm", { type: 'audio/webm' }), settings);
            if (text) {
                setQuickNote(prev => (prev ? prev + " " + text : text));
            }
        } catch (error) {
            console.error("Transcription failed:", error);
            alert("转录失败。请检查您的 API Key 设置。");
        } finally {
            setIsTranscribing(false);
        }
    };

    // Sidebar for Input & AI Tools
    const SidebarContent = (
        <div className="h-full flex flex-col p-4 text-phy-text bg-slate-900/40 relative">
            {/* History Overlay */}
            {showHistory && (
                <div className="absolute inset-0 z-10 bg-slate-900/95 backdrop-blur-md p-4 flex flex-col animate-fade-in">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <History size={16} /> 最近播放
                        </h3>
                        <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-phy-glassHeavy rounded">
                            <X size={16} className="text-phy-muted" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                        {history.length === 0 && <p className="text-phy-muted text-xs text-center mt-4">暂无历史记录。</p>}
                        {history.map((hist) => (
                            <div
                                key={hist.url}
                                onClick={() => handleHistoryClick(hist)}
                                className="p-3 bg-slate-800/50 rounded-lg border border-phy-border hover:bg-phy-glassHeavy cursor-pointer group"
                            >
                                <div className="flex justify-between items-start">
                                    <p className="text-xs text-phy-text font-medium line-clamp-2 mb-1">{hist.title}</p>
                                    <button
                                        onClick={(e) => handleDeleteHistory(e, hist.url)}
                                        className="opacity-0 group-hover:opacity-100 text-phy-muted hover:text-red-400 p-0.5"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                                <div className="text-[10px] text-phy-muted flex items-center gap-1">
                                    <Clock size={10} />
                                    {new Date(hist.lastWatched).toLocaleDateString()}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="mb-6 flex justify-between items-start">
                <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
                        <PlayCircle className="text-pink-500" />
                        视频学习
                    </h2>
                    <p className="text-xs text-phy-muted">AI 辅助 Bilibili 视频学习</p>
                </div>
                <button
                    onClick={() => setShowHistory(true)}
                    className="p-2 text-phy-muted hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-colors"
                    title="历史记录"
                >
                    <History size={18} />
                </button>
            </div>

            {/* URL Input */}
            <div className="mb-6">
                <label className="text-xs font-bold text-phy-muted uppercase tracking-wider mb-2 block">
                    视频来源
                </label>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={inputUrl}
                            onChange={(e) => setInputUrl(e.target.value)}
                            placeholder="粘贴 Bilibili 视频链接..."
                            className="w-full bg-slate-950/50 border border-phy-borderHover rounded-lg pl-3 pr-8 py-2 text-sm text-white focus:outline-none focus:border-pink-500/50 transition-colors"
                            onKeyDown={(e) => e.key === 'Enter' && handleLoadVideo()}
                        />
                        {inputUrl && (
                            <button
                                onClick={() => setInputUrl('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-phy-muted hover:text-white"
                            >
                                ×
                            </button>
                        )}
                    </div>
                </div>
                <button
                    onClick={handleLoadVideo}
                    className="w-full mt-2 bg-pink-600 hover:bg-pink-500 text-white py-2 rounded-lg text-xs font-bold transition-all shadow-lg shadow-pink-900/20"
                >
                    加载视频
                </button>
            </div>

            <div className="w-full h-px bg-phy-glassHover mb-6"></div>

            {/* Learning Tools */}
            <div className="flex-1 flex flex-col min-h-0">
                <label className="text-xs font-bold text-phy-muted uppercase tracking-wider mb-2 flex justify-between items-center">
                    <span>智能笔记 & 音频</span>
                    <div className="flex items-center gap-2">
                        {isTranscribing && <span className="text-[10px] text-blue-400 animate-pulse">正在转录...</span>}
                        <span className="text-[10px] bg-phy-glassHeavy px-1.5 py-0.5 rounded text-phy-muted">未保存</span>
                    </div>
                </label>

                <textarea
                    value={quickNote}
                    onChange={(e) => setQuickNote(e.target.value)}
                    placeholder={isRecording ? "正在聆听..." : "输入笔记或使用麦克风捕捉视频语音..."}
                    className={`flex-1 w-full bg-slate-950/30 border rounded-xl p-3 text-sm text-phy-text focus:outline-none resize-none mb-3 custom-scrollbar transition-colors ${isRecording ? 'border-red-500/50 bg-red-900/10' : 'border-phy-borderHover focus:border-indigo-500/50'
                        }`}
                ></textarea>

                <div className="flex gap-2">
                    {/* Mic Button */}
                    <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isTranscribing}
                        className={`px-4 rounded-xl flex items-center justify-center transition-all ${isRecording
                            ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
                            : 'bg-phy-glassHeavy text-phy-text hover:bg-slate-700 hover:text-white'
                            } ${isTranscribing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="AI 听力模式 (录制音频)"
                    >
                        {isTranscribing ? <Loader2 size={18} className="animate-spin" /> : (isRecording ? <Square size={18} fill="currentColor" /> : <Mic size={18} />)}
                    </button>

                    <button
                        onClick={() => {
                            if (quickNote.trim()) {
                                toggleChat();
                                setTimeout(() => {
                                    navigator.clipboard.writeText(`Please analyze this text from the video: "${quickNote}"`);
                                    setCurrentArticle(quickNote);
                                }, 100);
                            }
                        }}
                        className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-bold text-xs transition-all"
                    >
                        <Sparkles size={14} />
                        分析
                    </button>
                    <button
                        onClick={async () => {
                            if (quickNote.trim()) {
                                await saveToNotes({ title: `视频笔记: ${new Date().toLocaleString()}`, content: quickNote });
                                setQuickNote('');
                            }
                        }}
                        className="flex items-center justify-center gap-2 bg-phy-glassHeavy hover:bg-slate-700 text-phy-text px-4 py-2.5 rounded-xl font-bold text-xs transition-all"
                        title="保存到笔记"
                    >
                        <FileText size={14} />
                    </button>
                </div>
            </div>

            <div className="mt-4 text-[10px] text-phy-muted text-center">
                提示: 点击麦克风让 AI “聆听”并转录视频内容。
            </div>
        </div>
    );

    return (
        <div className="w-full h-full overflow-hidden rounded-3xl border border-phy-border shadow-2xl bg-slate-900/20 backdrop-blur-sm">
            <SplitPane
                initialLeftWidth={350}
                minLeftWidth={280}
                maxLeftWidth={500}
                left={SidebarContent}
                right={
                    <div className={`w-full h-full flex flex-col p-6 ${!url ? 'justify-center items-center' : ''}`}>
                        <BilibiliPlayer url={url} />
                    </div>
                }
            />
        </div>
    );
};

export default VideoView;
