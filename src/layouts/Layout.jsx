import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useChat } from '../context/ChatContext';
import ChatSidebar from '../components/ChatSidebar';
import PomodoroTimer from '../components/PomodoroTimer';
import GlobalPlayer from '../components/GlobalPlayer';
import SplitPane from '../components/SplitPane';

import {
    BarChart2, Upload, BookOpen, Activity, Settings, Brain,
    Clock, FolderOpen, NotebookPen, Layers, Columns, Maximize2, Menu, Mic, PlayCircle, PenTool, FileQuestion, Share2, X, Home, Target
} from 'lucide-react';

const SidebarItem = ({ icon: Icon, label, active, onClick, onContextMenu }) => (
    <button
        onClick={onClick}
        onContextMenu={onContextMenu}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-medium text-[14px] mb-1 outline-none focus:outline-none ${active
            ? 'glass-panel text-phy-accent font-bold border-phy-accentHover'
            : 'text-phy-text/80 hover:bg-phy-glassHover hover:text-phy-text border border-transparent'
            }`}
    >
        <Icon size={18} strokeWidth={active ? 2.5 : 2} className={active ? 'shrink-0 text-phy-accent' : 'shrink-0 text-phy-text/70'} />
        <span className="whitespace-nowrap">{label}</span>
    </button>
);

const MobileTab = ({ icon: Icon, label, active, onClick }) => (
    <button
        onClick={onClick}
        className="flex flex-col items-center justify-center flex-1 h-full"
        style={{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
    >
        <span className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-2xl transition-all duration-200 ${active ? 'bg-phy-accentGlass' : ''}`}>
            <Icon size={22} strokeWidth={active ? 2.5 : 1.8} className={active ? 'text-phy-accent' : 'text-phy-text/75'} />
            <span className={`text-[10px] font-semibold ${active ? 'text-phy-accent' : 'text-phy-text/75'}`}>{label}</span>
        </span>
    </button>
);

