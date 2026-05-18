import React, { useState, useRef, useEffect } from 'react';
import SharedMarkdown from './SharedMarkdown';
import { 
    X, Send, Bot, User, Loader2, FileText, NotebookPen, Brain, 
    History, Plus, Trash2, MessageSquare, Zap, MessageCircle, 
    Database, CheckCircle2, ChevronRight, Layers, PenTool, Mic, 
    BookOpen, ImagePlus, Calendar, BarChart3, ChevronDown, AlertTriangle, Square, CheckSquare } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useChat } from '../context/ChatContext';
import { analyzeImagesForChat, streamChatMessage, streamAgentChat } from '../services/ai';
import { AGENT_TOOLS } from '../services/agentTools';
import ChatQuizWidget from './ChatQuizWidget';
import ChatFlashcardWidget from './ChatFlashcardWidget';
import ChatWritingWidget from './ChatWritingWidget';

const TOOL_LABELS = {
    get_flashcard_stats: { label: '读取闪卡统计', icon: '统计' },
    get_study_history: { label: '读取学习历史', icon: '历史' },
    get_notes_summary: { label: '读取笔记摘要', icon: '笔记' },
    get_note_detail: { label: '读取笔记详情', icon: '笔记' },
    get_study_logs: { label: '读取学习日志', icon: '日志' },
    get_user_goal: { label: '读取学习目标', icon: '目标' },
    get_drill_performance: { label: '读取训练表现', icon: '训练' },
    get_current_reading_exam_article: { label: '读取阅读文章', icon: '阅读' },
    extract_reading_learning_points_preview: { label: '预览阅读学习点', icon: '提取' },
    get_writing_history: { label: '读取写作记录', icon: '写作' },
    list_writing_materials: { label: '读取写作素材', icon: '素材' },
    list_flashcard_folders: { label: '读取闪卡文件夹', icon: '文件夹' },
    list_flashcards: { label: '读取闪卡列表', icon: '闪卡' },
    organize_flashcards_to_note: { label: '闪卡整理成笔记', icon: '整理' },
    create_writing_material: { label: '创建素材', icon: '新建' },
    update_writing_material: { label: '更新素材', icon: '编辑' },
    upsert_writing_vocabulary: { label: '编辑词汇替换', icon: '词汇' },
    delete_writing_materials: { label: '删除素材', icon: '删除' },
    get_highlights: { label: '读取标记', icon: '标记' },
    get_tasks: { label: '读取任务', icon: '任务' },
    create_flashcards: { label: '创建闪卡', icon: '新卡' },
    update_flashcard: { label: '编辑闪卡', icon: '编辑' },
    delete_flashcards: { label: '删除指定闪卡', icon: '删除' },
    flashcard_batch_delete: { label: '批量删除闪卡', icon: '批删' },
    flashcard_batch_move_folder: { label: '批量移动闪卡', icon: '移动' },
    flashcard_batch_edit: { label: '批量编辑闪卡', icon: '批改' },
    flashcard_delete_by_rule: { label: '按规则删除闪卡', icon: '规则' },
    flashcard_undo_last_batch: { label: '撤销闪卡操作', icon: '撤销' },
    create_note: { label: '创建笔记', icon: '新建' },
    update_note: { label: '更新笔记', icon: '编辑' },
    delete_notes: { label: '删除笔记', icon: '删除' },
    create_task_item: { label: '创建任务', icon: '新建' },
    update_task_item: { label: '更新任务', icon: '编辑' },
    delete_task_items: { label: '删除任务', icon: '删除' },
    create_listening_audio: { label: '生成听力音频', icon: '听力' },
    create_writing_task: { label: '创建写作练习', icon: '写作' },
    create_coach_topic: { label: '创建口语主题', icon: '口语' },
    navigate_to: { label: '跳转页面', icon: '跳转' },
    review_flashcards: { label: '快速复习闪卡', icon: '复习' },
    create_interactive_quiz: { label: '创建互动测验', icon: '测验' },
    generate_deep_note: { label: '生成深度笔记', icon: '深笔' },
    note_create_deep_note: { label: '创建深度笔记', icon: '深笔' },
    note_append_today_folder: { label: '追加今日笔记', icon: '追加' },
    note_partial_sync_to_materials: { label: '同步笔记素材', icon: '同步' },
};

