import React, { useState, useEffect, useRef, useMemo } from 'react';
import SharedMarkdown from '../components/SharedMarkdown';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import {
    NotebookPen, Plus, Search, Trash2, Folder, FolderPlus,
    PanelLeft, FileDown, ChevronRight, ChevronDown, Bookmark,
    ArrowLeft, MoreVertical, LayoutGrid, ListFilter, FileText, Check, Tag, CalendarDays
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { saveHighlight, getFolders, saveFolder } from '../services/db';
import { getTodayNotesFolderName } from '../utils/noteFolders';
import toast from 'react-hot-toast';

const NotesView = ({ params }) => {
    const { loadUserNotes, saveToNotes, removeNoteItem } = useApp();
    const [notes, setNotes] = useState([]);
    const [activeNote, setActiveNote] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [viewMode, setViewMode] = useState('split'); // 'edit', 'split', 'read'
    const [showList, setShowList] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    // Responsive and Navigation State
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [viewingMobileId, setViewingMobileId] = useState(null); // Track which note is open in mobile
    const [showMobileListOptions, setShowMobileListOptions] = useState(false);

    // Tags State
    const [topicTags, setTopicTags] = useState([]);
    const [recentDateTags, setRecentDateTags] = useState([]);
    const [activeTag, setActiveTag] = useState('All');
    const [showTagsMobile, setShowTagsMobile] = useState(false);

    // Debounce Save Timer
    const saveTimerRef = useRef(null);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // ensureNotebookFolder removed as we rely on native tagging

    useEffect(() => {
        refreshNotes();
    }, []);

    // Handle deep linking
    useEffect(() => {
        if (params?.id && notes.length > 0) {
            const targetNote = notes.find(n => n.id === params.id);
            if (targetNote && targetNote.id !== activeNote?.id) {
                setActiveNote(targetNote);
                if (isMobile) setViewingMobileId(targetNote.id);
                if (targetNote.tags && targetNote.tags.length > 0) setActiveTag(targetNote.tags[0]);
                setViewMode('read');
            }
        }
    }, [params, notes, isMobile]);

    const refreshNotes = async () => {
        const noteData = await loadUserNotes();
        const datePattern = /^\d{4}\/\d{1,2}\/\d{1,2}$/;
        
        const tagsSet = new Set();
        noteData.forEach(n => {
            if (!Array.isArray(n.tags)) n.tags = [];
            // Migration for old notes with only 'folder'
            if (n.folder && n.folder !== 'Uncategorized' && !n.tags.includes(n.folder)) {
                n.tags.push(n.folder);
            }
            n.tags.forEach(t => tagsSet.add(t));
        });

        const allTags = Array.from(tagsSet);
        const dates = allTags.filter(t => datePattern.test(t)).sort((a,b) => new Date(b) - new Date(a));
        const topics = allTags.filter(t => !datePattern.test(t)).sort((a,b) => a.localeCompare(b, 'zh-Hans-CN'));

        setRecentDateTags(dates.slice(0, 3));
        setTopicTags(topics);
        setNotes(noteData);
    };

    const handleCreate = async () => {
        const defaultTag = activeTag !== 'All' ? activeTag : getTodayNotesFolderName();
        const newNote = {
            id: Date.now().toString(),
            title: "Untitled Note",
            content: "# New Note\nStart writing here...",
            tags: activeTag !== 'All' ? [activeTag] : [getTodayNotesFolderName()],
            updatedAt: Date.now()
        };
        await saveToNotes(newNote);
        await refreshNotes();
        setActiveNote(newNote);
        if (isMobile) setViewingMobileId(newNote.id);
        setActiveTag(defaultTag);
        setViewMode('edit');
    };

    const handleDelete = async (e, id) => {
        if (e) e.stopPropagation();
        if (confirm("Delete this note?")) {
            await removeNoteItem(id);
            if (activeNote?.id === id) setActiveNote(null);
            if (viewingMobileId === id) setViewingMobileId(null);
            await refreshNotes();
        }
    };

    const handleUpdate = (updatedFields) => {
        if (!activeNote) return;
        const updated = { ...activeNote, ...updatedFields, updatedAt: Date.now() };
        setActiveNote(updated);

        // Update local list UI immediately
        setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));

        // Debounced Auto-save
        setIsSaving(true);
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            await saveToNotes(updated);
            setIsSaving(false);
        }, 1000);
    };

    const handleCreateFolder = async () => {
        const name = prompt("Enter new folder name:");
        if (name && !folders.includes(name)) {
            await saveFolder({
                id: crypto.randomUUID(),
                name: name,
                type: 'notebook'
            });
            await refreshNotes();
            setActiveFolder(name);
        }
    };

    const filteredNotes = notes.filter(n => {
        const titleStr = (n.title || '').toLowerCase();
        const contentStr = (n.content || '').toLowerCase();
        const tagsCombo = (n.tags || []).join(' ').toLowerCase();
        const query = searchQuery.toLowerCase();
        
        const matchesSearch = titleStr.includes(query) || contentStr.includes(query) || tagsCombo.includes(query);
        const matchesTag = activeTag === 'All' || (n.tags || []).includes(activeTag);
        return matchesSearch && matchesTag;
    });

    const activeNoteForMobile = useMemo(() => {
        if (!viewingMobileId) return null;
        return notes.find(n => n.id === viewingMobileId) || activeNote;
    }, [viewingMobileId, notes, activeNote]);

    // --- RENDER HELPERS ---

    const renderNoteCard = (note) => (
        <div
            key={note.id}
            onClick={() => {
                setActiveNote(note);
                if (isMobile) setViewingMobileId(note.id);
            }}
            className={`p-5 rounded-[2rem] cursor-pointer transition-all active:scale-[0.98] relative border ${
                activeNote?.id === note.id && !isMobile
                ? 'bg-phy-accentGlass border-phy-accent/40 shadow-md ring-1 ring-phy-accent/20'
                : 'bg-white/70 dark:bg-white/5 border-phy-border/40 shadow-sm hover:border-phy-accent/30'
            }`}
        >
            <h4 className="font-bold text-lg text-phy-text mb-1 truncate leading-tight">
                {note.title || "Untitled Note"}
            </h4>
            <div className="flex items-center gap-2 text-phy-muted text-xs">
                <span className="whitespace-nowrap">{new Date(note.updatedAt).toLocaleDateString()}</span>
                <span className="opacity-40">|</span>
                <p className="truncate opacity-70">
                    {(note.content || '').replace(/[#*`]/g, '').substring(0, 40).trim() || 'No additional content'}
                </p>
            </div>
            <div className="flex items-center gap-1 absolute right-5 top-5">
                {(note.tags || []).slice(0, 2).map((t, idx) => (
                    <div key={idx} className="bg-phy-glass px-2 py-0.5 rounded-full text-[10px] text-phy-muted border border-phy-border shadow-sm max-w-[80px] truncate">
                        {t}
                    </div>
                ))}
                {(note.tags?.length > 2) && <div className="text-phy-muted text-[10px]">...</div>}
            </div>
        </div>
    );

    const handleExport = (note = activeNote) => {
        if (!note) return;
        const blob = new Blob([note.content], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${note.title || "Note"}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // --- MOBILE VIEW ---
    if (isMobile && viewingMobileId) {
        const note = activeNoteForMobile;
        return (
            <div className="h-full flex flex-col bg-phy-bg overscroll-none animate-in slide-in-from-right duration-300">
                {/* Mobile Navbar */}
                <div className="px-4 h-16 flex items-center justify-between border-b border-phy-border bg-white/40 dark:bg-black/20 backdrop-blur-md sticky top-0 z-50">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setViewingMobileId(null)} className="p-2 -ml-2 rounded-full hover:bg-phy-glass">
                            <ArrowLeft size={20} />
                        </button>
                        <input
                            value={note?.title}
                            onChange={(e) => handleUpdate({ title: e.target.value })}
                            className="text-base font-bold text-phy-text bg-transparent border-none outline-none focus:ring-0 w-32"
                            placeholder="Title"
                        />
                    </div>
                    <div className="flex items-center gap-1">
                         <button 
                            onClick={async () => {
                                await saveHighlight({
                                    type: 'note',
                                    sourceId: note.id,
                                    content: note.title,
                                    context: note.content?.substring(0, 100) || '',
                                    date: new Date().toISOString().split('T')[0]
                                });
                                toast.success('Added to Daily Summary');
                            }}
                            className="p-2 text-amber-500 rounded-full"
                        >
                            <Bookmark size={20} />
                        </button>
                        <button onClick={() => setShowMobileListOptions(!showMobileListOptions)} className="p-2 text-phy-muted rounded-full">
                            <MoreVertical size={20} />
                        </button>
                    </div>
                </div>

                {/* Mobile Tab Switcher */}
                <div className="flex p-2 gap-1 bg-phy-glass/40 mx-4 mt-4 rounded-2xl border border-phy-border/30">
                    <button 
                        onClick={() => setViewMode('edit')}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all ${viewMode === 'edit' ? 'bg-phy-accent text-white shadow-md' : 'text-phy-muted'}`}
                    >
                        Edit
                    </button>
                    <button 
                        onClick={() => setViewMode('read')}
                        className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all ${viewMode === 'read' ? 'bg-phy-accent text-white shadow-md' : 'text-phy-muted'}`}
                    >
                        Preview
                    </button>
                </div>

                {/* Mobile Content Area */}
                <div className="flex-1 overflow-y-auto px-4 pt-4 pb-32 overscroll-contain">
                    {viewMode === 'edit' ? (
                        <textarea
                            value={note?.content}
                            onChange={(e) => handleUpdate({ content: e.target.value })}
                            className="w-full h-full min-h-[400px] resize-none outline-none border-none font-phy text-phy-text text-base leading-relaxed bg-transparent selection:bg-phy-accent/30"
                            placeholder="# Start writing..."
                        />
                    ) : (
                        <div className="animate-in fade-in zoom-in-95">
                            <SharedMarkdown
                                remarkPlugins={[remarkBreaks]}
                                rehypePlugins={[rehypeRaw, rehypeHighlight]}
                                content={note?.content.replace(/==([^=]+)==/g, '<mark class="bg-phy-accent text-white px-1 rounded font-bold shadow-sm">$1</mark>')}
                            />
                        </div>
                    )}
                </div>

                {/* Mobile More Options Backdrop */}
                {showMobileListOptions && (
                    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowMobileListOptions(false)}>
                        <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl p-6 animate-in slide-in-from-bottom flex flex-col gap-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="w-12 h-1.5 bg-phy-muted/30 rounded-full mx-auto mb-2" />
                            <h3 className="text-sm font-bold text-phy-muted uppercase tracking-widest px-2">Settings</h3>
                            <div className="grid grid-cols-1 gap-2">
                                <button onClick={() => { handleExport(note); setShowMobileListOptions(false); }} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-phy-glass transition-colors">
                                    <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600"><FileDown size={20} /></div>
                                    <span className="font-bold">Export Markdown</span>
                                </button>
                                <div className="p-4 rounded-2xl bg-phy-glass flex flex-col gap-2">
                                    <span className="text-[10px] font-bold text-phy-muted px-1">TAGS (COMMA SEPARATED)</span>
                                    <input 
                                        value={(note?.tags || []).join(', ')}
                                        onChange={(e) => handleUpdate({ tags: e.target.value.split(',').map(t=>t.trim()).filter(Boolean) })}
                                        className="w-full bg-white dark:bg-black/20 border border-phy-border rounded-xl p-2 outline-none text-sm text-phy-text"
                                        placeholder="Tag 1, Tag 2"
                                    />
                                </div>
                                <div className="h-px bg-phy-border my-2" />
                                <button onClick={() => { if(confirm('Delete note?')) { handleDelete(null, note.id); setShowMobileListOptions(false); } }} className="flex items-center gap-4 p-4 rounded-2xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors">
                                    <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-600"><Trash2 size={20} /></div>
                                    <span className="font-bold">Delete Note</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Auto-save indicator */}
                {isSaving && (
                    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-phy-accent text-white rounded-full text-xs font-bold shadow-xl animate-bounce z-[110]">
                        Saving...
                    </div>
                )}
            </div>
        );
    }

    if (isMobile) {
        return (
            <div className="h-full flex flex-col bg-phy-bg px-5 pt-10 pb-20 overscroll-none animate-in fade-in duration-500">
                {/* Mobile Header */}
                <div className="flex items-center justify-between mb-2">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2" onClick={() => setShowTagsMobile(!showTagsMobile)}>
                             <h1 className="text-4xl font-bold flex items-center gap-2">
                                {activeTag === 'All' ? '全部笔记' : activeTag} <ChevronDown size={28} className="text-phy-muted/40" />
                             </h1>
                        </div>
                        <span className="text-phy-muted ml-1 mt-1 font-medium">{filteredNotes.length} 条笔记</span>
                    </div>
                    <div className="flex gap-2">
                        <button className="p-3 bg-white/50 dark:bg-white/10 rounded-2xl border border-white/20 shadow-sm text-phy-muted">
                            <LayoutGrid size={22} />
                        </button>
                    </div>
                </div>

                {/* Mobile Search */}
                <div className="relative my-6 group">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-phy-muted opacity-50 transition-opacity group-focus-within:opacity-100" size={20} />
                    <input 
                        placeholder="搜索笔记..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-14 pr-6 py-5 bg-white/40 dark:bg-white/5 border border-phy-border/30 rounded-[2rem] outline-none text-base placeholder:text-phy-muted focus:ring-4 focus:ring-phy-accent/10 focus:border-phy-accent/40 shadow-sm transition-all"
                    />
                </div>

                {/* Mobile Card List */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-32 custom-scrollbar">
                    {filteredNotes.map(renderNoteCard)}
                    {filteredNotes.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-phy-muted gap-4 opacity-50">
                             <FileText size={64} strokeWidth={1.5} />
                             <p className="font-medium">No records found</p>
                        </div>
                    )}
                </div>

                {/* Mobile FAB */}
                <button
                    onClick={handleCreate}
                    className="fixed bottom-24 right-6 w-16 h-16 bg-phy-accent text-white rounded-full shadow-[0_12px_40px_rgba(var(--phy-accent-rgb),0.4)] flex items-center justify-center transform active:scale-90 transition-transform z-[90]"
                >
                    <Plus size={32} />
                </button>

                {/* Mobile Tag Selection Overlay */}
                {showTagsMobile && (
                    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowTagsMobile(false)}>
                        <div className="w-full max-w-lg bg-phy-glassHeavy backdrop-blur-3xl rounded-t-[2.5rem] p-6 pb-12 animate-in slide-in-from-bottom flex flex-col gap-4 shadow-[0_-20px_50px_rgba(0,0,0,0.3)] border-t border-phy-border/30" onClick={e => e.stopPropagation()}>
                            <div className="w-12 h-1.5 bg-phy-muted/30 rounded-full mx-auto mb-2" />
                            <h3 className="text-xs font-bold text-phy-muted uppercase tracking-widest px-2 opacity-60">分类筛选</h3>
                            <div className="grid grid-cols-1 gap-1.5 overflow-y-auto max-h-[50vh] custom-scrollbar pr-1">
                                <button 
                                    onClick={() => { setActiveTag('All'); setShowTagsMobile(false); }}
                                    className={`flex items-center justify-between p-4 rounded-2xl transition-all active:scale-95 ${activeTag === 'All' ? 'bg-phy-accentGlass text-phy-accent border border-phy-accent/20 shadow-inner' : 'hover:bg-phy-glass border border-transparent'}`}
                                >
                                    <div className="flex flex-row gap-3 items-center">
                                       <LayoutGrid size={20} />
                                       <span className="font-bold">全部笔记</span>
                                    </div>
                                    {activeTag === 'All' && <Check size={20} className="text-phy-accent" />}
                                </button>

                                {topicTags.length > 0 && <div className="text-[10px] font-bold text-phy-muted px-2 mt-4 mb-2 tracking-widest opacity-40">THEMES / TOPICS</div>}
                                {topicTags.map(f => (
                                    <button 
                                        key={f}
                                        onClick={() => { setActiveTag(f); setShowTagsMobile(false); }}
                                        className={`flex items-center justify-between p-4 rounded-2xl transition-all active:scale-95 ${activeTag === f ? 'bg-phy-accentGlass text-phy-accent border border-phy-accent/20 shadow-inner' : 'hover:bg-phy-glass border border-transparent'}`}
                                    >
                                        <div className="flex flex-row gap-3 items-center">
                                            <Tag size={20} />
                                            <span className="font-bold">{f}</span>
                                        </div>
                                        {activeTag === f && <Check size={20} className="text-phy-accent" />}
                                    </button>
                                ))}

                                {recentDateTags.length > 0 && <div className="text-[10px] font-bold text-phy-muted px-2 mt-4 mb-2 tracking-widest opacity-40">TEMPORAL</div>}
                                {recentDateTags.map(f => (
                                    <button 
                                        key={f}
                                        onClick={() => { setActiveTag(f); setShowTagsMobile(false); }}
                                        className={`flex items-center justify-between p-4 rounded-2xl transition-all active:scale-95 ${activeTag === f ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-inner' : 'hover:bg-phy-glass border border-transparent'}`}
                                    >
                                        <div className="flex flex-row gap-3 items-center">
                                            <CalendarDays size={20} />
                                            <span className="font-bold">{f}</span>
                                        </div>
                                        {activeTag === f && <Check size={20} className="text-emerald-500" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // --- DESKTOP VIEW (Refined) ---
    return (
        <div className="h-full min-h-0 flex animate-in fade-in bg-transparent overflow-hidden overscroll-none relative">
            
            {!showList && (
                <button 
                  onClick={() => setShowList(true)}
                  className="absolute top-4 left-4 z-50 p-2 glass-panel rounded-lg text-phy-muted hover:text-phy-accent transition-all"
                >
                    <PanelLeft size={20} />
                </button>
            )}

            <div className={`${showList ? 'w-80 border-r border-phy-border' : 'w-0 opacity-0'} h-full flex flex-col transition-all duration-500 glass-sidebar z-40 relative shrink-0 overflow-hidden`}>
                <div className="p-5 flex items-center justify-between">
                     <h2 className="text-xl font-bold text-phy-text">Notebook</h2>
                     <div className="flex gap-2">
                        <button onClick={handleCreate} className="p-2 bg-phy-accent text-white rounded-lg shadow-lg hover:brightness-110 transition-all"><Plus size={18} /></button>
                     </div>
                </div>

                <div className="px-3 pb-4 flex flex-col gap-1 overflow-y-auto max-h-[350px] custom-scrollbar">
                    <div className="text-[10px] font-bold text-phy-muted px-4 mb-2 tracking-widest uppercase">Classification</div>
                    <div 
                        onClick={() => setActiveTag('All')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${activeTag === 'All' ? 'bg-phy-accentGlass text-phy-accent border border-phy-accent/20' : 'text-phy-muted hover:bg-phy-glassHover border border-transparent'}`}
                    >
                        <LayoutGrid size={14} className={activeTag === 'All' ? 'text-phy-accent' : 'text-phy-muted'} />
                        <span className="flex-1">全部笔记</span>
                        <span className="opacity-40 text-[10px] font-medium">{notes.length}</span>
                    </div>

                    {topicTags.map(tag => (
                        <div 
                            key={tag}
                            onClick={() => setActiveTag(tag)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${activeTag === tag ? 'bg-phy-accentGlass text-phy-accent border border-phy-accent/20' : 'text-phy-muted hover:bg-phy-glassHover border border-transparent'}`}
                        >
                            <Tag size={14} className={activeTag === tag ? 'text-phy-accent' : 'text-phy-muted'} />
                            <span className="flex-1 truncate">{tag}</span>
                            <span className="opacity-40 text-[10px] font-medium">{notes.filter(n => (n.tags || []).includes(tag)).length}</span>
                        </div>
                    ))}

                    {recentDateTags.length > 0 && (
                        <>
                            <div className="text-[10px] font-bold text-phy-muted px-4 mt-4 mb-2 tracking-widest uppercase">Recent Dates</div>
                            {recentDateTags.map(tag => (
                                <div 
                                    key={tag}
                                    onClick={() => setActiveTag(tag)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${activeTag === tag ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'text-phy-muted hover:bg-phy-glassHover border border-transparent'}`}
                                >
                                    <CalendarDays size={14} className={activeTag === tag ? 'text-emerald-500' : 'text-phy-muted'} />
                                    <span className="flex-1 truncate">{tag}</span>
                                    <span className="opacity-40 text-[10px] font-medium">{notes.filter(n => (n.tags || []).includes(tag)).length}</span>
                                </div>
                            ))}
                        </>
                    )}
                </div>

                <div className="px-5 mb-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-phy-muted" size={14} />
                        <input 
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full bg-phy-bg/50 border border-phy-border/40 rounded-xl pl-9 pr-4 py-2 text-xs focus:ring-2 focus:ring-phy-accent/20 outline-none"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 space-y-2 custom-scrollbar pb-10">
                    {filteredNotes.map(note => (
                        <div
                            key={note.id}
                            onClick={() => setActiveNote(note)}
                            className={`p-4 rounded-2xl cursor-pointer transition-all border relative group ${activeNote?.id === note.id ? 'bg-phy-accentGlass border-phy-accent/30 shadow-sm' : 'hover:bg-phy-glass border-transparent'}`}
                        >
                            <h4 className={`text-sm font-bold truncate ${activeNote?.id === note.id ? 'text-phy-text' : 'text-phy-text/70'}`}>{note.title || "Untitled"}</h4>
                            <div className="flex items-center justify-between mt-2">
                                <span className="text-[10px] text-phy-muted">{new Date(note.updatedAt).toLocaleDateString()}</span>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => { e.stopPropagation(); handleExport(note); }} className="p-1 hover:text-blue-500"><FileDown size={12} /></button>
                                    <button onClick={(e) => handleDelete(e, note.id)} className="p-1 hover:text-rose-500"><Trash2 size={12} /></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex-1 flex flex-col bg-transparent overflow-hidden">
                {activeNote ? (
                    <>
                        <div className="h-14 border-b border-phy-border flex items-center justify-between px-6 bg-white/10 backdrop-blur-sm shrink-0">
                            <div className="flex items-center gap-4 flex-1">
                                <button onClick={() => setShowList(!showList)} className="p-2 text-phy-muted hover:text-phy-accent transition-colors"><PanelLeft size={18} /></button>
                                <input 
                                    value={activeNote.title}
                                    onChange={e => handleUpdate({ title: e.target.value })}
                                    className="bg-transparent border-none outline-none font-bold text-lg text-phy-text flex-1"
                                    placeholder="Untitled"
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <input 
                                    value={(activeNote.tags || []).join(', ')}
                                    onChange={e => handleUpdate({ tags: e.target.value.split(',').map(t=>t.trim()).filter(Boolean) })}
                                    className="bg-phy-bg border border-phy-border/60 rounded-lg outline-none font-bold text-[11px] text-phy-muted px-3 py-1.5 focus:ring-1 focus:ring-phy-accent/40 w-[180px] transition-all"
                                    placeholder="Add tags (comma separated)..."
                                />
                                <span className={`text-[10px] font-bold text-phy-accent transition-opacity ${isSaving ? 'opacity-100' : 'opacity-0'}`}>AUTOSAVING...</span>
                                <div className="w-px h-4 bg-phy-border mx-1" />
                                <div className="flex bg-phy-glass p-0.5 rounded-lg border border-phy-border">
                                    {['edit', 'split', 'read'].map(m => (
                                        <button 
                                            key={m} 
                                            onClick={() => setViewMode(m)}
                                            className={`px-3 py-1 text-[10px] uppercase font-black rounded-md transition-all ${viewMode === m ? 'bg-phy-accent text-white shadow-sm' : 'text-phy-muted hover:text-phy-text'}`}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 flex min-h-0 overflow-hidden">
                            {(viewMode === 'edit' || viewMode === 'split') && (
                                <div className={`flex-1 flex flex-col overflow-hidden ${viewMode === 'split' ? 'border-r border-phy-border' : ''}`}>
                                    <textarea 
                                        value={activeNote.content}
                                        onChange={e => handleUpdate({ content: e.target.value })}
                                        className="w-full h-full p-10 resize-none outline-none border-none font-mono text-base leading-loose bg-transparent selection:bg-phy-accent/20 custom-scrollbar"
                                    />
                                </div>
                            )}
                            {(viewMode === 'read' || viewMode === 'split') && (
                                <div className="flex-1 p-10 overflow-y-auto bg-phy-bg/20 custom-scrollbar overscroll-contain">
                                    <div className="max-w-4xl mx-auto animate-in fade-in zoom-in-95">
                                        <SharedMarkdown
                                            remarkPlugins={[remarkBreaks]}
                                            rehypePlugins={[rehypeRaw, rehypeHighlight]}
                                            content={activeNote.content.replace(/==([^=]+)==/g, '<mark class="bg-phy-accent text-white px-1 rounded font-bold shadow-sm">$1</mark>')}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-phy-muted animate-in fade-in duration-700">
                        <div className="w-32 h-32 bg-phy-glass rounded-[2.5rem] flex items-center justify-center mb-6 shadow-pill border border-phy-border/50">
                            <NotebookPen size={64} className="opacity-20" />
                        </div>
                        <h3 className="text-xl font-bold opacity-30">Select a note to begin</h3>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotesView;