const Layout = ({ currentView, setCurrentView, children, isSplit, setIsSplit, onOpenSplit, secondaryContent }) => {
    const { settings } = useApp();
    const { toggleChat, isChatOpen } = useChat();
    const [isSidebarOpen, setSidebarOpen] = useState(true);
    const [showPomodoro, setShowPomodoro] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [contextMenu, setContextMenu] = useState(null);
    const [isMobileViewport, setIsMobileViewport] = useState(() => window.innerWidth < 768);
    const [examCanvasMode, setExamCanvasMode] = useState(() => localStorage.getItem('exam_canvas_mode') || 'classic');

    useEffect(() => {
        const handleExamCanvasModeChange = (e) => {
            const mode = e?.detail?.mode;
            if (mode === 'classic' || mode === 'expanded') {
                setExamCanvasMode(mode);
            }
        };
        window.addEventListener('exam-canvas-mode-change', handleExamCanvasModeChange);
        return () => window.removeEventListener('exam-canvas-mode-change', handleExamCanvasModeChange);
    }, []);

    useEffect(() => {
        const handleResize = () => setIsMobileViewport(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const isExamExpanded = currentView === 'exam' && examCanvasMode === 'expanded';
    const isFixedCanvasView = currentView === 'notes' || currentView === 'exam';
    const contentContainerClass = currentView === 'notes'
        ? 'h-full w-full max-w-none mx-0 p-0'
        : currentView === 'exam'
            ? `${isExamExpanded ? 'max-w-[1700px]' : 'max-w-6xl'} mx-auto h-full`
            : `${isExamExpanded ? 'max-w-[1700px]' : 'max-w-6xl'} mx-auto pt-4 md:pt-6 pb-24 md:pb-8`;
    const splitPaneContainerClass = currentView === 'exam'
        ? `${isExamExpanded ? 'max-w-[1700px]' : 'max-w-6xl'} mx-auto h-full`
        : `${isExamExpanded ? 'max-w-[1700px]' : 'max-w-6xl'} mx-auto h-full pt-6`;

    const handleContextMenu = (e, itemId) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, itemId });
    };

    const handleClick = () => { if (contextMenu) setContextMenu(null); };

    const navItems = [
        { id: 'dashboard', icon: BarChart2, label: '工作台' },
        { id: 'notes', icon: NotebookPen, label: '我的笔记' },
        { id: 'import', icon: Upload, label: '导入' },
        { id: 'video', icon: PlayCircle, label: '视频学习' },
        { id: 'writer', icon: PenTool, label: 'AI 写作' },
        { id: 'exam', icon: FileQuestion, label: '考试模拟' },
        { id: 'study', icon: BookOpen, label: '词汇与阅读' },
        { id: 'flashcards', icon: Layers, label: '闪卡复习' },
        { id: 'review', icon: Target, label: '记忆曲线复习' },
        { id: 'knowledge', icon: Share2, label: '知识图谱' },
        { id: 'library', icon: FolderOpen, label: '文件库' },
        { id: 'history', icon: Clock, label: '历史' },
        { id: 'coach', icon: Mic, label: '口语教练' },
        { id: 'plan', icon: Activity, label: '学习计划' },
    ];

    const mobileBottomTabs = [
        { id: 'dashboard', icon: Home, label: '首页' },
        { id: 'study', icon: BookOpen, label: '阅读' },
        { id: 'flashcards', icon: Layers, label: '复习' },
        { id: 'review', icon: Target, label: '记忆曲线' },
        { id: 'writer', icon: PenTool, label: '写作' },
        { id: 'coach', icon: Mic, label: '口语' },
    ];

    const currentPageLabel = navItems.find(i => i.id === currentView)?.label?.split(' (')[0] || (currentView === 'settings' ? '设置' : '页面');

    return (
        <div
            onClick={handleClick}
            className="flex h-screen w-full overflow-hidden relative selection:bg-phy-accentGlass selection:text-phy-accent text-phy-text flex-col md:flex-row bg-phy-bg"
        >
            {/* Zen Background */}
            <div className="absolute inset-0 z-0 transition-colors duration-500">
                {!isMobileViewport && settings.backgroundImage && (
                    <img
                        src={settings.backgroundImage}
                        className="w-full h-full object-cover transition-opacity duration-700 opacity-40 mix-blend-overlay"
                        alt="bg"
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                )}
                <div
                    className={`absolute inset-0 ${isMobileViewport ? 'bg-phy-bg/35' : 'backdrop-blur-[20px] bg-phy-bg/20'}`}
                    style={{ opacity: 1 - (settings.glassOpacity ?? 0.7) }}
                />
            </div>

            {/* Mobile Top Header */}
            <div className="md:hidden relative z-30 shrink-0">
                <div className="h-14 flex items-center justify-between px-4 border-b border-phy-border bg-phy-glassHeavy backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsMobileMenuOpen(true)}
                            className="p-2 -ml-1 rounded-xl text-phy-muted active:bg-phy-glass transition-colors"
                            style={{ WebkitTapHighlightColor: 'transparent' }}
                        >
                            <Menu size={22} />
                        </button>
                        <h1 className="text-base font-bold text-phy-text truncate max-w-[170px]">{currentPageLabel}</h1>
                    </div>
                    <button
                        onClick={toggleChat}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all border text-xs font-bold ${isChatOpen
                            ? 'bg-phy-accentGlass text-phy-accent border-phy-borderHover'
                            : 'border-phy-border text-phy-muted active:bg-phy-glass'}`}
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                        <Brain size={17} strokeWidth={2} />
                        <span>AI</span>
                    </button>
                </div>
            </div>

            {/* Sidebar Overlay (Mobile) */}
            <div
                className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden ${isMobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={() => setIsMobileMenuOpen(false)}
            />

            {/* Sidebar Drawer */}
            <aside className={`
                fixed md:relative z-50 h-full
                ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                ${isSidebarOpen ? 'w-[80vw] max-w-[300px] md:w-64' : 'md:w-0 -translate-x-full'}
                flex flex-col shrink-0 transition-all duration-300 border-r border-phy-border glass-sidebar overflow-hidden
            `}>
                <div className="h-16 flex items-center justify-between px-5 shrink-0">
                    <div className="flex items-center gap-3 text-phy-accent font-extrabold text-xl tracking-tight">
                        <Brain size={26} strokeWidth={2.5} />
                        <span>AI English</span>
                    </div>
                    <button
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="md:hidden p-1.5 rounded-lg text-phy-muted active:bg-phy-glass"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                        <X size={20} />
                    </button>
                </div>

                <nav className="flex-1 px-3 py-2 overflow-y-auto custom-scrollbar">
                    {navItems.map((item) => (
                        <SidebarItem
                            key={item.id}
                            icon={item.icon}
                            label={item.label}
                            active={currentView === item.id}
                            onClick={() => { setCurrentView(item.id); setIsMobileMenuOpen(false); }}
                            onContextMenu={(e) => handleContextMenu(e, item.id)}
                        />
                    ))}
                </nav>

                <div className="p-4 border-t border-phy-border bg-phy-glassHeavy shrink-0" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
                    <button
                        onClick={() => { setCurrentView('settings'); setIsMobileMenuOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-phy-accentGlass border border-phy-borderHover text-phy-accent transition-all text-sm font-medium"
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                        <Settings size={18} />
                        <span>设置与主题</span>
                    </button>
                </div>
            </aside>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed z-50 w-48 bg-phy-glassHeavy backdrop-blur-xl border border-phy-border rounded-xl shadow-2xl py-1 text-sm text-phy-text animate-fade-in"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <button className="w-full text-left px-4 py-2.5 hover:bg-phy-glassHover" onClick={() => { setCurrentView(contextMenu.itemId); setContextMenu(null); }}>切换到此页面</button>
                    <button className="w-full text-left px-4 py-2.5 text-phy-accent hover:bg-phy-glassHover border-t border-phy-border" onClick={() => { onOpenSplit(contextMenu.itemId); setContextMenu(null); }}>在分屏中打开</button>
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full min-w-0 relative z-10 bg-transparent">
                {/* Desktop Header */}
                <header className="hidden md:flex h-16 items-center justify-between px-6 shrink-0 border-b border-phy-border bg-phy-glassHeavy backdrop-blur-md">
                    <div className='flex items-center gap-4'>
                        <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="p-2 -ml-2 hover:bg-phy-glassHover rounded-lg text-phy-muted hover:text-phy-text transition-colors">
                            <Menu size={20} />
                        </button>
                        <h2 className="text-lg font-bold text-phy-text tracking-wide">{currentPageLabel}</h2>
                        <button
                            onClick={() => setIsSplit(!isSplit)}
                            className={`p-2 rounded-lg transition-all border ${isSplit ? 'bg-phy-accentGlass border-phy-borderHover text-phy-accent' : 'border-phy-border text-phy-muted hover:text-phy-text hover:bg-phy-glassHover'}`}
                            title="切换分屏模式"
                        >
                            {isSplit ? <Columns size={18} /> : <Maximize2 size={18} />}
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowPomodoro(!showPomodoro)}
                            className={`p-2 rounded-full transition-all border ${showPomodoro ? 'bg-red-500 text-white border-red-400' : 'border-phy-border text-phy-muted hover:text-phy-text hover:bg-phy-glassHover'}`}
                            title="专注番茄钟"
                        >
                            <Clock size={18} />
                        </button>
                        <GlobalPlayer />
                        <button
                            onClick={toggleChat}
                            className={`p-2 rounded-lg transition-all border ${isChatOpen ? 'bg-phy-accentGlass text-phy-accent border-phy-borderHover' : 'border-phy-border text-phy-muted hover:text-phy-text hover:bg-phy-glassHover'}`}
                            title="AI 助手"
                        >
                            <Brain size={18} />
                        </button>
                    </div>
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden relative">
                    {isSplit ? (
                        <SplitPane
                            left={<div className="h-full overflow-y-auto p-2 bg-phy-glassHeavy">{secondaryContent}</div>}
                            right={
                                <main className="h-full overflow-y-auto px-8 pb-8 scroll-smooth bg-transparent">
                                    <div className={splitPaneContainerClass}>{children}</div>
                                </main>
                            }
                        />
                    ) : (
                        <main
                            className={`h-full scroll-smooth ${isFixedCanvasView ? 'overflow-hidden p-0' : 'overflow-y-auto px-4 md:px-8'}`}
                            style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
                        >
                            <div className={contentContainerClass}>
                                {children}
                            </div>
                        </main>
                    )}
                </div>
            </div>

            {/* Pomodoro */}
            {showPomodoro && (
                <div className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-50 animate-slide-up">
                    <PomodoroTimer onClose={() => setShowPomodoro(false)} />
                </div>
            )}

            {/* AI Chat Sidebar */}
            {(!isMobileViewport || isChatOpen) && (
                <div className="fixed inset-y-0 right-0 z-50 md:static md:z-0 md:h-full shrink-0">
                    <ChatSidebar />
                </div>
            )}

            {/* Mobile Bottom Tab Bar */}
            <div
                className="md:hidden fixed bottom-0 left-0 right-0 z-[45] bg-phy-glassHeavy backdrop-blur-xl border-t border-phy-border flex items-stretch"
                style={{
                    height: 'calc(60px + env(safe-area-inset-bottom, 0px))',
                    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                }}
            >
                {mobileBottomTabs.map((tab) => (
                    <MobileTab
                        key={tab.id}
                        icon={tab.icon}
                        label={tab.label}
                        active={currentView === tab.id}
                        onClick={() => setCurrentView(tab.id)}
                    />
                ))}
                <MobileTab
                    icon={Menu}
                    label="菜单"
                    active={false}
                    onClick={() => setIsMobileMenuOpen(true)}
                />
            </div>
        </div>
    );
};

export default Layout;



