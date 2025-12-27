import { useApp } from '../context/AppContext';
import ChatSidebar from '../components/ChatSidebar';
import {
    BarChart2,
    Upload,
    BookOpen,
    Activity,
    Settings,
    Brain,
    LogOut
} from 'lucide-react';

const SidebarItem = ({ icon: Icon, label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all font-medium text-[15px] mb-1.5 ${active
            ? 'bg-blue-50 text-blue-600 font-semibold'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
    >
        <Icon size={20} strokeWidth={active ? 2.5 : 2} />
        <span>{label}</span>
    </button>
);

const Layout = ({ currentView, setCurrentView, children }) => {
    const { toggleChat, isChatOpen } = useApp(); // Get toggle function

    // navItems 保持不变...
    const navItems = [
        { id: 'dashboard', icon: BarChart2, label: '工作台' },
        { id: 'import', icon: Upload, label: '导入分析' },
        { id: 'study', icon: BookOpen, label: '词汇与阅读' },
        { id: 'plan', icon: Activity, label: '智能计划' },
    ];

    return (
        <div className="flex h-screen w-full bg-[#FAFBFF] overflow-hidden relative">
            {/* Sidebar - Fixed Left */}
            <aside className="w-64 bg-white border-r border-slate-100 flex flex-col h-full shrink-0 z-20 shadow-[2px_0_20px_rgba(0,0,0,0.02)] hidden md:flex">
                {/* Logo... */}
                <div className="h-20 flex items-center px-6">
                    <div className="flex items-center gap-3 text-blue-600 font-extrabold text-xl tracking-tight">
                        <Brain size={28} strokeWidth={2.5} />
                        <span>AI SmartLearn</span>
                    </div>
                </div>

                {/* Nav... */}
                <nav className="flex-1 px-4 py-4 space-y-1">
                    {navItems.map((item) => (
                        <SidebarItem
                            key={item.id}
                            {...item}
                            active={currentView === item.id}
                            onClick={() => setCurrentView(item.id)}
                        />
                    ))}
                </nav>

                {/* Footer Settings */}
                <div className="p-4 border-t border-slate-50">
                    <SidebarItem
                        icon={Settings}
                        label="设置 & API"
                        active={currentView === 'settings'}
                        onClick={() => setCurrentView('settings')}
                    />
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col h-full min-w-0 bg-[#FAFBFF]">
                {/* Header */}
                <header className="h-16 flex items-center justify-between px-8 shrink-0 bg-[#FAFBFF]">
                    <h2 className="text-xl font-bold text-slate-800">
                        {navItems.find(i => i.id === currentView)?.label || (currentView === 'settings' ? 'Global Settings' : 'Overview')}
                    </h2>

                    {/* Header Actions */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={toggleChat}
                            className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all border ${isChatOpen
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200 hover:text-indigo-600'
                                }`}
                        >
                            <Brain size={18} />
                            <span>AI 助手</span>
                        </button>
                    </div>
                </header>

                {/* Scrollable Content */}
                <main className="flex-1 overflow-y-auto px-8 pb-8 scroll-smooth">
                    <div className="max-w-6xl mx-auto h-full">
                        {children}
                    </div>
                </main>
            </div>

            {/* AI Chat Sidebar */}
            <ChatSidebar />
        </div>
    );
};

export default Layout;
