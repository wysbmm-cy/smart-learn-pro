import React, { useState, useEffect, useRef } from 'react';
import SplitPane from '../components/SplitPane';
import { useApp } from '../context/AppContext';
import { PenTool, Save, RotateCcw, Sparkles, CheckCircle, AlertCircle, FileText, Eraser, Trash2, X, Loader2 } from 'lucide-react';
import { saveWriting, getWritings, deleteWriting } from '../services/db';
import { analyzeWriting } from '../services/ai';
import toast from 'react-hot-toast';

const WriterView = () => {
    const { settings, toggleChat, setCurrentArticle } = useApp();
    const [content, setContent] = useState(() => localStorage.getItem('draft_writer_content') || '');
    const [title, setTitle] = useState(() => localStorage.getItem('draft_writer_title') || '');
    const [writings, setWritings] = useState([]);
    const [currentId, setCurrentId] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // AI Analysis State
    const [analysis, setAnalysis] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Persist draft
    useEffect(() => {
        localStorage.setItem('draft_writer_content', content);
    }, [content]);

    useEffect(() => {
        localStorage.setItem('draft_writer_title', title);
    }, [title]);

    // Stats
    const wordCount = content.trim().split(/\s+/).filter(w => w.length > 0).length;

    useEffect(() => {
        loadWritings();
    }, []);

    const loadWritings = async () => {
        const list = await getWritings();
        setWritings(list);
    };

    const handleSave = async () => {
        if (!content.trim()) return;
        setIsSaving(true);
        const id = currentId || crypto.randomUUID();
        const writing = {
            id,
            title: title || content.slice(0, 30) + '...',
            content,
            createdAt: currentId ? undefined : Date.now() // Keep original creation date if updating
        };
        await saveWriting(writing);
        setCurrentId(id);
        if (!title) setTitle(writing.title);
        await loadWritings();
        setTimeout(() => setIsSaving(false), 800);
        toast.success('Draft saved successfully!');
    };

    const handleNew = () => {
        setContent('');
        setTitle('');
        setCurrentId(null);
        setAnalysis(null);
    };

    const handleLoad = (w) => {
        setContent(w.content);
        setTitle(w.title);
        setCurrentId(w.id);
        setAnalysis(null);
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (window.confirm("Delete this draft?")) {
            await deleteWriting(id);
            if (currentId === id) handleNew();
            loadWritings();
            toast.success('Draft deleted.');
        }
    };

    const handleAnalyze = async () => {
        if (!content.trim()) {
            toast.error("Please write something first!");
            return;
        }
        setIsAnalyzing(true);
        setAnalysis(null); // Reset previous analysis
        try {
            const result = await analyzeWriting(content, settings);
            setAnalysis(result);
            toast.success("Analysis Complete!");
        } catch (e) {
            console.error(e);
            toast.error("Analysis Failed: " + e.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Score Badge Color Helper
    const getScoreColor = (score) => {
        if (score >= 13) return 'bg-emerald-500 shadow-emerald-500/50'; // Excellent
        if (score >= 10) return 'bg-blue-500 shadow-blue-500/50';       // Good
        if (score >= 7) return 'bg-amber-500 shadow-amber-500/50';      // Fair
        return 'bg-red-500 shadow-red-500/50';                         // Poor
    };

    const SidebarContent = (
        <div className="h-full flex flex-col p-4 text-slate-200 bg-slate-900/40">
            <div className="mb-6">
                <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
                    <PenTool className="text-emerald-500" />
                    Writing Bench
                </h2>
                <p className="text-xs text-slate-400">Core writing practice area.</p>
            </div>

            <button
                onClick={handleNew}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-sm font-bold mb-4 flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
            >
                <FileText size={16} /> New Draft
            </button>

            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                <h3 className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Drafts</h3>
                {writings.map(w => (
                    <div
                        key={w.id}
                        onClick={() => handleLoad(w)}
                        className={`p-3 rounded-lg border cursor-pointer group transition-all ${currentId === w.id
                            ? 'bg-emerald-900/20 border-emerald-500/50 text-emerald-100'
                            : 'bg-slate-800/30 border-white/5 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                    >
                        <div className="flex justify-between items-start">
                            <p className="text-sm font-medium line-clamp-1">{w.title}</p>
                            <button
                                onClick={(e) => handleDelete(e, w.id)}
                                className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                        <p className="text-[10px] opacity-60 mt-1">
                            {new Date(w.updatedAt).toLocaleDateString()}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="w-full h-full overflow-hidden rounded-3xl border border-white/5 shadow-2xl bg-slate-900/20 backdrop-blur-sm">
            <SplitPane
                initialLeftWidth={280}
                minLeftWidth={250}
                maxLeftWidth={400}
                left={SidebarContent}
                right={
                    <div className="flex h-full bg-slate-950/30 relative overflow-hidden">
                        {/* Main Editor Area */}
                        <div className={`flex flex-col h-full transition-all duration-300 ${analysis ? 'w-1/2 border-r border-white/5 hidden md:flex' : 'w-full'}`}>
                            {/* Editor Toolbar */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Untitled Draft..."
                                    className="bg-transparent text-xl font-bold text-white placeholder-slate-600 focus:outline-none w-full mr-4"
                                />
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500 mr-2 whitespace-nowrap">
                                        {wordCount} words
                                    </span>
                                    <button
                                        onClick={handleSave}
                                        className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                        title="Save"
                                    >
                                        {isSaving ? <CheckCircle size={20} className="text-emerald-500" /> : <Save size={20} />}
                                    </button>

                                    <div className="w-px h-6 bg-white/10 mx-1"></div>

                                    <button
                                        onClick={handleAnalyze}
                                        disabled={isAnalyzing}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold shadow-lg transition-all whitespace-nowrap
                                            ${isAnalyzing
                                                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'}`}
                                    >
                                        {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                        {isAnalyzing ? 'Analyzing...' : 'AI Polish'}
                                    </button>
                                </div>
                            </div>

                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Start writing here..."
                                className="flex-1 w-full bg-transparent p-8 text-lg leading-relaxed text-slate-200 focus:outline-none resize-none custom-scrollbar font-sans"
                                spellCheck="false"
                            />
                        </div>

                        {/* Analysis Result Panel */}
                        {analysis && (
                            <div className="flex-1 h-full bg-slate-900/80 overflow-y-auto custom-scrollbar animate-in slide-in-from-right duration-300 absolute md:static inset-0 z-20 md:z-0 w-full md:w-auto">
                                <div className="p-6 space-y-6">
                                    <div className="flex justify-between items-start">
                                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                            <CheckCircle className="text-emerald-400" />
                                            Analysis Report
                                        </h3>
                                        <button
                                            onClick={() => setAnalysis(null)}
                                            className="p-1 hover:bg-white/10 rounded-full text-slate-400 transition-colors"
                                        >
                                            <X size={24} />
                                        </button>
                                    </div>

                                    {/* Score Card */}
                                    <div className="bg-slate-800/50 rounded-2xl p-6 border border-white/5 relative overflow-hidden group hover:border-white/10 transition-colors">
                                        <div className="flex justify-between items-center relative z-10">
                                            <div>
                                                <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">CET Score</div>
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-6xl font-black text-white tracking-tighter">{analysis.score}</span>
                                                    <span className="text-2xl text-slate-500 font-light">/ 15</span>
                                                </div>
                                                <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold text-white mt-3 shadow-lg ${getScoreColor(analysis.score)}`}>
                                                    {analysis.level}
                                                </div>
                                            </div>
                                            <div className="text-right pl-4 flex-1">
                                                <div className="text-slate-300 text-sm italic leading-relaxed">"{analysis.comment}"</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Issues List */}
                                    <div className="space-y-4">
                                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <AlertCircle size={14} />
                                            Key Issues ({analysis.issues.length})
                                        </h4>
                                        {analysis.issues.length === 0 ? (
                                            <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-sm text-center font-bold">
                                                🎉 Perfect! No major issues found.
                                            </div>
                                        ) : (
                                            analysis.issues.map((issue, idx) => (
                                                <div key={idx} className="bg-slate-800/30 rounded-xl p-4 border border-white/5 hover:bg-slate-800/50 transition-colors">
                                                    <div className="flex flex-wrap gap-2 items-center mb-2">
                                                        <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-bold uppercase border border-indigo-500/30">
                                                            {issue.type}
                                                        </span>
                                                        <span className="text-xs text-red-300 font-mono bg-red-500/10 px-1 rounded line-through decoration-red-500/50">
                                                            {issue.original}
                                                        </span>
                                                        <span className="text-slate-500">→</span>
                                                        <span className="text-xs text-emerald-300 font-mono bg-emerald-500/10 px-1 rounded font-bold">
                                                            {issue.fixed}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-slate-400">{issue.reason}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    {/* Improvement Tips */}
                                    {analysis.improvement_tips && (
                                        <div className="bg-indigo-900/10 rounded-2xl p-6 border border-indigo-500/10">
                                            <h4 className="text-sm font-bold text-indigo-300 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <Sparkles size={14} /> Improvement Tips
                                            </h4>
                                            <ul className="space-y-2">
                                                {analysis.improvement_tips.map((tip, idx) => (
                                                    <li key={idx} className="text-sm text-indigo-200/80 flex gap-3 text-left">
                                                        <span className="text-indigo-500 font-bold">•</span> {tip}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Rewritten Version */}
                                    <div className="pb-6">
                                        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                            <PenTool size={14} /> Model Essay (14-15 pts)
                                        </h4>
                                        <div className="bg-slate-950 rounded-xl p-6 border border-white/10 text-slate-300 text-sm leading-loose font-serif whitespace-pre-wrap shadow-inner relative">
                                            {/* decorative quote */}
                                            <div className="absolute top-4 left-4 text-6xl font-serif text-white/5 pointer-events-none">“</div>
                                            {analysis.corrected_text}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                }
            />
        </div>
    );
};

export default WriterView;