const VIEW_INFO = {
    flashcards: { label: '闪卡复习', icon: Layers, color: 'text-violet-600 bg-violet-50 border-violet-200' },
    writer: { label: 'AI 写作', icon: PenTool, color: 'text-blue-600 bg-blue-50 border-blue-200' },
    coach: { label: '口语教练', icon: Mic, color: 'text-green-600 bg-green-50 border-green-200' },
    notes: { label: '我的笔记', icon: NotebookPen, color: 'text-amber-600 bg-amber-50 border-amber-200' },
    study: { label: '词汇与阅读', icon: BookOpen, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
    exam: { label: '阅读与考试', icon: FileText, color: 'text-red-600 bg-red-50 border-red-200' },
    listening: { label: '听力实验室', icon: BookOpen, color: 'text-teal-600 bg-teal-50 border-teal-200' },
    plan: { label: '学习计划', icon: Brain, color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
    dashboard: { label: '工作台', icon: Brain, color: 'text-phy-muted bg-phy-bg border-phy-border' },
    knowledge: { label: '知识图谱', icon: Brain, color: 'text-purple-600 bg-purple-50 border-purple-200' },
    review: { label: '复习中心', icon: Brain, color: 'text-sky-600 bg-sky-50 border-sky-200' },
};

const AGENT_TOOL_FLOW_STORAGE_KEY = 'verbapath_agent_tool_flows_v1';

const BUILTIN_AGENT_TOOL_FLOWS = [
    {
        id: 'builtin_vocab_to_assets',
        name: '单词到学习资产',
        description: '创建闪卡，挑选重点词生成深度笔记，再同步到写作/翻译素材。',
        source: 'builtin',
        tools: [
            { toolName: 'create_flashcards', defaultParams: {} },
            { toolName: 'note_create_deep_note', defaultParams: { syncToWriting: false, syncToTranslation: false } },
            { toolName: 'note_partial_sync_to_materials', defaultParams: { toWriting: true, toTranslation: true, maxItems: 20 } }
        ]
    },
    {
        id: 'builtin_flashcards_review_note',
        name: '闪卡整理复盘',
        description: '读取闪卡，整理成复盘笔记，并追加到今日笔记。',
        source: 'builtin',
        tools: [
            { toolName: 'list_flashcards', defaultParams: { limit: 20 } },
            { toolName: 'organize_flashcards_to_note', defaultParams: { mode: 'append' } },
            { toolName: 'note_append_today_folder', defaultParams: { heading: '闪卡复盘', syncKnowledge: true } }
        ]
    },
    {
        id: 'builtin_writing_materials',
        name: '写作素材整理',
        description: '沉淀写作素材，并生成可练习的句子写作任务。',
        source: 'builtin',
        tools: [
            { toolName: 'create_writing_material', defaultParams: { source: 'agent_flow' } },
            { toolName: 'create_writing_task', defaultParams: {} }
        ]
    }
];

const normalizeAgentToolFlow = (flow = {}, source = 'saved') => ({
    id: String(flow.id || `flow_${Date.now()}`),
    name: String(flow.name || '未命名流程'),
    description: String(flow.description || ''),
    source: flow.source || source,
    tools: Array.isArray(flow.tools)
        ? flow.tools
            .map((item) => ({
                toolName: String(item.toolName || item.name || '').trim(),
                defaultParams: item.defaultParams && typeof item.defaultParams === 'object' ? item.defaultParams : {}
            }))
            .filter((item) => item.toolName)
        : [],
    createdAt: flow.createdAt || Date.now(),
    updatedAt: flow.updatedAt || Date.now()
});

const loadSavedAgentToolFlows = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(AGENT_TOOL_FLOW_STORAGE_KEY) || '[]');
        return Array.isArray(parsed)
            ? parsed.map((item) => normalizeAgentToolFlow(item, 'saved')).filter((item) => item.tools.length)
            : [];
    } catch {
        return [];
    }
};

const saveAgentToolFlows = (flows = []) => {
    localStorage.setItem(AGENT_TOOL_FLOW_STORAGE_KEY, JSON.stringify(flows));
};

const getFlowToolsText = (flow = {}) => (flow.tools || [])
    .map((item) => TOOL_LABELS[item.toolName]?.label || item.toolName)
    .join(' → ');

