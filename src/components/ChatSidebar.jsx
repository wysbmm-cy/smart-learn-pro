import React, { useState, useRef, useEffect } from 'react';
import SharedMarkdown from './SharedMarkdown';
import { 
    X, Send, Bot, User, Loader2, FileText, NotebookPen, Brain, 
    History, Plus, Trash2, MessageSquare, Zap, MessageCircle, 
    Database, CheckCircle2, ChevronRight, Layers, PenTool, Mic, 
    BookOpen, ImagePlus, Calendar, BarChart3 
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useChat } from '../context/ChatContext';
import { analyzeImagesForChat, streamChatMessage, streamAgentChat } from '../services/ai';
import ChatQuizWidget from './ChatQuizWidget';
import ChatFlashcardWidget from './ChatFlashcardWidget';
import ChatWritingWidget from './ChatWritingWidget';

// Tool name -> display label mapping
// Tool name -> display label mapping
const TOOL_LABELS = {
    get_flashcard_stats: { label: 'Flashcard stats', icon: 'STAT' },
    get_study_history: { label: 'Study history', icon: 'HIS' },
    get_notes_summary: { label: 'Notes summary', icon: 'NOTE' },
    get_note_detail: { label: 'Note detail', icon: 'NOTE+' },
    get_study_logs: { label: 'Study logs', icon: 'LOG' },
    get_user_goal: { label: 'User goal', icon: 'GOAL' },
    get_drill_performance: { label: 'Drill performance', icon: 'DRILL' },
    get_writing_history: { label: 'Writing history', icon: 'WRITE' },
    list_writing_materials: { label: 'Writing materials', icon: 'PACK' },
    list_flashcard_folders: { label: 'Flashcard folders', icon: 'FOLD' },
    list_flashcards: { label: 'Flashcard list', icon: 'CARD' },
    organize_flashcards_to_note: { label: 'Folder to note', icon: 'SYNC' },
    create_writing_material: { label: 'Create material', icon: 'NEW' },
    update_writing_material: { label: 'Update material', icon: 'EDIT' },
    delete_writing_materials: { label: 'Delete material', icon: 'DEL' },
    get_highlights: { label: 'Highlights', icon: 'MARK' },
    get_tasks: { label: 'Tasks', icon: 'TASK' },
    create_flashcards: { label: 'Create flashcards', icon: 'NEW' },
    update_flashcard: { label: 'Update flashcard', icon: 'EDIT' },
    delete_flashcards: { label: 'Delete flashcards', icon: 'DEL' },
    flashcard_batch_delete: { label: 'Batch delete cards', icon: 'BDEL' },
    flashcard_batch_move_folder: { label: 'Batch move folder', icon: 'MOVE' },
    flashcard_batch_edit: { label: 'Batch edit cards', icon: 'BEDIT' },
    flashcard_delete_by_rule: { label: 'Delete by rule', icon: 'RULE' },
    flashcard_undo_last_batch: { label: 'Undo batch op', icon: 'UNDO' },
    create_note: { label: 'Create note', icon: 'NEW' },
    update_note: { label: 'Update note', icon: 'EDIT' },
    delete_notes: { label: 'Delete notes', icon: 'DEL' },
    create_task_item: { label: 'Create task', icon: 'NEW' },
    update_task_item: { label: 'Update task', icon: 'EDIT' },
    delete_task_items: { label: 'Delete task', icon: 'DEL' },
    create_writing_task: { label: 'Writing exercise', icon: 'WRITE' },
    create_coach_topic: { label: 'Coach topic', icon: 'COACH' },
    navigate_to: { label: 'Navigate', icon: 'GO' },
    review_flashcards: { label: 'Quick review cards', icon: 'CARD' },
    create_interactive_quiz: { label: 'Interactive quiz', icon: 'QUIZ' },
    generate_deep_note: { label: 'Generate deep note', icon: 'NOTE+' },
    note_create_deep_note: { label: 'Create deep note+', icon: 'NOTE+' },
    note_append_today_folder: { label: 'Append today note', icon: 'NAPP' },
    note_partial_sync_to_materials: { label: 'Sync note links', icon: 'SYNC' },
};

