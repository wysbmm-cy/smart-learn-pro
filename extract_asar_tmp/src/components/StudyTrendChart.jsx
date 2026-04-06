import React, { useMemo } from 'react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Calendar } from 'lucide-react';

const StudyTrendChart = ({ days = 30 }) => {
    const chartData = useMemo(() => {
        // Get stats from localStorage
        try {
            const statsStr = localStorage.getItem('smartlearn_stats');
            if (!statsStr) return [];

            const stats = JSON.parse(statsStr);
            // Ensure dailyActivity is an array
            const dailyActivity = Array.isArray(stats.dailyActivity) ? stats.dailyActivity : [];

            // Get last N days
            const now = new Date();
            const result = [];

            for (let i = days - 1; i >= 0; i--) {
                const date = new Date(now);
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];

                // Find activity for this date
                const activity = dailyActivity.find(a => a.date === dateStr);

                result.push({
                    date: dateStr,
                    displayDate: `${date.getMonth() + 1}/${date.getDate()}`,
                    flashcards: activity?.flashcard || 0,
                    words: activity?.words || 0,
                    notes: activity?.notes || 0
                });
            }

            return result;
        } catch (error) {
            console.error('Error parsing study stats:', error);
            return [];
        }
    }, [days]);

    const totalCards = useMemo(() => {
        return chartData.reduce((sum, day) => sum + day.flashcards, 0);
    }, [chartData]);

    if (chartData.length === 0 || totalCards === 0) {
        return (
            <div className="bg-phy-glass rounded-2xl p-6 border border-phy-border shadow-sm">
                <h3 className="font-bold text-phy-text mb-4 flex items-center gap-2">
                    <TrendingUp size={20} className="text-blue-500" />
                    学习趋势 (最近 {days} 天)
                </h3>
                <div className="h-64 flex items-center justify-center text-phy-muted text-sm">
                    <div className="text-center">
                        <Calendar size={48} className="mx-auto mb-2 opacity-20" />
                        <p>暂无学习记录</p>
                        <p className="text-xs mt-1">完成复习后即可查看趋势</p>
                    </div>
                </div>
            </div>
        );
    }

    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-phy-glassHeavy text-white px-4 py-3 rounded-lg shadow-lg">
                    <div className="font-bold mb-2 text-sm">{label}</div>
                    {payload.map((entry, index) => (
                        <div key={index} className="text-xs flex items-center gap-2">
                            <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: entry.color }}
                            />
                            <span className="text-phy-text">{entry.name}:</span>
                            <span className="font-bold">{entry.value}</span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="bg-phy-glass rounded-2xl p-6 border border-phy-border shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-phy-text flex items-center gap-2">
                    <TrendingUp size={20} className="text-blue-500" />
                    学习趋势 (最近 {days} 天)
                </h3>
                <div className="text-xs text-phy-muted">
                    累计复习 <span className="font-bold text-indigo-600">{totalCards}</span> 张卡片
                </div>
            </div>

            <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorFlashcards" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorWords" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                        dataKey="displayDate"
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                    />
                    <YAxis
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                        wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                        iconType="circle"
                    />
                    <Area
                        type="monotone"
                        dataKey="flashcards"
                        name="复习卡片"
                        stroke="#6366f1"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorFlashcards)"
                    />
                    <Area
                        type="monotone"
                        dataKey="words"
                        name="学习单词"
                        stroke="#10b981"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorWords)"
                    />
                </AreaChart>
            </ResponsiveContainer>

            <div className="mt-4 pt-4 border-t border-slate-50 grid grid-cols-3 gap-4">
                <div className="text-center">
                    <div className="text-xs text-phy-muted mb-1">日均复习</div>
                    <div className="text-lg font-bold text-indigo-600">
                        {(totalCards / days).toFixed(1)}
                    </div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-phy-muted mb-1">最高记录</div>
                    <div className="text-lg font-bold text-blue-600">
                        {Math.max(...chartData.map(d => d.flashcards))}
                    </div>
                </div>
                <div className="text-center">
                    <div className="text-xs text-phy-muted mb-1">活跃天数</div>
                    <div className="text-lg font-bold text-emerald-600">
                        {chartData.filter(d => d.flashcards > 0).length}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudyTrendChart;
