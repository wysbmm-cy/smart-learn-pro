import React, { useEffect, useState } from 'react';
import { Upload, CheckCircle, Activity, ChevronRight, Calendar, Sparkles, BookOpen, ImageIcon, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import ForgettingCurveChart from '../components/ForgettingCurveChart';
import UserGuideModal from '../components/UserGuideModal';
import StudyHeatmap from '../components/StudyHeatmap';
import { getHighlightsByDate } from '../services/db';
import { generateDailySummaryImage } from '../services/ai';

const Dashboard = ({ onNavigate }) => {
    const { stats, settings, loadUserFlashcards, setFlashcardStartupState } = useApp();
    const hasKey = !!settings.apiKey;
    const [flashcards, setFlashcards] = useState([]);
    const [showGuide, setShowGuide] = useState(false);

    // Daily Summary Image State
    const [dailyImage, setDailyImage] = useState(null);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [todayHighlights, setTodayHighlights] = useState([]);

    useEffect(() => {
        const load = async () => {
            const cards = await loadUserFlashcards();
            setFlashcards(cards);

            // Load today's highlights
            const today = new Date().toISOString().split('T')[0];
            const highlights = await getHighlightsByDate(today);
            setTodayHighlights(highlights);
        };
        load();
    }, []);

    const handleGenerateImage = async () => {
        if (!todayHighlights.length) {
            alert('今日暂无标记内容。请先在各模块中标记一些重点内容！');
            return;
        }
        setIsGeneratingImage(true);
        try {
            const imageUrl = await generateDailySummaryImage(todayHighlights, settings);
            if (imageUrl) {
                setDailyImage(imageUrl);
            } else {
                alert('图片生成失败，请检查生图 API 配置');
            }
        } catch (e) {
            console.error(e);
            alert('生成失败: ' + e.message);
        } finally {
            setIsGeneratingImage(false);
        }
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

            {/* 2. Study Heatmap (Replaces Daily Goal) */}
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

                {/* Card: Daily Summary Image */}
                <div className="md:col-span-2 bg-gradient-to-br from-slate-900 to-indigo-900 p-6 rounded-3xl shadow-lg border border-indigo-500/20 relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <div className="flex items-center gap-2 text-white font-bold text-lg mb-1">
                                <ImageIcon size={20} className="text-amber-400" />
                                每日总结生图
                            </div>
                            <div className="text-indigo-300 text-sm">
                                今日已标记 <span className="font-bold text-amber-400">{todayHighlights.length}</span> 条内容
                            </div>
                        </div>
                        <button
                            onClick={handleGenerateImage}
                            disabled={isGeneratingImage || !todayHighlights.length}
                            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${isGeneratingImage ? 'bg-slate-700 text-slate-400' : todayHighlights.length ? 'bg-amber-500 hover:bg-amber-400 text-slate-900' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                        >
                            {isGeneratingImage ? (
                                <><Loader2 size={16} className="animate-spin" /> 生成中...</>
                            ) : (
                                <><Sparkles size={16} /> 生成图片</>
                            )}
                        </button>
                    </div>

                    {dailyImage ? (
                        <div className="rounded-xl overflow-hidden border border-white/10">
                            <img
                                src={dailyImage.startsWith('data:') ? dailyImage : dailyImage}
                                alt="Daily Summary"
                                className="w-full h-auto object-cover"
                            />
                        </div>
                    ) : (
                        <div className="h-48 rounded-xl bg-white/5 border border-dashed border-white/20 flex flex-col items-center justify-center text-indigo-300">
                            <ImageIcon size={48} className="opacity-30 mb-3" />
                            <p className="text-sm">点击“生成图片”创建今日学习总结</p>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default Dashboard;
