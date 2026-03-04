import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { X, Send, Bot, User, Loader2, FileText, NotebookPen, Brain, History, Plus, Trash2, MessageSquare, Zap, MessageCircle, Database, CheckCircle2, ChevronRight, Layers, PenTool, Mic, BookOpen } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { streamChatMessage, streamAgentChat } from '../services/ai';
import ChatQuizWidget from './ChatQuizWidget';
import ChatFlashcardWidget from './ChatFlashcardWidget';
import ChatWritingWidget from './ChatWritingWidget';

// Tool name -> display label mapping
const TOOL_LABELS = {
    get_flashcard_stats: { label: '词汇统计', icon: '🃏' },
    get_study_history: { label: '学习历史', icon: '📖' },
    get_notes_summary: { label: '笔记列表', icon: '📝' },
    get_study_logs: { label: '学习日志', icon: '📊' },
    get_user_goal: { label: '学习目标', icon: '🎯' },
    get_drill_performance: { label: '练习表现', icon: '💪' },
    get_writing_history: { label: '写作记录', icon: '✍️' },
    get_highlights: { label: '每日精选', icon: '⭐' },
    get_tasks: { label: '待办任务', icon: '📋' },
    create_flashcards: { label: '创建闪卡', icon: '🃏' },
    create_note: { label: '生成笔记', icon: '📝' },
    create_writing_task: { label: '布置写作', icon: '✍️' },
    create_coach_topic: { label: '设置口语', icon: '🎤' },
    navigate_to: { label: '跳转页面', icon: '🔗' },
    review_flashcards: { label: '抽取复习卡', icon: '🃏' },
    create_interactive_quiz: { label: '发起测验', icon: '🎯' },
};