// View ID -> display info
const VIEW_INFO = {
    flashcards: { label: '单词闪卡', icon: Layers, color: 'text-violet-600 bg-violet-50 border-violet-200' },
    writer: { label: '写作中心', icon: PenTool, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    coach: { label: '口语教练', icon: Mic, color: 'text-green-600 bg-green-50 border-green-200' },
    notes: { label: '学习笔记', icon: NotebookPen, color: 'text-amber-600 bg-amber-50 border-amber-200' },
    study: { label: '沉浸阅读', icon: BookOpen, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
    exam: { label: '模考中心', icon: FileText, color: 'text-red-600 bg-red-50 border-red-200' },
    plan: { label: '学习计划', icon: Brain, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
    dashboard: { label: '仪表盘', icon: Brain, color: 'text-phy-muted bg-phy-bg border-phy-border' },
    knowledge: { label: '知识图谱', icon: Brain, color: 'text-purple-600 bg-purple-50 border-purple-200' },
    review: { label: '复习中心', icon: Brain, color: 'text-sky-600 bg-sky-50 border-sky-200' },
};

const formatToolArgs = (args) => {
    if (!args || typeof args !== 'object') return '';
    const keys = Object.keys(args).slice(0, 4);
    if (!keys.length) return '';
    return keys
        .map((key) => {
            const value = args[key];
            const str = typeof value === 'string' ? value : JSON.stringify(value);
            const clipped = String(str || '').replace(/\s+/g, ' ').slice(0, 36);
            return `${key}: ${clipped}${String(str || '').length > 36 ? '...' : ''}`;
        })
        .join(' | ');
};

const summarizeToolResult = (tc) => {
    if (tc?.error) return `Error: ${tc.error}`;
    const result = tc?.result;
    if (!result || typeof result !== 'object') return '';
    if (result.error) return `Error: ${result.error}`;
    if (result.message) return String(result.message);
    if (result._action) return `Action: ${result._action}`;
    const keys = Object.keys(result).slice(0, 3);
    if (!keys.length) return '';
    return keys.map((k) => `${k}=${String(result[k]).slice(0, 28)}`).join(' | ');
};

const ChatSidebar = ({ isMobileSheet = false }) => {
    const {
        settings,
        loadUserNotes, loadFiles, currentArticle,
        navigateRef, updateFlashcardProgress
    } = useApp();
    const {
        isChatOpen, toggleChat, chatMessages, addChatMessage, updateLastChatMessage,
        currentSessionId, chatSessions, createNewChatSession, loadChatSession, removeChatSession, flushChatSession
    } = useChat();
    const [input, setInput] = useState(() => localStorage.getItem('draft_chat_input') || '');
    const [isSending, setIsSending] = useState(false);
    const [imageAttachments, setImageAttachments] = useState([]);

    // Persist chat draft
    useEffect(() => {
        localStorage.setItem('draft_chat_input', input);
    }, [input]);

    // View Mode: 'chat' or 'history'
    const [viewMode, setViewMode] = useState('chat');
    // Chat Mode: 'chat' or 'agent'
    const [chatMode, setChatMode] = useState(() => localStorage.getItem('chat_mode') || 'chat');
    // Agent tool call status for visualization
    const [toolCalls, setToolCalls] = useState([]);
    // Collected actions from tool execution results
    const [pendingActions, setPendingActions] = useState([]);

    // Persist chat mode preference
    useEffect(() => {
        localStorage.setItem('chat_mode', chatMode);
    }, [chatMode]);

    // Suggestion State
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestionQuery, setSuggestionQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [cursorPosition, setCursorPosition] = useState(0);

    const STREAM_FLUSH_MS = 100;
    const messagesContainerRef = useRef(null);
    const inputRef = useRef(null);
    const imageInputRef = useRef(null);
    const streamTimerRef = useRef(null);
    const pendingStreamTextRef = useRef('');
    const autoScrollEnabledRef = useRef(true);

    const scrollToBottom = (behavior = 'auto') => {
        const container = messagesContainerRef.current;
        if (!container) return;
        container.scrollTo({ top: container.scrollHeight, behavior });
    };

    const updateAutoScrollState = () => {
        const container = messagesContainerRef.current;
        if (!container) return;
        const distance = container.scrollHeight - (container.scrollTop + container.clientHeight);
        autoScrollEnabledRef.current = distance < 120;
    };

    const scheduleStreamCommit = (fullText) => {
        pendingStreamTextRef.current = fullText;
        if (streamTimerRef.current) return;
        streamTimerRef.current = setTimeout(() => {
            streamTimerRef.current = null;
            updateLastChatMessage(pendingStreamTextRef.current, { persist: false });
            if (autoScrollEnabledRef.current) {
                scrollToBottom('auto');
            }
        }, STREAM_FLUSH_MS);
    };

    const flushStreamCommit = async (fullText, forceImmediate = false) => {
        if (streamTimerRef.current) {
            clearTimeout(streamTimerRef.current);
            streamTimerRef.current = null;
        }
        pendingStreamTextRef.current = fullText;
        updateLastChatMessage(fullText, { persist: true, immediate: true });
        if (autoScrollEnabledRef.current) {
            scrollToBottom('auto');
        }
        if (forceImmediate) {
            await flushChatSession();
        }
    };

    // Auto-scroll on new messages
    useEffect(() => {
        if (viewMode === 'chat' && autoScrollEnabledRef.current) {
            scrollToBottom('auto');
        }
    }, [chatMessages.length, isChatOpen, viewMode, toolCalls, pendingActions]);

    useEffect(() => {
        return () => {
            if (streamTimerRef.current) {
                clearTimeout(streamTimerRef.current);
                streamTimerRef.current = null;
            }
        };
    }, []);

    // Handle navigation from action buttons
    const handleNavigate = (target) => {
        if (navigateRef?.current) {
            navigateRef.current(target);
        }
        if (window.innerWidth < 768 && isChatOpen) {
            toggleChat();
        }
    };

    // Handle Input & Mentions
    const handleInputChange = (e) => {
        const val = e.target.value;
        const pos = e.target.selectionStart;
        setInput(val);
        setCursorPosition(pos);

        const lastAt = val.lastIndexOf('@', pos);
        if (lastAt !== -1 && lastAt < pos) {
            const charBefore = lastAt === 0 ? ' ' : val[lastAt - 1];
            if (charBefore === ' ' || charBefore === '\n') {
                const query = val.slice(lastAt + 1, pos);
                if (!query.includes(' ')) {
                    setSuggestionQuery(query);
                    setShowSuggestions(true);
                    fetchSuggestions(query);
                    return;
                }
            }
        }
        setShowSuggestions(false);
    };

    const fetchSuggestions = async (query) => {
        const q = query.toLowerCase();
        const options = [];

        if (currentArticle) {
            options.push({
                type: 'context', id: 'current', title: 'Current Article/Analysis',
                content: currentArticle, icon: Brain
            });
        }

        const notes = await loadUserNotes();
        notes.forEach(n => {
            options.push({ type: 'note', id: n.id, title: n.title, content: n.content, icon: NotebookPen });
        });

        const files = await loadFiles();
        files.forEach(f => {
            options.push({ type: 'file', id: f.id, title: f.name, data: f, icon: FileText });
        });

        setSuggestions(options.filter(o => o.title.toLowerCase().includes(q)));
    };

    const handleSelectSuggestion = async (item) => {
        let contentToInsert = "";

        if (item.type === 'file') {
            if (item.data.type.includes('text') || item.data.name.endsWith('.md')) {
                const text = await item.data.blob.text();
                contentToInsert = text;
            } else {
                contentToInsert = "[Binary File: " + item.title + "]";
            }
        } else {
            contentToInsert = item.content;
        }

        if (contentToInsert.length > 2000) contentToInsert = contentToInsert.slice(0, 2000) + "...(truncated)";

        const formatted = `\n> Ref **${item.title}**\n> ${contentToInsert}\n\n`;

        const before = input.slice(0, input.lastIndexOf('@', cursorPosition));
        const after = input.slice(cursorPosition);

        setInput(before + formatted + after);
        setShowSuggestions(false);
        inputRef.current?.focus();
    };

    const fileToDataUrl = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const appendImages = async (files) => {
        const imageFiles = (Array.from(files || [])).filter((f) => f.type?.startsWith('image/')).slice(0, 4);
        if (!imageFiles.length) return;
        try {
            const converted = await Promise.all(imageFiles.map(async (f) => ({
                id: crypto.randomUUID(),
                name: f.name || 'clipboard-image',
                dataUrl: await fileToDataUrl(f)
            })));
            setImageAttachments((prev) => [...prev, ...converted].slice(0, 4));
        } catch (e) {
            console.error(e);
        }
    };

    const removeImageAttachment = (id) => {
        setImageAttachments((prev) => prev.filter((x) => x.id !== id));
    };

    // Auto-resize textarea
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 192) + 'px';
        }
    }, [input]);

    const handleDirectMessage = async (msgText, attachments = []) => {
        const pureText = String(msgText || '').trim();
        if ((!pureText && attachments.length === 0) || isSending) return;

        let aiUserMessage = pureText || 'Please analyze the uploaded image content.';
        const uiUserMessage = attachments.length > 0
            ? `${aiUserMessage}\n\n[Attached images: ${attachments.length}]`
            : aiUserMessage;

        addChatMessage('user', uiUserMessage);
        setIsSending(true);
        setToolCalls([]);
        // Don't clear pending actions here if we want them to stay, but usually we do
        setPendingActions([]);

        try {
            if (attachments.length > 0) {
                try {
                    const summary = await analyzeImagesForChat(
                        attachments.map((x) => x.dataUrl),
                        settings,
                        'Please extract key text from the image and provide a concise summary for follow-up Q&A.'
                    );
                    if (summary?.trim()) {
                        aiUserMessage = `${aiUserMessage}\n\n[Image OCR Summary]\n${summary.trim()}`;
                    }
                } catch (e) {
                    aiUserMessage = `${aiUserMessage}\n\n[Image OCR failed: ${e.message}]`;
                }
            }

            if (!settings.apiKey) {
                setTimeout(() => {
                    addChatMessage('assistant', 'Please configure your API Key in Settings first.');
                    setIsSending(false);
                }, 1000);
                return;
            }

            const history = chatMessages.slice(-10)
                .filter(m => m.content && m.content.trim() !== '')  // Filter empty messages to avoid API 400
                .map(m => ({
                    role: m.role,
                    content: m.content
                }));
            history.push({ role: 'user', content: aiUserMessage });

            addChatMessage('assistant', '');

            if (chatMode === 'agent') {
                let fullResponse = "";
                const collectedActions = [];
                let planInjected = false;
                let contentDeltaSeen = false;

                await streamAgentChat(history, settings, (delta) => {
                    if (delta) {
                        contentDeltaSeen = true;
                    }
                    fullResponse += delta;
                    scheduleStreamCommit(fullResponse);
                }, (toolInfo) => {
                    if (toolInfo?.status === 'plan') {
                        const planText = String(toolInfo.planMarkdown || '').trim();
                        if (planText) {
                            if (!planInjected) {
                                fullResponse = `${planText}\n\n`;
                                planInjected = true;
                            } else if (!fullResponse.includes(planText)) {
                                fullResponse = `${planText}\n\n${fullResponse}`;
                            }
                            scheduleStreamCommit(fullResponse);
                        }
                        return;
                    }

                    setToolCalls(prev => {
                        const existing = prev.findIndex(t =>
                            (toolInfo.id && t.id && t.id === toolInfo.id) ||
                            (!toolInfo.id && t.name === toolInfo.name && t.status === 'calling')
                        );
                        if (existing >= 0) {
                            const updated = [...prev];
                            updated[existing] = { ...updated[existing], ...toolInfo };
                            return updated;
                        }
                        return [...prev, { ...toolInfo, createdAt: Date.now() }];
                    });

                    if (toolInfo.status === 'done' && toolInfo.result && toolInfo.result._action) {
                        collectedActions.push(toolInfo.result);
                    }
                });

                // Agent fallback: ensure user still gets feedback when model returns empty text
                if (!contentDeltaSeen) {
                    const fallbackMsg = collectedActions.length > 0
                        ? 'Done. I completed the requested action.'
                        : 'Done. What should I help with next?'
                    const merged = planInjected && fullResponse.trim()
                        ? `${fullResponse}${fallbackMsg}`
                        : fallbackMsg;
                    await flushStreamCommit(merged, true);
                } else {
                    await flushStreamCommit(fullResponse, true);
                }

                if (collectedActions.length > 0) {
                    setPendingActions(collectedActions);
                }
            } else {
                let fullResponse = "";
                await streamChatMessage(history, settings, (delta) => {
                    fullResponse += delta;
                    scheduleStreamCommit(fullResponse);
                });

                // Normal chat fallback
                if (!fullResponse.trim()) {
                    await flushStreamCommit('AI returned an empty response. Please try again.', true);
                } else {
                    await flushStreamCommit(fullResponse, true);
                }
            }

        } catch (error) {
            await flushStreamCommit(`Error: ${error.message}`, true);
        } finally {
            await flushChatSession();
            setIsSending(false);
        }
    };

    const handleSend = () => {
        if ((!input.trim() && imageAttachments.length === 0) || isSending) return;
        const userMsg = input.trim();
        const attachments = imageAttachments;
        setInput('');
        setImageAttachments([]);
        handleDirectMessage(userMsg, attachments);
    };


    // Resizable Logic
    const [width, setWidth] = useState(400);
    const [isResizing, setIsResizing] = useState(false);
    const sidebarRef = useRef(null);

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizing) return;
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth > 300 && newWidth < 800) {
                setWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    return (
        <div
            ref={sidebarRef}
            style={{ width: isMobileSheet ? '100%' : (isChatOpen ? width : 0) }}
            className={`transition-all duration-300 flex flex-col h-full shrink-0 relative ${
                isMobileSheet 
                ? 'w-full h-full bg-transparent' 
                : `glass-sidebar ${isChatOpen ? 'translate-x-0' : 'translate-x-full border-l-0 overflow-hidden opacity-0'}`
            }`}
        >
            {/* Resize Handle */}
            {!isMobileSheet && (
                <div
                    onMouseDown={(e) => {
                        setIsResizing(true);
                        e.stopPropagation();
                    }}
                    className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-indigo-500/20 z-50 transition-colors"
                    title="Drag to resize"
                />
            )}

            {/* Header */}
            <div className={`h-14 flex items-center justify-between px-4 border-b border-phy-border shrink-0 ${isMobileSheet ? 'bg-transparent' : 'bg-phy-glassHeavy/50 backdrop-blur-md'}`}>
                <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${chatMode === 'agent' ? 'bg-amber-100 text-amber-600 shadow-sm' : 'bg-indigo-100 text-indigo-600 shadow-sm'}`}>
                        {chatMode === 'agent' ? <Zap size={18} /> : <Bot size={18} />}
                    </div>
                    <div className="flex flex-col -space-y-0.5">
                        <span className="text-sm font-bold text-phy-text">{chatMode === 'agent' ? 'AI Agent' : 'AI Tutor'}</span>
                        <span className="text-[10px] text-phy-muted font-medium uppercase tracking-wider">
                            {chatMode === 'agent' ? '鍏ㄨ兘鍔╂墜' : '瀛︿範瀵艰埅'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    {/* Mode Toggle */}
                    <div className="flex bg-phy-glassHeavy/80 p-0.5 rounded-lg border border-phy-border shadow-inner">
                        <button
                            onClick={() => setChatMode('chat')}
                            className={`px-2 py-1 flex items-center gap-1.5 rounded-md transition-all ${chatMode === 'chat'
                                ? 'bg-phy-accent text-white shadow-sm'
                                : 'text-phy-muted hover:text-phy-text'
                                }`}
                            title="瀵煎笀妯″紡"
                        >
                            <MessageCircle size={14} />
                            <span className="text-[11px] font-bold">鑱婂ぉ</span>
                        </button>
                        <button
                            onClick={() => setChatMode('agent')}
                            className={`px-2 py-1 flex items-center gap-1.5 rounded-md transition-all ${chatMode === 'agent'
                                ? 'bg-phy-accent text-white shadow-sm'
                                : 'text-phy-muted hover:text-phy-text'
                                }`}
                            title="Agent mode"
                        >
                            <Zap size={14} />
                            <span className="text-[11px] font-bold">Agent</span>
                        </button>
                    </div>

                    <div className="w-px h-4 bg-phy-border mx-0.5" />

                    <button
                        onClick={() => setViewMode(prev => prev === 'chat' ? 'history' : 'chat')}
                        className={`p-1.5 rounded-lg transition-colors ${viewMode === 'history' ? 'bg-phy-accentGlass text-phy-accent' : 'hover:bg-phy-glassHeavy text-phy-muted'}`}
                        title="瀵硅瘽鍘嗗彶"
                    >
                        <History size={18} />
                    </button>

                    <button
                        onClick={toggleChat}
                        className="p-1.5 hover:bg-phy-glassHeavy rounded-lg text-phy-muted transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Content: Switch between Chat and History */}
            {viewMode === 'history' ? (
                // --- History View ---
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    <button
                        onClick={() => {
                            createNewChatSession();
                            setViewMode('chat');
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-phy-glass border border-dashed border-indigo-300 text-indigo-600 rounded-xl hover:bg-indigo-50 transition-colors font-bold text-sm shadow-sm"
                    >
                        <Plus size={16} /> Start New Chat
                    </button>

                    <div className="text-xs font-bold text-phy-muted uppercase tracking-wider mt-4 px-2">Recent Chats</div>

                    {(!chatSessions || chatSessions.length === 0) && (
                        <div className="text-center py-8 text-phy-muted text-sm italic">No chat history yet.</div>
                    )}

                    {(chatSessions || []).map(session => (
                        <div key={session.id} className="group relative">
                            <button
                                onClick={() => {
                                    loadChatSession(session);
                                    setViewMode('chat');
                                }}
                                className={`w-full text-left p-3 rounded-xl transition-all border ${currentSessionId === session.id
                                    ? 'bg-phy-glass border-phy-accent shadow-md ring-2 ring-phy-accent/20'
                                    : 'bg-phy-bg border-phy-border hover:border-phy-accentHover hover:bg-phy-glassHeavy'}`}
                            >
                                <div className="font-bold text-phy-text text-sm truncate pr-6">{session.title || "New chat"}</div>
                                <div className="text-[10px] text-phy-muted mt-1 flex justify-between items-center">
                                    <span>{new Date(session.updatedAt || Date.now()).toLocaleDateString()}</span>
                                    <span>{session.messages?.length || 0} messages</span>
                                </div>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm("纭畾瑕佸垹闄ゆ瀵硅瘽鍚楋紵")) removeChatSession(session.id);
                                }}
                                className="absolute right-2 top-3 p-1.5 text-phy-text hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                title="鍒犻櫎"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                // --- Chat View ---
                <>
                    <div
                        ref={messagesContainerRef}
                        onScroll={updateAutoScrollState}
                        className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
                    >
                        {chatMessages.length <= 1 && (
                            <div className="py-6 px-2 animate-fade-in">
                                <div className="text-center mb-8">
                                    <div className={`w-14 h-14 mx-auto flex items-center justify-center rounded-2xl mb-4 shadow-lg border border-phy-border ${
                                        chatMode === 'agent' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'
                                    }`}>
                                        {chatMode === 'agent' ? <Zap size={28} /> : <Bot size={28} />}
                                    </div>
                                    <h2 className="text-lg font-bold text-phy-text mb-1">
                                        {chatMode === 'agent' ? 'VerbaPath Agent' : 'VerbaPath Tutor'}
                                    </h2>
                                    <p className="text-xs text-phy-muted max-w-[240px] mx-auto leading-relaxed">
                                        {chatMode === 'agent'
                                            ? 'I can read your learning data and execute in-app actions for you.'
                                            : 'Ask me anything about grammar, vocabulary, and learning methods.'
                                        }
                                    </p>
                                </div>

                                {chatMode === 'agent' && (
                                    <div className="grid grid-cols-1 gap-2.5">
                                        {[
                                            { label: 'Generate daily plan', hint: 'Create a focused study schedule', cmd: 'Generate a practical daily study plan from my recent learning data.' },
                                            { label: 'Analyze flashcards', hint: 'Show stats and weak words', cmd: 'Show my flashcard stats and weak words.' },
                                            { label: 'Create deep note', hint: 'Deep note for "ephemeral"', cmd: 'Create a deep note for the word ephemeral and sync useful parts.' },
                                            { label: 'Reading quiz', hint: 'Build quiz from latest article', cmd: 'Create a reading quiz from my latest article.' },
                                            { label: 'Sentence practice', hint: 'Practice with difficult words', cmd: 'Create sentence practice using my recent difficult words.' }
                                        ].map((item, i) => (
                                            <button
                                                key={i}
                                                onClick={() => { handleDirectMessage(item.cmd); }}
                                                className="group w-full flex items-center gap-3 p-3 bg-phy-bg border border-phy-border rounded-xl hover:bg-phy-glassHeavy hover:border-phy-accent transition-all text-left shadow-sm"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-phy-glassHeavy flex items-center justify-center text-phy-muted group-hover:text-phy-accent group-hover:bg-phy-accentGlass transition-colors">
                                                    {i === 0 ? <Calendar size={16} /> : 
                                                     i === 1 ? <BarChart3 size={16} /> :
                                                     i === 2 ? <BookOpen size={16} /> :
                                                     i === 3 ? <FileText size={16} /> :
                                                     <PenTool size={16} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-bold text-phy-text truncate">{item.label}</div>
                                                    <div className="text-[10px] text-phy-muted truncate">{item.hint}</div>
                                                </div>
                                                <ChevronRight size={14} className="text-phy-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {chatMessages.map((msg, idx) => (
                            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-phy-glassHeavy text-phy-accent border border-phy-border`}>
                                    {msg.role === 'user' ? <User size={14} /> :
                                        chatMode === 'agent' ? <Zap size={14} /> : <Bot size={14} />}
                                </div>
                                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                                    ? 'bg-phy-accent text-white rounded-br-none shadow-sm shadow-phy-accent/20 border border-phy-accentHover'
                                    : 'glass-panel text-phy-text rounded-bl-none'
                                    }`}>
                                    {msg.role === 'user' ? (
                                        msg.content
                                    ) : (
                                        <SharedMarkdown
                                            content={msg.content}
                                            className="break-words"
                                        />
                                    )}
                                </div>
                            </div>
                        ))}

                                                {/* Tool Call Visualization (Agent Mode) */}
                        {chatMode === 'agent' && toolCalls.length > 0 && (
                            <div className="mx-2 p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2 animate-fade-in">
                                <div className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                                    <Database size={12} />
                                    {isSending ? 'Agent tool calls running...' : 'Latest Agent tool calls'}
                                </div>
                                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                                    {toolCalls.map((tc, i) => {
                                        const toolInfo = TOOL_LABELS[tc.name] || { label: tc.name, icon: '*' };
                                        const argsText = formatToolArgs(tc.args);
                                        const resultText = summarizeToolResult(tc);
                                        const isError = tc.status === 'error';
                                        return (
                                            <div key={`${tc.id || tc.name}-${i}`} className="rounded-lg border border-amber-200/80 bg-white/70 px-2.5 py-2 text-xs text-amber-700 space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span>{toolInfo.icon}</span>
                                                    <span className="font-semibold">{toolInfo.label}</span>
                                                    <span className="text-[10px] text-amber-500 font-mono">{tc.name}</span>
                                                    {tc.status === 'calling' ? (
                                                        <Loader2 size={12} className="animate-spin ml-auto text-amber-400" />
                                                    ) : isError ? (
                                                        <X size={12} className="ml-auto text-red-500" />
                                                    ) : (
                                                        <CheckCircle2 size={12} className="ml-auto text-green-500" />
                                                    )}
                                                </div>
                                                {argsText && (
                                                    <div className="text-[10px] text-amber-700/90">
                                                        Args: {argsText}
                                                    </div>
                                                )}
                                                {resultText && (
                                                    <div className={`text-[10px] ${isError ? 'text-red-600' : 'text-emerald-700'}`}>
                                                        {resultText}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Action Card (After Agent finishes, show clickable navigation buttons) */}
                        {!isSending && pendingActions.length > 0 && (
                            <div className="mx-2 p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl space-y-3 animate-fade-in">
                                <div className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                                    <CheckCircle2 size={14} />
                                    浠诲姟宸插畬鎴愩€傝鐐瑰嚮涓嬫柟鐩爣鍓嶅線鏌ョ湅锛?
                                </div>
                                <div className="space-y-2">
                                    {pendingActions.map((action, i) => {
                                        if (action._action === 'chat_quiz') {
                                            return (
                                                <ChatQuizWidget
                                                    key={i}
                                                    data={action}
                                                    onAnswer={(selected, isCorrect, feedbackMsg) => {
                                                        handleDirectMessage(feedbackMsg);
                                                    }}
                                                />
                                            );
                                        }

                                        if (action._action === 'chat_flashcard_review') {
                                            return (
                                                <ChatFlashcardWidget
                                                    key={i}
                                                    cards={action.cards}
                                                    onReview={(cardId, quality) => {
                                                        updateFlashcardProgress(cardId, quality);
                                                    }}
                                                    onComplete={(feedbackMsg) => {
                                                        handleDirectMessage(feedbackMsg);
                                                    }}
                                                />
                                            );
                                        }

                                        if (action._action === 'chat_writing') {
                                            return (
                                                <ChatWritingWidget
                                                    key={i}
                                                    sentences={action.sentences}
                                                    onSubmit={(feedbackMsg) => {
                                                        handleDirectMessage(feedbackMsg);
                                                    }}
                                                />
                                            );
                                        }

                                        // Handle action cards from tools
                                        const viewId = action._navigateTo;
                                        if (!viewId) {
                                            // Ignore actions that only return status without navigation target
                                            return null;
                                        }
                                        const info = VIEW_INFO[viewId] || { label: viewId, icon: Brain, color: 'text-phy-muted bg-phy-bg border-phy-border' };
                                        const Icon = info.icon;

                                        return (
                                            <button
                                                key={i}
                                                onClick={() => handleNavigate(
                                                    action._navigateToParams
                                                        ? { view: viewId, params: action._navigateToParams }
                                                        : viewId
                                                )}
                                                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-md hover:scale-[1.01] active:scale-[0.99] ${info.color}`}
                                            >
                                                <div className="p-1.5 rounded-lg bg-white/80 shadow-sm">
                                                    <Icon size={16} />
                                                </div>
                                                <div className="flex-1 text-left">
                                                    <div className="font-bold text-sm">{info.label}</div>
                                                    <div className="text-[11px] opacity-70 truncate">
                                                        {action.message || action._action}
                                                    </div>
                                                </div>
                                                <ChevronRight size={16} className="opacity-40" />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {isSending && chatMessages[chatMessages.length - 1]?.content === "" && (
                            <div className="flex gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border border-phy-border bg-phy-glass text-phy-accent`}>
                                    {chatMode === 'agent' ? <Zap size={14} /> : <Bot size={14} />}
                                </div>
                                <Loader2 size={16} className="animate-spin text-phy-accent mt-2" />
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <div 
                        className="p-3 md:p-4 bg-phy-glassHeavy border-t border-phy-border relative shrink-0"
                        style={{ paddingBottom: isMobileSheet ? 'calc(1rem + env(safe-area-inset-bottom, 0px))' : undefined }}
                    >
                        {/* Context Menu Suggestion UI */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute bottom-full left-4 right-4 mb-2 bg-phy-glass rounded-xl shadow-2xl border border-phy-border overflow-hidden max-h-60 overflow-y-auto animate-fade-in z-50">
                                <div className="px-3 py-2 bg-phy-bg border-b border-phy-border text-xs font-bold text-phy-muted uppercase tracking-wider">
                                    寮曠敤涓婁笅鏂?
                                </div>
                                {suggestions.map((item, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleSelectSuggestion(item)}
                                        className="w-full text-left px-4 py-3 hover:bg-indigo-50 flex items-center gap-3 transition-colors border-b border-slate-50 last:border-0"
                                    >
                                        <div className={`p-1.5 rounded-lg ${item.type === 'context' ? 'bg-purple-100 text-purple-600' :
                                            item.type === 'note' ? 'bg-blue-100 text-blue-600' :
                                                'bg-phy-bg text-phy-muted'
                                            }`}>
                                            <item.icon size={16} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm text-phy-text truncate">{item.title}</div>
                                            <div className="text-xs text-phy-muted truncate max-w-[200px]">
                                                {item.type.toUpperCase()}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {imageAttachments.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-2">
                                {imageAttachments.map((img) => (
                                    <div key={img.id} className="relative rounded-lg overflow-hidden border border-phy-border bg-phy-bg">
                                        <img src={img.dataUrl} alt={img.name} className="w-14 h-14 object-cover" />
                                        <button
                                            onClick={() => removeImageAttachment(img.id)}
                                            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center"
                                            title="绉婚櫎"
                                        >
                                            脳
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="relative">
                            <input
                                ref={imageInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={async (e) => {
                                    await appendImages(e.target.files);
                                    e.target.value = '';
                                }}
                            />
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={handleInputChange}
                                onPaste={async (e) => {
                                    const items = Array.from(e.clipboardData?.items || []);
                                    const imageFiles = items
                                        .filter((it) => it.type?.startsWith('image/'))
                                        .map((it) => it.getAsFile())
                                        .filter(Boolean);
                                    if (imageFiles.length > 0) {
                                        e.preventDefault();
                                        await appendImages(imageFiles);
                                    }
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        if (showSuggestions && suggestions.length > 0) {
                                            e.preventDefault();
                                            handleSelectSuggestion(suggestions[0]);
                                            return;
                                        }
                                        e.preventDefault();
                                        handleSend();
                                    }
                                    if (e.key === 'Escape') setShowSuggestions(false);
                                }}
                                placeholder={chatMode === 'agent' ? 'Ask the Agent to read data and do actions (create/edit/delete/navigate)...' : 'Ask me anything... (use @ to reference context)'}
                                className={`w-full bg-phy-glass border border-phy-border rounded-xl pl-4 pr-20 py-3 text-sm text-phy-text focus:bg-phy-glassHeavy focus:border-phy-accent focus:ring-4 focus:ring-phy-accentGlass outline-none transition-all resize-none min-h-[56px] max-h-48 overflow-y-auto`}
                            />
                            <button
                                onClick={() => imageInputRef.current?.click()}
                                className="absolute right-11 top-2 p-2 text-phy-muted hover:text-phy-text hover:bg-phy-glassHeavy rounded-lg transition-colors"
                                title="Upload image or paste screenshot"
                            >
                                <ImagePlus size={16} />
                            </button>
                            <button
                                onClick={handleSend}
                                disabled={(!input.trim() && imageAttachments.length === 0) || isSending}
                                className={`absolute right-2 top-2 p-2 text-white bg-phy-accent hover:bg-phy-accentHover rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md shadow-phy-accent/20 border border-phy-accentHover`}
                            >
                                <Send size={16} />
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default ChatSidebar;



