import React, { useEffect, useState } from 'react';
import { Upload, CheckCircle, Activity, ChevronRight, Calendar, Sparkles, BookOpen } from 'lucide-react';
import { useApp } from '../context/AppContext';
import ForgettingCurveChart from '../components/ForgettingCurveChart';
import UserGuideModal from '../components/UserGuideModal';

const Dashboard = ({ onNavigate }) => {
    const { stats, settings, loadUserFlashcards } = useApp();
    const hasKey = !!settings.apiKey;
    const [flashcards, setFlashcards] = useState([]);
    const [showGuide, setShowGuide] = useState(false);

    useEffect(() => {
        const load = async () => {
            const cards = await loadUserFlashcards();
            setFlashcards(cards);
        };
        load();
    }, []);

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

            {/* 2. Forgetting Curve & Today's Task */}
            <ForgettingCurveChart
                flashcards={flashcards}
                onReviewStart={() => onNavigate('flashcards')}
            />

            {/* 2. Stats Grid - Clean White Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* Card 1: Daily Goal (Green Theme) */}
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100/50 hover:shadow-md transition-all flex flex-col justify-between h-[180px]">
                    <div className="flex justify-between items-start">
                        <div className="p-3 bg-green-50 text-green-600 rounded-2xl">
                            <CheckCircle size={24} strokeWidth={2.5} />
                        </div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Daily Goal</span>
                    </div>
                    <div>
                        <div className="flex items-baseline gap-1 mb-2">
                            <span className="text-4xl font-bold text-slate-800">{stats.todayLearned}</span>
                            <span className="text-xl text-slate-300 font-medium">/{stats.todayGoal}</span>
                        </div>
                        <div className="text-sm text-slate-500 font-medium mb-3">词汇学习进度</div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-green-500 rounded-full"
                                style={{ width: `${Math.min((stats.todayLearned / stats.todayGoal) * 100, 100)}%` }}
                            ></div>
                        </div>
                    </div>
                </div>

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
