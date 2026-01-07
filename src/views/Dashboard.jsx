import React, { useEffect, useState } from 'react';
import { Upload, CheckCircle, Activity, ChevronRight, Calendar, Sparkles, BookOpen, ImageIcon, Loader2, BookMarked } from 'lucide-react';
import { useApp } from '../context/AppContext';
import ForgettingCurveChart from '../components/ForgettingCurveChart';
import UserGuideModal from '../components/UserGuideModal';
import StudyHeatmap from '../components/StudyHeatmap';
import { getHighlightsByDate, getFlashcards, getNotes, getHistory } from '../services/db';
import { generateDailySummaryImage, generateStoryComic } from '../services/ai';

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
    const [imageStyle, setImageStyle] = useState('cyberpunk');

    // --- Stats & Local State ---
    const [todayStats, setTodayStats] = useState({
        wordsLearned: 0,
        articlesRead: 0,
        notesCreated: 0,
        flashcardsReviewed: 0
    });

    // Check if tasks are running globally
    const isGeneratingImage = bgTasks.dailyImage?.status === 'loading';
    const isGeneratingComic = bgTasks.storyComic?.status === 'loading';

    // Get results from global state
    const dailyImage = bgTasks.dailyImage?.url;
    const storyComic = bgTasks.storyComic?.data;



    useEffect(() => {
        const load = async () => {
            const cards = await loadUserFlashcards();
            setFlashcards(cards);

            // Load today's highlights
            const today = new Date().toISOString().split('T')[0];
            const highlights = await getHighlightsByDate(today);
            setTodayHighlights(highlights || []);

            // Calculate today's stats
            try {
                const allCards = await getFlashcards();
                const allNotes = await getNotes();
                const allHistory = await getHistory();

                const todayCards = allCards.filter(c => c.lastReview && c.lastReview.startsWith(today));
                const todayNotes = allNotes.filter(n => n.date && n.date.startsWith(today));
                const todayArticles = allHistory.filter(h => h.date && h.date.startsWith(today));

                setTodayStats({
                    wordsLearned: todayCards.reduce((acc, c) => acc + (c.reviews || 1), 0),
                    articlesRead: todayArticles.length,
                    notesCreated: todayNotes.length,
                    flashcardsReviewed: todayCards.length
                });
            } catch (e) {
                console.error('Stats loading error:', e);
            }
        };
        load();
    }, []);

    const handleGenerateImage = async () => {
        if (!todayHighlights.length && !todayStats.articlesRead) {
            alert('今日暂无标记内容或学习数据。请先在各模块中学习并标记重点！');
            return;
        }
        // Run in background (Global Context)
        runDailyImageGeneration(todayHighlights, imageStyle, todayStats);
    };

    // Generate Story Comic (random style)
    const handleGenerateComic = async () => {
        if (!todayHighlights.length) {
            alert('今日暂无标记内容。请先在各模块中标记一些重点内容！');
            return;
        }
        // Run in background (Global Context)
        runStoryComicGeneration(todayHighlights);
    };

    return (
        <div className="space-y-6 animate-fade-in pb-10 relative">
            {showGuide && <UserGuideModal onClose={() => setShowGuide(false)} />}

            {/* 1. Hero Banner - The Blue Gradient Card */}
            <div className="w-full bg-gradient-to-r from-[#3B82F6] to-[#4F46E5] rounded-[2rem] p-8 md:p-10 shadow-xl shadow-blue-500/20 text-white relative overflow-hidden flex flex-col justify-center min-h-[220px]">
                {/* Background Circles for decoration */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-white opacity-5 rounded-full blur-3xl -mr-20 -mt-20"></div>
                <div className="absolute bottom-0 left-20 w-64 h-64 bg-indigo-300 opacity-10 rounded-full blur-2xl"></div>

                <div className="relative z-10 max-w-2xl">
                    <h1 className="text-3xl md:text-4xl font-bold mb-3 tracking-tight text-white">
                        早安, Learner.
                    </h1>
                    <p className="text-blue-100 text-base md:text-lg mb-8 font-medium">
                        {hasKey
                            ? 'AI 核心已就绪。随时准备为您解析新的阅读材料，提升语言能力。'
                            : 'AI 核心未配置 (演示模式)。请在设置中配置 API Key 以解锁完整功能。'
                        }
                    </p>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => onNavigate('import')}
                            className="bg-white text-blue-600 px-8 py-3.5 rounded-full font-bold text-sm hover:bg-blue-50 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center gap-2"
                        >
                            <Upload size={18} strokeWidth={2.5} />
                            导入新内容
                        </button>
                        <button
                            onClick={() => setShowGuide(true)}
                            className="bg-blue-600/30 backdrop-blur text-white border border-white/20 px-6 py-3.5 rounded-full font-bold text-sm hover:bg-blue-600/40 transition-all flex items-center gap-2"
                        >
                            <BookOpen size={18} strokeWidth={2.5} />
                            使用手册
                        </button>
                    </div>
                </div>
            </div>

            {/* ⭐ 2. Daily Summary Image - PROMINENT POSITION */}
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-900 p-6 md:p-8 rounded-[2rem] shadow-xl shadow-indigo-500/10 border border-indigo-500/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500 opacity-5 rounded-full blur-3xl -mr-20 -mt-20"></div>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-3 text-white font-bold text-xl mb-2">
                            <div className="p-2 bg-amber-500/20 rounded-xl">
                                <ImageIcon size={24} className="text-amber-400" />
                            </div>
                            每日学习总结
                        </div>
                        <div className="text-indigo-300 text-sm">
                            今日已标记 <span className="font-bold text-amber-400 text-lg">{todayHighlights.length}</span> 条重点内容
                        </div>
                    </div>

                    {/* Style Selector */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setImageStyle('cyberpunk')}
                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${imageStyle === 'cyberpunk' ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/50' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
                        >
                            💠 赛博霓虹
                        </button>
                        <button
                            onClick={() => setImageStyle('popart')}
                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${imageStyle === 'popart' ? 'bg-yellow-500/30 text-yellow-300 border border-yellow-400/50' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
                        >
                            💥 波普漫画
                        </button>
                        <button
                            onClick={handleGenerateImage}
                            disabled={isGeneratingImage || (!todayHighlights.length && !todayStats.articlesRead)}
                            className={`px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg ${isGeneratingImage ? 'bg-slate-700 text-slate-400' : (todayHighlights.length || todayStats.articlesRead) ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-900 shadow-amber-500/30' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                        >
                            {isGeneratingImage ? (
                                <><Loader2 size={18} className="animate-spin" /> AI 分析+生图中...</>
                            ) : (
                                <><Sparkles size={18} /> 生成每日总结图</>
                            )}
                        </button>
                    </div>
                </div>

                {dailyImage ? (
                    <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                        <img
                            src={dailyImage}
                            alt="Daily Summary"
                            className="w-full h-auto object-cover"
                        />
                    </div>
                ) : (
                    <div className="h-56 rounded-2xl bg-white/5 border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-indigo-300">
                        <ImageIcon size={56} className="opacity-20 mb-4" />
                        <p className="text-base font-medium">在各模块标记重点 → 点击生成专属学习总结图</p>
                        <p className="text-xs text-indigo-400 mt-2">支持 OpenRouter / SiliconFlow / OpenAI 图像模型</p>
                    </div>
                )}
            </div>

            {/* ⭐ 3. Story Comic - Random Art Style */}
            <div className="bg-gradient-to-br from-rose-950 via-purple-950 to-indigo-950 p-6 md:p-8 rounded-[2rem] shadow-xl shadow-purple-500/10 border border-purple-500/20 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-64 h-64 bg-pink-500 opacity-5 rounded-full blur-3xl -ml-20 -mt-20"></div>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-3 text-white font-bold text-xl mb-2">
                            <div className="p-2 bg-pink-500/20 rounded-xl">
                                <BookMarked size={24} className="text-pink-400" />
                            </div>
                            今日故事漫画
                        </div>
                        <div className="text-purple-300 text-sm">
                            AI 将标记内容变成冒险故事，随机画风生成
                            {storyComic?.styleName && <span className="ml-2 px-2 py-0.5 bg-pink-500/20 text-pink-300 rounded-lg text-xs">{storyComic.styleName}</span>}
                        </div>
                    </div>

                    <button
                        onClick={handleGenerateComic}
                        disabled={isGeneratingComic || !todayHighlights.length}
                        className={`px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg ${isGeneratingComic ? 'bg-slate-700 text-slate-400' : todayHighlights.length ? 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-400 hover:to-purple-400 text-white shadow-pink-500/30' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                    >
                        {isGeneratingComic ? (
                            <><Loader2 size={18} className="animate-spin" /> AI 编剧+随机画风生成...</>
                        ) : (
                            <><BookMarked size={18} /> 生成故事漫画</>
                        )}
                    </button>
                </div>

                {storyComic?.imageUrl ? (
                    <div className="space-y-3">
                        <div className="text-center text-white font-bold text-lg">{storyComic.storyTitle}</div>
                        <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                            <img
                                src={storyComic.imageUrl}
                                alt="Story Comic"
                                className="w-full h-auto object-cover"
                            />
                        </div>
                    </div>
                ) : (
                    <div className="h-56 rounded-2xl bg-white/5 border-2 border-dashed border-white/20 flex flex-col items-center justify-center text-purple-300">
                        <BookMarked size={56} className="opacity-20 mb-4" />
                        <p className="text-base font-medium">AI 将学习内容变成冒险故事</p>
                        <p className="text-xs text-purple-400 mt-2">支持 22+ 漫画画风：日漫 / 美漫 / 国漫 / 儿童卡通 / 特殊风格</p>
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
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100/50 hover:shadow-md transition-all flex flex-col justify-between h-[180px]">
                    <div className="flex justify-between items-start">
                        <div className="p-3 bg-orange-50 text-orange-500 rounded-2xl">
                            <Activity size={24} strokeWidth={2.5} />
                        </div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Streak</span>
                    </div>
                    <div>
                        <div className="flex items-baseline gap-1 mb-2">
                            <span className="text-4xl font-bold text-slate-800">{stats.streak}</span>
                            <span className="text-lg text-slate-400 font-medium">days</span>
                        </div>
                        <div className="text-sm text-slate-500 font-medium">连续学习天数</div>
                    </div>
                </div>

                {/* Card 3: Plan (Purple Theme) */}
                <div
                    onClick={() => onNavigate('plan')}
                    className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100/50 hover:shadow-md hover:border-blue-100 transition-all cursor-pointer flex flex-col justify-between h-[180px] group"
                >
                    <div className="flex justify-between items-start">
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl group-hover:bg-purple-100 transition-colors">
                            <Calendar size={24} strokeWidth={2.5} />
                        </div>
                        <ChevronRight className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg font-bold text-slate-800">查看智能计划</span>
                        </div>
                        <div className="text-sm text-slate-500 leading-relaxed">
                            AI 已根据进度调整复习队列，点击开始今日复习。
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Dashboard;
