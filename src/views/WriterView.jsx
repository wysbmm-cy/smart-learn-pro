import React, { useState, useEffect, useRef } from 'react';
import SplitPane from '../components/SplitPane';
import { useApp } from '../context/AppContext';
import { PenTool, Save, RotateCcw, Sparkles, CheckCircle, AlertCircle, FileText, Eraser, Trash2 } from 'lucide-react';
import { saveWriting, getWritings, deleteWriting } from '../services/db';
import toast from 'react-hot-toast';

const WriterView = () => {
    const { settings, toggleChat, setCurrentArticle } = useApp();
    const [content, setContent] = useState(() => localStorage.getItem('draft_writer_content') || '');
    const [title, setTitle] = useState(() => localStorage.getItem('draft_writer_title') || '');
    const [writings, setWritings] = useState([]);
    const [currentId, setCurrentId] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

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
    };

    const handleLoad = (w) => {
        setContent(w.content);
        setTitle(w.title);
        setCurrentId(w.id);
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
                    <div className="flex flex-col h-full bg-slate-950/30 relative">
                        {/* Editor Toolbar */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Untitled Draft..."
                                className="bg-transparent text-xl font-bold text-white placeholder-slate-600 focus:outline-none w-full mr-4"
                            />
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500 mr-2">
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
                                    onClick={() => {
                                        if (!content.trim()) return;
                                        toggleChat();
                                        // Delay to allow chat sidebar to open
                                        setTimeout(() => {
                                            navigator.clipboard.writeText(`Please proofread this essay:\n\n${content}`);
                                            setCurrentArticle(content);
                                            toast.success('Copied to clipboard! AI Assistant opening...');
                                        }, 100);
                                    }}
                                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-emerald-900/20 transition-all"
                                >
                                    <Sparkles size={16} /> AI Polish
                                </button>
                            </div>
                        </div>

                        {/* Editor Area */}
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Start writing your masterpiece..."
                            className="flex-1 w-full bg-transparent p-6 text-lg text-slate-200 focus:outline-none resize-none leading-relaxed custom-scrollbar font-sans"
                            style={{ maxWidth: '100%' }}
                            spellCheck="false"
                        ></textarea>
                    </div>
                }
            />
        </div>
    );
};

export default WriterView;
