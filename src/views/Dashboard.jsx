import React, { useEffect, useState } from 'react';
import { Upload, CheckCircle, Activity, ChevronRight, Calendar, Sparkles, BookOpen, ImageIcon, Loader2, BookMarked, History as HistoryIcon, Trash2, Settings, Download, X, Play } from 'lucide-react';
import { useApp } from '../context/AppContext';
import ForgettingCurveChart from '../components/ForgettingCurveChart';
import UserGuideModal from '../components/UserGuideModal';
import StudyHeatmap from '../components/StudyHeatmap';
import DailySummaryCard from '../components/DailySummaryCard';
import { getHighlightsByDate, getFlashcards, getNotes, getHistory, deleteHighlight, getChatSessions } from '../services/db';
import { generateStoryComic, COMIC_STYLES } from '../services/ai';
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

    // Get results from global state
    const storyComic = bgTasks.storyComic?.data;



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
                // Calculate FSRS due cards
                const now = Date.now();
                const dueCards = allCards.filter(c => !c.nextReview || c.nextReview <= now);
                setDueCount(dueCards.length);
                const allNotes = await getNotes();
                const allHistory = await getHistory();

                const allChat = await getChatSessions();

                // Filter today's data
                const todayCards = allCards.filter(c => c.lastReview && c.lastReview.startsWith(today));
                const todayNotes = allNotes.filter(n => n.date && n.date.startsWith(today));
                const todayArticles = allHistory.filter(h => h.date && h.date.startsWith(today));

                // Approximations for Chat & Writing
                // 1. Chat: Sessions updated today
                const todayChats = allChat.filter(c => c.updatedAt && new Date(c.updatedAt).toISOString().startsWith(today));

                // 2. Writing: Simple word count of notes created today
                const writingWordCount = todayNotes.reduce((acc, n) => acc + (n.content ? n.content.split(/\s+/).length : 0), 0);

                setTodayStats({
                    wordsLearned: todayCards.reduce((acc, c) => acc + (c.reviews || 1), 0),
                    articlesRead: todayArticles.length,
                    notesCreated: todayNotes.length,
                    flashcardsReviewed: todayCards.length,
                    questionsAsked: todayChats.length, // Using session count as proxy for 'interactions' for now
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



    // Generate Story Comic (with options)
    const handleGenerateComic = async () => {
        if (!todayHighlights.length) {
            alert('今日暂无标记内容。请先在各模块中标记一些重点内容！');
            return;
        }
        // Run in background with selected options
        runStoryComicGeneration(todayHighlights, {
            style: selectedComicStyle,
            format: selectedComicFormat
        });
    };

    // Save comic image
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
            alert('保存失败: ' + e.message);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10 relative">
            {showGuide && <UserGuideModal onClose={() => setShowGuide(false)} />}

            {/* 1. Hero Banner */}
            <div className="w-full bg-gradient-to-r from-[#3B82F6] to-[#4F46E5] rounded-[2rem] p-6 md:p-10 shadow-xl shadow-blue-500/20 text-white relative overflow-hidden flex flex-col justify-center min-h-[200px] md:min-h-[220px]">
                <div className="absolute top-0 right-0 w-96 h-96 bg-phy-glass opacity-5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                <div className="absolute bottom-0 left-20 w-64 h-64 bg-indigo-300 opacity-10 rounded-full blur-2xl pointer-events-none"></div>

                <div className="relative z-10 max-w-2xl">
                    <h1 className="text-2xl md:text-4xl font-bold mb-2 md:mb-3 tracking-tight text-white">
                        早安, Learner.
                    </h1>
                    <p className="text-blue-100 text-sm md:text-lg mb-5 md:mb-8 font-medium leading-relaxed">
                        {hasKey
                            ? 'AI 核心已就绪。随时准备为您解析新的阅读材料，提升语言能力。'
                            : 'AI 核心未配置 (演示模式)。请在设置中配置 API Key 以解锁完整功能。'
                        }
                    </p>

                    {/* Buttons: vertical stack on mobile, horizontal on desktop */}
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
                        {/* Settings Button */}
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

                {/* Settings Panel */}
                {showComicSettings && (
                    <div className="mb-6 p-4 bg-phy-glass rounded-xl border border-phy-borderHover relative z-10">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-white font-bold text-sm">漫画设置</span>
                            <button onClick={() => setShowComicSettings(false)} className="text-purple-300 hover:text-white">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Style Selector */}
                            <div>
                                <label className="block text-xs text-purple-300 mb-2">画风</label>
                                <select
                                    value={selectedComicStyle}
                                    onChange={(e) => setSelectedComicStyle(e.target.value)}
                                    className="w-full bg-phy-glassHover border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-400"
                                >
                                    <option value="random" className="bg-phy-glassHeavy">🎲 随机</option>
                                    <optgroup label="日漫" className="bg-phy-glassHeavy">
                                        {Object.entries(COMIC_STYLES).slice(0, 7).map(([key, style]) => (
                                            <option key={key} value={key} className="bg-phy-glassHeavy">{style.name}</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="美漫" className="bg-phy-glassHeavy">
                                        {Object.entries(COMIC_STYLES).slice(7, 12).map(([key, style]) => (
                                            <option key={key} value={key} className="bg-phy-glassHeavy">{style.name}</option>
                                        ))}
                                    </optgroup>
                                    <optgroup label="国漫/儿童卡通/特殊" className="bg-phy-glassHeavy">
                                        {Object.entries(COMIC_STYLES).slice(12).map(([key, style]) => (
                                            <option key={key} value={key} className="bg-phy-glassHeavy">{style.name}</option>
                                        ))}
                                    </optgroup>
                                </select>
                            </div>
                            {/* Format Selector */}
                            <div>
                                <label className="block text-xs text-purple-300 mb-2">格式</label>
                                <select
                                    value={selectedComicFormat}
                                    onChange={(e) => setSelectedComicFormat(e.target.value)}
                                    className="w-full bg-phy-glassHover border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-pink-400"
                                >
                                    <option value="random" className="bg-phy-glassHeavy">🎲 随机</option>
                                    <option value="single" className="bg-phy-glassHeavy">🖼️ 单图</option>
                                    <option value="2panel" className="bg-phy-glassHeavy">📖 两格漫画</option>
                                    <option value="4panel" className="bg-phy-glassHeavy">📚 四格漫画</option>
                                </select>
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
                        {/* Save Button */}
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


            {/* 3. Forgetting Curve & Today's Task */}
            <ForgettingCurveChart
                flashcards={flashcards}
                onReviewStart={() => {
                    setFlashcardStartupState({ mode: 'study', folder: 'today' });
                    onNavigate('flashcards');
                }}
            />

            {/* 4. Stats Grid - Clean White Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Card 2: Streak (Orange Theme) */}
                {isLoading ? (
                    <div className="bg-phy-glass p-6 rounded-3xl shadow-sm border border-phy-border/50 h-[180px]">
                        <div className="flex justify-between items-start mb-6">
                            <Skeleton className="h-12 w-12 rounded-2xl bg-phy-bg" />
                            <Skeleton className="h-4 w-16 bg-phy-bg" />
                        </div>
                        <Skeleton className="h-10 w-24 mb-2 bg-phy-bg" />
                        <Skeleton className="h-4 w-32 bg-phy-bg" />
                    </div>
                ) : (
                    <div className="bg-phy-glass p-6 rounded-3xl shadow-sm border border-phy-border/50 hover:shadow-md transition-all flex flex-col justify-between h-[180px]">
                        <div className="flex justify-between items-start">
                            <div className="p-3 bg-orange-50 text-orange-500 rounded-2xl">
                                <Activity size={24} strokeWidth={2.5} />
                            </div>
                            <span className="text-[11px] font-bold text-phy-muted uppercase tracking-widest">Streak</span>
                        </div>
                        <div>
                            <div className="flex items-baseline gap-1 mb-2">
                                <span className="text-4xl font-bold text-phy-text font-bold">{stats.streak}</span>
                                <span className="text-lg text-phy-muted font-medium">days</span>
                            </div>
                            <div className="text-sm text-phy-muted font-medium">连续学习天数</div>
                        </div>
                    </div>
                )}

                {/* Card 3: Plan (Purple Theme) */}
                {isLoading ? (
                    <div className="bg-phy-glass p-6 rounded-3xl shadow-sm border border-phy-border/50 h-[180px]">
                        <div className="flex justify-between items-start mb-6">
                            <Skeleton className="h-12 w-12 rounded-2xl bg-phy-bg" />
                            <Skeleton className="h-6 w-6 bg-phy-bg" />
                        </div>
                        <Skeleton className="h-6 w-36 mb-2 bg-phy-bg" />
                        <Skeleton className="h-4 w-full bg-phy-bg" />
                    </div>
                ) : (
                    <div
                        onClick={() => onNavigate('plan')}
                        className="bg-phy-glass p-6 rounded-3xl shadow-sm border border-phy-border/50 hover:shadow-md hover:border-blue-100 transition-all cursor-pointer flex flex-col justify-between h-[180px] group"
                    >
                        <div className="flex justify-between items-start">
                            <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl group-hover:bg-purple-100 transition-colors">
                                <Calendar size={24} strokeWidth={2.5} />
                            </div>
                            <ChevronRight className="text-phy-text group-hover:text-blue-500 transition-colors" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg font-bold text-phy-text font-bold">查看智能计划</span>
                            </div>
                            <div className="text-sm text-phy-muted leading-relaxed">
                                AI 已根据进度调整复习队列，点击开始今日复习。
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div >
    );
};

export default Dashboard;
