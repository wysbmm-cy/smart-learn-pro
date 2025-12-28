import React from 'react';

const StudyHeatmap = ({ dailyActivity }) => {
    // Generate dates for the last 180 days (approx 6 months)
    const days = [];
    const today = new Date();
    // Normalize today to start of day
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 168; i++) { // 24 weeks * 7 days = 168
        const d = new Date(today);
        d.setDate(d.getDate() - (168 - 1 - i));
        days.push(d);
    }

    const getColor = (count) => {
        if (!count) return 'bg-slate-100';
        if (count < 5) return 'bg-green-200';
        if (count < 10) return 'bg-green-400';
        if (count < 20) return 'bg-green-600';
        return 'bg-green-800';
    };

    const formatDate = (date) => {
        return date.toISOString().split('T')[0];
    };

    // Group by weeks for column layout
    const weeks = [];
    let currentWeek = [];

    days.forEach((day, index) => {
        currentWeek.push(day);
        if (currentWeek.length === 7) {
            weeks.push(currentWeek);
            currentWeek = [];
        }
    });

    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6 animate-fade-in">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                Learning Consistency (Last 6 Months)
            </h3>

            <div className="overflow-x-auto pb-2">
                <div className="flex gap-1 min-w-max">
                    {weeks.map((week, wIndex) => (
                        <div key={wIndex} className="flex flex-col gap-1">
                            {week.map((day, dIndex) => {
                                const dateStr = formatDate(day);
                                const count = dailyActivity[dateStr] || 0;
                                return (
                                    <div
                                        key={dateStr}
                                        className={`w-3 h-3 rounded-sm ${getColor(count)} transition-all hover:scale-125 hover:ring-2 ring-offset-1 ring-green-300 relative group cursor-pointer hover:z-20`}
                                    >
                                        {/* Tooltip */}
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none">
                                            {count} words on {dateStr}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-3 text-[10px] text-slate-400">
                <span>Less</span>
                <div className="w-3 h-3 bg-slate-100 rounded-sm"></div>
                <div className="w-3 h-3 bg-green-200 rounded-sm"></div>
                <div className="w-3 h-3 bg-green-400 rounded-sm"></div>
                <div className="w-3 h-3 bg-green-600 rounded-sm"></div>
                <div className="w-3 h-3 bg-green-800 rounded-sm"></div>
                <span>More</span>
            </div>
        </div>
    );
};

export default StudyHeatmap;
