import { useState } from 'react';
import { useApp } from '../context/AppContext';
import ChatSidebar from '../components/ChatSidebar';
import PomodoroTimer from '../components/PomodoroTimer';
import GlobalPlayer from '../components/GlobalPlayer';
// Custom Split Component
import SplitPane from '../components/SplitPane';

import {
    Clock, FolderOpen, NotebookPen, Layers, Columns, Maximize2, Menu, Mic
} from 'lucide-react';
// NotesView import removed (dynamic in App.jsx)

const SidebarItem = ({ icon: Icon, label, active, onClick, onContextMenu }) => (
    <button
        onClick={onClick}
        onContextMenu={onContextMenu}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-medium text-[14px] mb-1.5 outline-none focus:outline-none ${active
            ? 'bg-gradient-to-r from-violet-600/20 to-indigo-600/20 text-indigo-300 font-bold shadow-[0_0_15px_rgba(139,92,246,0.1)] border border-violet-500/30'
            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
            }`}
    >
        <Icon size={18} strokeWidth={active ? 2.5 : 2} className="shrink-0" />
        <span className="whitespace-nowrap">{label}</span>
    </button>
);

const Layout = ({ currentView, setCurrentView, children, isSplit, setIsSplit, onOpenSplit, secondaryContent }) => {
    const { toggleChat, isChatOpen, settings } = useApp();
    const [isSidebarOpen, setSidebarOpen] = useState(true);
    const [showPomodoro, setShowPomodoro] = useState(false); // Default hidden

    // Context Menu State
    const [contextMenu, setContextMenu] = useState(null);

    const handleContextMenu = (e, itemId) => {
        e.preventDefault();
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            itemId
        });
    };

    // Close menu when clicking elsewhere
    const handleClick = () => {
        if (contextMenu) setContextMenu(null);
    };

    const navItems = [
        { id: 'dashboard', icon: BarChart2, label: '工作台' },
        { id: 'notes', icon: NotebookPen, label: '我的笔记' },
        { id: 'import', icon: Upload, label: '导入分析' },
        { id: 'study', icon: BookOpen, label: '词汇与阅读' },
        { id: 'flashcards', icon: Layers, label: '抽记卡 (Flashcards)' },
        { id: 'library', icon: FolderOpen, label: '文件库' },
        { id: 'history', icon: Clock, label: '历史回顾' },
        { id: 'coach', icon: Mic, label: '口语教练 (AI Coach)' },
        { id: 'plan', icon: Activity, label: '智能计划' },
    ];

    return (
        <div
            onClick={handleClick}
            className="flex h-screen w-full overflow-hidden relative selection:bg-violet-500/30 selection:text-violet-200 bg-[#0f172a] text-slate-200"
        >
            {/* Zen Background Layer (Dark Theme) */}
            <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#1e1b4b] to-slate-950">
                {settings.backgroundImage && (
                    <img
                        src={settings.backgroundImage}
                        className="w-full h-full object-cover transition-opacity duration-700 opacity-40 mix-blend-overlay"
                        alt="Zen Background"
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                )}
                {/* Cyber Glass Overlay */}
                <div
                    className="absolute inset-0 backdrop-blur-[20px] bg-slate-950/40"
                    style={{ opacity: 1 - (settings.glassOpacity ?? 0.3) }}
                />
            </div>

            {/* Sidebar - Glass */}
            <aside className={`${isSidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full opacity-0'} flex flex-col h-full shrink-0 z-20 relative transition-all duration-300 border-r border-white/5 bg-slate-950/30 backdrop-blur-xl overflow-hidden`}>
                <div className="h-20 flex items-center px-6">
                    <div className="flex items-center gap-3 text-indigo-400 font-extrabold text-xl tracking-tight drop-shadow-[0_0_10px_rgba(99,102,241,0.5)]">
                        <Brain size={28} strokeWidth={2.5} />
                        <span>AI SmartLearn</span>
                    </div>
                </div>

                <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto custom-scrollbar">
                    {navItems.map((item) => (
                        <SidebarItem
                            key={item.id}
                            {...item}
                            active={currentView === item.id}
                            onClick={() => setCurrentView(item.id)}
                            onContextMenu={(e) => handleContextMenu(e, item.id)}
                        />
                    ))}
                </nav>

                <div className="p-4 border-t border-white/5">
                    <SidebarItem
                        icon={Settings}
                        label="设置 & API"
                        active={currentView === 'settings'}
                        onClick={() => setCurrentView('settings')}
                    />
                </div>
            </aside>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed z-50 w-48 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl py-1 animate-fade-in text-sm"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <button
                        className="w-full text-left px-4 py-2 hover:bg-violet-600/30 text-slate-200 hover:text-white"
                        onClick={() => setCurrentView(contextMenu.itemId)}
                    >
                        在此页打开
                    </button>
                    <button
                        className="w-full text-left px-4 py-2 hover:bg-violet-600/30 text-indigo-300 hover:text-white border-t border-white/5"
                        onClick={() => onOpenSplit(contextMenu.itemId)}
                    >
                        分屏打开 (Open in Split)
                    </button>
                </div>
            )}

            {/* Main Content - Split-Pane Capable */}
            <div className="flex-1 flex flex-col h-full min-w-0 relative z-10 bg-transparent">
                {/* Header */}
                <header className="h-16 flex items-center justify-between px-6 shrink-0 border-b border-white/5 bg-slate-950/20 backdrop-blur-md">
                    <div className='flex items-center gap-4'>
                        {/* Sidebar Toggle */}
                        <button
                            onClick={() => setSidebarOpen(!isSidebarOpen)}
                            className="p-2 -ml-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                        >
                            <Menu size={20} />
                        </button>

                        <h2 className="text-lg font-bold text-slate-100 tracking-wide">
                            {navItems.find(i => i.id === currentView)?.label || (currentView === 'settings' ? 'Global Settings' : 'Overview')}
                        </h2>
                        {/* Split Toggle */}
                        <button
                            onClick={() => setIsSplit(!isSplit)}
                            className={`p-2 rounded-lg transition-all border ${isSplit
                                ? 'bg-violet-600/20 border-violet-500/50 text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.2)]'
                                : 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5'}`}
                            title="Toggle Split View"
                        >
                            {isSplit ? <Columns size={18} /> : <Maximize2 size={18} />}
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setShowPomodoro(!showPomodoro)}
                            className={`p-2 rounded-full transition-all border ${showPomodoro
                                ? 'bg-red-500 text-white border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]'
                                : 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5'}`}
                            title="Toggle Pomodoro Timer"
                        >
                            <Clock size={18} />
                        </button>
                        <button
                            onClick={toggleChat}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all border shadow-lg backdrop-blur-md ${isChatOpen
                                ? 'bg-violet-600 text-white border-violet-400 shadow-[0_0_15px_rgba(139,92,246,0.4)]'
                                : 'bg-slate-800/50 text-slate-300 border-white/10 hover:bg-slate-700/50'
                                }`}
                        >
                            <Brain size={18} />
                            <span>AI 助手</span>
                        </button>
                    </div>
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden relative">
                    {isSplit ? (
                        <SplitPane
                            left={
                                <div className="h-full overflow-y-auto p-2 bg-slate-900/30">
                                    {secondaryContent}
                                </div>
                            }
                            right={
                                <main className="h-full overflow-y-auto px-8 pb-8 scroll-smooth bg-transparent">
                                    <div className="max-w-6xl mx-auto h-full pt-6">
                                        {children}
                                    </div>
                                </main>
                            }
                        />
                    ) : (
                        <main className={`h-full overflow-y-auto scroll-smooth ${currentView === 'notes' ? 'p-0' : 'px-8 pb-8'}`}>
                            <div className={`${currentView === 'notes' ? 'w-full h-full' : 'max-w-6xl mx-auto h-full pt-6'}`}>
                                {children}
                            </div>
                        </main>
                    )}
                </div>
            </div>

            <ChatSidebar />
            <GlobalPlayer />
            {showPomodoro && <PomodoroTimer />}
        </div>
    );
};

export default Layout;
