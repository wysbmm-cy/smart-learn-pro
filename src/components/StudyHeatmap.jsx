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

    const getLevel = (count) => {
        if (!count) return 0;
        if (count < 10) return 1; // Light effort
        if (count < 30) return 2; // Moderate effort
        if (count < 60) return 3; // High effort
        return 4;                 // Extreme effort (60+ items)
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
        <div className="bg-phy-glass rounded-2xl p-6 shadow-sm border border-phy-border mb-6 animate-fade-in">
            <h3 className="text-sm font-bold text-phy-muted uppercase tracking-wider mb-4 flex items-center gap-2">
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
                                 const level = getLevel(count);
                                 return (
                                     <div
                                         key={dateStr}
                                         className={`w-3 h-3 rounded-sm transition-all hover:scale-125 hover:ring-2 ring-offset-1 ring-phy-accent relative group cursor-pointer hover:z-20`}
                                         style={{ backgroundColor: `var(--heatmap-l${level})` }}
                                     >
                                         {/* Tooltip */}
                                         <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-phy-glassHeavy backdrop-blur-md text-white border border-phy-border text-[10px] px-2 py-1 rounded whitespace-nowrap z-10 pointer-events-none shadow-xl">
                                             {count} words on {dateStr}
                                         </div>
                                     </div>
                                 );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-center justify-end gap-2 mt-3 text-[10px] text-phy-muted font-medium">
                <span>Less</span>
                <div className="w-3 h-3 rounded-sm shadow-inner" style={{ backgroundColor: 'var(--heatmap-l0)' }}></div>
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--heatmap-l1)' }}></div>
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--heatmap-l2)' }}></div>
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--heatmap-l3)' }}></div>
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--heatmap-l4)' }}></div>
                <span>More</span>
            </div>
        </div>
    );
};

export default StudyHeatmap;
