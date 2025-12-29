import React, { useState, useEffect } from 'react';
import Layout from '../layouts/Layout';
import BilibiliPlayer from '../components/video/BilibiliPlayer';
import { useApp } from '../context/AppContext';
import { Search, Sparkles, BookOpen, ChevronRight, PlayCircle, Layers, FileText } from 'lucide-react';

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
    const [isSplit, setIsSplit] = useState(true);
    const [quickNote, setQuickNote] = useState('');

    // Sidebar for Input & AI Tools
    const SidebarContent = (
        <div className="h-full flex flex-col p-4 text-slate-200">
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
                    <span>Smart Notes</span>
                    <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">Not Saved</span>
                </label>

                <textarea
                    value={quickNote}
                    onChange={(e) => setQuickNote(e.target.value)}
                    placeholder="Type subtitles or notes here to analyze..."
                    className="flex-1 w-full bg-slate-950/30 border border-white/10 rounded-xl p-3 text-sm text-slate-300 focus:outline-none focus:border-indigo-500/50 resize-none mb-3 custom-scrollbar"
                ></textarea>

                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            // Trigger AI Chat with this text
                            if (quickNote.trim()) {
                                toggleChat();
                                setTimeout(() => {
                                    // We would ideally inject this into chat input, 
                                    // but for V1 user can copy/paste or we use a context method if available.
                                    // Since ChatSidebar is separate, let's copy to clipboard for now as a "Plugin" feel
                                    navigator.clipboard.writeText(`Please analyze this text from the video: "${quickNote}"`);
                                    // Or use setCurrentArticle if we want standard analysis
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
                                // Toast or feedback could go here
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
                Tip: Use "Analyze" to get deep grammatical insights.
            </div>
        </div>
    );

    return (
        <Layout
            currentView="video"
            isSplit={isSplit}
            setIsSplit={setIsSplit}
            secondaryContent={SidebarContent}
        >
            <div className={`w-full h-full flex flex-col ${!url ? 'justify-center items-center' : ''}`}>
                <BilibiliPlayer url={url} />
            </div>
        </Layout>
    );
};

export default VideoView;
