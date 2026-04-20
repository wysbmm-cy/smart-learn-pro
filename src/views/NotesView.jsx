import React, { useState, useEffect, useRef, useMemo } from 'react';
import SharedMarkdown from '../components/SharedMarkdown';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import {
    NotebookPen, Plus, Search, Trash2, Folder, FolderPlus,
    PanelLeft, FileDown, ChevronRight, ChevronDown, Bookmark,
    ArrowLeft, MoreVertical, LayoutGrid, ListFilter, FileText, Check, Tag, CalendarDays, Link2
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { saveHighlight, getFolders, saveFolder } from '../services/db';
import { chatNoteKnowledgeLinking } from '../services/ai';
import { getTodayNotesFolderName } from '../utils/noteFolders';
import { parseWikiLinks, parseWikiLinkLabel, resolveWikiTarget } from '../utils/noteLinks';
import { parseKnowledgeBlocks } from '../utils/knowledgeLinking';
import toast from 'react-hot-toast';

const NOTE_LINK_TOOLBAR_HIDDEN_KEY = 'notes_link_toolbar_hidden';
const NOTE_LINKING_TEMPLATES = {
    material: `@素材[argument]{title=请填写素材标题}
content: 请写可直接插入写作的句子
#usage 适用场景（例如：开头立场 / 让步转折）
#caution 使用注意（例如：避免绝对化表达）`,
    translation: `@翻译例句{scene=general}
EN: 请填写英文句子
CN: 请填写中文对应
#keyword 关键词（可选）`,
    vocab: `@替换词
source: 原词
target: 替换词
reason: 替换理由
example: 例句（可选）`
};

const NotesView = ({ params }) => {
    const { settings, loadUserNotes, saveToNotes, removeNoteItem, syncNoteKnowledgeLinks } = useApp();
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
    const desktopReadPaneRef = useRef(null);
    const mobileReadPaneRef = useRef(null);
    const sectionHighlightTimerRef = useRef(null);
    const [duplicateLinkPicker, setDuplicateLinkPicker] = useState(null);
    const [pendingSectionAnchor, setPendingSectionAnchor] = useState("");
    const [sourceContext, setSourceContext] = useState(null);
    const [pendingScrollRestore, setPendingScrollRestore] = useState(null);
    const [showMobileBacklinks, setShowMobileBacklinks] = useState(false);
    const [showDesktopBacklinks, setShowDesktopBacklinks] = useState(() => {
        try {
            return localStorage.getItem('notes_show_backlinks') === '1';
        } catch {
            return false;
        }
    });
    const [previewContext, setPreviewContext] = useState(null);
    const [previewPosition, setPreviewPosition] = useState(null);
    const [isDraggingPreview, setIsDraggingPreview] = useState(false);
    const previewCardRef = useRef(null);
    const previewDragStateRef = useRef(null);
    const desktopEditorRef = useRef(null);
    const mobileEditorRef = useRef(null);
    const [linkSuggest, setLinkSuggest] = useState({
        open: false,
        query: '',
        items: [],
        start: 0,
        end: 0,
        source: null
    });
    const [linkSuggestIndex, setLinkSuggestIndex] = useState(0);
    const [showKnowledgeAiModal, setShowKnowledgeAiModal] = useState(false);
    const [knowledgeAiMessages, setKnowledgeAiMessages] = useState([]);
    const [knowledgeAiInput, setKnowledgeAiInput] = useState('请先帮我挑出这篇笔记里最值得接入写作/翻译的内容。');
    const [knowledgeSelectedMap, setKnowledgeSelectedMap] = useState({});
    const [isKnowledgeAiRunning, setIsKnowledgeAiRunning] = useState(false);
    const [showLinkToolBar, setShowLinkToolBar] = useState(() => {
        try {
            return localStorage.getItem(NOTE_LINK_TOOLBAR_HIDDEN_KEY) !== '1';
        } catch {
            return true;
        }
    });

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        return () => {
            if (sectionHighlightTimerRef.current) {
                window.clearTimeout(sectionHighlightTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem('notes_show_backlinks', showDesktopBacklinks ? '1' : '0');
        } catch {
            // ignore storage errors
        }
    }, [showDesktopBacklinks]);

    useEffect(() => {
        try {
            localStorage.setItem(NOTE_LINK_TOOLBAR_HIDDEN_KEY, showLinkToolBar ? '0' : '1');
        } catch {
            // ignore storage errors
        }
    }, [showLinkToolBar]);

    useEffect(() => {
        if (!showKnowledgeAiModal) return;
        if (knowledgeAiMessages.length > 0) return;
        setKnowledgeAiMessages([
            {
                id: `assistant-welcome-${Date.now()}`,
                role: 'assistant',
                content: '你可以直接告诉我目标：例如“只要3条写作素材”“只要1条例句+2条替换词”。我会给你候选，你勾选后再接入。',
                candidates: []
            }
        ]);
    }, [showKnowledgeAiModal, knowledgeAiMessages.length]);

    useEffect(() => {
        setLinkSuggest(prev => ({ ...prev, open: false, items: [], source: null }));
        setLinkSuggestIndex(0);
    }, [viewMode, activeNote?.id, viewingMobileId]);

    useEffect(() => {
        if (!previewContext?.note || isMobile) return;

        const handleOutsideMouseDown = (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (previewCardRef.current?.contains(target)) return;
            if (target.closest('[data-note-preview-trigger="1"]')) return;
            setPreviewContext(null);
        };

        const handleEscape = (event) => {
            if (event.key === 'Escape') setPreviewContext(null);
        };

        document.addEventListener('mousedown', handleOutsideMouseDown);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleOutsideMouseDown);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [previewContext, isMobile]);

    useEffect(() => {
        if (!previewContext?.note || isMobile) {
            setPreviewPosition(null);
            setIsDraggingPreview(false);
            previewDragStateRef.current = null;
            return;
        }
        setPreviewPosition(getDesktopPreviewLayout(previewContext.anchorRect));
    }, [previewContext, isMobile]);

    useEffect(() => {
        if (!isDraggingPreview) return;

        const handleMouseMove = (event) => {
            const drag = previewDragStateRef.current;
            if (!drag) return;
            const margin = 12;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const width = drag.width;
            const height = drag.height;

            let nextLeft = event.clientX - drag.offsetX;
            let nextTop = event.clientY - drag.offsetY;
            const maxLeft = Math.max(margin, viewportWidth - width - margin);
            const maxTop = Math.max(margin, viewportHeight - height - margin);

            nextLeft = Math.min(Math.max(nextLeft, margin), maxLeft);
            nextTop = Math.min(Math.max(nextTop, margin), maxTop);

            setPreviewPosition(prev => ({
                left: nextLeft,
                top: nextTop,
                width: prev?.width || width,
                maxHeight: prev?.maxHeight || height
            }));
        };

        const handleMouseUp = () => {
            setIsDraggingPreview(false);
            previewDragStateRef.current = null;
        };

        document.body.style.cursor = 'move';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingPreview]);

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

    const getEditingNote = () => (isMobile ? activeNoteForMobile : activeNote);

    const handleManualKnowledgeSync = async (noteInput = null) => {
        const note = noteInput || getEditingNote();
        if (!note?.id) {
            toast.error('请先打开一篇笔记');
            return;
        }
        try {
            await syncNoteKnowledgeLinks(note);
            toast.success('已手动同步到写作/翻译关联池');
        } catch (error) {
            console.error('manual knowledge sync failed', error);
            toast.error(`手动同步失败: ${error.message}`);
        }
    };

    const getCandidateKey = (messageId, candidateId) => `${String(messageId)}::${String(candidateId)}`;

    const getKnowledgeCandidateTag = (candidate) => {
        const type = String(candidate?.type || '').toLowerCase();
        if (type === 'translation' || type === 'examples') return '翻译例句';
        if (type === 'vocab' || type === 'replace') return '替换词';
        return '写作素材';
    };

    const normalizeKnowledgeCandidate = (candidate, noteId, fallbackIndex = 0) => {
        const directive = String(candidate?.directive || '').trim();
        const parsed = parseKnowledgeBlocks(directive, noteId);
        const firstBlock = parsed?.[0] || null;
        const directiveType = String(firstBlock?.meta?.directive || candidate?.type || '').toLowerCase();
        const type =
            directiveType === 'translation'
                ? 'translation'
                : directiveType === 'vocab'
                    ? 'vocab'
                    : 'material';

        return {
            id: String(candidate?.id || `candidate-${Date.now()}-${fallbackIndex}`),
            type,
            title: String(candidate?.title || '').trim() || `${getKnowledgeCandidateTag({ type })} ${fallbackIndex + 1}`,
            reason: String(candidate?.reason || '').trim(),
            directive,
            previewText: String(firstBlock?.text || directive).trim(),
            sourceSection: String(firstBlock?.section || '').trim()
        };
    };

    const getSelectedKnowledgeCandidates = () => {
        const selected = [];
        for (const message of knowledgeAiMessages) {
            if (!Array.isArray(message?.candidates) || message.candidates.length === 0) continue;
            for (const candidate of message.candidates) {
                const key = getCandidateKey(message.id, candidate.id);
                if (knowledgeSelectedMap[key]) selected.push(candidate);
            }
        }
        return selected;
    };

    const applySelectedCandidatesToNote = async ({ syncAfterApply = false } = {}) => {
        const note = getEditingNote();
        if (!note?.id) {
            toast.error('请先打开一篇笔记');
            return;
        }

        const selected = getSelectedKnowledgeCandidates();
        if (selected.length === 0) {
            toast.error('请先勾选要接入的候选内容');
            return;
        }

        const uniqueDirectives = Array.from(
            new Set(
                selected
                    .map((item) => String(item?.directive || '').trim())
                    .filter(Boolean)
            )
        );
        if (uniqueDirectives.length === 0) {
            toast.error('选中项中没有可接入指令');
            return;
        }

        const existing = String(note.content || '').trimEnd();
        const sectionTitle = '## 知识关联接入（手动选择）';
        const sectionBody = uniqueDirectives.join('\n\n');
        const nextContent = `${existing}\n\n${sectionTitle}\n\n${sectionBody}\n`;
        const updated = { ...note, content: nextContent, updatedAt: Date.now() };

        setActiveNote(updated);
        setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
        if (isMobile) setViewingMobileId(updated.id);
        await saveToNotes(updated);

        if (syncAfterApply) {
            await handleManualKnowledgeSync(updated);
        } else {
            toast.success(`已追加 ${uniqueDirectives.length} 条到笔记末尾`);
        }
    };

    const handleSendKnowledgeAiMessage = async () => {
        const note = getEditingNote();
        const userText = String(knowledgeAiInput || '').trim();
        if (!note?.id) {
            toast.error('请先打开一篇笔记');
            return;
        }
        if (!userText) {
            toast.error('先输入你的要求，比如“只要2条写作素材”');
            return;
        }
        if (!settings?.apiKey) {
            toast.error('请先在设置中配置 API Key');
            return;
        }

        const userMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: userText,
            candidates: []
        };
        setKnowledgeAiMessages((prev) => [...prev, userMessage]);
        setKnowledgeAiInput('');
        setIsKnowledgeAiRunning(true);

        try {
            const result = await chatNoteKnowledgeLinking(
                { title: note.title || '', content: note.content || '' },
                knowledgeAiMessages.map((item) => ({ role: item.role, content: item.content })),
                userText,
                settings
            );
            const candidates = (Array.isArray(result?.candidates) ? result.candidates : [])
                .map((candidate, idx) => normalizeKnowledgeCandidate(candidate, note.id, idx))
                .filter((candidate) => candidate.directive.startsWith('@'));
            const assistantMessage = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: String(result?.assistantReply || '').trim() || '我整理了一批候选内容，你可以按需勾选接入。',
                candidates
            };
            setKnowledgeAiMessages((prev) => [...prev, assistantMessage]);
            if (candidates.length === 0) {
                toast('这轮没有候选接入项，你可以继续追问或补充要求');
            }
        } catch (error) {
            console.error('knowledge chat failed', error);
            toast.error(`AI 对话失败: ${error.message}`);
        } finally {
            setIsKnowledgeAiRunning(false);
        }
    };

    const backlinks = useMemo(() => {
        const normalize = (value) => String(value || "").trim().toLowerCase();
        const currentTitle = normalize(activeNote?.title);
        if (!currentTitle) return [];

        return notes
            .filter((note) => note.id !== activeNote?.id)
            .map((note) => {
                const hitCount = parseWikiLinks(note.content).filter(
                    (link) => normalize(link.title) === currentTitle
                ).length;

                if (!hitCount) return null;
                return { note, hitCount };
            })
            .filter(Boolean)
            .sort((a, b) => (b.note.updatedAt || 0) - (a.note.updatedAt || 0));
    }, [notes, activeNote?.id, activeNote?.title]);

    const wikiLinkCandidates = useMemo(() => {
        const map = new Map();
        for (const note of notes) {
            const title = String(note?.title || '').trim();
            if (!title) continue;
            const key = title.toLowerCase();
            if (!map.has(key)) map.set(key, title);
        }
        return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'en'));
    }, [notes]);

    const getCurrentReadScrollTop = () => {
        const pane = isMobile ? mobileReadPaneRef.current : desktopReadPaneRef.current;
        return pane?.scrollTop || 0;
    };

    const openLinkedTarget = (targetNote, section = "") => {
        if (!targetNote) return;

        if (activeNote?.id && activeNote.id !== targetNote.id) {
            setSourceContext({
                noteId: activeNote.id,
                scrollTop: getCurrentReadScrollTop()
            });
        }

        setActiveNote(targetNote);
        if (isMobile) setViewingMobileId(targetNote.id);
        setViewMode('read');
        setPendingSectionAnchor(section || "");
    };

    const handleReturnToSource = () => {
        if (!sourceContext?.noteId) return;
        const sourceNote = notes.find((note) => note.id === sourceContext.noteId);
        if (!sourceNote) {
            setSourceContext(null);
            return;
        }

        setActiveNote(sourceNote);
        if (isMobile) setViewingMobileId(sourceNote.id);
        setViewMode('read');
        setPendingScrollRestore(sourceContext.scrollTop || 0);
        setSourceContext(null);
    };

    useEffect(() => {
        if (pendingScrollRestore === null) return;

        const timer = window.setTimeout(() => {
            const pane = isMobile ? mobileReadPaneRef.current : desktopReadPaneRef.current;
            if (pane) pane.scrollTop = pendingScrollRestore;
            setPendingScrollRestore(null);
        }, 60);

        return () => window.clearTimeout(timer);
    }, [pendingScrollRestore, activeNote?.id, isMobile, viewMode]);

    useEffect(() => {
        if (!pendingSectionAnchor || viewMode === 'edit') return;

        const normalize = (value) => String(value || "").trim().toLowerCase();
        const timer = window.setTimeout(() => {
            const pane = isMobile ? mobileReadPaneRef.current : desktopReadPaneRef.current;
            if (!pane) return;

            const targetHeading = Array.from(pane.querySelectorAll('h1, h2, h3, h4, h5, h6')).find(
                (heading) => normalize(heading.textContent) === normalize(pendingSectionAnchor)
            );

            if (!targetHeading) {
                toast.error(`Section not found: ${pendingSectionAnchor}`);
                setPendingSectionAnchor("");
                return;
            }

            targetHeading.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const previousColor = targetHeading.style.backgroundColor;
            const previousTransition = targetHeading.style.transition;
            targetHeading.style.transition = "background-color 240ms ease";
            targetHeading.style.backgroundColor = "rgba(250, 204, 21, 0.25)";
            if (sectionHighlightTimerRef.current) window.clearTimeout(sectionHighlightTimerRef.current);
            sectionHighlightTimerRef.current = window.setTimeout(() => {
                targetHeading.style.backgroundColor = previousColor;
                targetHeading.style.transition = previousTransition;
            }, 1600);

            setPendingSectionAnchor("");
        }, 80);

        return () => window.clearTimeout(timer);
    }, [activeNote?.id, isMobile, pendingSectionAnchor, viewMode]);

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

    const toMarkdownWithWikiLinks = (content = "") => {
        const withLinks = String(content).replace(/\[\[([^\]]+)\]\]/g, (_, label) => {
            const target = String(label || "").trim();
            return `[${target}](note://${encodeURIComponent(target)})`;
        });
        return withLinks.replace(
            /==([^=]+)==/g,
            '<mark class="bg-phy-accent text-white px-1 rounded font-bold shadow-sm">$1</mark>'
        );
    };

    const getPreviewSummary = (content = "") => {
        const plain = String(content || "")
            .replace(/```[\s\S]*?```/g, ' ')
            .replace(/`[^`]*`/g, ' ')
            .replace(/[#>*_\-\[\]\(\)!]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!plain) return 'No content yet.';
        return plain.slice(0, 180) + (plain.length > 180 ? '...' : '');
    };

    const getDesktopPreviewLayout = (anchorRect) => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const margin = 12;
        const gap = 10;

        const width = Math.min(Math.max(Math.round(viewportWidth * 0.32), 420), Math.min(520, viewportWidth - margin * 2));
        const maxHeight = Math.min(Math.max(Math.round(viewportHeight * 0.62), 380), Math.min(560, viewportHeight - margin * 2));

        const fallbackRect = {
            left: viewportWidth - width - margin,
            right: viewportWidth - margin,
            top: 88,
            bottom: 120
        };
        const sourceRect = anchorRect && Number.isFinite(anchorRect.left) ? anchorRect : fallbackRect;

        let left = sourceRect.right + gap;
        if (left + width > viewportWidth - margin) {
            left = sourceRect.left - width - gap;
        }
        if (left < margin) {
            left = Math.max(margin, Math.min(sourceRect.left, viewportWidth - width - margin));
        }

        let top = sourceRect.top;
        if (top + maxHeight > viewportHeight - margin) {
            top = sourceRect.bottom - maxHeight;
        }
        if (top < margin) {
            top = margin;
        }
        if (top + maxHeight > viewportHeight - margin) {
            top = viewportHeight - maxHeight - margin;
        }

        return {
            left,
            top,
            width,
            maxHeight
        };
    };

    const closeLinkSuggest = () => {
        setLinkSuggest(prev => ({ ...prev, open: false, items: [], source: null }));
        setLinkSuggestIndex(0);
    };

    const extractWikiQueryAtCursor = (text, cursor) => {
        const content = String(text || '');
        const caret = Number.isFinite(cursor) ? cursor : content.length;
        const openIndex = content.lastIndexOf('[[', caret);
        if (openIndex < 0) return null;

        const closeIndex = content.lastIndexOf(']]', caret);
        if (closeIndex > openIndex) return null;

        const query = content.slice(openIndex + 2, caret);
        if (/[\n\[\]]/.test(query)) return null;

        return {
            query,
            start: openIndex,
            end: caret
        };
    };

    const refreshLinkSuggest = (text, cursor, source) => {
        const ctx = extractWikiQueryAtCursor(text, cursor);
        if (!ctx) {
            closeLinkSuggest();
            return;
        }

        const query = ctx.query.trim();
        const filtered = wikiLinkCandidates
            .filter((title) => title.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 8);

        if (filtered.length === 0) {
            closeLinkSuggest();
            return;
        }

        setLinkSuggest({
            open: true,
            query,
            items: filtered,
            start: ctx.start,
            end: ctx.end,
            source
        });
        setLinkSuggestIndex(0);
    };

    const applyLinkSuggestion = (title) => {
        const currentNote = isMobile ? activeNoteForMobile : activeNote;
        const original = String(currentNote?.content || '');
        const before = original.slice(0, linkSuggest.start);
        const after = original.slice(linkSuggest.end);
        const token = `[[${title}]]`;
        const nextContent = `${before}${token}${after}`;
        const nextCaret = before.length + token.length;

        handleUpdate({ content: nextContent });
        closeLinkSuggest();

        window.setTimeout(() => {
            const editorRef = linkSuggest.source === 'mobile' ? mobileEditorRef.current : desktopEditorRef.current;
            if (!editorRef) return;
            editorRef.focus();
            editorRef.setSelectionRange(nextCaret, nextCaret);
        }, 0);
    };

    const insertKnowledgeTemplate = (templateKey, source) => {
        const template = NOTE_LINKING_TEMPLATES[templateKey];
        if (!template) return;
        const editorRef = source === 'mobile' ? mobileEditorRef.current : desktopEditorRef.current;
        const currentNote = source === 'mobile' ? activeNoteForMobile : activeNote;
        if (!editorRef || !currentNote) return;

        const content = String(currentNote.content || '');
        const start = editorRef.selectionStart ?? content.length;
        const end = editorRef.selectionEnd ?? start;
        const before = content.slice(0, start);
        const after = content.slice(end);
        const prefix = before.length > 0 && !before.endsWith('\n') ? '\n\n' : '';
        const suffix = after.length > 0 && !after.startsWith('\n') ? '\n\n' : '';
        const insertion = `${prefix}${template}${suffix}`;
        const nextContent = `${before}${insertion}${after}`;
        const nextCaret = before.length + insertion.length;

        handleUpdate({ content: nextContent });
        closeLinkSuggest();
        window.setTimeout(() => {
            const nextEditorRef = source === 'mobile' ? mobileEditorRef.current : desktopEditorRef.current;
            if (!nextEditorRef) return;
            nextEditorRef.focus();
            nextEditorRef.setSelectionRange(nextCaret, nextCaret);
        }, 0);
    };

    const renderKnowledgeLinkToolBar = (source = 'desktop') => (
        <div className="shrink-0 border-b border-phy-border bg-phy-glass/40 px-4 py-2.5">
            <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-bold text-phy-text">
                    笔记关联工具栏
                </div>
                <button
                    type="button"
                    onClick={() => setShowLinkToolBar((prev) => !prev)}
                    className="px-2 py-0.5 rounded-md border border-phy-border text-[10px] font-bold text-phy-muted hover:text-phy-text"
                >
                    {showLinkToolBar ? '收起' : '展开'}
                </button>
            </div>
            {showLinkToolBar ? (
                <>
                    <div className="mt-2 text-[11px] text-phy-muted leading-relaxed">
                        可直接插入可同步模板：素材包、翻译例句、替换词。填写后保存即可参与关联同步。
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            onClick={() => insertKnowledgeTemplate('material', source)}
                            className="px-2.5 py-1 rounded-lg border border-indigo-400/30 bg-indigo-500/10 text-[11px] font-bold text-indigo-200"
                        >
                            插入 @素材 模板
                        </button>
                        <button
                            type="button"
                            onClick={() => insertKnowledgeTemplate('translation', source)}
                            className="px-2.5 py-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 text-[11px] font-bold text-emerald-200"
                        >
                            插入 @翻译例句 模板
                        </button>
                        <button
                            type="button"
                            onClick={() => insertKnowledgeTemplate('vocab', source)}
                            className="px-2.5 py-1 rounded-lg border border-amber-400/30 bg-amber-500/10 text-[11px] font-bold text-amber-200"
                        >
                            插入 @替换词 模板
                        </button>
                        <button
                            type="button"
                            onClick={() => handleManualKnowledgeSync()}
                            className="px-2.5 py-1 rounded-lg border border-cyan-400/30 bg-cyan-500/10 text-[11px] font-bold text-cyan-200"
                        >
                            手动接入写作/翻译
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setKnowledgeSelectedMap({});
                                setKnowledgeAiInput('请先帮我挑出这篇笔记里最值得接入写作/翻译的内容。');
                                setShowKnowledgeAiModal(true);
                            }}
                            className="px-2.5 py-1 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 text-[11px] font-bold text-fuchsia-200"
                        >
                            AI 对话式接入
                        </button>
                    </div>
                </>
            ) : null}
        </div>
    );

    const handleEditorChange = (event, source) => {
        const text = event.target.value;
        const cursor = event.target.selectionStart ?? text.length;
        handleUpdate({ content: text });
        refreshLinkSuggest(text, cursor, source);
    };

    const handleEditorCursorChange = (event, source) => {
        if (
            event?.type === 'keyup' &&
            linkSuggest.open &&
            linkSuggest.source === source &&
            (event.key === 'ArrowDown' || event.key === 'ArrowUp')
        ) {
            return;
        }
        const text = event.target.value;
        const cursor = event.target.selectionStart ?? text.length;
        refreshLinkSuggest(text, cursor, source);
    };

    const handleEditorKeyDown = (event, source) => {
        if (!linkSuggest.open || linkSuggest.source !== source) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setLinkSuggestIndex((prev) => (prev + 1) % linkSuggest.items.length);
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setLinkSuggestIndex((prev) => (prev - 1 + linkSuggest.items.length) % linkSuggest.items.length);
            return;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            const selected = linkSuggest.items[linkSuggestIndex];
            if (selected) applyLinkSuggestion(selected);
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            closeLinkSuggest();
        }
    };

    const renderLinkSuggestPanel = (source) => {
        if (!linkSuggest.open || linkSuggest.source !== source || linkSuggest.items.length === 0) {
            return null;
        }

        return (
            <div className="absolute z-30 left-4 right-4 bottom-4 rounded-xl border border-phy-border bg-phy-bg/95 backdrop-blur-md shadow-xl p-2">
                <div className="text-[11px] text-phy-muted px-2 pb-1">
                    Wiki link suggestions ({linkSuggest.query || 'all'})
                </div>
                <div className="space-y-1 max-h-44 overflow-y-auto custom-scrollbar">
                    {linkSuggest.items.map((title, idx) => (
                        <button
                            key={`${source}-${title}-${idx}`}
                            type="button"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                applyLinkSuggestion(title);
                            }}
                            className={`w-full text-left px-2 py-1.5 rounded-lg text-sm transition-colors ${
                                idx === linkSuggestIndex
                                    ? 'bg-phy-accentGlass text-phy-accent'
                                    : 'hover:bg-phy-glass text-phy-text'
                            }`}
                        >
                            {title}
                        </button>
                    ))}
                </div>
            </div>
        );
    };

    const handleWikiLinkClick = async (rawTarget) => {
        const { title, section } = parseWikiLinkLabel(rawTarget);
        if (!title) {
            toast.error('Invalid note link');
            return;
        }

        const resolution = resolveWikiTarget(notes, title);
        let targetNote = null;

        if (resolution.status === "none") {
            const inheritedTags = Array.isArray(activeNote?.tags) ? activeNote.tags : [];
            const newNote = {
                id: Date.now().toString(),
                title,
                content: "",
                tags: [...inheritedTags],
                updatedAt: Date.now()
            };
            await saveToNotes(newNote);
            await refreshNotes();
            targetNote = newNote;
            toast.success(`Created note: ${title}`);
        } else if (resolution.status === "multiple") {
            const matches = [...resolution.matches].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            setDuplicateLinkPicker({ title, section, matches });
            return;
        } else {
            targetNote = [...resolution.matches].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
        }

        openLinkedTarget(targetNote, section);
    };

    const handleWikiLinkPreview = (rawTarget, meta = {}) => {
        const { title, section } = parseWikiLinkLabel(rawTarget);
        if (!title) {
            toast.error('Invalid note link');
            return;
        }

        const resolution = resolveWikiTarget(notes, title);
        if (resolution.status === "none") {
            toast.error(`Preview target not found: ${title}`);
            return;
        }

        const targetNote = [...resolution.matches].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
        if (resolution.status === "multiple") {
            toast('Multiple notes found, previewing latest one');
        }

        const anchorRect = meta?.anchorRect && Number.isFinite(meta.anchorRect.left)
            ? meta.anchorRect
            : null;

        setPreviewContext({
            title,
            section,
            note: targetNote,
            anchorRect,
            summary: getPreviewSummary(targetNote?.content || "")
        });
    };

    const renderDuplicatePicker = () => {
        if (!duplicateLinkPicker) return null;

        return (
            <div className="fixed inset-0 z-[130] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-lg rounded-2xl border border-phy-border bg-phy-bg p-4 shadow-2xl">
                    <div className="text-sm font-bold text-phy-text">Choose target note</div>
                    <div className="text-xs text-phy-muted mt-1">Found multiple notes titled: {duplicateLinkPicker.title}</div>
                    <div className="mt-3 max-h-[50vh] overflow-y-auto space-y-2 custom-scrollbar pr-1">
                        {duplicateLinkPicker.matches.map((match) => (
                            <button
                                key={match.id}
                                onClick={() => {
                                    openLinkedTarget(match, duplicateLinkPicker.section);
                                    setDuplicateLinkPicker(null);
                                }}
                                className="w-full text-left rounded-xl border border-phy-border bg-phy-glass px-3 py-2 hover:border-phy-accent/40 transition-colors"
                            >
                                <div className="text-sm font-semibold text-phy-text truncate">{match.title || "Untitled Note"}</div>
                                <div className="text-[11px] text-phy-muted mt-1">{new Date(match.updatedAt || Date.now()).toLocaleString()}</div>
                                {Array.isArray(match.tags) && match.tags.length > 0 && (
                                    <div className="text-[11px] text-phy-muted mt-1 truncate">{match.tags.join(', ')}</div>
                                )}
                            </button>
                        ))}
                    </div>
                    <div className="mt-3 flex justify-end">
                        <button
                            onClick={() => setDuplicateLinkPicker(null)}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-phy-border text-phy-muted hover:text-phy-text"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const handlePreviewHeaderMouseDown = (event) => {
        if (isMobile || event.button !== 0) return;
        const cardRect = previewCardRef.current?.getBoundingClientRect();
        const base = previewPosition || getDesktopPreviewLayout(previewContext?.anchorRect);
        if (!base) return;

        event.preventDefault();
        event.stopPropagation();

        previewDragStateRef.current = {
            offsetX: event.clientX - base.left,
            offsetY: event.clientY - base.top,
            width: cardRect?.width || base.width,
            height: cardRect?.height || base.maxHeight
        };
        setIsDraggingPreview(true);
    };

    const renderPreviewPopup = () => {
        if (!previewContext?.note) return null;
        const note = previewContext.note;
        const updatedAtLabel = new Date(note.updatedAt || Date.now()).toLocaleString();

        if (isMobile) {
            return (
                <div className="fixed inset-0 z-[125] bg-black/45 flex items-end" onClick={() => setPreviewContext(null)}>
                    <div
                        ref={previewCardRef}
                        className="w-full h-[62vh] max-h-[70vh] rounded-t-3xl border-t border-phy-border bg-phy-bg shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 py-3 border-b border-phy-border bg-phy-glassLight/60 backdrop-blur-sm rounded-t-3xl">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-sm font-black text-phy-text truncate">{note.title || "Untitled Note"}</div>
                                    <div className="text-[11px] text-phy-muted mt-1 truncate">{updatedAtLabel}</div>
                                    {previewContext.section && (
                                        <div className="mt-1 inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border border-phy-accent/40 text-phy-accent bg-phy-accentGlass">
                                            Section: {previewContext.section}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => setPreviewContext(null)}
                                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-phy-border text-phy-muted"
                                >
                                    Close
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-3">
                            <div className="rounded-xl border border-phy-border bg-phy-glassLight px-3 py-2">
                                <div className="text-[11px] font-bold tracking-wide uppercase text-phy-muted mb-1">Summary</div>
                                <p className="text-sm leading-relaxed text-phy-text">{previewContext.summary}</p>
                            </div>
                            <div className="rounded-xl border border-phy-border bg-phy-bg/80 px-3 py-3">
                                <SharedMarkdown
                                    remarkPlugins={[remarkBreaks]}
                                    rehypePlugins={[rehypeRaw, rehypeHighlight]}
                                    content={toMarkdownWithWikiLinks(note.content)}
                                    onInternalLinkClick={handleWikiLinkClick}
                                />
                            </div>
                        </div>

                        <div className="px-4 py-3 border-t border-phy-border bg-phy-glassLight/70 backdrop-blur-sm mobile-safe-bottom">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => {
                                        openLinkedTarget(note, previewContext.section);
                                        setPreviewContext(null);
                                    }}
                                    className="flex-1 px-3 py-2 text-xs font-black rounded-xl bg-phy-accent text-white shadow-sm hover:brightness-110"
                                >
                                    Open in main
                                </button>
                                <button
                                    onClick={() => setPreviewContext(null)}
                                    className="px-3 py-2 text-xs font-bold rounded-xl border border-phy-border text-phy-muted"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        const previewLayout = previewPosition || getDesktopPreviewLayout(previewContext.anchorRect);

        return (
            <div
                className="fixed z-[125] pointer-events-none animate-in fade-in zoom-in-95 duration-150"
                style={{
                    left: `${previewLayout.left}px`,
                    top: `${previewLayout.top}px`,
                    width: `${previewLayout.width}px`
                }}
            >
                <div
                    ref={previewCardRef}
                    className="pointer-events-auto border border-phy-border rounded-2xl shadow-[0_18px_45px_rgba(0,0,0,0.28)] bg-phy-bg/96 backdrop-blur-md flex flex-col overflow-hidden"
                    style={{ maxHeight: `${previewLayout.maxHeight}px` }}
                >
                    <div
                        onMouseDown={handlePreviewHeaderMouseDown}
                        className={`px-4 py-3 border-b border-phy-border bg-gradient-to-r from-phy-glassLight to-phy-glassHeavy select-none ${isDraggingPreview ? 'cursor-grabbing' : 'cursor-grab'}`}
                        title="Drag to move"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-sm font-black text-phy-text truncate">{note.title || "Untitled Note"}</div>
                                <div className="text-[11px] text-phy-muted mt-1">{updatedAtLabel}</div>
                                {previewContext.section && (
                                    <div className="mt-1 inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border border-phy-accent/40 text-phy-accent bg-phy-accentGlass">
                                        Section: {previewContext.section}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => setPreviewContext(null)}
                                className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-phy-border text-phy-muted hover:text-phy-text hover:border-phy-borderHover transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-3">
                        <div className="rounded-xl border border-phy-border bg-phy-glassLight px-3 py-2">
                            <div className="text-[11px] font-bold tracking-wide uppercase text-phy-muted mb-1">Summary</div>
                            <p className="text-sm leading-relaxed text-phy-text">{previewContext.summary}</p>
                        </div>
                        <div className="rounded-xl border border-phy-border bg-phy-bg/85 px-3 py-3">
                            <SharedMarkdown
                                remarkPlugins={[remarkBreaks]}
                                rehypePlugins={[rehypeRaw, rehypeHighlight]}
                                content={toMarkdownWithWikiLinks(note.content)}
                                onInternalLinkClick={handleWikiLinkClick}
                            />
                        </div>
                    </div>

                    <div className="px-4 py-3 border-t border-phy-border bg-phy-glassLight/75 backdrop-blur-sm">
                        <div className="flex items-center justify-end gap-2">
                            <button
                                onClick={() => setPreviewContext(null)}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-phy-border text-phy-muted hover:text-phy-text"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => {
                                    openLinkedTarget(note, previewContext.section);
                                    setPreviewContext(null);
                                }}
                                className="px-3 py-1.5 text-xs font-black rounded-lg bg-phy-accent text-white shadow-sm hover:brightness-110"
                            >
                                Open in main
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderKnowledgeAiModal = () => {
        if (!showKnowledgeAiModal) return null;
        const selectedCount = Object.values(knowledgeSelectedMap).filter(Boolean).length;
        return (
            <div className="fixed inset-0 z-[140] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-5xl h-[80vh] rounded-2xl border border-phy-border bg-phy-bg shadow-2xl flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-phy-border flex items-start justify-between gap-3">
                        <div>
                            <div className="text-sm md:text-base font-black text-phy-text">AI 笔记接入助手（可对话 + 可勾选）</div>
                            <div className="text-xs text-phy-muted mt-1">
                                你可以连续对话，让 AI 只给你需要接入的部分；勾选后再追加到笔记。
                            </div>
                        </div>
                        <button
                            onClick={() => setShowKnowledgeAiModal(false)}
                            className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-phy-border text-phy-muted hover:text-phy-text"
                        >
                            关闭
                        </button>
                    </div>

                    <div className="px-4 py-2 border-b border-phy-border text-[11px] text-phy-muted flex items-center justify-between">
                        <span>当前笔记：{getEditingNote()?.title || 'Untitled Note'}</span>
                        <span>已勾选 {selectedCount} 条</span>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-3">
                        {knowledgeAiMessages.map((message) => (
                            <div
                                key={message.id}
                                className={`rounded-xl border p-3 ${
                                    message.role === 'assistant'
                                        ? 'border-phy-border bg-phy-glass/30'
                                        : 'border-indigo-500/30 bg-indigo-500/10'
                                }`}
                            >
                                <div className="text-[11px] font-bold mb-1 text-phy-muted">
                                    {message.role === 'assistant' ? 'AI 助手' : '你'}
                                </div>
                                <div className="text-sm leading-relaxed text-phy-text whitespace-pre-wrap">{message.content}</div>

                                {Array.isArray(message.candidates) && message.candidates.length > 0 ? (
                                    <div className="mt-3 space-y-2">
                                        {message.candidates.map((candidate) => {
                                            const candidateKey = getCandidateKey(message.id, candidate.id);
                                            const isChecked = !!knowledgeSelectedMap[candidateKey];
                                            return (
                                                <label
                                                    key={candidateKey}
                                                    className="block rounded-lg border border-phy-border bg-phy-bg/60 px-3 py-2"
                                                >
                                                    <div className="flex items-start gap-2">
                                                        <input
                                                            type="checkbox"
                                                            className="mt-1 accent-indigo-500"
                                                            checked={isChecked}
                                                            onChange={(e) => {
                                                                const checked = e.target.checked;
                                                                setKnowledgeSelectedMap((prev) => ({
                                                                    ...prev,
                                                                    [candidateKey]: checked
                                                                }));
                                                            }}
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="text-xs font-black text-phy-text">{candidate.title}</span>
                                                                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold border border-phy-border text-phy-muted">
                                                                    {getKnowledgeCandidateTag(candidate)}
                                                                </span>
                                                            </div>
                                                            {candidate.reason ? (
                                                                <div className="text-[11px] text-phy-muted mt-1">{candidate.reason}</div>
                                                            ) : null}
                                                            <div className="text-xs text-phy-text mt-1 line-clamp-2">
                                                                {candidate.previewText}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>

                    <div className="px-4 py-3 border-t border-phy-border space-y-2">
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => setKnowledgeSelectedMap({})}
                                className="px-3 py-1.5 rounded-lg border border-phy-border text-xs font-bold text-phy-muted hover:text-phy-text"
                            >
                                清空勾选
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        await applySelectedCandidatesToNote({ syncAfterApply: false });
                                    } catch (error) {
                                        console.error('apply selected candidates failed', error);
                                        toast.error(`追加失败: ${error.message}`);
                                    }
                                }}
                                className="px-3 py-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/15 text-xs font-bold text-indigo-200"
                            >
                                追加到笔记
                            </button>
                            <button
                                onClick={async () => {
                                    try {
                                        await applySelectedCandidatesToNote({ syncAfterApply: true });
                                    } catch (error) {
                                        console.error('append and sync failed', error);
                                        toast.error(`接入失败: ${error.message}`);
                                    }
                                }}
                                className="px-3 py-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/15 text-xs font-bold text-emerald-200"
                            >
                                追加并接入写作/翻译
                            </button>
                        </div>

                        <div className="flex gap-2">
                            <textarea
                                value={knowledgeAiInput}
                                onChange={(e) => setKnowledgeAiInput(e.target.value)}
                                rows={2}
                                onKeyDown={(e) => {
                                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSendKnowledgeAiMessage();
                                    }
                                }}
                                className="flex-1 rounded-xl border border-phy-border bg-phy-glass px-3 py-2 text-sm text-phy-text resize-none"
                                placeholder="例如：只要2条能用于议论文开头的素材，不要翻译例句。"
                            />
                            <button
                                onClick={handleSendKnowledgeAiMessage}
                                disabled={isKnowledgeAiRunning}
                                className="shrink-0 px-4 py-2 rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/15 text-sm font-black text-fuchsia-200 disabled:opacity-60"
                            >
                                {isKnowledgeAiRunning ? '发送中...' : '发送'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
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
                        {sourceContext?.noteId && (
                            <button onClick={handleReturnToSource} className="px-2 py-1 text-xs rounded-lg bg-phy-glass border border-phy-border text-phy-muted">
                                Back
                            </button>
                        )}
                        <button onClick={() => setShowMobileBacklinks(true)} className="p-2 text-phy-muted rounded-full hover:bg-phy-glass">
                            <Link2 size={18} />
                        </button>
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
                <div ref={mobileReadPaneRef} className="flex-1 overflow-y-auto px-4 pt-4 pb-32 overscroll-contain">
                    {viewMode === 'edit' ? (
                        <div className="h-full flex flex-col rounded-2xl border border-phy-border/50 bg-phy-glass/20 overflow-hidden">
                            {renderKnowledgeLinkToolBar('mobile')}
                            <div className="relative flex-1">
                                <textarea
                                    ref={mobileEditorRef}
                                    value={note?.content}
                                    onChange={(e) => handleEditorChange(e, 'mobile')}
                                    onClick={(e) => handleEditorCursorChange(e, 'mobile')}
                                    onKeyUp={(e) => handleEditorCursorChange(e, 'mobile')}
                                    onKeyDown={(e) => handleEditorKeyDown(e, 'mobile')}
                                    className="w-full h-full min-h-[360px] resize-none outline-none border-none font-phy text-phy-text text-base leading-relaxed bg-transparent selection:bg-phy-accent/30 p-4"
                                    placeholder="# Start writing..."
                                />
                                {renderLinkSuggestPanel('mobile')}
                            </div>
                        </div>
                    ) : (
                        <div className="animate-in fade-in zoom-in-95">
                            <SharedMarkdown
                                remarkPlugins={[remarkBreaks]}
                                rehypePlugins={[rehypeRaw, rehypeHighlight]}
                                content={toMarkdownWithWikiLinks(note?.content)}
                                onInternalLinkClick={handleWikiLinkClick}
                                onInternalLinkPreview={handleWikiLinkPreview}
                            />
                        </div>
                    )}
                </div>

                {/* Mobile More Options Backdrop */}
                {showMobileListOptions && (
                    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowMobileListOptions(false)}>
                        <div className="w-full max-w-lg bg-phy-glassHeavy backdrop-blur-[40px] rounded-t-[2.5rem] p-6 pb-28 animate-in slide-in-from-bottom flex flex-col gap-4 shadow-[0_-15px_60px_rgba(0,0,0,0.4)] border-t border-phy-border/30 mobile-safe-bottom" onClick={e => e.stopPropagation()}>
                            <div className="w-12 h-1.5 bg-phy-muted/30 rounded-full mx-auto mb-2" />
                            <h3 className="text-[11px] font-black text-phy-accent uppercase tracking-[0.2em] px-2 mb-2">Note Settings</h3>
                            <div className="grid grid-cols-1 gap-2">
                                <button 
                                    onClick={() => { handleExport(note); setShowMobileListOptions(false); }} 
                                    className="flex items-center gap-4 p-4 rounded-2xl bg-phy-glass border border-phy-border/30 hover:bg-phy-glassHover transition-all active:scale-95"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                                        <FileDown size={24} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold text-phy-text">Export Markdown</span>
                                        <span className="text-[10px] text-phy-muted">Save as .md file</span>
                                    </div>
                                </button>

                                <div className="p-4 rounded-2xl bg-phy-glass/40 border border-phy-border/30 flex flex-col gap-2.5">
                                    <div className="flex items-center gap-2 px-1">
                                        <Tag size={12} className="text-phy-accent" />
                                        <span className="text-[11px] font-bold text-phy-muted uppercase tracking-wider">Tags</span>
                                    </div>
                                    <input 
                                        value={(note?.tags || []).join(', ')}
                                        onChange={(e) => handleUpdate({ tags: e.target.value.split(',').map(t=>t.trim()).filter(Boolean) })}
                                        className="w-full bg-phy-bg border border-phy-border rounded-xl px-4 py-3 outline-none text-sm text-phy-text placeholder:text-phy-muted/60 focus:ring-2 focus:ring-phy-accent/40 transition-all font-medium"
                                        placeholder="Tag 1, Tag 2"
                                    />
                                </div>

                                <div className="h-px bg-phy-border/50 my-2 mx-4" />

                                <button 
                                    onClick={() => { if(confirm('Delete note?')) { handleDelete(null, note.id); setShowMobileListOptions(false); } }} 
                                    className="flex items-center gap-4 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 hover:bg-rose-500/20 transition-all active:scale-95"
                                >
                                    <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-600">
                                        <Trash2 size={24} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-bold">Delete Note</span>
                                        <span className="text-[10px] opacity-70">Remove permanently</span>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {showMobileBacklinks && (
                    <div className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-sm flex items-end" onClick={() => setShowMobileBacklinks(false)}>
                        <div className="w-full bg-white dark:bg-gray-900 rounded-t-3xl p-4 pb-24 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-bold text-phy-text">Backlinks ({backlinks.length})</h3>
                                <button onClick={() => setShowMobileBacklinks(false)} className="text-sm text-phy-muted">Close</button>
                            </div>
                            <div className="space-y-2">
                                {backlinks.map(({ note: linkedNote, hitCount }) => (
                                    <button
                                        key={linkedNote.id}
                                        onClick={() => {
                                            setShowMobileBacklinks(false);
                                            openLinkedTarget(linkedNote);
                                        }}
                                        className="w-full text-left rounded-xl border border-phy-border bg-phy-glass px-3 py-2"
                                    >
                                        <div className="text-sm font-semibold text-phy-text truncate">{linkedNote.title || "Untitled Note"}</div>
                                        <div className="text-xs text-phy-muted mt-1">{hitCount} link(s)</div>
                                    </button>
                                ))}
                                {backlinks.length === 0 && (
                                    <div className="text-xs text-phy-muted py-6 text-center">No backlinks yet.</div>
                                )}
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
                {renderDuplicatePicker()}
                {renderPreviewPopup()}
                {renderKnowledgeAiModal()}
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
                        <div className="w-full max-w-lg bg-phy-glassHeavy backdrop-blur-3xl rounded-t-[2.5rem] p-6 pb-28 animate-in slide-in-from-bottom flex flex-col gap-4 shadow-[0_-20px_50px_rgba(0,0,0,0.3)] border-t border-phy-border/30 mobile-safe-bottom" onClick={e => e.stopPropagation()}>
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
                                {sourceContext?.noteId && (
                                    <button
                                        onClick={handleReturnToSource}
                                        className="px-3 py-1.5 text-[11px] font-bold rounded-lg border border-phy-border bg-phy-glass text-phy-muted hover:text-phy-text transition-colors"
                                    >
                                        Return
                                    </button>
                                )}
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
                                <button
                                    onClick={() => setShowDesktopBacklinks(prev => !prev)}
                                    className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition-colors ${
                                        showDesktopBacklinks
                                            ? 'border-phy-accent/40 text-phy-accent bg-phy-accentGlass'
                                            : 'border-phy-border text-phy-muted hover:text-phy-text'
                                    }`}
                                    title={showDesktopBacklinks ? 'Hide backlinks panel' : 'Show backlinks panel'}
                                >
                                    <span className="inline-flex items-center gap-1.5">
                                        <Link2 size={12} />
                                        <span>{showDesktopBacklinks ? 'Hide Links' : 'Show Links'}</span>
                                    </span>
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 flex min-h-0 overflow-hidden">
                            {(viewMode === 'edit' || viewMode === 'split') && (
                                <div className={`flex-1 flex flex-col overflow-hidden ${viewMode === 'split' ? 'border-r border-phy-border' : ''}`}>
                                    {renderKnowledgeLinkToolBar('desktop')}
                                    <div className="relative w-full h-full">
                                        <textarea 
                                            ref={desktopEditorRef}
                                            value={activeNote.content}
                                            onChange={(e) => handleEditorChange(e, 'desktop')}
                                            onClick={(e) => handleEditorCursorChange(e, 'desktop')}
                                            onKeyUp={(e) => handleEditorCursorChange(e, 'desktop')}
                                            onKeyDown={(e) => handleEditorKeyDown(e, 'desktop')}
                                            className="w-full h-full p-10 resize-none outline-none border-none font-mono text-base leading-loose bg-transparent selection:bg-phy-accent/20 custom-scrollbar"
                                        />
                                        {renderLinkSuggestPanel('desktop')}
                                    </div>
                                </div>
                            )}
                            {(viewMode === 'read' || viewMode === 'split') && (
                                <div ref={desktopReadPaneRef} className="flex-1 p-10 overflow-y-auto bg-phy-bg/20 custom-scrollbar overscroll-contain">
                                    <div className="max-w-4xl mx-auto animate-in fade-in zoom-in-95">
                                        <SharedMarkdown
                                            remarkPlugins={[remarkBreaks]}
                                            rehypePlugins={[rehypeRaw, rehypeHighlight]}
                                            content={toMarkdownWithWikiLinks(activeNote.content)}
                                            onInternalLinkClick={handleWikiLinkClick}
                                            onInternalLinkPreview={handleWikiLinkPreview}
                                        />
                                    </div>
                                </div>
                            )}
                            {showDesktopBacklinks && (
                                <div className="w-72 border-l border-phy-border bg-phy-bg/30 p-4 overflow-y-auto custom-scrollbar">
                                <div className="flex items-center gap-2 text-sm font-bold text-phy-text mb-3">
                                    <Link2 size={16} />
                                    <span>Backlinks</span>
                                    <span className="text-xs text-phy-muted">({backlinks.length})</span>
                                </div>
                                <div className="space-y-2">
                                    {backlinks.map(({ note, hitCount }) => (
                                        <button
                                            key={note.id}
                                            onClick={() => openLinkedTarget(note)}
                                            className="w-full text-left rounded-xl border border-phy-border bg-phy-glass px-3 py-2 hover:border-phy-accent/40 transition-colors"
                                        >
                                            <div className="text-sm font-semibold text-phy-text truncate">{note.title || "Untitled Note"}</div>
                                            <div className="text-[11px] text-phy-muted mt-1">{hitCount} link(s)</div>
                                        </button>
                                    ))}
                                    {backlinks.length === 0 && (
                                        <div className="text-xs text-phy-muted py-6 text-center border border-dashed border-phy-border rounded-xl">
                                            No backlinks yet.
                                        </div>
                                    )}
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
            {renderDuplicatePicker()}
            {renderPreviewPopup()}
            {renderKnowledgeAiModal()}
        </div>
    );
};

export default NotesView;

