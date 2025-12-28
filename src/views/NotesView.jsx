import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import {
    NotebookPen, Plus, Search, Trash2, Save, Folder, FolderPlus,
    PanelLeft, Eye, EyeOff, FileText, MoreVertical, FileDown, ChevronRight, ChevronDown
} from 'lucide-react';
import { useApp } from '../context/AppContext';

const NotesView = () => {
    const { loadUserNotes, saveToNotes, removeNoteItem } = useApp();
    const [notes, setNotes] = useState([]);
    const [activeNote, setActiveNote] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState('split'); // 'edit', 'split', 'read'
    const [showList, setShowList] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Folder State
    const [folders, setFolders] = useState(['Uncategorized', 'Smart Analysis']);
    const [activeFolder, setActiveFolder] = useState('All');
    const [isFoldersExpanded, setIsFoldersExpanded] = useState(true);

    // Debounce Save Timer
    const saveTimerRef = useRef(null);

    useEffect(() => {
        refreshNotes();
    }, []);

    const refreshNotes = async () => {
        const data = await loadUserNotes();
        setNotes(data);

        // Extract unique folders
        const uniqueFolders = new Set(['Uncategorized', 'Smart Analysis']);
        data.forEach(n => {
            if (n.folder) uniqueFolders.add(n.folder);
            else uniqueFolders.add('Uncategorized');
        });
        setFolders(Array.from(uniqueFolders));
    };

    const handleCreate = async () => {
        const newNote = {
            id: Date.now().toString(),
            title: "Untitled Note",
            content: "# New Note\nStart writing here...",
            folder: activeFolder === 'All' ? 'Uncategorized' : activeFolder,
            updatedAt: Date.now()
        };
        await saveToNotes(newNote);
        await refreshNotes();
        setActiveNote(newNote);
        setViewMode('edit'); // Switch to edit on create
    };

    const handleCreateFolder = () => {
        const name = prompt("Enter new folder name:");
        if (name && !folders.includes(name)) {
            setFolders(prev => [...prev, name]);
            setActiveFolder(name);
        }
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

    const filteredNotes = notes.filter(n => {
        const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            n.content.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFolder = activeFolder === 'All' || (n.folder || 'Uncategorized') === activeFolder;
        return matchesSearch && matchesFolder;
    });

    return (
        <div className="h-full flex animate-fade-in bg-transparent overflow-hidden relative">

            {/* --- Left Sidebar (Folders & Note List) --- */}
            <div className={`${showList ? 'w-64 border-r border-white/5' : 'w-0 opacity-0'} flex flex-col transition-all duration-300 bg-slate-950/20 backdrop-blur-sm relative shrink-0`}>

                {/* Header Actions */}
                <div className="p-3 border-b border-white/5 flex items-center justify-between shrink-0">
                    <button
                        onClick={() => setIsFoldersExpanded(!isFoldersExpanded)}
                        className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-200"
                    >
                        {isFoldersExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        FOLDERS
                    </button>
                    <button onClick={handleCreateFolder} className="text-slate-500 hover:text-violet-400" title="New Folder">
                        <FolderPlus size={14} />
                    </button>
                </div>

                {/* Folder List */}
                {isFoldersExpanded && (
                    <div className="px-2 py-2 border-b border-white/5 overflow-y-auto max-h-[200px] shrink-0 custom-scrollbar">
                        <div
                            onClick={() => setActiveFolder('All')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer mb-1 ${activeFolder === 'All' ? 'bg-violet-600/20 text-violet-300' : 'text-slate-400 hover:bg-white/5'}`}
                        >
                            <Folder size={14} />
                            <span>All Notes</span>
                            <span className="ml-auto opacity-50">{notes.length}</span>
                        </div>
                        {folders.map(folder => (
                            <div
                                key={folder}
                                onClick={() => setActiveFolder(folder)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer mb-1 ${activeFolder === folder ? 'bg-violet-600/20 text-violet-300' : 'text-slate-400 hover:bg-white/5'}`}
                            >
                                <Folder size={14} />
                                <span className="truncate flex-1">{folder}</span>
                                <span className="opacity-50">{notes.filter(n => (n.folder || 'Uncategorized') === folder).length}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Search & Actions */}
                <div className="p-3 shrink-0">
                    <div className="flex items-center gap-2 mb-2">
                        <h2 className="font-bold text-slate-200 text-sm flex-1">
                            {activeFolder === 'All' ? 'All Notes' : activeFolder}
                        </h2>
                        <button onClick={handleCreate} className="p-1.5 bg-violet-600/20 text-violet-300 border border-violet-500/30 rounded-lg hover:bg-violet-600/40 transition">
                            <Plus size={14} />
                        </button>
                    </div>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-slate-900/50 border border-white/10 rounded-lg text-xs text-slate-300 focus:ring-1 focus:ring-violet-500/50 outline-none placeholder:text-slate-600"
                        />
                    </div>
                </div>

                {/* Note List */}
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
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-slate-600 group-hover:text-slate-500">
                                    {new Date(note.updatedAt).toLocaleDateString()}
                                </span>
                                {note.folder && note.folder !== 'Uncategorized' && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-slate-500 border border-white/5 truncate max-w-[80px]">
                                        {note.folder}
                                    </span>
                                )}
                            </div>
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
                            No notes found
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
                            <>
                                <input
                                    value={activeNote.title}
                                    onChange={(e) => handleUpdate({ title: e.target.value })}
                                    className="text-sm font-bold text-slate-200 bg-transparent border-none outline-none focus:ring-0 placeholder:text-slate-600 flex-1 min-w-0"
                                    placeholder="Note Title"
                                />
                                {/* Folder Selector */}
                                <select
                                    value={activeNote.folder || 'Uncategorized'}
                                    onChange={(e) => handleUpdate({ folder: e.target.value })}
                                    className="hidden md:block bg-slate-900 border border-white/10 text-xs text-slate-400 rounded px-2 py-1 outline-none focus:border-violet-500"
                                >
                                    {folders.map(f => (
                                        <option key={f} value={f}>{f}</option>
                                    ))}
                                </select>
                            </>
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

                            {/* View Mode Switcher */}
                            <div className="flex bg-white/5 rounded-lg p-0.5 ml-2">
                                <button
                                    onClick={() => setViewMode('edit')}
                                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${viewMode === 'edit' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                                    title="Edit Mode"
                                >
                                    EDIT
                                </button>
                                <button
                                    onClick={() => setViewMode('split')}
                                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${viewMode === 'split' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                                    title="Split Mode"
                                >
                                    SPLIT
                                </button>
                                <button
                                    onClick={() => setViewMode('read')}
                                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${viewMode === 'read' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                                    title="Read Mode"
                                >
                                    READ
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Content Area */}
                {activeNote ? (
                    <div className="flex-1 flex overflow-hidden">
                        {/* Editor (Shown in Edit & Split) */}
                        {(viewMode === 'edit' || viewMode === 'split') && (
                            <div className={`flex-1 flex flex-col ${viewMode === 'split' ? 'border-r border-white/5' : ''}`}>
                                <textarea
                                    value={activeNote.content}
                                    onChange={(e) => handleUpdate({ content: e.target.value })}
                                    className="flex-1 w-full p-6 resize-none outline-none border-none font-mono text-slate-300 text-sm leading-7 selection:bg-violet-500/30 bg-transparent placeholder:text-slate-700"
                                    placeholder="# Start writing..."
                                />
                            </div>
                        )}

                        {/* Preview (Shown in Split & Read) */}
                        {(viewMode === 'read' || viewMode === 'split') && (
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
                            <Folder size={32} className="opacity-50" />
                        </div>
                        <p className="text-sm">Select a folder or create a new note</p>
                    </div>
                )}
            </div>

        </div>
    );
};

export default NotesView;