const getAgentToolOptions = () => AGENT_TOOLS.map((tool) => {
    const name = tool?.function?.name || '';
    const meta = TOOL_LABELS[name] || { label: name, icon: '工具' };
    return {
        name,
        label: meta.label || name,
        icon: meta.icon || '工具',
        description: tool?.function?.description || '',
        isRisky: /delete|batch_delete/.test(name)
    };
}).filter((item) => item.name);

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

const getPlanStepStyle = (status) => {
    if (status === 'running') return 'border-amber-300/40 bg-amber-500/10 text-amber-200';
    if (status === 'done') return 'border-emerald-300/35 bg-emerald-500/10 text-emerald-200';
    if (status === 'error') return 'border-red-300/35 bg-red-500/10 text-red-200';
    return 'border-phy-border bg-phy-bg/70 text-phy-muted';
};

const getPlanStepLabel = (status) => {
    if (status === 'running') return '执行中';
    if (status === 'done') return '完成';
    if (status === 'error') return '失败';
    return '等待';
};

const isRiskyTool = (name = '', riskLevel = '') => riskLevel === 'high' || /delete|batch_delete/.test(name);

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
    const [agentPlan, setAgentPlan] = useState(null);
    const [expandedPlanSteps, setExpandedPlanSteps] = useState({});
    const [showToolLog, setShowToolLog] = useState(false);
    const [savedToolFlows, setSavedToolFlows] = useState(loadSavedAgentToolFlows);
    const [selectedToolFlow, setSelectedToolFlow] = useState(null);
    const [showSlashMenu, setShowSlashMenu] = useState(false);
    const [slashQuery, setSlashQuery] = useState('');
    const [showSaveFlowForm, setShowSaveFlowForm] = useState(false);
    const [flowNameDraft, setFlowNameDraft] = useState('');
    const [flowDescriptionDraft, setFlowDescriptionDraft] = useState('');
    // Collected actions from tool execution results
    const [pendingActions, setPendingActions] = useState([]);

    // Persist chat mode preference
    useEffect(() => {
        localStorage.setItem('chat_mode', chatMode);
        if (chatMode !== 'agent') {
            setShowSlashMenu(false);
            setSelectedToolFlow(null);
        }
    }, [chatMode]);

    useEffect(() => {
        saveAgentToolFlows(savedToolFlows);
    }, [savedToolFlows]);

    useEffect(() => {
        if (!showSlashMenu) return;
        setSavedToolFlows(loadSavedAgentToolFlows());
    }, [showSlashMenu]);

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
    }, [chatMessages.length, isChatOpen, viewMode, toolCalls, pendingActions, agentPlan]);

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

        if (chatMode === 'agent') {
            const lastSlash = val.lastIndexOf('/', pos);
            if (lastSlash !== -1 && lastSlash < pos) {
                const charBeforeSlash = lastSlash === 0 ? ' ' : val[lastSlash - 1];
                const query = val.slice(lastSlash + 1, pos);
                if ((charBeforeSlash === ' ' || charBeforeSlash === '\n') && !query.includes(' ') && !query.includes('\n')) {
                    setSlashQuery(query);
                    setShowSlashMenu(true);
                    setShowSuggestions(false);
                    return;
                }
            }
        }
        setShowSlashMenu(false);

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

    const getVisibleToolFlows = () => {
        const q = slashQuery.trim().toLowerCase();
        return [...savedToolFlows, ...BUILTIN_AGENT_TOOL_FLOWS].filter((flow) => {
            if (!q) return true;
            const hay = `${flow.name} ${flow.description} ${getFlowToolsText(flow)}`.toLowerCase();
            return hay.includes(q);
        });
    };

    const getVisibleAgentTools = () => {
        const q = slashQuery.trim().toLowerCase();
        return getAgentToolOptions().filter((tool) => {
            if (!q) return true;
            return `${tool.name} ${tool.label} ${tool.description}`.toLowerCase().includes(q);
        });
    };

    const handleSelectToolFlow = (flow) => {
        const normalized = normalizeAgentToolFlow(flow, flow.source || 'builtin');
        const before = input.slice(0, input.lastIndexOf('/', cursorPosition));
        const after = input.slice(cursorPosition);
        setInput(`${before}${after}`.trimStart());
        setSelectedToolFlow(normalized);
        setShowSlashMenu(false);
        setShowSaveFlowForm(false);
        setFlowNameDraft(normalized.name);
        setFlowDescriptionDraft(normalized.description || '');
        inputRef.current?.focus();
    };

    const handleSelectAgentTool = (toolName) => {
        const before = input.slice(0, input.lastIndexOf('/', cursorPosition));
        const after = input.slice(cursorPosition);
        setInput(`${before}${after}`.trimStart());
        setSelectedToolFlow((current) => {
            const base = current?.tools?.length
                ? current
                : {
                    id: `custom_flow_${Date.now()}`,
                    name: '自定义工具流程',
                    description: '用户通过 / 自主选择工具顺序。',
                    source: 'custom',
                    tools: [],
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
            const next = normalizeAgentToolFlow({
                ...base,
                id: base.id || `custom_flow_${Date.now()}`,
                name: base.source === 'saved' ? `${base.name} 副本` : base.name,
                source: 'custom',
                description: base.description || '用户通过 / 自主选择工具顺序。',
                tools: [...(base.tools || []), { toolName, defaultParams: {} }],
                updatedAt: Date.now()
            }, 'custom');
            setFlowNameDraft(next.name);
            setFlowDescriptionDraft(next.description || '');
            return next;
        });
        setShowSlashMenu(false);
        setShowSaveFlowForm(false);
        inputRef.current?.focus();
    };

    const handleSaveSelectedToolFlow = () => {
        if (!selectedToolFlow?.tools?.length) return;
        const name = flowNameDraft.trim() || selectedToolFlow.name || '自定义工具流程';
        const flow = normalizeAgentToolFlow({
            ...selectedToolFlow,
            id: `saved_flow_${Date.now()}`,
            source: 'saved',
            name,
            description: flowDescriptionDraft.trim(),
            createdAt: Date.now(),
            updatedAt: Date.now()
        }, 'saved');
        setSavedToolFlows((prev) => [flow, ...prev]);
        setSelectedToolFlow(flow);
        setShowSaveFlowForm(false);
    };

    const handleDeleteSavedToolFlow = (flowId) => {
        setSavedToolFlows((prev) => prev.filter((flow) => flow.id !== flowId));
        setSelectedToolFlow((current) => current?.id === flowId ? null : current);
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

    const handleDirectMessage = async (msgText, attachments = [], forcedToolFlow = null) => {
        const pureText = String(msgText || '').trim();
        if ((!pureText && attachments.length === 0) || isSending) return;

        let aiUserMessage = pureText || 'Please analyze the uploaded image content.';
        const uiUserMessage = attachments.length > 0
            ? `${aiUserMessage}\n\n[Attached images: ${attachments.length}]`
            : aiUserMessage;

        addChatMessage('user', uiUserMessage);
        setIsSending(true);
        setToolCalls([]);
        setAgentPlan(null);
        setExpandedPlanSteps({});
        setShowToolLog(false);
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
                let contentDeltaSeen = false;

                await streamAgentChat(history, settings, (delta) => {
                    if (delta) {
                        contentDeltaSeen = true;
                    }
                    fullResponse += delta;
                    scheduleStreamCommit(fullResponse);
                }, (toolInfo) => {
                    if (toolInfo?.status === 'plan') {
                        if (toolInfo.plan) {
                            setAgentPlan(toolInfo.plan);
                        }
                        return;
                    }

                    if (toolInfo?.id) {
                        setAgentPlan((current) => current ? {
                            ...current,
                            steps: (current.steps || []).map((step) => (
                                step.id === toolInfo.id
                                    ? {
                                        ...step,
                                        status: toolInfo.status === 'calling'
                                            ? 'running'
                                            : toolInfo.status === 'done'
                                                ? 'done'
                                                : toolInfo.status === 'error'
                                                    ? 'error'
                                                    : step.status,
                                        result: toolInfo.result?.message || toolInfo.error || step.result
                                    }
                                    : step
                            ))
                        } : current);
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
                }, forcedToolFlow ? { forcedToolFlow } : {});

                // Agent fallback: ensure user still gets feedback when model returns empty text
                if (!contentDeltaSeen) {
                    const fallbackMsg = collectedActions.length > 0
                        ? 'Done. I completed the requested action.'
                        : 'Done. What should I help with next?'
                    await flushStreamCommit(fallbackMsg, true);
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
        const forcedToolFlow = chatMode === 'agent' ? selectedToolFlow : null;
        setInput('');
        setImageAttachments([]);
        setSelectedToolFlow(null);
        setShowSlashMenu(false);
        setShowSaveFlowForm(false);
        handleDirectMessage(userMsg, attachments, forcedToolFlow);
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

    const visibleToolFlows = getVisibleToolFlows();
    const visibleAgentTools = getVisibleAgentTools();

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
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${chatMode === 'agent' ? '工具执行模式' : '学习辅导模式'}`}>
                        {chatMode === 'agent' ? <Zap size={18} /> : <Bot size={18} />}
                    </div>
                    <div className="flex flex-col -space-y-0.5">
                        <span className="text-sm font-bold text-phy-text">{chatMode === 'agent' ? '工具执行模式' : '学习辅导模式'}</span>
                        <span className="text-[10px] text-phy-muted font-medium uppercase tracking-wider">
                            {chatMode === 'agent' ? '工具执行模式' : '学习辅导模式'}
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
                            title="导师模式"
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
                                    if (confirm('确定要删除这条对话吗？')) removeChatSession(session.id);
                                }}
                                className="absolute right-2 top-3 p-1.5 text-phy-text hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                title="删除"
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
                                        {chatMode === 'agent' ? '工具执行模式' : '学习辅导模式'}
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
                        {/* Agent Plan Card */}
                        {chatMode === 'agent' && agentPlan?.steps?.length > 0 && (
                            <div className="mx-1 rounded-2xl border border-cyan-300/25 bg-gradient-to-br from-cyan-500/10 via-phy-glass to-indigo-500/10 p-3 shadow-lg shadow-cyan-500/5 space-y-3 animate-fade-in">
                                <div className="flex items-start gap-2">
                                    <div className="w-8 h-8 rounded-xl bg-cyan-400/15 text-cyan-200 border border-cyan-300/20 flex items-center justify-center shrink-0">
                                        <Zap size={15} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-xs font-black text-phy-text">Agent 执行计划</div>
                                        <div className="text-[11px] text-phy-muted leading-relaxed line-clamp-2">{agentPlan.goal}</div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {agentPlan.steps.map((step, index) => {
                                        const expanded = !!expandedPlanSteps[step.id || index];
                                        const risky = isRiskyTool(step.tool, step.riskLevel);
                                        const toolInfo = TOOL_LABELS[step.tool] || { label: step.displayToolName || step.tool, icon: '工具' };
                                        return (
                                            <div key={step.id || index} className={`rounded-xl border px-3 py-2 ${getPlanStepStyle(step.status)}`}>
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedPlanSteps((prev) => ({ ...prev, [step.id || index]: !expanded }))}
                                                    className="w-full flex items-center gap-2 text-left"
                                                >
                                                    <span className="w-6 h-6 rounded-lg bg-black/10 flex items-center justify-center text-[10px] font-black shrink-0">
                                                        {step.status === 'done' ? <CheckSquare size={13} /> : step.status === 'running' ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <div className={`text-xs font-bold truncate ${step.status === 'done' ? 'line-through opacity-80' : ''}`}>{step.purpose}</div>
                                                        <div className="text-[10px] opacity-75 truncate">{toolInfo.label}</div>
                                                    </div>
                                                    {risky && (
                                                        <span className="inline-flex items-center gap-1 rounded-full border border-red-300/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-black text-red-200">
                                                            <AlertTriangle size={10} /> 高风险
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] font-black shrink-0">{getPlanStepLabel(step.status)}</span>
                                                    {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                                </button>
                                                {expanded && (
                                                    <div className="mt-2 space-y-1.5 rounded-lg bg-black/10 p-2 text-[10px] leading-relaxed">
                                                        <div><span className="opacity-60">工具：</span><span className="font-mono">{step.tool}</span></div>
                                                        <div><span className="opacity-60">范围：</span>{step.scopeSummary || step.inputs || '-'}</div>
                                                        {step.canUndo && <div className="text-amber-200">可撤销：执行后可用“撤销闪卡操作”恢复上次批量改动。</div>}
                                                        {step.result && <div><span className="opacity-60">结果：</span>{step.result}</div>}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Tool Call Visualization (Agent Mode) */}
                        {chatMode === 'agent' && toolCalls.length > 0 && (
                            <div className="mx-1 rounded-2xl border border-amber-300/25 bg-gradient-to-br from-amber-500/10 via-phy-glass to-cyan-500/10 p-3 shadow-lg shadow-amber-500/5 space-y-2 animate-fade-in">
                                <button
                                    type="button"
                                    onClick={() => setShowToolLog((value) => !value)}
                                    className="w-full flex items-center justify-between gap-2 text-left"
                                >
                                    <div className="text-xs font-black text-phy-text flex items-center gap-2">
                                        <span className="w-6 h-6 rounded-lg bg-amber-400/15 text-amber-300 flex items-center justify-center border border-amber-300/20">
                                            <Database size={13} />
                                        </span>
                                        执行日志
                                    </div>
                                    <span className="text-[10px] uppercase tracking-[0.18em] text-phy-muted flex items-center gap-1">
                                        {isSending ? 'RUNNING' : 'COMPLETED'} {showToolLog ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                    </span>
                                </button>
                                {showToolLog && (
                                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                                        {toolCalls.map((tc, i) => {
                                            const toolInfo = TOOL_LABELS[tc.name] || { label: tc.name, icon: '工具' };
                                            const argsText = formatToolArgs(tc.args);
                                            const resultText = summarizeToolResult(tc);
                                            const isError = tc.status === 'error';
                                            return (
                                                <div key={`${tc.id || tc.name}-${i}`} className="rounded-xl border border-phy-border bg-phy-bg/70 px-3 py-2 text-xs text-phy-text space-y-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="min-w-7 h-7 px-1 rounded-lg bg-phy-glassHeavy text-amber-300 border border-amber-300/15 flex items-center justify-center text-[10px] font-black">
                                                            {toolInfo.icon}
                                                        </span>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="font-bold text-phy-text truncate">{toolInfo.label}</div>
                                                            <div className="text-[10px] text-phy-muted font-mono truncate">{tc.name}</div>
                                                        </div>
                                                        {tc.status === 'calling' ? <Loader2 size={12} className="animate-spin ml-auto text-amber-400" /> : isError ? <X size={12} className="ml-auto text-red-500" /> : <CheckCircle2 size={12} className="ml-auto text-green-500" />}
                                                    </div>
                                                    {argsText && <div className="rounded-lg bg-phy-glass px-2 py-1 text-[10px] text-phy-muted">输入：{argsText}</div>}
                                                    {resultText && <div className={`rounded-lg px-2 py-1 text-[10px] ${isError ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{resultText}</div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                        {/* Action Card (After Agent finishes, show clickable navigation buttons) */}
                        {!isSending && pendingActions.length > 0 && (
                            <div className="mx-1 p-4 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-300/20 rounded-2xl space-y-3 animate-fade-in shadow-lg shadow-emerald-500/5">
                                <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                                    <CheckCircle2 size={14} />
                                    任务已完成。点击下方入口查看结果。                                </div>
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
                                            <div key={i} className="space-y-2">
                                                <button
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
                                                {action.canUndo && (
                                                    <button
                                                        onClick={() => handleDirectMessage('撤销上一次闪卡批量操作')}
                                                        className="w-full rounded-xl border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-200 hover:bg-amber-500/20 transition-colors"
                                                    >
                                                        撤销本次闪卡操作
                                                    </button>
                                                )}
                                            </div>
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
                        className="p-3 md:p-4 bg-gradient-to-t from-phy-bg via-phy-glassHeavy to-phy-glass border-t border-phy-border relative shrink-0"
                        style={{ paddingBottom: isMobileSheet ? 'calc(1rem + env(safe-area-inset-bottom, 0px))' : undefined }}
                    >
                        {/* Context Menu Suggestion UI */}
                        {showSuggestions && suggestions.length > 0 && (
                            <div className="absolute bottom-full left-4 right-4 mb-2 bg-phy-glass rounded-xl shadow-2xl border border-phy-border overflow-hidden max-h-60 overflow-y-auto animate-fade-in z-50">
                                <div className="px-3 py-2 bg-phy-bg border-b border-phy-border text-xs font-bold text-phy-muted uppercase tracking-wider">
                                    引用上下文                                </div>
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

                        {chatMode === 'agent' && showSlashMenu && (
                            <div className="absolute bottom-full left-4 right-4 mb-2 bg-phy-glass rounded-xl shadow-2xl border border-phy-border overflow-hidden max-h-72 overflow-y-auto animate-fade-in z-50">
                                <div className="px-3 py-2 bg-phy-bg border-b border-phy-border text-xs font-bold text-phy-muted uppercase tracking-wider flex items-center justify-between">
                                    <span>工具流程 / 全部工具</span>
                                    <span className="normal-case tracking-normal text-[10px]">点工具会追加到当前流程</span>
                                </div>
                                {visibleToolFlows.length > 0 && (
                                    <div>
                                        <div className="px-3 py-1.5 text-[10px] font-black text-phy-muted bg-phy-bg/60">已保存 / 推荐流程</div>
                                        {visibleToolFlows.map((flow) => (
                                            <div
                                                key={`${flow.source || 'flow'}_${flow.id}`}
                                                className="flex items-stretch border-b border-phy-border/60 last:border-0 hover:bg-phy-glassHover transition-colors"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => handleSelectToolFlow(flow)}
                                                    className="min-w-0 flex-1 px-4 py-3 text-left flex items-start gap-3"
                                                >
                                                    <div className="mt-0.5 min-w-8 h-8 rounded-xl bg-amber-400/15 text-amber-300 border border-amber-300/20 flex items-center justify-center text-[10px] font-black">
                                                        流程
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <div className="font-bold text-sm text-phy-text truncate">{flow.name}</div>
                                                            <span className="rounded-full bg-phy-bg px-2 py-0.5 text-[10px] font-black text-phy-muted">
                                                                {flow.source === 'saved' ? '已保存' : '推荐'}
                                                            </span>
                                                        </div>
                                                        <div className="mt-0.5 text-xs text-phy-muted line-clamp-1">{flow.description || '按固定工具顺序执行'}</div>
                                                        <div className="mt-1 text-[10px] font-mono text-phy-muted line-clamp-1">{getFlowToolsText(flow)}</div>
                                                    </div>
                                                </button>
                                                {flow.source === 'saved' && (
                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            handleDeleteSavedToolFlow(flow.id);
                                                        }}
                                                        className="m-3 self-start rounded-lg p-1.5 text-red-300 hover:bg-red-500/10"
                                                        title="删除保存的流程"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {visibleAgentTools.length > 0 && (
                                    <div>
                                        <div className="px-3 py-1.5 text-[10px] font-black text-phy-muted bg-phy-bg/60">全部工具</div>
                                        {visibleAgentTools.map((tool) => (
                                            <button
                                                key={tool.name}
                                                type="button"
                                                onClick={() => handleSelectAgentTool(tool.name)}
                                                className="w-full px-4 py-3 text-left flex items-start gap-3 border-b border-phy-border/60 last:border-0 hover:bg-phy-glassHover transition-colors"
                                            >
                                                <div className={`mt-0.5 min-w-8 h-8 rounded-xl border flex items-center justify-center text-[10px] font-black ${tool.isRisky ? 'bg-red-500/10 text-red-200 border-red-300/20' : 'bg-cyan-400/10 text-cyan-200 border-cyan-300/20'}`}>
                                                    {tool.icon}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <div className="font-bold text-sm text-phy-text truncate">{tool.label}</div>
                                                        {tool.isRisky && <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-black text-red-200">高风险</span>}
                                                    </div>
                                                    <div className="mt-0.5 text-[10px] text-phy-muted font-mono truncate">{tool.name}</div>
                                                    <div className="mt-1 text-xs text-phy-muted line-clamp-1">{tool.description}</div>
                                                </div>
                                                <Plus size={14} className="mt-2 text-phy-muted" />
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {!visibleToolFlows.length && !visibleAgentTools.length && (
                                    <div className="px-4 py-5 text-sm text-phy-muted">没有匹配的流程或工具。</div>
                                )}
                            </div>
                        )}

                        {chatMode === 'agent' && selectedToolFlow && (
                            <div className="mb-2 rounded-2xl border border-amber-300/25 bg-amber-500/10 p-3 space-y-2">
                                <div className="flex items-start gap-2">
                                    <div className="min-w-8 h-8 rounded-xl bg-amber-400/15 text-amber-200 border border-amber-300/20 flex items-center justify-center">
                                        <Zap size={14} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <div className="text-sm font-black text-phy-text truncate">{selectedToolFlow.name}</div>
                                            <span className="rounded-full bg-phy-bg px-2 py-0.5 text-[10px] font-black text-phy-muted">
                                                {selectedToolFlow.source === 'saved' ? '已保存流程' : selectedToolFlow.source === 'custom' ? '自选工具' : '推荐流程'}
                                            </span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                            {(selectedToolFlow.tools || []).map((tool, index) => (
                                                <span key={`${tool.toolName}_${index}`} className="rounded-full border border-amber-300/20 bg-phy-bg/70 px-2 py-1 text-[10px] font-bold text-phy-text">
                                                    {index + 1}. {TOOL_LABELS[tool.toolName]?.label || tool.toolName}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedToolFlow(null);
                                            setShowSaveFlowForm(false);
                                        }}
                                        className="rounded-lg p-1.5 text-phy-muted hover:bg-phy-glassHover hover:text-phy-text"
                                        title="取消当前流程"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                                {selectedToolFlow.source !== 'saved' && !showSaveFlowForm && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFlowNameDraft(selectedToolFlow.name);
                                            setFlowDescriptionDraft(selectedToolFlow.description || '');
                                            setShowSaveFlowForm(true);
                                        }}
                                        className="rounded-xl border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs font-black text-amber-100 hover:bg-amber-400/20"
                                    >
                                        保存当前流程
                                    </button>
                                )}
                                {showSaveFlowForm && (
                                    <div className="grid grid-cols-1 gap-2 rounded-xl border border-phy-border bg-phy-bg/70 p-2">
                                        <input
                                            value={flowNameDraft}
                                            onChange={(event) => setFlowNameDraft(event.target.value)}
                                            className="rounded-lg border border-phy-border bg-phy-glass px-3 py-2 text-xs text-phy-text outline-none focus:border-phy-accent"
                                            placeholder="流程名称"
                                        />
                                        <input
                                            value={flowDescriptionDraft}
                                            onChange={(event) => setFlowDescriptionDraft(event.target.value)}
                                            className="rounded-lg border border-phy-border bg-phy-glass px-3 py-2 text-xs text-phy-text outline-none focus:border-phy-accent"
                                            placeholder="流程说明（可选）"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={handleSaveSelectedToolFlow}
                                                className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-black text-amber-950"
                                            >
                                                保存
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setShowSaveFlowForm(false)}
                                                className="rounded-lg border border-phy-border px-3 py-1.5 text-xs font-black text-phy-muted"
                                            >
                                                取消
                                            </button>
                                        </div>
                                    </div>
                                )}
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
                                            title="移除"
                                        >×</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="relative rounded-2xl border border-phy-border bg-phy-glass shadow-inner focus-within:border-phy-accent focus-within:ring-4 focus-within:ring-phy-accentGlass transition-all">
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
                                        if (showSlashMenu && (visibleToolFlows.length > 0 || visibleAgentTools.length > 0)) {
                                            e.preventDefault();
                                            if (visibleToolFlows.length > 0) handleSelectToolFlow(visibleToolFlows[0]);
                                            else handleSelectAgentTool(visibleAgentTools[0].name);
                                            return;
                                        }
                                        if (showSuggestions && suggestions.length > 0) {
                                            e.preventDefault();
                                            handleSelectSuggestion(suggestions[0]);
                                            return;
                                        }
                                        e.preventDefault();
                                        handleSend();
                                    }
                                    if (e.key === 'Escape') {
                                        setShowSuggestions(false);
                                        setShowSlashMenu(false);
                                    }
                                }}
                                placeholder={chatMode === 'agent' ? '输入 / 选择工具流程；也可以直接让 Agent 整理闪卡、编辑笔记、生成深度笔记...' : '问语法、词汇、阅读、写作；也可以用 @ 引用上下文...'}
                                className="w-full bg-transparent border-0 rounded-2xl pl-4 pr-24 py-3 text-sm text-phy-text placeholder:text-phy-muted/70 focus:outline-none resize-none min-h-[58px] max-h-48 overflow-y-auto"
                            />
                            <button
                                onClick={() => imageInputRef.current?.click()}
                                className="absolute right-12 top-2.5 p-2 text-phy-muted hover:text-phy-text hover:bg-phy-glassHeavy rounded-xl transition-colors"
                                title="上传图片或粘贴截图"
                            >
                                <ImagePlus size={16} />
                            </button>
                            <button
                                onClick={handleSend}
                                disabled={(!input.trim() && imageAttachments.length === 0) || isSending}
                                className="absolute right-2 top-2.5 p-2 text-white bg-gradient-to-br from-phy-accent to-blue-500 hover:brightness-110 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-phy-accent/20 border border-white/10"
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






