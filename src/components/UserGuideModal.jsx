import React, { useState } from 'react';
import { X, BookOpen, Brain, Zap, Layers, Shield, Key, Sparkles, GraduationCap, Video, PenTool, BarChart3, Settings, Volume2, Mic, ImageIcon, Globe, Server, History } from 'lucide-react';

const UserGuideModal = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState('start');

    const renderContent = () => {
        switch (activeTab) {
            case 'start':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="bg-blue-500/10 p-6 rounded-[2rem] border border-blue-500/20 mb-6 relative overflow-hidden group">
                            <div className="absolute -right-4 -top-4 text-blue-500/10 group-hover:scale-110 transition-transform duration-700">
                                <Sparkles size={120} />
                            </div>
                            <h3 className="text-2xl font-black text-phy-text mb-2 tracking-tight">👋 欢迎来到语脉 VerbaPath</h3>
                            <p className="text-phy-muted leading-relaxed max-w-lg font-medium">
                                这不仅仅是一个软件，而是您的<strong>私人 AI 英语导师</strong>。它基于深度学习与艾宾浩斯遗忘曲线，为您打造从阅读到口语的全闭环提升。
                            </p>
                        </div>

                        <div className="space-y-4">
                            <h4 className="font-bold text-phy-text flex items-center gap-2 text-lg">
                                <Key className="text-blue-500" size={20} />
                                第一步：启动 AI (连接神经中枢)
                            </h4>
                            <div className="bg-phy-glass p-6 rounded-2xl border border-phy-border shadow-sm space-y-4 leading-relaxed">
                                <p className="text-sm text-phy-muted">这款应用需要通过 API 连接到大语言模型。就像给汽车加油一样：</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                                    <div className="p-4 bg-phy-bg rounded-xl border border-phy-border group hover:border-blue-500/30 transition-all">
                                        <div className="font-bold text-phy-text text-sm mb-1 flex items-center gap-2">
                                            <Globe size={14} className="text-blue-400" /> Kimi / OpenAI
                                        </div>
                                        <p className="text-xs text-phy-muted opacity-70">支持 Moonshot (Kimi) 或原生 OpenAI 协议，模型响应快，长文本能力强。</p>
                                    </div>
                                    <div className="p-4 bg-phy-bg rounded-xl border border-phy-border group hover:border-blue-500/30 transition-all">
                                        <div className="font-bold text-phy-text text-sm mb-1 flex items-center gap-2">
                                            <Server size={14} className="text-blue-400" /> SiliconFlow (推荐)
                                        </div>
                                        <p className="text-xs text-phy-muted opacity-70">国内低延迟直连，价格极低且无需科学上网，适合语音转文字(STT)和生图。</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 mt-2 p-3 bg-blue-50/50 rounded-xl border border-blue-100/50 text-blue-700 text-xs font-bold leading-tight">
                                    <Shield size={16} className="shrink-0" />
                                    <span>您的 API Key 仅加密存储于您本地的 IndexedDB 中，语脉 VerbaPath 无法也永远不会访问您的密钥。</span>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 'study':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <section>
                            <h4 className="font-black text-phy-text text-xl mb-6 flex items-center gap-3">
                                <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-xl">
                                    <BookOpen size={24} />
                                </div>
                                深度阅读与分析
                            </h4>
                            
                            <div className="space-y-4">
                                <div className="bg-phy-glass p-5 rounded-2xl border border-phy-border">
                                    <div className="font-bold text-phy-text text-base mb-3 flex items-center gap-2">
                                        <Zap size={18} className="text-yellow-500" /> 两层分析模式
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="p-4 bg-phy-bg rounded-xl border border-phy-border">
                                            <div className="font-bold text-sm text-phy-text mb-1">极速模式 (Turbo)</div>
                                            <p className="text-xs text-phy-muted leading-relaxed">导入即生成！包含一句话摘要、CEFR 难度分级及核心 10-15 个高价值词汇。</p>
                                        </div>
                                        <div className="p-4 bg-phy-bg border border-indigo-200/50 rounded-xl bg-indigo-50/20">
                                            <div className="font-bold text-sm text-indigo-700 mb-1 flex items-center gap-1">深度钻研 (Deep Dive) <Sparkles size={12} /></div>
                                            <p className="text-xs text-indigo-900/60 leading-relaxed">点击任意词汇卡片，AI 会为您撰写包含词源、地道搭配、考试陷阱在内的“单点爆破”笔记。</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-phy-glass p-5 rounded-2xl border border-phy-border">
                                    <div className="font-bold text-phy-text text-base mb-3">交互式阅读技巧</div>
                                    <ul className="space-y-3">
                                        <li className="flex items-center gap-3 text-sm text-phy-muted">
                                            <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                                            <span><strong>划词快译：</strong> 阅读时直接鼠标选中任意文本，即刻浮现 AI 实时翻译与解析。</span>
                                        </li>
                                        <li className="flex items-center gap-3 text-sm text-phy-muted">
                                            <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                                            <span><strong>阅读自测：</strong> 分析完成后点击 "Quiz" 按钮，AI 会根据文章内容生成阅读理解题。</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </section>
                    </div>
                );
            case 'coach':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <section>
                            <h4 className="font-black text-phy-text text-xl mb-6 flex items-center gap-3">
                                <div className="p-2 bg-pink-500/10 text-pink-500 rounded-xl">
                                    <Mic size={24} />
                                </div>
                                AI 口语教练 (Full-Duplex)
                            </h4>
                            
                            <div className="bg-phy-glass p-6 rounded-2xl border border-phy-border mb-4">
                                <p className="text-sm text-phy-muted leading-relaxed mb-4">
                                    拒绝无声阅读！进入 Coach 视图，开启全双工实时语音对话。
                                </p>
                                <div className="grid grid-cols-3 gap-2 mb-6">
                                    {['雅思考官', '生活伴侣', '商务专家'].map((p, i) => (
                                        <div key={i} className="px-3 py-2 bg-phy-bg border border-phy-border rounded-xl text-center text-[10px] font-bold text-phy-muted">
                                            {p}
                                        </div>
                                    ))}
                                </div>
                                
                                <div className="space-y-4">
                                    <div className="flex gap-4 items-start">
                                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                                            <Volume2 size={16} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm text-phy-text">实时回声与分析</div>
                                            <p className="text-xs text-phy-muted mt-1 leading-relaxed">
                                                说出您的句子，AI 会即刻将其转录并回复。对话结束后，点击“分析”可以查看语法修正及 IPA 音标纠音建议。
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 items-start">
                                        <div className="p-2 bg-pink-50 text-pink-600 rounded-lg">
                                            <History size={16} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm text-phy-text">会话历史溯源</div>
                                            <p className="text-xs text-phy-muted mt-1 leading-relaxed">
                                                所有口语对话都会本地存储，您可以随时回听您的发音，对比练习前的进步。
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                );
            case 'review':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <section>
                            <h4 className="font-black text-phy-text text-xl mb-6 flex items-center gap-3">
                                <div className="p-2 bg-amber-500/10 text-amber-500 rounded-xl">
                                    <Brain size={24} />
                                </div>
                                记忆之塔 (FSRS 智能复习)
                            </h4>
                            
                            <p className="text-sm text-phy-muted leading-relaxed mb-6">
                                采用了业界领先的 <strong>FSRS (Free Spaced Repetition Scheduler)</strong> 算法。比传统的 Anki 更懂你的遗忘速度。
                            </p>

                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="bg-phy-bg p-4 rounded-xl border border-phy-border">
                                    <div className="text-blue-500 font-bold text-xs mb-2 flex items-center gap-1">🚀 Again / Hard</div>
                                    <p className="text-[11px] text-phy-muted leading-snug">表示较难。AI 会大幅增加此词的出现频率。</p>
                                </div>
                                <div className="bg-phy-bg p-4 rounded-xl border border-phy-border">
                                    <div className="text-emerald-500 font-bold text-xs mb-2 flex items-center gap-1">✅ Good / Easy</div>
                                    <p className="text-[11px] text-phy-muted leading-snug">表示已掌握。下一次出现可能是 7 天甚至 30 天后。</p>
                                </div>
                            </div>

                            <div className="bg-phy-glass p-5 rounded-2xl border border-phy-border">
                                <div className="font-bold text-phy-text text-sm mb-2 flex items-center gap-2">⭐ 收集与归档</div>
                                <p className="text-xs text-phy-muted leading-relaxed">
                                    阅读中遇到的生词会自动进入卡片盒。点击“五角星”标记，AI 会在生成“智能练习”时优先选取这些标记词汇。
                                </p>
                            </div>
                        </section>
                    </div>
                );
            case 'writer':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="bg-emerald-500/10 p-6 rounded-[2rem] border border-emerald-500/20 mb-6">
                            <h3 className="text-lg font-black text-emerald-900 mb-2 flex items-center gap-2">
                                <PenTool size={20} className="text-emerald-600" />
                                写作工作台 2.0
                            </h3>
                            <p className="text-emerald-800/80 text-sm leading-relaxed">
                                帮助您从“写得出”跨越到“写得好”。
                            </p>
                        </div>

                        <div className="space-y-4">
                            <div className="flex gap-4 items-start p-4 bg-phy-glass rounded-xl border border-phy-border">
                                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                    <Layers size={16} />
                                </div>
                                <div>
                                    <div className="font-bold text-sm text-phy-text">词汇热力图 (Heatmap)</div>
                                    <p className="text-xs text-phy-muted mt-1 leading-relaxed">
                                        AI 会扫描并高亮您的文章。紫色的 C1/C2 词汇越多，说明您的词汇量越高级。
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-4 items-start p-4 bg-phy-glass rounded-xl border border-phy-border">
                                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                    <Sparkles size={16} />
                                </div>
                                <div>
                                    <div className="font-bold text-sm text-phy-text">多维润色 (Deep Polish)</div>
                                    <p className="text-xs text-phy-muted mt-1 leading-relaxed">
                                        不只是改错！您可以选择“正式”、“随和”或“雅思高分”风格，让 AI 对全文逻辑与语气进行对齐。
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 'video':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <section>
                            <h4 className="font-black text-phy-text text-xl mb-6 flex items-center gap-3">
                                <div className="p-2 bg-red-500/10 text-red-500 rounded-xl">
                                    <Video size={24} />
                                </div>
                                视频实验室 (Whisper 实时听力)
                            </h4>
                            <div className="bg-phy-glass p-5 rounded-2xl border border-phy-border shadow-sm text-sm text-phy-muted leading-relaxed">
                                <ul className="space-y-4">
                                    <li className="flex gap-3">
                                        <div className="w-6 h-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
                                        <div><strong>解析链接：</strong> 支持 Bilibili / YouTube 链接，直接拉取视频。</div>
                                    </li>
                                    <li className="flex gap-3">
                                        <div className="w-6 h-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
                                        <div><strong>Whisper 转录：</strong> 点击🎙️按钮，AI 会根据视频音频生成逐句字幕，支持点击单词即查。</div>
                                    </li>
                                    <li className="flex gap-3">
                                        <div className="w-6 h-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-[10px] font-bold shrink-0">3</div>
                                        <div><strong>段落爆破：</strong> 听到精彩段落？一键提取至“学习空间”进行深度分析。</div>
                                    </li>
                                </ul>
                            </div>
                        </section>
                    </div>
                );
            case 'insights':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <section>
                            <h4 className="font-black text-phy-text text-xl mb-6 flex items-center gap-3">
                                <div className="p-2 bg-cyan-500/10 text-cyan-500 rounded-xl">
                                    <BarChart3 size={24} />
                                </div>
                                洞察与奖励 (可视化成长)
                            </h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-phy-glass p-4 rounded-xl border border-phy-border group hover:bg-cyan-50/20 transition-all">
                                    <div className="font-bold text-phy-text text-sm mb-1">3D 知识图谱</div>
                                    <p className="text-xs text-phy-muted leading-relaxed">
                                        您的词汇并不是孤岛。图谱会展示词汇间的逻辑联结，帮助您构建语义网络。
                                    </p>
                                </div>
                                <div className="bg-phy-glass p-4 rounded-xl border border-phy-border group hover:bg-pink-50/20 transition-all">
                                    <div className="font-bold text-phy-text text-sm mb-1 flex items-center gap-2">昨日故事漫画 <ImageIcon size={14} /></div>
                                    <p className="text-xs text-phy-muted leading-relaxed">
                                        系统会根据您昨天的学习行为，自动编写一个短篇故事并用 AI 绘制成四格漫画。学外语从未如此有趣。
                                    </p>
                                </div>
                            </div>
                        </section>
                    </div>
                );
            case 'advanced':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <section>
                            <h4 className="font-black text-phy-text text-xl mb-6 flex items-center gap-3">
                                <div className="p-2 bg-slate-500/10 text-slate-500 rounded-xl">
                                    <Settings size={24} />
                                </div>
                                高级玩家与隐私
                            </h4>
                            <div className="space-y-4">
                                <div className="bg-phy-glass p-4 rounded-xl border border-phy-border">
                                    <div className="font-bold text-sm text-phy-text mb-2">Prompt 提示词工程</div>
                                    <p className="text-xs text-phy-muted leading-relaxed mb-3">
                                        您可以自定义“系统提示词”来改变 AI 的性格。例如：“请用莎士比亚的语气对我说话”。
                                    </p>
                                </div>
                                <div className="bg-phy-glass p-4 rounded-xl border border-phy-border">
                                    <div className="font-bold text-sm text-phy-text mb-2 flex items-center gap-2">数据全主权 <Shield size={14} className="text-emerald-500" /></div>
                                    <p className="text-xs text-phy-muted leading-relaxed">
                                        不同于传统云端 App，您的所有数据（笔记、语音、进度）全部存在浏览器 IndexedDB 中。我们提供“导出 JSON”功能，您可以备份至本地或导入新设备。
                                    </p>
                                </div>
                            </div>
                        </section>
                    </div>
                );
            default: return null;
        }
    };

    const TabButton = ({ id, icon: Icon, label, badge }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-left relative group ${activeTab === id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                : 'text-phy-muted hover:bg-phy-bg hover:text-phy-text'
                }`}
        >
            <Icon size={18} className={activeTab === id ? 'text-white' : 'group-hover:text-blue-500 transition-colors'} />
            <span className="font-bold text-sm">{label}</span>
            {badge && (
                <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === id ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'}`}>
                    {badge}
                </span>
            )}
        </button>
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-xl bg-slate-900/60 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-5xl h-[85vh] flex border border-slate-200 overflow-hidden relative">
                
                {/* Sidebar */}
                <div className="w-72 bg-slate-50 border-r border-slate-200 p-6 flex flex-col gap-1.5 shrink-0 relative z-10">
                    <div className="px-2 py-4 mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                                <GraduationCap size={22} />
                            </div>
                            <div>
                                <h2 className="font-black text-phy-text text-xl tracking-tight leading-none">新手指南</h2>
                                <p className="text-[10px] text-phy-muted mt-1 font-bold uppercase tracking-widest opacity-60">语脉 VerbaPath v1.0.2</p>
                            </div>
                        </div>
                    </div>

                    <TabButton id="start" icon={Key} label="快速上手" />
                    <TabButton id="study" icon={BookOpen} label="深度阅读" />
                    <TabButton id="coach" icon={Mic} label="AI 口语教练" />
                    <TabButton id="review" icon={Brain} label="遗忘曲线复习" />
                    <TabButton id="writer" icon={PenTool} label="写作实验室" badge="Pro" />
                    <TabButton id="video" icon={Video} label="视频精听" badge="Beta" />
                    <TabButton id="insights" icon={BarChart3} label="学习洞察" />
                    <TabButton id="advanced" icon={Settings} label="高级与隐私" />

                    <div className="mt-auto pt-6 border-t border-slate-200">
                        <div className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-2xl flex gap-3">
                            <Shield size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-emerald-800/70 font-medium leading-relaxed">
                                <b>隐私透明承诺</b><br/>
                                软件核心逻辑全开源，数据流向仅限您与 API 端点之间。
                            </p>
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 flex flex-col min-w-0 bg-white relative z-10">
                    <div className="flex justify-end p-6">
                        <button
                            onClick={onClose}
                            className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl text-phy-muted hover:text-phy-text transition-all active:scale-90"
                        >
                            <X size={24} strokeWidth={2.5} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-10 pb-12 custom-scrollbar">
                        <div className="max-w-3xl">
                            {renderContent()}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserGuideModal;