// View ID -> display info
const VIEW_INFO = {
    flashcards: { label: '闪卡复习', icon: Layers, color: 'text-violet-600 bg-violet-50 border-violet-200' },
    writer: { label: '写作工作台', icon: PenTool, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    coach: { label: '口语教练', icon: Mic, color: 'text-green-600 bg-green-50 border-green-200' },
    notes: { label: '笔记本', icon: NotebookPen, color: 'text-amber-600 bg-amber-50 border-amber-200' },
    study: { label: '阅读分析', icon: BookOpen, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
    exam: { label: '模拟考场', icon: FileText, color: 'text-red-600 bg-red-50 border-red-200' },
    plan: { label: '智能计划', icon: Brain, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
    dashboard: { label: '工作台', icon: Brain, color: 'text-slate-600 bg-slate-50 border-slate-200' },
    knowledge: { label: '知识图谱', icon: Brain, color: 'text-purple-600 bg-purple-50 border-purple-200' },
};

const ChatSidebar = () => {
    const {
        isChatOpen, toggleChat, chatMessages, addChatMessage, updateLastChatMessage, settings,
        loadUserNotes, loadFiles, currentArticle, currentSessionId, chatSessions, createNewChatSession, loadChatSession, removeChatSession,
        navigateRef, updateFlashcardProgress
    } = useApp();
    const [input, setInput] = useState(() => localStorage.getItem('draft_chat_input') || '');
    const [isSending, setIsSending] = useState(false);

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
        if (window.innerWidth < 768) {
            setIsChatOpen(false);
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

        const formatted = `\n> 📎 **${item.title}**\n> ${contentToInsert.replace(/\n/g, '\n> ')}\n\n`;

        const before = input.slice(0, input.lastIndexOf('@', cursorPosition));
        const after = input.slice(cursorPosition);

        setInput(before + formatted + after);
        setShowSuggestions(false);
        inputRef.current?.focus();
    };

    // Auto-resize textarea
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 192) + 'px';
        }
    }, [input]);

    const handleDirectMessage = async (msgText) => {
        if (!msgText.trim() || isSending) return;

        addChatMessage('user', msgText);
        setIsSending(true);
        setToolCalls([]);
        // Don't clear pending actions here if we want them to stay, but usually we do
        setPendingActions([]);

        try {
            if (!settings.apiKey) {
                setTimeout(() => {
                    addChatMessage('assistant', "请先在设置中配置你的 API Key。");
                    setIsSending(false);
                }, 1000);
                return;
            }

            const history = chatMessages.slice(-10)
                .filter(m => m.content && m.content.trim() !== '')  // 过滤空消息，防止 API 400
                .map(m => ({
                    role: m.role,
                    content: m.content
                }));
            history.push({ role: 'user', content: msgText });

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

                // 如果 Agent 只调用了工具没产生文字，给个兜底消息
                if (!fullResponse.trim()) {
                    const fallbackMsg = collectedActions.length > 0
                        ? '✅ 已完成，请查看下方的学习内容吧！'
                        : '🤔 处理完毕，还需要我做什么吗？';
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

                // 普通聊天也兜底，防止空消息
                if (!fullResponse.trim()) {
                    updateLastChatMessage('抱歉，AI 未能生成回复，请重试。');
                }
            }

        } catch (error) {
            updateLastChatMessage(`Error: ${error.message}`);
        } finally {
            setIsSending(false);
        }
    };

    const handleSend = () => {
        if (!input.trim() || isSending) return;
        const userMsg = input.trim();
        setInput('');
        handleDirectMessage(userMsg);
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
            className={`border-l border-slate-200 bg-white shadow-xl transition-all duration-300 flex flex-col h-full shrink-0 relative ${isChatOpen ? 'translate-x-0' : 'translate-x-full border-l-0 overflow-hidden opacity-0'
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
            <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 bg-slate-50/50 backdrop-blur-sm shrink-0">
                <div className="flex items-center gap-2 font-bold text-slate-800">
                    <div className={`p-1.5 rounded-lg ${chatMode === 'agent' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {chatMode === 'agent' ? <Zap size={18} /> : <Bot size={18} />}
                    </div>
                    <span>{chatMode === 'agent' ? 'AI Agent' : 'AI Tutor'}</span>
                </div>

                <div className="flex items-center gap-1">
                    {/* Mode Toggle */}
                    <div className="flex bg-slate-100 rounded-lg p-0.5 mr-1">
                        <button
                            onClick={() => setChatMode('chat')}
                            className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${chatMode === 'chat'
                                ? 'bg-white text-indigo-600 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                            title="普通对话模式"
                        >
                            <MessageCircle size={14} className="inline mr-1" />
                            Chat
                        </button>
                        <button
                            onClick={() => setChatMode('agent')}
                            className={`px-2 py-1 rounded-md text-xs font-medium transition-all ${chatMode === 'agent'
                                ? 'bg-white text-amber-600 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                            title="Agent 模式 - AI 可读取并操作你的学习数据"
                        >
                            <Zap size={14} className="inline mr-1" />
                            Agent
                        </button>
                    </div>

                    {/* History Toggle */}
                    <button
                        onClick={() => setViewMode(prev => prev === 'chat' ? 'history' : 'chat')}
                        className={`p-2 rounded-lg transition-colors ${viewMode === 'history' ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-200 text-slate-500'}`}
                        title="Chat History"
                    >
                        {viewMode === 'history' ? <MessageSquare size={18} /> : <History size={18} />}
                    </button>

                    <button
                        onClick={toggleChat}
                        className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors"
                    >
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Agent Mode Banner */}
            {chatMode === 'agent' && viewMode === 'chat' && (
                <div className="px-4 py-2 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 shrink-0">
                    <div className="flex items-center gap-2 text-xs text-amber-700">
                        <Database size={12} />
                        <span className="font-medium">Agent 模式</span>
                        <span className="text-amber-500">· 可读取数据 + 创建学习内容 + 一键跳转</span>
                    </div>
                </div>
            )}

            {/* Content: Switch between Chat and History */}
            {viewMode === 'history' ? (
                // --- History View ---
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
                    <button
                        onClick={() => {
                            createNewChatSession();
                            setViewMode('chat');
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-white border border-dashed border-indigo-300 text-indigo-600 rounded-xl hover:bg-indigo-50 transition-colors font-bold text-sm shadow-sm"
                    >
                        <Plus size={16} /> New Chat
                    </button>

                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-4 px-2">Recent Sessions</div>

                    {(!chatSessions || chatSessions.length === 0) && (
                        <div className="text-center py-8 text-slate-400 text-sm italic">No history found.</div>
                    )}

                    {(chatSessions || []).map(session => (
                        <div key={session.id} className="group relative">
                            <button
                                onClick={() => {
                                    loadChatSession(session);
                                    setViewMode('chat');
                                }}
                                className={`w-full text-left p-3 rounded-xl transition-all border ${currentSessionId === session.id
                                    ? 'bg-white border-indigo-500 shadow-md ring-2 ring-indigo-500/10'
                                    : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-sm'}`}
                            >
                                <div className="font-bold text-slate-700 text-sm truncate pr-6">{session.title || "New Chat"}</div>
                                <div className="text-[10px] text-slate-400 mt-1 flex justify-between items-center">
                                    <span>{new Date(session.updatedAt || Date.now()).toLocaleDateString()}</span>
                                    <span>{session.messages?.length || 0} msgs</span>
                                </div>
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm("Delete this chat?")) removeChatSession(session.id);
                                }}
                                className="absolute right-2 top-3 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
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
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 custom-scrollbar">
                        {/* Welcome / New Chat Hint */}
                        {chatMessages.length <= 1 && (
                            <div className="text-center py-8 opacity-60">
                                <div className={`w-16 h-16 ${chatMode === 'agent' ? 'bg-amber-50 text-amber-400' : 'bg-indigo-50 text-indigo-400'} rounded-2xl mx-auto flex items-center justify-center mb-3`}>
                                    {chatMode === 'agent' ? <Zap size={32} /> : <Bot size={32} />}
                                </div>
                                <p className="text-slate-500 text-sm">
                                    {chatMode === 'agent'
                                        ? '🔥 Max Mode — 给我单词/话题，我帮你准备全套学习材料'
                                        : 'Start a new conversation...'
                                    }
                                </p>
                                {chatMode === 'agent' && (
                                    <div className="mt-4 flex flex-wrap gap-2 justify-center px-4">
                                        {[
                                            '📊 分析我的学习状况',
                                            '📅 制定本周计划',
                                            '🔥 深度学习 ephemeral, serendipity',
                                            '📝 复习最近学过的内容',
                                        ].map((q, i) => (
                                            <button
                                                key={i}
                                                onClick={() => { setInput(q.replace(/^\S+\s/, '')); inputRef.current?.focus(); }}
                                                className="text-xs px-3 py-1.5 bg-white border border-amber-200 text-amber-700 rounded-full hover:bg-amber-50 transition-colors"
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
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'user' ? 'bg-slate-200 text-slate-500' :
                                    chatMode === 'agent' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'
                                    }`}>
                                    {msg.role === 'user' ? <User size={14} /> :
                                        chatMode === 'agent' ? <Zap size={14} /> : <Bot size={14} />}
                                </div>
                                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user'
                                    ? 'bg-slate-900 text-white rounded-br-none'
                                    : 'bg-white border border-slate-200 text-slate-700 shadow-sm rounded-bl-none'
                                    }`}>
                                    {msg.role === 'user' ? (
                                        msg.content
                                    ) : (
                                        <div className="prose prose-sm max-w-none prose-slate break-words" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                                                    ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2" {...props} />,
                                                    ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2" {...props} />,
                                                    li: ({ node, ...props }) => <li className="mb-1" {...props} />,
                                                    strong: ({ node, ...props }) => <strong className="font-bold text-slate-900" {...props} />,
                                                    h3: ({ node, ...props }) => <h3 className="text-sm font-bold text-slate-800 mt-3 mb-1" {...props} />,
                                                    h4: ({ node, ...props }) => <h4 className="text-sm font-semibold text-slate-700 mt-2 mb-1" {...props} />,
                                                    hr: () => <hr className="my-2 border-slate-200" />,
                                                    table: ({ node, ...props }) => (
                                                        <div className="overflow-x-auto my-2 rounded-lg border border-slate-200">
                                                            <table className="w-full text-xs" {...props} />
                                                        </div>
                                                    ),
                                                    thead: ({ node, ...props }) => <thead className="bg-slate-100" {...props} />,
                                                    tbody: ({ node, ...props }) => <tbody className="divide-y divide-slate-100" {...props} />,
                                                    tr: ({ node, ...props }) => <tr className="hover:bg-slate-50" {...props} />,
                                                    th: ({ node, ...props }) => <th className="px-2 py-1.5 text-left font-semibold text-slate-700 whitespace-nowrap" {...props} />,
                                                    td: ({ node, ...props }) => <td className="px-2 py-1.5 text-slate-600" {...props} />,
                                                    code: ({ node, inline, className, children, ...props }) => {
                                                        return inline ?
                                                            <code className="bg-slate-100 px-1 py-0.5 rounded text-xs font-mono text-pink-600" {...props}>{children}</code> :
                                                            <code className="block bg-slate-900 text-slate-50 p-3 rounded-lg text-xs font-mono my-2 overflow-x-auto" {...props}>{children}</code>
                                                    }
                                                }}
                                            >
                                                {msg.content}
                                            </ReactMarkdown>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Tool Call Visualization (Agent Mode) */}
                        {isSending && chatMode === 'agent' && toolCalls.length > 0 && (
                            <div className="mx-2 p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2 animate-fade-in">
                                <div className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                                    <Database size={12} />
                                    Agent 正在工作...
                                </div>
                                {toolCalls.map((tc, i) => {
                                    const toolInfo = TOOL_LABELS[tc.name] || { label: tc.name, icon: '🔧' };
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
                                    学习套餐已准备好！点击跳转开始学习：
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

                                        // 导航类 action cards（创建闪卡、笔记、写作、口语等）
                                        const viewId = action._navigateTo;
                                        if (!viewId) {
                                            // 没有导航目标的 action（如 no_cards），不渲染卡片
                                            return null;
                                        }
                                        const info = VIEW_INFO[viewId] || { label: viewId, icon: Brain, color: 'text-slate-600 bg-slate-50 border-slate-200' };
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
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${chatMode === 'agent' ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600'
                                    }`}>
                                    {chatMode === 'agent' ? <Zap size={14} /> : <Bot size={14} />}
                                </div>
                                <Loader2 size={16} className="animate-spin text-slate-400 mt-2" />
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-4 bg-white border-t border-slate-100 relative shrink-0">
                        {/* Context Menu Suggestion UI */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-60 overflow-y-auto animate-fade-in z-50">
                                <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-400 uppercase tracking-wider">
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
                                                'bg-slate-100 text-slate-600'
                                            }`}>
                                            <item.icon size={16} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm text-slate-700 truncate">{item.title}</div>
                                            <div className="text-xs text-slate-400 truncate max-w-[200px]">
                                                {item.type.toUpperCase()}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {chatMode === 'agent' && (
                            <button
                                onClick={() => handleDirectMessage("请根据我的学习历史和数据，为我生成一份今天的学习计划综合建议，包含复习和新知识学习。")}
                                className="mb-3 w-full py-2.5 bg-gradient-to-r from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-2"
                            >
                                <Zap size={14} className="text-orange-500" />
                                ✨ 智能生成今日学习计划 (Daily Plan)
                            </button>
                        )}

                        <div className="relative">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={handleInputChange}
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
                                placeholder={chatMode === 'agent' ? "给我几个单词或话题，我帮你准备全套学习..." : "Ask anything... (@ for context)"}
                                className={`w-full bg-slate-50 border rounded-xl pl-4 pr-12 py-3 text-sm text-slate-800 focus:bg-white focus:ring-4 outline-none transition-all resize-none min-h-[56px] max-h-48 overflow-y-auto ${chatMode === 'agent'
                                    ? 'border-amber-200 focus:border-amber-500 focus:ring-amber-500/10'
                                    : 'border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/10'
                                    }`}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || isSending}
                                className={`absolute right-2 top-2 p-2 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md ${chatMode === 'agent'
                                    ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'
                                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                                    }`}
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
