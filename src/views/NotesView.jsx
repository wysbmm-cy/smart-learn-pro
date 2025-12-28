import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import {
    NotebookPen, Plus, Search, Trash2, Save,
    PanelLeft, Eye, EyeOff, FileText, MoreVertical, FileDown
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const NotesView = () => {
    const { loadUserNotes, saveToNotes, removeNoteItem } = useApp();
    const [notes, setNotes] = useState([]);
    const [activeNote, setActiveNote] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [showPreview, setShowPreview] = useState(true);
    const [showList, setShowList] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Debounce Save Timer
    const saveTimerRef = useRef(null);

    useEffect(() => {
        refreshNotes();
    }, []);

    const refreshNotes = async () => {
        const data = await loadUserNotes();
        setNotes(data);
        // If there are notes and none active, select first? Or stay null for "Zero State"
        if (!activeNote && data.length > 0) {
            // Optional: setActiveNote(data[0]);
        }
    };

    const handleCreate = async () => {
        const newNote = {
            id: Date.now().toString(),
            title: "Untitled Note",
            content: "# New Note\nStart writing here...",
            updatedAt: Date.now()
        };
        await saveToNotes(newNote);
        await refreshNotes();
        setActiveNote(newNote);
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (confirm("Delete this note?")) {
            await removeNoteItem(id);
            if (activeNote?.id === id) setActiveNote(null);
            await refreshNotes();
        }
    };

    const handleUpdate = (updatedFields) => {
        if (!activeNote) return;
        const updated = { ...activeNote, ...updatedFields, updatedAt: Date.now() };
        setActiveNote(updated);

        // Update local list UI immediately for responsiveness
        setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));

        // Debounced Auto-save
        setIsSaving(true);
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            await saveToNotes(updated);
            setIsSaving(false);
        }, 1000); // 1s debounce
    };

    const handleExport = () => {
        if (!activeNote) return;
        const blob = new Blob([activeNote.content], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${activeNote.title || "Note"}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const filteredNotes = notes.filter(n =>
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="h-full flex animate-fade-in bg-transparent overflow-hidden relative">

            {/* --- Left Sidebar (Note List) --- */}
            <div className={`${showList ? 'w-64 border-r border-white/5' : 'w-0 opacity-0'} flex flex-col transition-all duration-300 bg-slate-950/20 backdrop-blur-sm relative shrink-0`}>
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                    <h2 className="font-bold text-slate-100 flex items-center gap-2 text-sm">
                        <NotebookPen size={16} className="text-violet-400" />
                        笔记本
                    </h2>
                    <button onClick={handleCreate} className="p-1.5 bg-violet-600/20 text-violet-300 border border-violet-500/30 rounded-lg hover:bg-violet-600/40 transition">
                        <Plus size={16} />
                    </button>
                </div>

                <div className="p-3">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-3 text-slate-500" />
                        <input
                            type="text"
                            placeholder="搜索笔记..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-xs text-slate-300 focus:ring-1 focus:ring-violet-500/50 focus:border-violet-500/50 outline-none placeholder:text-slate-600"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                    {filteredNotes.map(note => (
                        <div
                            key={note.id}
                            onClick={() => setActiveNote(note)}
                            className={`p-3 rounded-lg cursor-pointer transition-all group relative ${activeNote?.id === note.id
                                ? 'bg-violet-600/10 border border-violet-500/30'
                                : 'hover:bg-white/5 border border-transparent'
                                }`}
                        >
                            <h4 className={`font-medium text-sm truncate ${activeNote?.id === note.id ? 'text-violet-200' : 'text-slate-400 group-hover:text-slate-200'}`}>
                                {note.title || "Untitled"}
                            </h4>
                            <p className="text-[10px] text-slate-600 mt-1 truncate group-hover:text-slate-500">
                                {new Date(note.updatedAt).toLocaleDateString()}
                            </p>
                            <button
                                onClick={(e) => handleDelete(e, note.id)}
                                className="absolute right-2 top-2 p-1.5 text-slate-500 hover:text-red-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                    {filteredNotes.length === 0 && (
                        <div className="text-center py-10 text-slate-600 text-xs">
                            暂无笔记
                        </div>
                    )}
                </div>
            </div>

            {/* --- Main Area (Editor + Preview) --- */}
            <div className="flex-1 flex flex-col min-w-0 bg-transparent">

                {/* Toolbar */}
                <div className="h-14 border-b border-white/5 flex items-center justify-between px-4 bg-transparent shrink-0">
                    <div className="flex items-center gap-3 w-full">
                        <button
                            onClick={() => setShowList(!showList)}
                            className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-slate-200 shrink-0 cursor-pointer transition-colors"
                            title={showList ? "Hide Sidebar" : "Show Sidebar"}
                        >
                            <PanelLeft size={18} />
                        </button>
                        {activeNote && (
                            <input
                                value={activeNote.title}
                                onChange={(e) => handleUpdate({ title: e.target.value })}
                                className="text-sm font-bold text-slate-200 bg-transparent border-none outline-none focus:ring-0 placeholder:text-slate-600 flex-1 min-w-0"
                                placeholder="Note Title"
                            />
                        )}
                    </div>

                    {activeNote && (
                        <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] font-medium transition-opacity ${isSaving ? 'opacity-100 text-violet-400' : 'opacity-0'}`}>
                                Saving...
                            </span>
                            <div className="h-4 w-px bg-white/10 mx-2" />
                            <button
                                onClick={handleExport}
                                className="p-1.5 rounded-lg flex items-center gap-2 text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
                                title="Export Markdown"
                            >
                                <FileDown size={16} />
                            </button>

                            <button
                                onClick={() => setShowPreview(!showPreview)}
                                className={`p-1.5 rounded-lg flex items-center gap-2 text-xs font-medium transition-colors ${showPreview ? 'bg-violet-600/20 text-violet-300' : 'text-slate-500 hover:bg-white/5'
                                    }`}
                            >
                                {showPreview ? <Eye size={16} /> : <EyeOff size={16} />}
                            </button>
                        </div>
                    )}
                </div>

                {/* Content Area */}
                {activeNote ? (
                    <div className="flex-1 flex overflow-hidden">
                        {/* Editor */}
                        <div className={`flex-1 flex flex-col ${showPreview ? 'border-r border-white/5' : ''}`}>
                            <textarea
                                value={activeNote.content}
                                onChange={(e) => handleUpdate({ content: e.target.value })}
                                className="flex-1 w-full p-6 resize-none outline-none border-none font-mono text-slate-300 text-sm leading-7 selection:bg-violet-500/30 bg-transparent placeholder:text-slate-700"
                                placeholder="# Start writing..."
                            />
                        </div>

                        {/* Preview */}
                        {showPreview && (
                            <div className="flex-1 overflow-y-auto bg-slate-950/20 p-6 
                                prose prose-invert prose-sm max-w-none 
                                prose-headings:text-violet-200 prose-headings:font-bold prose-headings:border-b prose-headings:border-white/5 prose-headings:pb-2
                                prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
                                prose-blockquote:border-l-4 prose-blockquote:border-violet-500 prose-blockquote:bg-white/5 prose-blockquote:px-4 prose-blockquote:py-1 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:text-slate-300
                                prose-table:border-collapse prose-table:border prose-table:border-white/10 
                                prose-th:bg-white/5 prose-th:p-3 prose-th:text-slate-200 
                                prose-td:p-3 prose-td:border-t prose-td:border-white/5
                                prose-code:text-violet-300 prose-code:bg-white/5 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
                                prose-img:rounded-xl prose-img:shadow-lg
                                prose-hr:border-white/10
                                prose-p:my-1 prose-p:leading-relaxed
                            ">
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm, remarkBreaks]}
                                    rehypePlugins={[rehypeRaw, rehypeHighlight]}
                                >
                                    {activeNote.content.replace(/==([^=]+)==/g, '<mark class="bg-yellow-400 text-slate-900 px-1 rounded font-bold shadow-sm">$1</mark>')}
                                </ReactMarkdown>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4 border border-white/5">
                            <NotebookPen size={32} className="opacity-50" />
                        </div>
                        <p className="text-sm">Select or create a note</p>
                    </div>
                )}
            </div>

        </div>
    );
};

export default NotesView;
