import React, { useState, useEffect, useRef } from 'react';
import SplitPane from '../components/SplitPane';
import BilibiliPlayer from '../components/video/BilibiliPlayer';
import { useApp } from '../context/AppContext';
import { Sparkles, PlayCircle, FileText, Mic, Square, Loader2, History, Clock, Trash2, X } from 'lucide-react';
import { transcribeAudio } from '../services/ai';
import { saveVideoHistory, getVideoHistory, deleteVideoHistory } from '../services/db';
import toast from 'react-hot-toast';

const VideoView = () => {
    const {
        settings,
        setCurrentArticle,
        toggleChat,
        saveToNotes
    } = useApp();

    const [url, setUrl] = useState('');
    const [inputUrl, setInputUrl] = useState('');
    const [quickNote, setQuickNote] = useState(() => localStorage.getItem('draft_video_note') || '');

    const [history, setHistory] = useState([]);
    const [showHistory, setShowHistory] = useState(false);

    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    useEffect(() => {
        localStorage.setItem('draft_video_note', quickNote);
    }, [quickNote]);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        try {
            const list = await getVideoHistory();
            setHistory(list || []);
        } catch (error) {
            console.error('Failed to load video history:', error);
        }
    };

    const handleLoadVideo = async () => {
        const nextUrl = inputUrl.trim();
        if (!nextUrl) return;

        setUrl(nextUrl);

        const record = {
            url: nextUrl,
            title: `Bilibili Video (${nextUrl.slice(-12)})`,
            lastWatched: Date.now()
        };

        await saveVideoHistory(record);
        await loadHistory();
    };

    const handleHistoryClick = (item) => {
        setInputUrl(item.url);
        setUrl(item.url);
        setShowHistory(false);
    };

    const handleDeleteHistory = async (event, historyUrl) => {
        event.stopPropagation();
        if (!window.confirm('Remove this item from history?')) return;
        await deleteVideoHistory(historyUrl);
        await loadHistory();
    };

    const startRecording = async () => {
        try {
            let stream;
            try {
                stream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: true
                });
            } catch (displayError) {
                console.warn('System audio capture canceled, fallback to microphone:', displayError);
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
        } catch (error) {
            console.error('Audio recording failed:', error);
            toast.error('Recording failed. Please check microphone/screen permission.');
        }
    };

    const stopRecording = () => {
        if (!mediaRecorderRef.current || !isRecording) return;

        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
    };

    const handleRecordingStop = async () => {
        setIsTranscribing(true);

        try {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const file = new File([audioBlob], 'video_clip.webm', { type: 'audio/webm' });
            const text = await transcribeAudio(file, settings);

            if (text) {
                setQuickNote((prev) => (prev ? `${prev} ${text}` : text));
            }
        } catch (error) {
            console.error('Transcription failed:', error);
            toast.error('Transcription failed. Check API settings and try again.');
        } finally {
            setIsTranscribing(false);
        }
    };

    const SidebarContent = (
        <div className="h-full flex flex-col p-4 text-phy-text bg-slate-900/40 relative">
            {showHistory && (
                <div className="absolute inset-0 z-10 bg-slate-900/95 backdrop-blur-md p-4 flex flex-col animate-fade-in">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <History size={16} /> 视频历史
                        </h3>
                        <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-phy-glassHeavy rounded">
                            <X size={16} className="text-phy-muted" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                        {history.length === 0 && (
                            <p className="text-phy-muted text-xs text-center mt-4">暂无视频历史记录。</p>
                        )}
                        {history.map((item) => (
                            <div
                                key={item.url}
                                onClick={() => handleHistoryClick(item)}
                                className="p-3 bg-slate-800/50 rounded-lg border border-phy-border hover:bg-phy-glassHeavy cursor-pointer group"
                            >
                                <div className="flex justify-between items-start">
                                    <p className="text-xs text-phy-text font-medium line-clamp-2 mb-1">{item.title}</p>
                                    <button
                                        onClick={(event) => handleDeleteHistory(event, item.url)}
                                        className="opacity-0 group-hover:opacity-100 text-phy-muted hover:text-red-400 p-0.5"
                                        title="Delete from history"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                                <div className="text-[10px] text-phy-muted flex items-center gap-1">
                                    <Clock size={10} />
                                    {new Date(item.lastWatched || item.timestamp || Date.now()).toLocaleDateString()}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="mb-6 flex justify-between items-start">
                <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
                        <PlayCircle className="text-pink-500" />
                        视频学习
                    </h2>
                    <p className="text-xs text-phy-muted">加载 Bilibili 视频，并通过 AI 转录获取笔记。</p>
                </div>
                <button
                    onClick={() => setShowHistory(true)}
                    className="p-2 text-phy-muted hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-colors"
                    title="Open video history"
                >
                    <History size={18} />
                </button>
            </div>

            <div className="mb-6">
                <label className="text-xs font-bold text-phy-muted uppercase tracking-wider mb-2 block">
                    Bilibili URL
                </label>
                <div className="relative">
                    <input
                        type="text"
                        value={inputUrl}
                        onChange={(event) => setInputUrl(event.target.value)}
                        placeholder="粘贴 Bilibili 链接..."
                        className="w-full bg-slate-950/50 border border-phy-borderHover rounded-lg pl-3 pr-10 py-2 text-sm text-white focus:outline-none focus:border-pink-500/50 transition-colors"
                        onKeyDown={(event) => event.key === 'Enter' && handleLoadVideo()}
                    />
                    {inputUrl && (
                        <button
                            onClick={() => setInputUrl('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-phy-muted hover:text-white"
                            title="Clear URL"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                <button
                    onClick={handleLoadVideo}
                    className="w-full mt-2 bg-pink-600 hover:bg-pink-500 text-white py-2 rounded-lg text-xs font-bold transition-all shadow-lg shadow-pink-900/20"
                >
                    加载视频
                </button>
            </div>

            <div className="w-full h-px bg-phy-glassHover mb-6" />

            <div className="flex-1 flex flex-col min-h-0">
                <label className="text-xs font-bold text-phy-muted uppercase tracking-wider mb-2 flex justify-between items-center">
                    <span>快速笔记与转录</span>
                    <div className="flex items-center gap-2">
                        {isTranscribing && <span className="text-[10px] text-blue-400 animate-pulse">正在转录...</span>}
                        <span className="text-[10px] bg-phy-glassHeavy px-1.5 py-0.5 rounded text-phy-muted">已自动保存草稿</span>
                    </div>
                </label>

                <textarea
                    value={quickNote}
                    onChange={(event) => setQuickNote(event.target.value)}
                    placeholder={
                        isRecording
                            ? 'Recording... click stop to transcribe.'
                            : 'Write notes while watching. You can transcribe audio and send to AI.'
                    }
                    className={`flex-1 w-full border rounded-xl p-3 text-sm text-phy-text focus:outline-none resize-none mb-3 custom-scrollbar transition-colors ${
                        isRecording
                            ? 'border-red-500/50 bg-red-900/10'
                            : 'bg-slate-950/30 border-phy-borderHover focus:border-indigo-500/50'
                    }`}
                />

                <div className="flex gap-2">
                    <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isTranscribing}
                        className={`px-4 rounded-xl flex items-center justify-center transition-all ${
                            isRecording
                                ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
                                : 'bg-phy-glassHeavy text-phy-text hover:bg-slate-700 hover:text-white'
                        } ${isTranscribing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="Record system/mic audio"
                    >
                        {isTranscribing
                            ? <Loader2 size={18} className="animate-spin" />
                            : isRecording
                                ? <Square size={18} fill="currentColor" />
                                : <Mic size={18} />}
                    </button>

                    <button
                        onClick={() => {
                            if (!quickNote.trim()) return;
                            toggleChat();
                            setTimeout(() => {
                                try {
                                    navigator.clipboard.writeText(`Please analyze this text from the video: "${quickNote}"`);
                                } catch (error) {
                                    console.warn('Clipboard write failed:', error);
                                }
                                setCurrentArticle(quickNote);
                            }, 100);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-2.5 rounded-xl font-bold text-xs transition-all"
                    >
                        <Sparkles size={14} />
                        AI 深度分析
                    </button>

                    <button
                        onClick={async () => {
                            if (!quickNote.trim()) return;
                            await saveToNotes({
                                title: `Video Note ${new Date().toLocaleString()}`,
                                content: quickNote
                            });
                            setQuickNote('');
                            toast.success('Saved to notes.');
                        }}
                        className="flex items-center justify-center gap-2 bg-phy-glassHeavy hover:bg-slate-700 text-phy-text px-4 py-2.5 rounded-xl font-bold text-xs transition-all"
                        title="Save as note"
                    >
                        <FileText size={14} />
                    </button>
                </div>
            </div>

            <div className="mt-4 text-[10px] text-phy-muted text-center">
                Tip: for better transcript quality, use screen-share audio when starting recording.
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
