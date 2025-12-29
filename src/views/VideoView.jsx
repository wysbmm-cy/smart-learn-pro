import React, { useState, useEffect, useRef } from 'react';
import SplitPane from '../components/SplitPane';
import BilibiliPlayer from '../components/video/BilibiliPlayer';
import { useApp } from '../context/AppContext';
import { Search, Sparkles, BookOpen, ChevronRight, PlayCircle, Layers, FileText, Mic, Square, Loader2 } from 'lucide-react';
import { transcribeAudio } from '../services/ai';

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
    const [quickNote, setQuickNote] = useState('');

    // Audio / AI Hearing State
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
            console.error("Mic Error:", err);
            alert("Could not access microphone. Please check permissions.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
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
            alert("Transcription failed. Please check your Audio API Key.");
        } finally {
            setIsTranscribing(false);
        }
    };

    // Sidebar for Input & AI Tools
    const SidebarContent = (
        <div className="h-full flex flex-col p-4 text-slate-200 bg-slate-900/40">
            {/* Header */}
            <div className="mb-6">
                <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
                    <PlayCircle className="text-pink-500" />
                    Video Learning
                </h2>
                <p className="text-xs text-slate-400">Watch Bilibili videos with AI assistance.</p>
            </div>

            {/* URL Input */}
            <div className="mb-6">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                    Video Source
                </label>
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            value={inputUrl}
                            onChange={(e) => setInputUrl(e.target.value)}
                            placeholder="Paste Bilibili URL..."
                            className="w-full bg-slate-950/50 border border-white/10 rounded-lg pl-3 pr-8 py-2 text-sm text-white focus:outline-none focus:border-pink-500/50 transition-colors"
                            onKeyDown={(e) => e.key === 'Enter' && setUrl(inputUrl)}
                        />
                        {inputUrl && (
                            <button
                                onClick={() => setInputUrl('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                            >
                                ×
                            </button>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => setUrl(inputUrl)}
                    className="w-full mt-2 bg-pink-600 hover:bg-pink-500 text-white py-2 rounded-lg text-xs font-bold transition-all shadow-lg shadow-pink-900/20"
                >
                    Load Video
                </button>
            </div>

            <div className="w-full h-px bg-white/10 mb-6"></div>

            {/* Learning Tools */}
            <div className="flex-1 flex flex-col min-h-0">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between items-center">
                    <span>Smart Notes & Audio</span>
                    <div className="flex items-center gap-2">
                        {isTranscribing && <span className="text-[10px] text-blue-400 animate-pulse">Transcribing...</span>}
                        <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">Not Saved</span>
                    </div>
                </label>

                <textarea
                    value={quickNote}
                    onChange={(e) => setQuickNote(e.target.value)}
                    placeholder={isRecording ? "Listening..." : "Type notes or use the mic to capture video audio..."}
                    className={`flex-1 w-full bg-slate-950/30 border rounded-xl p-3 text-sm text-slate-300 focus:outline-none resize-none mb-3 custom-scrollbar transition-colors ${isRecording ? 'border-red-500/50 bg-red-900/10' : 'border-white/10 focus:border-indigo-500/50'
                        }`}
                ></textarea>

                <div className="flex gap-2">
                    {/* Mic Button */}
                    <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isTranscribing}
                        className={`px-4 rounded-xl flex items-center justify-center transition-all ${isRecording
                            ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                            } ${isTranscribing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        title="AI Hearing Mode (Record Audio)"
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
                        Analyze
                    </button>
                    <button
                        onClick={async () => {
                            if (quickNote.trim()) {
                                await saveToNotes({ title: `Video Note: ${new Date().toLocaleString()}`, content: quickNote });
                                setQuickNote('');
                            }
                        }}
                        className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-xl font-bold text-xs transition-all"
                        title="Save to Notes"
                    >
                        <FileText size={14} />
                    </button>
                </div>
            </div>

            <div className="mt-4 text-[10px] text-slate-500 text-center">
                Tip: Click Mic to let AI "hear" and transcribe the video content.
            </div>
        </div>
    );

    return (
        <div className="w-full h-full overflow-hidden rounded-3xl border border-white/5 shadow-2xl bg-slate-900/20 backdrop-blur-sm">
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
