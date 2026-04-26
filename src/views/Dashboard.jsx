import React, { useEffect, useState } from 'react';
import { Upload, CheckCircle, Sparkles, BookOpen, ImageIcon, Loader2, BookMarked, History as HistoryIcon, Trash2, Settings, Download, X, Play, Route, CheckSquare, Circle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import UserGuideModal from '../components/UserGuideModal';
import StudyHeatmap from '../components/StudyHeatmap';
import DailySummaryCard from '../components/DailySummaryCard';
import { getHighlightsByDate, getFlashcards, getNotes, getHistory, deleteHighlight, getChatSessions, getDailyPlan, saveDailyPlan } from '../services/db';
import { generateLearningFlowInsight, generateStoryComic, COMIC_STYLES } from '../services/ai';
import { buildLearningFlowDraft, collectLearningFlowProfile, getLocalDateKey, mergeLearningFlowInsight } from '../utils/learningFlow';
import { Skeleton } from '../components/SkeletonLoader';

const Dashboard = ({ onNavigate }) => {
    const {
        stats,
        settings,
        loadUserFlashcards,
        setFlashcardStartupState,
        bgTasks,
        runDailyImageGeneration,
        runStoryComicGeneration
    } = useApp();

    const hasKey = !!settings.apiKey;
    const [flashcards, setFlashcards] = useState([]);
    const [showGuide, setShowGuide] = useState(false);
    const [todayHighlights, setTodayHighlights] = useState([]);
    const [showHighlightManager, setShowHighlightManager] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [dueCount, setDueCount] = useState(0);
    const [learningFlow, setLearningFlow] = useState(null);
    const [isGeneratingFlow, setIsGeneratingFlow] = useState(false);

    // Comic generation options
    const [showComicSettings, setShowComicSettings] = useState(false);
    const [selectedComicStyle, setSelectedComicStyle] = useState('random');
    const [selectedComicFormat, setSelectedComicFormat] = useState('random');

    const handleDeleteHighlight = async (id) => {
        if (confirm('确定移除这条标记吗？')) {
            await deleteHighlight(id);
            setTodayHighlights(prev => prev.filter(h => h.id !== id));
        }
    };

    // --- Stats & Local State ---
    const [todayStats, setTodayStats] = useState({
        wordsLearned: 0,
        articlesRead: 0,
        notesCreated: 0,
        flashcardsReviewed: 0
    });

    // Check if tasks are running globally
    const isGeneratingComic = bgTasks.storyComic?.status === 'loading';
    const isGeneratingDailyImage = bgTasks.dailyImage?.status === 'loading';

    // Get results from global state
    const storyComic = bgTasks.storyComic?.data;
    const dailyImageUrl = bgTasks.dailyImage?.url;

    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            const cards = await loadUserFlashcards();
            setFlashcards(cards);

            // Load today's highlights
            const today = new Date().toISOString().split('T')[0];
            const highlights = await getHighlightsByDate(today);
            setTodayHighlights(highlights || []);

            // Calculate today's stats
            try {
                const allCards = await getFlashcards();
                const now = Date.now();
                const dueCards = allCards.filter(c => !c.nextReview || c.nextReview <= now);
                setDueCount(dueCards.length);
                const allNotes = await getNotes();
                const allHistory = await getHistory();
                const allChat = await getChatSessions();

                const isSameIsoDay = (value, day) => {
                    if (!value) return false;
                    if (typeof value === 'number') {
                        const d = new Date(value);
                        return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(day);
                    }
                    if (typeof value === 'string') {
                        if (/^\d+$/.test(value)) {
                            const d = new Date(Number(value));
                            return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(day);
                        }
                        if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
                            return value.startsWith(day);
                        }
                        const d = new Date(value);
                        return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(day);
                    }
                    if (value instanceof Date) {
                        return !Number.isNaN(value.getTime()) && value.toISOString().startsWith(day);
                    }
                    return false;
                };

                // Filter today's data
                const todayCards = allCards.filter(c => isSameIsoDay(c.lastReview, today));
                const todayNotes = allNotes.filter(n => isSameIsoDay(n.date, today));
                const todayArticles = allHistory.filter(h => isSameIsoDay(h.date, today));
                const todayChats = allChat.filter(c => c.updatedAt && new Date(c.updatedAt).toISOString().startsWith(today));
                const writingWordCount = todayNotes.reduce((acc, n) => acc + (n.content ? n.content.split(/\s+/).length : 0), 0);

                setTodayStats({
                    wordsLearned: todayCards.reduce((acc, c) => acc + (c.reviews || 1), 0),
                    articlesRead: todayArticles.length,
                    notesCreated: todayNotes.length,
                    flashcardsReviewed: todayCards.length,
                    questionsAsked: todayChats.length,
                    writingCount: writingWordCount
                });
            } catch (e) {
                console.error('Stats loading error:', e);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    useEffect(() => {
        const loadLearningFlow = async () => {
            try {
                const plan = await getDailyPlan(getLocalDateKey());
                if (plan?.version === 'learning-flow-v1') {
                    setLearningFlow(plan);
                }
            } catch (e) {
                console.error('Learning flow loading error:', e);
            }
        };
        loadLearningFlow();
    }, []);

    const persistLearningFlow = async (plan) => {
        setLearningFlow(plan);
        await saveDailyPlan(plan.date || getLocalDateKey(), plan);
    };

    const handleGenerateLearningFlow = async () => {
        setIsGeneratingFlow(true);
        try {
            const profile = await collectLearningFlowProfile();
            const draft = buildLearningFlowDraft(profile);
            const insight = await generateLearningFlowInsight(profile, draft, settings);
            const plan = mergeLearningFlowInsight(draft, insight);
            await persistLearningFlow(plan);
        } catch (e) {
            console.error('Learning flow generation failed:', e);
            alert('学习流生成失败：' + e.message);
        } finally {
            setIsGeneratingFlow(false);
        }
    };

    const updateLearningNodeStatus = async (nodeId, status) => {
        if (!learningFlow) return;
        const next = {
            ...learningFlow,
            updatedAt: Date.now(),
            nodes: (learningFlow.nodes || []).map((node) => (
                node.id === nodeId ? { ...node, status } : node
            ))
        };
        await persistLearningFlow(next);
    };

    const handleLearningNodeAction = async (node) => {
        if (!node) return;
        if (node.type === 'flashcard' && node.params?.flashcardStartupState) {
            setFlashcardStartupState(node.params.flashcardStartupState);
        }
        await updateLearningNodeStatus(node.id, 'active');
        if (node.targetView) {
            onNavigate({ view: node.targetView, params: node.params || {} });
        }
    };

    const handleGenerateComic = async () => {
        if (!todayHighlights.length) {
            alert('今日暂无标记内容。请先在各模块中标记一些重点内容！');
            return;
        }
        runStoryComicGeneration(todayHighlights, {
            style: selectedComicStyle,
            format: selectedComicFormat
        });
    };

    const handleSaveComic = async () => {
        if (!storyComic?.imageUrl) return;
        try {
            const link = document.createElement('a');
            link.href = storyComic.imageUrl;
            link.download = `comic_${storyComic.storyTitle || 'story'}_${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error('Save failed:', e);
            alert('Save failed: ' + e.message);
        }
    };

    const handleGenerateYesterdaySummary = async () => {
        try {
            await runDailyImageGeneration(undefined, 'auto');
        } catch (e) {
            console.error('Daily summary generation failed:', e);
            alert('Generation failed: ' + e.message);
        }
    };

    const handleSaveSummaryImage = async () => {
        if (!dailyImageUrl) return;
        try {
            const link = document.createElement('a');
            link.href = dailyImageUrl;
            link.download = `daily-summary-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error('Summary save failed:', e);
            alert('Save failed: ' + e.message);
        }
    };

    const completedFlowNodes = learningFlow?.nodes?.filter((node) => node.status === 'done').length || 0;
    const totalFlowNodes = learningFlow?.nodes?.length || 0;
    const flowProgress = totalFlowNodes ? Math.round((completedFlowNodes / totalFlowNodes) * 100) : 0;

    return (
        <div className="space-y-6 animate-fade-in pb-10 relative">
            {showGuide && <UserGuideModal onClose={() => setShowGuide(false)} />}

            {/* 1. Hero Banner */}
            <div className="w-full bg-gradient-to-r from-[#3B82F6] to-[#4F46E5] rounded-[2rem] p-6 md:p-10 shadow-xl shadow-blue-500/20 text-white relative overflow-hidden flex flex-col justify-center min-h-[200px] md:min-h-[220px]">
                <div className="absolute top-0 right-0 w-96 h-96 bg-phy-glass opacity-5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                <div className="absolute bottom-0 left-20 w-64 h-64 bg-indigo-300 opacity-10 rounded-full blur-2xl pointer-events-none"></div>

                <div className="relative z-10 max-w-2xl">
                    <h1 className="text-2xl md:text-4xl font-bold mb-2 md:mb-3 tracking-tight text-white">
                        早安, 学习者.
                    </h1>
                    <p className="text-blue-100 text-sm md:text-lg mb-5 md:mb-8 font-medium leading-relaxed">
                        {hasKey
                            ? 'AI 核心已就绪。随时准备为您解析新的阅读材料，提升语言能力。'
                            : 'AI 核心未配置 (演示模式)。请在设置中配置 API Key 以解锁完整功能。'
                        }
                    </p>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 sm:flex-wrap">
                        {dueCount > 0 && (
                            <button
                                onClick={() => {
                                    setFlashcardStartupState({ mode: 'study', folder: 'today' });
                                    onNavigate('flashcards');
                                }}
                                className="bg-amber-400 text-amber-900 px-6 py-3 sm:px-8 sm:py-3.5 rounded-full font-bold text-sm hover:bg-amber-300 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-2 animate-pulse hover:animate-none"
                            >
                                <Play size={18} strokeWidth={2.5} />
                                开始复习 ({dueCount})
                            </button>
                        )}
                        <button
                            onClick={() => onNavigate('import')}
                            className="bg-phy-glass text-blue-600 px-6 py-3 sm:px-8 sm:py-3.5 rounded-full font-bold text-sm hover:bg-blue-50 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center gap-2"
                        >
                            <Upload size={18} strokeWidth={2.5} />
                            导入新内容
                        </button>
                        <button
                            onClick={() => setShowGuide(true)}
                            className="bg-blue-600/30 backdrop-blur text-white border border-white/20 px-5 py-3 sm:px-6 sm:py-3.5 rounded-full font-bold text-sm hover:bg-blue-600/40 transition-all flex items-center justify-center gap-2"
                        >
                            <BookOpen size={18} strokeWidth={2.5} />
                            使用手册
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-950 via-slate-950 to-cyan-950 rounded-[2rem] border border-emerald-400/20 p-5 md:p-7 shadow-xl shadow-emerald-500/10 relative overflow-hidden">
                <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full bg-emerald-400/10 blur-3xl pointer-events-none"></div>
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5 relative z-10">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-emerald-200 text-xs font-black uppercase tracking-[0.2em] mb-2">
                            <Route size={16} />
                            Learning Line V1
                        </div>
                        <h2 className="text-xl md:text-2xl font-black text-white">
                            {learningFlow?.title || '一线学习流'}
                        </h2>
                        <p className="text-sm text-emerald-100/75 mt-2 leading-relaxed max-w-3xl">
                            {learningFlow?.summary || '把闪卡、阅读、翻译、写作和笔记串成一条今日路线。先生成，再按节点推进。'}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-emerald-100/70">
                            <span>进度 {completedFlowNodes}/{totalFlowNodes || 5}</span>
                            <span>预计 {learningFlow?.estimatedMinutes || 45} 分钟</span>
                            {learningFlow?.sourceDate && <span>基于 {learningFlow.sourceDate}</span>}
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0">
                        <button
                            onClick={() => onNavigate?.('flow')}
                            className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-cyan-400/15 hover:bg-cyan-400/25 text-cyan-100 border border-cyan-300/20"
                        >
                            <Route size={16} />
                            打开画布
                        </button>
                        <button
                            onClick={handleGenerateLearningFlow}
                            disabled={isGeneratingFlow}
                            className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${isGeneratingFlow ? 'bg-slate-700 text-phy-muted' : 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300 shadow-lg shadow-emerald-500/20'}`}
                        >
                            {isGeneratingFlow ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            {learningFlow ? '重新生成' : '生成今日学习流'}
                        </button>
                        {learningFlow && (
                            <button
                                onClick={() => {
                                    const firstPending = learningFlow.nodes?.find((node) => node.status !== 'done') || learningFlow.nodes?.[0];
                                    handleLearningNodeAction(firstPending);
                                }}
                                className="px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-white/10 hover:bg-white/15 text-white border border-white/10"
                            >
                                <Play size={16} />
                                继续路线
                            </button>
                        )}
                    </div>
                </div>

                {learningFlow ? (
                    <div className="relative z-10 mt-5">
                        <div className="h-2 rounded-full bg-white/10 overflow-hidden mb-4">
                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300 transition-all" style={{ width: `${flowProgress}%` }}></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                            {(learningFlow.nodes || []).map((node, index) => {
                                const isDone = node.status === 'done';
                                const isActive = node.status === 'active';
                                return (
                                    <div
                                        key={node.id}
                                        className={`rounded-2xl border p-4 bg-white/[0.04] ${isDone ? 'border-emerald-300/40' : isActive ? 'border-cyan-300/50' : 'border-white/10'}`}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-3">
                                            <div className="w-8 h-8 rounded-xl bg-white/10 text-white flex items-center justify-center text-xs font-black">
                                                {index + 1}
                                            </div>
                                            <button
                                                onClick={() => updateLearningNodeStatus(node.id, isDone ? 'pending' : 'done')}
                                                className={`p-1.5 rounded-lg transition-colors ${isDone ? 'text-emerald-300 bg-emerald-400/10' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
                                                title={isDone ? '取消完成' : '标记完成'}
                                            >
                                                {isDone ? <CheckSquare size={16} /> : <Circle size={16} />}
                                            </button>
                                        </div>
                                        <div className="text-sm font-black text-white leading-snug min-h-[40px]">{node.title}</div>
                                        <div className="text-xs text-emerald-100/65 mt-2 leading-relaxed line-clamp-3">{node.description}</div>
                                        <div className="flex items-center justify-between gap-2 mt-4">
                                            <span className="text-[11px] text-emerald-100/50">{node.estimatedMinutes || 8} 分钟</span>
                                            <button
                                                onClick={() => handleLearningNodeAction(node)}
                                                className="px-3 py-1.5 rounded-lg bg-emerald-400/15 hover:bg-emerald-400/25 text-emerald-200 text-xs font-bold"
                                            >
                                                {node.actionLabel || '开始'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="relative z-10 mt-5 rounded-2xl border border-dashed border-emerald-300/20 bg-white/[0.03] p-6 text-center text-emerald-100/70 text-sm">
                        还没有今日学习流。生成后会自动串联复习、阅读、翻译、写作和笔记复盘。
                    </div>
                )}
            </div>

            {/* ⭐ 2. Code-Based Dynamic Summary Card */}
            <DailySummaryCard
                stats={todayStats}
                highlights={todayHighlights}
                onDeleteHighlight={handleDeleteHighlight}
                onClearHighlights={async () => {
                    if (confirm('确定清空今日所有标记吗？')) {
                        for (const h of todayHighlights) {
                            await deleteHighlight(h.id);
                        }
                        setTodayHighlights([]);
                    }
                }}
            />

            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-6 md:p-8 rounded-[2rem] border border-indigo-500/20 shadow-xl shadow-indigo-500/10">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                    <div>
                        <div className="flex items-center gap-2 text-white font-bold text-xl">
                            <ImageIcon size={22} className="text-indigo-300" />
                            昨日学习成果总结图
                        </div>
                        <div className="text-indigo-200/80 text-sm mt-1">
                            自动读取昨天学习记录，结合主题内容生成总结海报。
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleGenerateYesterdaySummary}
                            disabled={isGeneratingDailyImage}
                            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${isGeneratingDailyImage ? 'bg-slate-700 text-phy-muted' : 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/30'}`}
                        >
                            {isGeneratingDailyImage ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            {isGeneratingDailyImage ? '生成中...' : '生成昨日总结图'}
                        </button>
                    </div>
                </div>

                {bgTasks.dailyImage?.status === 'error' && (
                    <div className="rounded-xl border border-red-400/30 bg-red-500/10 text-red-200 text-sm px-4 py-3">
                        生成失败：{bgTasks.dailyImage?.error || '未知错误'}
                    </div>
                )}

                {dailyImageUrl ? (
                    <div className="space-y-3">
                        <div className="rounded-2xl overflow-hidden border border-indigo-400/20">
                            <img src={dailyImageUrl} alt="Yesterday Study Summary" className="w-full h-auto object-cover" />
                        </div>
                        <button
                            onClick={handleSaveSummaryImage}
                            className="w-full md:w-auto px-4 py-2 rounded-xl bg-phy-glassHover border border-indigo-300/30 text-indigo-100 hover:bg-phy-glass text-sm font-bold flex items-center justify-center gap-2"
                        >
                            <Download size={16} />
                            保存总结图
                        </button>
                    </div>
                ) : (
                    <div className="h-40 rounded-2xl border border-dashed border-indigo-400/20 bg-phy-glass0 flex items-center justify-center text-indigo-200/70 text-sm">
                        点击上方按钮，生成昨日学习成果图。
                    </div>
                )}
            </div>

            {/* ⭐ 3. Story Comic - With Style Selection */}
            <div className="bg-gradient-to-br from-rose-950 via-purple-950 to-indigo-950 p-6 md:p-8 rounded-[2rem] shadow-xl shadow-purple-500/10 border border-purple-500/20 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-64 h-64 bg-pink-500 opacity-5 rounded-full blur-3xl -ml-20 -mt-20 pointer-events-none"></div>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 relative z-10">
                    <div>
                        <div className="flex items-center gap-3 text-white font-bold text-xl mb-2">
                            <div className="p-2 bg-pink-500/20 rounded-xl">
                                <BookMarked size={24} className="text-pink-400" />
                            </div>
                            今日故事漫画
                        </div>
                        <div className="text-purple-300 text-sm">
                            AI 将标记内容变成你的学习故事
                            {storyComic?.styleName && <span className="ml-2 px-2 py-0.5 bg-pink-500/20 text-pink-300 rounded-lg text-xs">{storyComic.styleName}</span>}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowComicSettings(!showComicSettings)}
                            className="p-3 rounded-xl bg-phy-glassHover hover:bg-white/20 text-purple-300 transition-all"
                            title="设置风格和格式"
                        >
                            <Settings size={18} />
                        </button>

                        <button
                            onClick={handleGenerateComic}
                            disabled={isGeneratingComic || !todayHighlights.length}
                            className={`px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg ${isGeneratingComic ? 'bg-slate-700 text-phy-muted' : todayHighlights.length ? 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-400 hover:to-purple-400 text-white shadow-pink-500/30' : 'bg-slate-700 text-phy-muted cursor-not-allowed'}`}
                        >
                            {isGeneratingComic ? (
                                <><Loader2 size={18} className="animate-spin" /> 生成中...</>
                            ) : (
                                <><BookMarked size={18} /> 生成漫画</>
                            )}
                        </button>
                    </div>
                </div>

                {showComicSettings && (
                    <div className="mb-6 p-4 bg-phy-glass rounded-xl border border-phy-borderHover relative z-10">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-white font-bold text-sm">漫画设置</span>
                            <button onClick={() => setShowComicSettings(false)} className="text-purple-300 hover:text-white">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-purple-300 mb-2">画风</label>
                            </div>
                            <div>
                                <label className="block text-xs text-purple-300 mb-2">格式</label>
                            </div>
                        </div>
                    </div>
                )}

                {storyComic?.imageUrl ? (
                    <div className="space-y-3 relative z-10">
                        <div className="text-center text-white font-bold text-lg">{storyComic.storyTitle}</div>
                        <div className="rounded-2xl overflow-hidden border border-phy-borderHover shadow-2xl">
                            <img
                                src={storyComic.imageUrl}
                                alt="Story Comic"
                                className="w-full h-auto object-cover"
                            />
                        </div>
                        <button
                            onClick={handleSaveComic}
                            className="w-full py-3 rounded-xl bg-phy-glassHover hover:bg-white/20 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all border border-phy-borderHover"
                        >
                            <Download size={16} />
                            保存图片
                        </button>
                    </div>
                ) : (
                    <div className="h-56 rounded-2xl bg-phy-glass border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-purple-300 relative z-10">
                        <BookMarked size={56} className="opacity-20 mb-4" />
                        <p className="text-base font-medium">AI 将学习内容变成你的故事</p>
                        <p className="text-xs text-purple-400 mt-2">支持 22+ 漫画画风，可选单图/两格/四格</p>
                    </div>
                )}
            </div>

            {/* 4. Study Heatmap */}
            <StudyHeatmap dailyActivity={stats.dailyActivity || {}} />
        </div>
    );
};

export default Dashboard;



