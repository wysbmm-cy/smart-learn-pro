import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Brain, Zap, BookOpen, Sparkles } from 'lucide-react';

const DifficultyPieChart = ({ flashcards }) => {
    const stats = useMemo(() => {
        // Ensure flashcards is an array
        if (!flashcards || !Array.isArray(flashcards) || flashcards.length === 0) {
            return {
                data: [],
                total: 0
            };
        }

        // Categorize cards by difficulty
        const categories = {
            new: 0,      // repetitions === 0
            difficult: 0, // easeFactor < 2.0 or high failures
            medium: 0,    // easeFactor 2.0-2.5
            easy: 0       // easeFactor > 2.5
        };

        flashcards.forEach(card => {
            if (card.repetitions === 0) {
                categories.new++;
            } else {
                const ef = card.easeFactor || 2.5;
                if (ef < 2.0) {
                    categories.difficult++;
                } else if (ef <= 2.5) {
                    categories.medium++;
                } else {
                    categories.easy++;
                }
            }
        });

        const data = [
            { name: '新卡片', value: categories.new, color: '#94a3b8', icon: Sparkles },
            { name: '困难', value: categories.difficult, color: '#f87171', icon: Brain },
            { name: '中等', value: categories.medium, color: '#fbbf24', icon: BookOpen },
            { name: '简单', value: categories.easy, color: '#34d399', icon: Zap }
        ].filter(item => item.value > 0);

        return {
            data,
            total: flashcards.length
        };
    }, [flashcards]);

    if (stats.total === 0) {
        return (
            <div className="bg-phy-glass rounded-2xl p-6 border border-phy-border shadow-sm">
                <h3 className="font-bold text-phy-text mb-4 flex items-center gap-2">
                    <Brain size={20} className="text-indigo-500" />
                    难度分布
                </h3>
                <div className="h-48 flex items-center justify-center text-phy-muted text-sm">
                    暂无数据，开始复习后即可查看
                </div>
            </div>
        );
    }

    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const data = payload[0];
            const percentage = ((data.value / stats.total) * 100).toFixed(1);
            return (
                <div className="bg-phy-glassHeavy text-white px-3 py-2 rounded-lg shadow-lg text-sm">
                    <div className="font-bold">{data.name}</div>
                    <div className="text-phy-text">{data.value} 张 ({percentage}%)</div>
                </div>
            );
        }
        return null;
    };

    const renderLegend = (props) => {
        const { payload } = props;
        return (
            <div className="flex flex-wrap gap-3 justify-center mt-4">
                {payload.map((entry, index) => {
                    const Icon = entry.payload.icon;
                    return (
                        <div key={`legend-${index}`} className="flex items-center gap-2 text-sm">
                            <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: entry.color }}
                            />
                            <Icon size={14} className="text-phy-muted" />
                            <span className="text-phy-muted font-medium">{entry.value}</span>
                            <span className="text-phy-muted">({entry.payload.value})</span>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="bg-phy-glass rounded-2xl p-6 border border-phy-border shadow-sm">
            <h3 className="font-bold text-phy-text mb-4 flex items-center gap-2">
                <Brain size={20} className="text-indigo-500" />
                难度分布
                <span className="ml-auto text-xs font-normal text-phy-muted">
                    共 {stats.total} 张卡片
                </span>
            </h3>

            <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                    <Pie
                        data={stats.data}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                    >
                        {stats.data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend content={renderLegend} />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
};

export default DifficultyPieChart;
