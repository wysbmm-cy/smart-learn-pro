import React, { useState, useRef, useEffect } from 'react';
import SharedMarkdown from './SharedMarkdown';
import { X, Send, Bot, User, Loader2, FileText, NotebookPen, Brain, History, Plus, Trash2, MessageSquare, Zap, MessageCircle, Database, CheckCircle2, ChevronRight, Layers, PenTool, Mic, BookOpen, ImagePlus } from 'lucide-react';
import { useApp } from '../context/AppContext';
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
    get_study_logs: { label: 'Study logs', icon: 'LOG' },
    get_user_goal: { label: 'User goal', icon: 'GOAL' },
    get_drill_performance: { label: 'Drill performance', icon: 'DRILL' },
    get_writing_history: { label: 'Writing history', icon: 'WRITE' },
    get_highlights: { label: 'Highlights', icon: 'MARK' },
    get_tasks: { label: 'Tasks', icon: 'TASK' },
    create_flashcards: { label: 'Create flashcards', icon: 'NEW' },
    update_flashcard: { label: 'Update flashcard', icon: 'EDIT' },
    delete_flashcards: { label: 'Delete flashcards', icon: 'DEL' },
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
};

// View ID -> display info
const VIEW_INFO = {
    flashcards: { label: 'Flashcards', icon: Layers, color: 'text-violet-600 bg-violet-50 border-violet-200' },
    writer: { label: 'Writer', icon: PenTool, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    coach: { label: 'Coach', icon: Mic, color: 'text-green-600 bg-green-50 border-green-200' },
    notes: { label: 'Notes', icon: NotebookPen, color: 'text-amber-600 bg-amber-50 border-amber-200' },
    study: { label: 'Study', icon: BookOpen, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
    exam: { label: 'Exam', icon: FileText, color: 'text-red-600 bg-red-50 border-red-200' },
    plan: { label: 'Plan', icon: Brain, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
    dashboard: { label: 'Dashboard', icon: Brain, color: 'text-phy-muted bg-phy-bg border-phy-border' },
    knowledge: { label: 'Knowledge Graph', icon: Brain, color: 'text-purple-600 bg-purple-50 border-purple-200' },
    review: { label: 'Review Center', icon: Brain, color: 'text-sky-600 bg-sky-50 border-sky-200' },
};

const ChatSidebar = () => {
    const {
        isChatOpen, toggleChat, chatMessages, addChatMessage, updateLastChatMessage, settings,
        loadUserNotes, loadFiles, currentArticle, currentSessionId, chatSessions, createNewChatSession, loadChatSession, removeChatSession,
        navigateRef, updateFlashcardProgress
    } = useApp();
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

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const imageInputRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // Auto-scroll on new messages
    useEffect(() => {
        if (viewMode === 'chat') scrollToBottom();
    }, [chatMessages, isChatOpen, viewMode, toolCalls, pendingActions]);

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

        let aiUserMessage = pureText || '请分析我上传的图片内容。';
        const uiUserMessage = attachments.length > 0
            ? `${aiUserMessage}\n\n[附加图片 ${attachments.length} 张]`
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
                        '请提取图片里的文字并给出简洁内容说明，方便后续英语学习问答。'
                    );
                    if (summary?.trim()) {
                        aiUserMessage = `${aiUserMessage}\n\n[图片识别结果]\n${summary.trim()}`;
                    }
                } catch (e) {
                    aiUserMessage = `${aiUserMessage}\n\n[图片识别失败：${e.message}]`;
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

                await streamAgentChat(history, settings, (delta) => {
                    fullResponse += delta;
                    updateLastChatMessage(fullResponse);
                    scrollToBottom();
                }, (toolInfo) => {
                    setToolCalls(prev => {
                        const existing = prev.findIndex(t => t.name === toolInfo.name && t.status === 'calling');
                        if (existing >= 0) {
                            const updated = [...prev];
                            updated[existing] = { ...updated[existing], status: toolInfo.status };
                            return updated;
                        }
                        return [...prev, toolInfo];
                    });

                    if (toolInfo.status === 'done' && toolInfo.result && toolInfo.result._action) {
                        collectedActions.push(toolInfo.result);
                    }
                });

                // Agent fallback: ensure user still gets feedback when model returns empty text
                if (!fullResponse.trim()) {
                    const fallbackMsg = collectedActions.length > 0
                        ? 'Done. I completed the requested action.'
                        : 'Done. What should I help with next?'
                    updateLastChatMessage(fallbackMsg);
                }

                if (collectedActions.length > 0) {
                    setPendingActions(collectedActions);
                }
            } else {
                let fullResponse = "";
                await streamChatMessage(history, settings, (delta) => {
                    fullResponse += delta;
                    updateLastChatMessage(fullResponse);
                    scrollToBottom();
                });

                // Normal chat fallback
                if (!fullResponse.trim()) {
                    updateLastChatMessage('AI returned an empty response. Please try again.');
                }
            }

        } catch (error) {
            updateLastChatMessage(`Error: ${error.message}`);
        } finally {
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
            style={{ width: isChatOpen ? width : 0 }}
            className={`glass-sidebar transition-all duration-300 flex flex-col h-full shrink-0 relative ${isChatOpen ? 'translate-x-0' : 'translate-x-full border-l-0 overflow-hidden opacity-0'
                }`}
        >
            {/* Resize Handle */}
            <div
                onMouseDown={(e) => {
                    setIsResizing(true);
                    e.stopPropagation();
                }}
                className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-indigo-500/20 z-50 transition-colors"
                title="Drag to resize"
            />

            {/* Header */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-phy-border bg-phy-glass-heavy shrink-0">
                <div className="flex items-center gap-2 font-bold text-phy-text">
                    <div className={`p-1.5 rounded-lg ${chatMode === 'agent' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {chatMode === 'agent' ? <Zap size={18} /> : <Bot size={18} />}
                    </div>
                    <span>{chatMode === 'agent' ? 'AI Agent' : 'AI Tutor'}</span>
                </div>

                <div className="flex items-center gap-1">
                    {/* Mode Toggle */}
                    <div className="flex bg-phy-glassHeavy rounded-lg p-0.5 mr-1 border border-phy-border">
                        <button
                            onClick={() => setChatMode('chat')}
                            className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${chatMode === 'chat'
                                ? 'bg-phy-accentGlass text-phy-accent shadow-sm border border-phy-borderHover'
                                : 'text-phy-muted hover:text-phy-text'
                                }`}
                            title="Normal chat mode"
                        >
                            <MessageCircle size={14} className="inline mr-1" />
                            Chat
                        </button>
                        <button
                            onClick={() => setChatMode('agent')}
                            className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${chatMode === 'agent'
                                ? 'bg-phy-accentGlass text-phy-accent shadow-sm border border-phy-borderHover'
                                : 'text-phy-muted hover:text-phy-text'
                                }`}
                            title="Agent mode with tool calls"
                        >
                            <Zap size={14} className="inline mr-1" />
                            Agent
                        </button>
                    </div>

                    {/* History Toggle */}
                    <button
                        onClick={() => setViewMode(prev => prev === 'chat' ? 'history' : 'chat')}
                        className={`p-2 rounded-lg transition-colors ${viewMode === 'history' ? 'bg-phy-accentGlass text-phy-accent' : 'hover:bg-phy-glassHeavy text-phy-muted'}`}
                        title="Chat History"
                    >
                        {viewMode === 'history' ? <MessageSquare size={18} /> : <History size={18} />}
                    </button>

                    <button
                        onClick={toggleChat}
                        className="p-2 hover:bg-phy-glassHeavy rounded-lg text-phy-muted transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Agent Mode Banner */}
            {chatMode === 'agent' && viewMode === 'chat' && (
                <div className="px-4 py-2 bg-phy-accent border-b border-phy-borderHover shrink-0 bg-opacity-10 backdrop-blur-sm">
                    <div className="flex items-center gap-2 text-xs text-phy-text font-bold">
                        <Database size={12} className="text-phy-accent" />
                        <span>Agent Mode</span>
                        <span className="opacity-70 font-normal">- read data, write actions, and navigate pages</span>
                    </div>
                </div>
            )}

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
                        <Plus size={16} /> New Chat
                    </button>

                    <div className="text-xs font-bold text-phy-muted uppercase tracking-wider mt-4 px-2">Recent Sessions</div>

                    {(!chatSessions || chatSessions.length === 0) && (
                        <div className="text-center py-8 text-phy-muted text-sm italic">No history found.</div>
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
                                <div className="font-bold text-phy-text text-sm truncate pr-6">{session.title || "New Chat"}</div>
                                <div className="text-[10px] text-phy-muted mt-1 flex justify-between items-center">
                                    <span>{new Date(session.updatedAt || Date.now()).toLocaleDateString()}</span>
                                    <span>{session.messages?.length || 0} msgs</span>
                                </div>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm("Delete this chat?")) removeChatSession(session.id);
                                }}
                                className="absolute right-2 top-3 p-1.5 text-phy-text hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                title="Delete"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                // --- Chat View ---
                <>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {/* Welcome / New Chat Hint */}
                        {chatMessages.length <= 1 && (
                            <div className="text-center py-8 opacity-60">
                                <div className={`w-16 h-16 bg-phy-glassHeavy text-phy-accent rounded-2xl mx-auto flex items-center justify-center mb-3 border border-phy-border`}>
                                    {chatMode === 'agent' ? <Zap size={32} /> : <Bot size={32} />}
                                </div>
                                <p className="text-phy-muted text-sm">
                                    {chatMode === 'agent'
                                        ? 'Agent mode: I can read your study data and take in-app actions for you.'
                                        : 'Start a new conversation...'
                                    }
                                </p>
                                {chatMode === 'agent' && (
                                    <div className="mt-4 flex flex-wrap gap-2 justify-center px-4">
                                        {[
                                            'Show my flashcard stats and weak words',
                                            'Generate a focused daily learning plan',
                                            'Generate deep notes for the word: ephemeral',
                                            'Create sentence practice with: ephemeral, serendipity',
                                            'Create a reading quiz from my latest article',
                                        ].map((q, i) => (
                                            <button
                                                key={i}
                                                onClick={() => { setInput(q.replace(/^\S+\s/, '')); inputRef.current?.focus(); }}
                                                className="text-xs px-3 py-1.5 bg-phy-bg border border-phy-border text-phy-text rounded-full hover:bg-phy-glassHeavy hover:border-phy-borderHover transition-colors"
                                            >
                                                {q}
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
                        {isSending && chatMode === 'agent' && toolCalls.length > 0 && (
                            <div className="mx-2 p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2 animate-fade-in">
                                <div className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                                    <Database size={12} />
                                    Agent is calling tools...
                                </div>
                                {toolCalls.map((tc, i) => {
                                    const toolInfo = TOOL_LABELS[tc.name] || { label: tc.name, icon: '*' };
                                    return (
                                        <div key={i} className="flex items-center gap-2 text-xs text-amber-600">
                                            <span>{toolInfo.icon}</span>
                                            <span>{toolInfo.label}</span>
                                            {tc.status === 'calling' ? (
                                                <Loader2 size={12} className="animate-spin ml-auto text-amber-400" />
                                            ) : (
                                                <CheckCircle2 size={12} className="ml-auto text-green-500" />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Action Card (After Agent finishes, show clickable navigation buttons) */}
                        {!isSending && pendingActions.length > 0 && (
                            <div className="mx-2 p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl space-y-3 animate-fade-in">
                                <div className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                                    <CheckCircle2 size={14} />
                                    Action completed. Open the destination to continue:
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
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-phy-glassHeavy border-t border-phy-border relative shrink-0">
                        {/* Context Menu Suggestion UI */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute bottom-full left-4 right-4 mb-2 bg-phy-glass rounded-xl shadow-2xl border border-phy-border overflow-hidden max-h-60 overflow-y-auto animate-fade-in z-50">
                                <div className="px-3 py-2 bg-phy-bg border-b border-phy-border text-xs font-bold text-phy-muted uppercase tracking-wider">
                                    Reference Context
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

                        {chatMode === 'agent' && (
                            <button
                                onClick={() => handleDirectMessage("Please generate a practical daily study plan based on my recent learning data, including review and new learning tasks.")}
                                className="mb-3 w-full py-2.5 bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-2"
                            >
                                <Zap size={14} className="text-orange-500" />
                                Generate Daily Plan (Agent)
                            </button>
                        )}

                        {imageAttachments.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-2">
                                {imageAttachments.map((img) => (
                                    <div key={img.id} className="relative rounded-lg overflow-hidden border border-phy-border bg-phy-bg">
                                        <img src={img.dataUrl} alt={img.name} className="w-14 h-14 object-cover" />
                                        <button
                                            onClick={() => removeImageAttachment(img.id)}
                                            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center"
                                            title="移除"
                                        >
                                            ×
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
                                placeholder={chatMode === 'agent' ? 'Ask the agent to read data and do actions (create/edit/delete/navigate)...' : 'Ask anything... (@ for context)'}
                                className={`w-full bg-phy-glass border border-phy-border rounded-xl pl-4 pr-20 py-3 text-sm text-phy-text focus:bg-phy-glassHeavy focus:border-phy-accent focus:ring-4 focus:ring-phy-accentGlass outline-none transition-all resize-none min-h-[56px] max-h-48 overflow-y-auto`}
                            />
                            <button
                                onClick={() => imageInputRef.current?.click()}
                                className="absolute right-11 top-2 p-2 text-phy-muted hover:text-phy-text hover:bg-phy-glassHeavy rounded-lg transition-colors"
                                title="上传图片或粘贴截图"
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


