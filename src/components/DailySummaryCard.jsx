import React, { useState } from 'react';
import { Sparkles, Activity, BookOpen, Quote, Zap, Code, Target, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

const THEMES = {
    modern: {
        wrapper: 'bg-white/80 backdrop-blur-xl border border-phy-border/50 shadow-2xl rounded-[2rem] p-8 relative overflow-hidden transition-all duration-500',
        title: 'text-phy-text font-bold font-black',
        subtitle: 'text-phy-muted font-medium',
        statBox: 'bg-phy-bg border border-phy-border rounded-2xl p-5 hover:scale-105 transition-transform duration-300',
        statLabel: 'text-phy-muted text-sm font-bold',
        statValue: 'text-phy-text font-bold text-3xl font-black mt-2',
        iconColor: 'text-blue-500',
        highlightBox: 'bg-phy-glass border text-sm text-phy-text border-phy-border rounded-xl p-4 shadow-sm',
        accent: 'bg-blue-500'
    },
    cyber: {
        wrapper: 'bg-slate-950 border border-cyan-500/30 shadow-[0_0_30px_rgba(6,182,212,0.15)] rounded-[2rem] p-8 relative overflow-hidden transition-all duration-500',
        title: 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-500 font-black tracking-wider',
        subtitle: 'text-cyan-500/70 font-mono text-sm',
        statBox: 'bg-slate-900/50 border border-cyan-500/20 rounded-2xl p-5 backdrop-blur-md hover:border-cyan-400/50 transition-colors duration-300',
        statLabel: 'text-cyan-500/60 font-mono text-xs uppercase tracking-widest',
        statValue: 'text-cyan-400 text-3xl font-black mt-2 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)] font-mono',
        iconColor: 'text-fuchsia-500',
        highlightBox: 'bg-slate-900/80 border text-sm text-cyan-50 border-cyan-500/20 rounded-xl p-4 font-mono shadow-[inset_0_0_15px_rgba(6,182,212,0.05)]',
        accent: 'bg-cyan-500'
    },
    elegant: {
        wrapper: 'bg-gradient-to-br from-stone-100 to-stone-50 border border-stone-200 shadow-xl rounded-[2rem] p-8 relative overflow-hidden transition-all duration-500',
        title: 'text-stone-800 font-serif italic',
        subtitle: 'text-stone-500 font-serif',
        statBox: 'bg-phy-glass0 border border-stone-200 rounded-2xl p-5 hover:bg-phy-glass transition-colors duration-300 shadow-sm hover:shadow-md',
        statLabel: 'text-stone-500 text-sm font-serif',
        statValue: 'text-stone-800 text-3xl font-serif mt-2',
        iconColor: 'text-amber-700',
        highlightBox: 'bg-phy-glass border text-sm text-stone-700 border-stone-200 rounded-xl p-4 shadow-sm italic',
        accent: 'bg-amber-700'
    }
};

const DailySummaryCard = ({ stats, highlights, onDeleteHighlight, onClearHighlights }) => {
    const [themeKey, setThemeKey] = useState('modern');
    const [showManager, setShowManager] = useState(false);
    const theme = THEMES[themeKey];

    return (
        <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-bold text-phy-muted">摘要视图风格:</span>
                <div className="flex bg-phy-bg p-1 rounded-xl shadow-inner">
                    <button onClick={() => setThemeKey('modern')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${themeKey === 'modern' ? 'bg-phy-glass shadow text-phy-text font-bold' : 'text-phy-muted hover:text-phy-text'}`}>Modern</button>
                    <button onClick={() => setThemeKey('cyber')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${themeKey === 'cyber' ? 'bg-phy-glassHeavy shadow text-cyan-400' : 'text-phy-muted hover:text-phy-text'}`}>Cyber</button>
                    <button onClick={() => setThemeKey('elegant')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${themeKey === 'elegant' ? 'bg-stone-200 shadow text-stone-800' : 'text-phy-muted hover:text-phy-text'}`}>Elegant</button>
                </div>
            </div>

            <div className={theme.wrapper}>
                {/* Decorative Elements */}
                {themeKey === 'cyber' && (
                    <>
                        <div className="absolute top-0 right-0 w-64 h-64 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none"></div>
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
                        <div className="absolute top-4 right-4 text-cyan-500/30 text-xs font-mono">SYS_REPORT_01</div>
                    </>
                )}
                {themeKey === 'modern' && (
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
                )}

                <div className="flex items-center justify-between mb-8 relative z-10">
                    <div>
                        <h2 className={`text-2xl md:text-3xl ${theme.title}`}>Daily Learning Report</h2>
                        <p className={`mt-1 ${theme.subtitle}`}>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </div>
                    <div className={`p-4 rounded-full bg-phy-glassHover backdrop-blur-md border border-white/20 shadow-xl ${theme.iconColor}`}>
                        {themeKey === 'cyber' ? <Zap size={32} /> : <Sparkles size={32} />}
                    </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 relative z-10 mb-8">
                    <div className={theme.statBox}>
                        <div className="flex items-center gap-2">
                            <Target size={16} className={theme.iconColor} />
                            <span className={theme.statLabel}>Words Learned</span>
                        </div>
                        <div className={theme.statValue}>{stats.wordsLearned || 0}</div>
                    </div>
                    <div className={theme.statBox}>
                        <div className="flex items-center gap-2">
                            <BookOpen size={16} className={theme.iconColor} />
                            <span className={theme.statLabel}>Articles Read</span>
                        </div>
                        <div className={theme.statValue}>{stats.articlesRead || 0}</div>
                    </div>
                    <div className={theme.statBox}>
                        <div className="flex items-center gap-2">
                            <Activity size={16} className={theme.iconColor} />
                            <span className={theme.statLabel}>Interactions</span>
                        </div>
                        <div className={theme.statValue}>{stats.questionsAsked || 0}</div>
                    </div>
                    <div className={theme.statBox}>
                        <div className="flex items-center gap-2">
                            <Code size={16} className={theme.iconColor} />
                            <span className={theme.statLabel}>Words Written</span>
                        </div>
                        <div className={theme.statValue}>{stats.writingCount || 0}</div>
                    </div>
                </div>

                {highlights.length > 0 && (
                    <div className="relative z-10 border-t border-phy-border/20 pt-6 mt-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className={`flex items-center gap-2 ${theme.subtitle}`}>
                                <Quote size={20} className={theme.iconColor} />
                                <span>Today's Highlights ({highlights.length})</span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowManager(!showManager)}
                                    className={`flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors ${themeKey === 'cyber' ? 'border-cyan-500/30 text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20' : 'border-phy-border text-phy-muted bg-phy-glass0 hover:bg-phy-glass'}`}
                                >
                                    {showManager ? '收起列表' : '管理标记'}
                                    {showManager ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                                {showManager && (
                                    <button
                                        onClick={onClearHighlights}
                                        className="text-xs px-3 py-1.5 border border-red-200 text-red-500 bg-red-50/50 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        清空
                                    </button>
                                )}
                            </div>
                        </div>

                        {!showManager ? (
                            <div className="space-y-3">
                                {highlights.slice(0, 3).map((h, i) => (
                                    <div key={i} className={theme.highlightBox}>
                                        "{h.content}"
                                    </div>
                                ))}
                                {highlights.length > 3 && (
                                    <div className={`text-center text-xs mt-2 cursor-pointer ${theme.subtitle}`} onClick={() => setShowManager(true)}>
                                        ... and {highlights.length - 3} more. Click to manage.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className={`space-y-2 max-h-60 overflow-y-auto custom-scrollbar p-2 rounded-xl ${themeKey === 'cyber' ? 'bg-slate-900/50' : 'bg-slate-100/50'}`}>
                                {highlights.map(h => (
                                    <div key={h.id} className={`flex items-start justify-between gap-3 text-sm p-3 rounded-xl transition-colors ${theme.highlightBox}`}>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${h.type === 'note' ? 'bg-blue-500/20 text-blue-600' : h.type === 'card' ? 'bg-green-500/20 text-green-600' : 'bg-purple-500/20 text-purple-600'}`}>
                                                    {h.type || 'TEXT'}
                                                </span>
                                                <span className="text-xs opacity-50">{new Date(h.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <p className="line-clamp-2 leading-relaxed opacity-90">"{h.content}"</p>
                                        </div>
                                        <button
                                            onClick={() => onDeleteHighlight(h.id)}
                                            className="p-2 text-phy-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                            title="移除此标记"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
export default DailySummaryCard;
