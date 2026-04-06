import React from 'react';
import { Brain, CheckCircle, Clock, TrendingUp } from 'lucide-react';

const ForgettingCurveChart = ({ flashcards, onReviewStart }) => {
    const now = Date.now();

    // 1. Calculate Stats
    const dueCards = flashcards.filter(c => !c.nextReview || c.nextReview <= now);
    const learning = flashcards.filter(c => c.repetitions === 0).length;
    const reviewing = flashcards.filter(c => c.repetitions > 0 && c.repetitions < 5).length;
    const mastered = flashcards.filter(c => c.repetitions >= 5).length;

    // 2. Future Distribution (Next 7 days)
    const futureDistribution = Array(7).fill(0);
    flashcards.forEach(c => {
        if (c.nextReview > now) {
            const diffDays = Math.floor((c.nextReview - now) / (1000 * 60 * 60 * 24));
            if (diffDays < 7) futureDistribution[diffDays]++;
        }
    });

    const maxCount = Math.max(...futureDistribution, 1);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 animate-fade-in">
            {/* Left: Today's Task */}
            <div className="bg-gradient-to-br from-indigo-500 to-violet-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-500/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Brain size={120} />
                </div>

                <div className="relative z-10">
                    <h3 className="text-indigo-100 font-medium mb-1 flex items-center gap-2">
                        <Clock size={16} /> 今日记忆任务
                    </h3>
                    <div className="mt-4 flex items-end gap-2">
                        <span className="text-5xl font-bold">{dueCards.length}</span>
                        <span className="text-indigo-200 mb-1">个单词待复习</span>
                    </div>

                    <div className="mt-6 flex gap-3">
                        <div className="flex-1 bg-phy-glassHover rounded-xl p-3 backdrop-blur-sm border border-phy-borderHover">
                            <div className="text-xs text-indigo-200 mb-1">正在学习</div>
                            <div className="text-xl font-bold">{learning}</div>
                        </div>
                        <div className="flex-1 bg-phy-glassHover rounded-xl p-3 backdrop-blur-sm border border-phy-borderHover">
                            <div className="text-xs text-indigo-200 mb-1">深度复习</div>
                            <div className="text-xl font-bold">{reviewing}</div>
                        </div>
                        <div className="flex-1 bg-phy-glassHover rounded-xl p-3 backdrop-blur-sm border border-phy-borderHover">
                            <div className="text-xs text-indigo-200 mb-1">已掌握</div>
                            <div className="text-xl font-bold text-green-300">{mastered}</div>
                        </div>
                    </div>

                    <button
                        onClick={onReviewStart}
                        className="mt-6 w-full bg-phy-glass text-indigo-600 py-3 rounded-xl font-bold hover:bg-indigo-50 transition-colors shadow-lg flex items-center justify-center gap-2"
                    >
                        {dueCards.length > 0 ? (
                            <>
                                <TrendingUp size={18} />
                                开始复习 ({dueCards.length})
                            </>
                        ) : (
                            <>
                                <CheckCircle size={18} />
                                今日任务已完成
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Right: Memory Curve Distribution */}
            <div className="bg-phy-glass rounded-3xl p-6 border border-phy-border shadow-sm flex flex-col">
                <h3 className="font-bold text-phy-text flex items-center gap-2 mb-6">
                    <TrendingUp size={20} className="text-blue-500" />
                    未来7天记忆压力
                </h3>

                <div className="flex-1 flex items-end justify-between gap-2 h-32 px-2">
                    {futureDistribution.map((count, i) => (
                        <div key={i} className="flex flex-col items-center gap-2 flex-1 group relative">
                            <div
                                className="w-full bg-blue-100 rounded-lg relative transition-all duration-500 group-hover:bg-blue-200"
                                style={{ height: `${(count / maxCount) * 100}%`, minHeight: '4px' }}
                            >
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-phy-glassHeavy text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                    {count}词
                                </div>
                            </div>
                            <div className="text-xs text-phy-muted font-medium">
                                {i === 0 ? '明天' : `+${i + 1}天`}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-6 pt-6 border-t border-slate-50 flex justify-between text-xs text-phy-muted">
                    <p>遵循艾宾浩斯遗忘曲线，今日复习效率最高。</p>
                </div>
            </div>
        </div>
    );
};

export default ForgettingCurveChart;
