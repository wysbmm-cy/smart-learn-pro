import React from 'react';
import ReactDOM from 'react-dom';
import { ChevronRight, CheckCircle } from 'lucide-react';

const FixedTooltip = ({ data, onApply }) => {
    if (!data || !data.issue) return null;

    const { x, y, issue } = data;

    let badgeColor = "text-amber-400";
    let borderColor = "border-amber-500/20";

    if (issue.severity === 'critical') {
        badgeColor = "text-red-400";
        borderColor = "border-red-500/20";
    } else if (issue.severity === 'style') {
        badgeColor = "text-purple-400";
        borderColor = "border-purple-500/20";
    }

    return ReactDOM.createPortal(
        <div
            style={{
                top: y,
                left: x,
                maxWidth: '320px'
            }}
            className="fixed z-[9999] transform -translate-x-1/2 mt-2 pointer-events-none"
            onMouseEnter={data.onMouseEnter}
            onMouseLeave={data.onMouseLeave}
        >
            <div className={`pointer-events-auto bg-slate-900/95 backdrop-blur-xl rounded-xl shadow-2xl border ${borderColor} ring-1 ring-white/10 overflow-hidden animate-in fade-in zoom-in-95 duration-200`}>
                <div className="flex justify-between items-center p-3 bg-phy-glass border-b border-phy-border">
                    <div className="flex items-center gap-2">
                        <span className={`font-bold text-xs uppercase tracking-wider ${badgeColor}`}>{issue.type}</span>
                        <span className="text-[10px] px-1.5 py-0.5 bg-phy-glassHover rounded text-phy-muted font-mono uppercase">{issue.severity}</span>
                    </div>
                </div>

                <div className="p-4 space-y-3">
                    <div className="text-sm text-phy-text leading-relaxed font-sans text-justify">
                        {issue.reason}
                    </div>

                    <div className="flex items-center gap-2 text-sm bg-black/40 p-2.5 rounded-lg border border-phy-border font-mono overflow-x-auto custom-scrollbar">
                        <span className="text-red-400/70 line-through decoration-red-500/30 whitespace-nowrap">{issue.original}</span>
                        <ChevronRight size={12} className="text-phy-muted shrink-0" />
                        <span className="text-emerald-400 font-bold whitespace-nowrap">{issue.fixed}</span>
                    </div>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onApply(issue);
                        }}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-emerald-900/20 active:scale-95 group"
                    >
                        <CheckCircle size={14} className="group-hover:scale-110 transition-transform" />
                        立即应用修正
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default FixedTooltip;
