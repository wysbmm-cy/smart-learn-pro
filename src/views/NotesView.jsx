import React, { useState, useEffect, useRef } from 'react';
import SharedMarkdown from '../components/SharedMarkdown';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import {
    NotebookPen, Plus, Search, Trash2, Save, Folder, FolderPlus,
    PanelLeft, Eye, EyeOff, FileText, MoreVertical, FileDown, ChevronRight, ChevronDown, Bookmark
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { saveHighlight, getFolders, saveFolder } from '../services/db';

const NotesView = ({ params }) => {
    const { loadUserNotes, saveToNotes, removeNoteItem } = useApp();
    const [notes, setNotes] = useState([]);
    const [activeNote, setActiveNote] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState('split'); // 'edit', 'split', 'read'
    const [showList, setShowList] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Folder State
    const [folders, setFolders] = useState(['Uncategorized']);
    const [activeFolder, setActiveFolder] = useState('All');
    const [isFoldersExpanded, setIsFoldersExpanded] = useState(true);

    // Debounce Save Timer
    const saveTimerRef = useRef(null);

    useEffect(() => {
        refreshNotes();
    }, []);

    // Handle deep linking from Agent
    useEffect(() => {
        if (params?.id && notes.length > 0) {
            const targetNote = notes.find(n => n.id === params.id);
            if (targetNote && targetNote.id !== activeNote?.id) {
                setActiveNote(targetNote);
                if (targetNote.folder) setActiveFolder(targetNote.folder);
                setViewMode('read');
            }
        }
    }, [params, notes]);

    const refreshNotes = async () => {
        const [noteData, folderData] = await Promise.all([
            loadUserNotes(),
            getFolders()
        ]);
        setNotes(noteData);

        // Extract unique folders from both Notes (legacy string) and DB (objects)
        const uniqueFolders = new Set(['Uncategorized']);

        // 1. Add folders from DB
        folderData.forEach(f => uniqueFolders.add(f.name));

        // 2. Add ad-hoc folders from existing notes (in case they differ)
        noteData.forEach(n => {
            if (n.folder) uniqueFolders.add(n.folder);
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

    const handleCreateFolder = async () => {
        const name = prompt("Enter new folder name:");
        if (name && !folders.includes(name)) {
            // Persist folder
            await saveFolder({
                id: crypto.randomUUID(),
                name: name,
                type: 'notebook'
            });
            await refreshNotes();
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
        <div className="h-full flex animate-in fade-in bg-transparent overflow-hidden overscroll-none relative">

            {/* --- Left Sidebar (Folders & Note List) --- */}
            <div className={`${showList ? 'w-64 border-r border-phy-border' : 'w-0 opacity-0'} flex flex-col transition-all duration-300 glass-sidebar relative shrink-0 overflow-hidden overscroll-contain`}>

                {/* Header Actions */}
                <div className="p-3 border-b border-phy-border flex items-center justify-between shrink-0">
                    <button
                        onClick={() => setIsFoldersExpanded(!isFoldersExpanded)}
                        className="flex items-center gap-1 text-xs font-bold text-phy-muted hover:text-phy-text"
                    >
                        {isFoldersExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        文件夹
                    </button>
                    <button onClick={handleCreateFolder} className="text-phy-muted hover:text-phy-accent transition-colors" title="New Folder">
                        <FolderPlus size={14} />
                    </button>
                </div>

                {/* Folder List */}
                {isFoldersExpanded && (
                    <div className="px-2 py-2 border-b border-phy-border overflow-y-auto overscroll-contain max-h-[200px] shrink-0 custom-scrollbar">
                        <div
                            onClick={() => setActiveFolder('All')}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer mb-1 transition-colors ${activeFolder === 'All' ? 'bg-phy-accentGlass text-phy-accent' : 'text-phy-muted hover:bg-phy-glassHover'}`}
                        >
                            <Folder size={14} />
                            <span>全部笔记</span>
                            <span className="ml-auto opacity-50">{notes.length}</span>
                        </div>
                        {folders.map(folder => (
                            <div
                                key={folder}
                                onClick={() => setActiveFolder(folder)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs cursor-pointer mb-1 transition-colors ${activeFolder === folder ? 'bg-phy-accentGlass text-phy-accent' : 'text-phy-muted hover:bg-phy-glassHover'}`}
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
                        <h2 className="font-bold text-phy-text text-sm flex-1">
                            {activeFolder === 'All' ? 'All Notes' : activeFolder}
                        </h2>
                        <button onClick={handleCreate} className="p-1.5 bg-phy-accentGlass text-phy-accent border border-phy-accent/30 rounded-lg hover:bg-phy-accent/20 transition-colors">
                            <Plus size={14} />
                        </button>
                    </div>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-2.5 text-phy-muted" />
                        <input
                            type="text"
                            placeholder="搜索笔记..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-phy-bg border border-phy-border rounded-lg text-xs text-phy-text focus:ring-1 focus:ring-phy-accent/50 outline-none placeholder:text-phy-muted/60"
                        />
                    </div>
                </div>

                {/* Note List */}
                <div className="flex-1 overflow-y-auto overscroll-contain p-2 space-y-1 custom-scrollbar">
                    {filteredNotes.map(note => (
                        <div
                            key={note.id}
                            onClick={() => setActiveNote(note)}
                            className={`p-3 rounded-lg cursor-pointer transition-all group relative ${activeNote?.id === note.id
                                ? 'bg-phy-accentGlass border border-phy-accent/30 shadow-sm'
                                : 'hover:bg-phy-glassHover border border-transparent'
                                }`}
                        >
                            <h4 className={`font-medium text-sm truncate ${activeNote?.id === note.id ? 'text-phy-text font-bold' : 'text-phy-text/80 group-hover:text-phy-text'}`}>
                                {note.title || "无标题笔记"}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                                <span className={`text-[10px] ${activeNote?.id === note.id ? 'text-phy-accent' : 'text-phy-muted group-hover:text-phy-muted/80'}`}>
                                    {new Date(note.updatedAt).toLocaleDateString()}
                                </span>
                                {note.folder && note.folder !== 'Uncategorized' && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-phy-glass text-phy-muted border border-phy-border truncate max-w-[80px]">
                                        {note.folder}
                                    </span>
                                )}
                            </div>
                            <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        await saveHighlight({
                                            type: 'note',
                                            sourceId: note.id,
                                            content: note.title,
                                            context: note.content?.substring(0, 100) || '',
                                            date: new Date().toISOString().split('T')[0]
                                        });
                                        alert('已标记到每日总结！');
                                    }}
                                    className="p-1.5 text-amber-500 hover:text-amber-400 bg-phy-bg border border-phy-border rounded-lg shadow-sm"
                                    title="标记到每日总结"
                                >
                                    <Bookmark size={12} />
                                </button>
                                <button
                                    onClick={(e) => handleDelete(e, note.id)}
                                    className="p-1.5 text-rose-500 hover:text-rose-400 bg-phy-bg border border-phy-border rounded-lg shadow-sm"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {filteredNotes.length === 0 && (
                        <div className="text-center py-10 text-phy-muted text-xs">
                            暂无笔记
                        </div>
                    )}
                </div>
            </div>

            {/* --- Main Area (Editor + Preview) --- */}
            <div className="flex-1 flex flex-col min-w-0 bg-transparent overflow-hidden">

                {/* Toolbar */}
                <div className="h-14 border-b border-phy-border flex items-center justify-between px-4 bg-transparent shrink-0">
                    <div className="flex items-center gap-3 w-full">
                        <button
                            onClick={() => setShowList(!showList)}
                            className="p-2 hover:bg-phy-glassHover rounded-lg text-phy-muted hover:text-phy-text shrink-0 cursor-pointer transition-colors"
                            title={showList ? "Hide Sidebar" : "Show Sidebar"}
                        >
                            <PanelLeft size={18} />
                        </button>
                        {activeNote && (
                            <>
                                <input
                                    value={activeNote.title}
                                    onChange={(e) => handleUpdate({ title: e.target.value })}
                                    className="text-sm font-bold text-phy-text bg-transparent border-none outline-none focus:ring-0 placeholder:text-phy-muted/60 flex-1 min-w-0"
                                    placeholder="笔记标题"
                                />
                                {/* Folder Selector */}
                                <select
                                    value={activeNote.folder || 'Uncategorized'}
                                    onChange={(e) => handleUpdate({ folder: e.target.value })}
                                    className="hidden md:block bg-phy-bg border border-phy-border text-xs text-phy-text rounded px-2 py-1 outline-none focus:border-phy-accent"
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
                            <span className={`text-[10px] font-medium transition-opacity ${isSaving ? 'opacity-100 text-phy-accent' : 'opacity-0'}`}>
                                正在保存...
                            </span>
                            <div className="h-4 w-px bg-phy-border mx-2" />
                            <button
                                onClick={handleExport}
                                className="p-1.5 rounded-lg flex items-center gap-2 text-phy-muted hover:text-phy-text hover:bg-phy-glassHover transition-colors"
                                title="Export Markdown"
                            >
                                <FileDown size={16} />
                            </button>

                            {/* View Mode Switcher */}
                            <div className="flex bg-phy-glass rounded-lg p-0.5 ml-2">
                                <button
                                    onClick={() => setViewMode('edit')}
                                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${viewMode === 'edit' ? 'bg-phy-accent text-white shadow-sm' : 'text-phy-muted hover:text-phy-text'}`}
                                    title="Edit Mode"
                                >
                                    编辑
                                </button>
                                <button
                                    onClick={() => setViewMode('split')}
                                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${viewMode === 'split' ? 'bg-phy-accent text-white shadow-sm' : 'text-phy-muted hover:text-phy-text'}`}
                                    title="Split Mode"
                                >
                                    分屏
                                </button>
                                <button
                                    onClick={() => setViewMode('read')}
                                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${viewMode === 'read' ? 'bg-phy-accent text-white shadow-sm' : 'text-phy-muted hover:text-phy-text'}`}
                                    title="Read Mode"
                                >
                                    阅读
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Content Area */}
                {activeNote ? (
                    <div className="flex-1 flex overflow-hidden overscroll-none">
                        {/* Editor (Shown in Edit & Split) */}
                        {(viewMode === 'edit' || viewMode === 'split') && (
                            <div className={`flex-1 flex flex-col overflow-hidden ${viewMode === 'split' ? 'border-r border-phy-border' : ''}`}>
                                <textarea
                                    value={activeNote.content}
                                    onChange={(e) => handleUpdate({ content: e.target.value })}
                                    className="flex-1 w-full p-6 resize-none outline-none border-none font-mono text-phy-text text-sm leading-7 selection:bg-phy-accent/30 bg-transparent placeholder:text-phy-muted/60 overflow-y-auto overscroll-contain"
                                    placeholder="# 开始记录..."
                                />
                            </div>
                        )}

                        {/* Preview (Shown in Split & Read) */}
                        {(viewMode === 'read' || viewMode === 'split') && (
                            <div className="flex-1 overflow-y-auto overscroll-contain bg-phy-bg/30 p-6">
                                <SharedMarkdown
                                    remarkPlugins={[remarkBreaks]}
                                    rehypePlugins={[rehypeRaw, rehypeHighlight]}
                                    content={activeNote.content.replace(/==([^=]+)==/g, '<mark class="bg-phy-accent text-white px-1 rounded font-bold shadow-sm">$1</mark>')}
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-phy-muted">
                        <div className="w-16 h-16 bg-phy-glass rounded-2xl flex items-center justify-center mb-4 border border-phy-border">
                            <Folder size={32} className="opacity-50" />
                        </div>
                        <p className="text-sm">选择文件夹或创建新笔记</p>
                    </div>
                )}
            </div>

        </div>
    );
};

export default NotesView;
