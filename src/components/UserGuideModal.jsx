import React, { useState } from 'react';
import { X, BookOpen, Brain, Zap, Layers, Folder, Shield, Key, FileText, Sparkles, GraduationCap } from 'lucide-react';

const UserGuideModal = ({ onClose }) => {
    const [activeTab, setActiveTab] = useState('start');

    const renderContent = () => {
        switch (activeTab) {
            case 'start':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="bg-blue-50/50 p-6 rounded-2xl border border-blue-100 mb-6">
                            <h3 className="text-xl font-bold text-blue-900 mb-2">👋 欢迎来到 SmartLearn Pro</h3>
                            <p className="text-blue-800/80 leading-relaxed">
                                这不仅仅是一个软件，而是您的<strong>私人 AI 英语导师</strong>。它能阅读任何您给它的文章，为您划出重点，陪您背单词，帮您整理笔记。
                                <br /><br />
                                即使您从未用过类似软件，只需按照左侧的顺序，3分钟即可上手。
                            </p>
                        </div>

                        <div className="space-y-4">
                            <h4 className="font-bold text-slate-700 flex items-center gap-2">
                                <span className="bg-slate-200 text-slate-700 w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                                第一步：启动 AI (配置 API Key)
                            </h4>
                            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-sm text-slate-600 leading-7">
                                <p>这就好比给汽车加油。我们的软件本身是免费的，但它需要连接到强大的 "AI 大脑" (如 ChatGPT) 才能工作。</p>
                                <ul className="list-disc pl-5 mt-2 space-y-2 marker:text-blue-400">
                                    <li>点击左侧菜单底部的 <strong>Settings (设置)</strong>。</li>
                                    <li>找到 <strong>API Key</strong> 输入框。</li>
                                    <li>如果您没有 Key，我们也提供了获取方式（推荐使用 SiliconFlow 等国内可直连服务，便宜且稳定）。</li>
                                    <li>粘贴 Key，点击保存。看到 "Connected" 绿灯亮起，您的 AI 导师就上班了！</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                );
            case 'study':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <section>
                            <h4 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                                <FileText className="text-indigo-500" /> 如何开始学习？
                            </h4>
                            <div className="grid grid-cols-1 gap-4">
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <div className="font-bold text-slate-700 mb-2">1. 导入素材</div>
                                    <p className="text-sm text-slate-600">
                                        点击首页的 <strong>"导入新内容"</strong>。您可以粘贴一篇新闻、论文摘要，或者直接上传 PDF 文件。AI 会立即开始阅读。
                                    </p>
                                </div>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                    <div className="font-bold text-slate-700 mb-2">2. 两层分析模式</div>
                                    <p className="text-sm text-slate-600 mb-3">AI 读完后，会给您展示两层信息：</p>
                                    <ul className="space-y-3">
                                        <li className="flex gap-3 items-start bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                                            <Zap size={16} className="text-yellow-500 mt-0.5 shrink-0" />
                                            <div>
                                                <span className="font-bold text-slate-800">极速概览 (Turbo)</span>
                                                <p className="text-xs text-slate-500 mt-1">默认显示。包含文章摘要、核心单词表和简单语法点。适合快速通读。</p>
                                            </div>
                                        </li>
                                        <li className="flex gap-3 items-start bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                                            <Sparkles size={16} className="text-purple-500 mt-0.5 shrink-0" />
                                            <div>
                                                <span className="font-bold text-slate-800">深度私教 (Deep Dive)</span>
                                                <p className="text-xs text-slate-500 mt-1">
                                                    在阅读时，点击任意单词卡片右上角的 ✨ 按钮。AI 会专门为这个词写一篇几百字的详细笔记（包含词源、地道搭配、考试用法）。
                                                </p>
                                            </div>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </section>
                    </div>
                );
            case 'review':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <section>
                            <h4 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                                <Layers className="text-amber-500" /> 怎么背单词？(智能复习)
                            </h4>
                            <p className="text-slate-600 leading-relaxed mb-6">
                                别再死记硬背了。我们内置了<strong>记忆算法</strong>，它会计算您大脑的遗忘规律。
                            </p>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 border border-slate-100 rounded-xl bg-green-50/50">
                                    <h5 className="font-bold text-green-700 mb-2">✅ 我记得</h5>
                                    <p className="text-xs text-slate-600">
                                        如果您选了这个，系统会判断您掌握了，下次复习间隔会变长 (比如 3天后 -> 7天后)。
                                    </p>
                                </div>
                                <div className="p-4 border border-slate-100 rounded-xl bg-red-50/50">
                                    <h5 className="font-bold text-red-700 mb-2">❌ 我忘了</h5>
                                    <p className="text-xs text-slate-600">
                                        没关系！系统会标记这个词为“困难”，并会在明天立即提醒您复习，直到您记牢为止。
                                    </p>
                                </div>
                            </div>

                            <div className="mt-6 bg-amber-50 p-4 rounded-xl text-sm text-amber-800 border border-amber-100">
                                💡 <strong>小贴士：</strong> 每天进软件看一眼首页的 "Daily Goal" (今日目标)，如果有待复习的词，把它清零非常有成就感！
                            </div>
                        </section>
                    </div>
                );
            case 'notes':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <section>
                            <h4 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                                <Folder className="text-violet-500" /> 笔记怎么整理？
                            </h4>

                            <div className="space-y-4">
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 shrink-0">1</div>
                                    <div>
                                        <h5 className="font-bold text-slate-800 text-sm">一键保存</h5>
                                        <p className="text-sm text-slate-600 mt-1">在 AI 分析结果页面，点击 "保存到笔记"。无论是整篇文章的总结，还是某个词的深度解析，都会自动变成一篇排版精美的笔记。</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 shrink-0">2</div>
                                    <div>
                                        <h5 className="font-bold text-slate-800 text-sm">自动归档</h5>
                                        <p className="text-sm text-slate-600 mt-1">不用担心笔记乱放。系统会自动把 AI 生成的笔记放入 <strong>"Smart Analysis"</strong> 文件夹，方便您随时查找。</p>
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-500 shrink-0">3</div>
                                    <div>
                                        <h5 className="font-bold text-slate-800 text-sm">自己写</h5>
                                        <p className="text-sm text-slate-600 mt-1">您当然也可以创建自己的文件夹，写写随笔或心得。</p>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                );
            default: return null;
        }
    };

    const TabButton = ({ id, icon: Icon, label }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${activeTab === id
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
        >
            <Icon size={18} />
            <span className="font-bold text-sm">{label}</span>
        </button>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-slate-900/40 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[80vh] flex border border-slate-200 overflow-hidden">

                {/* Sidebar */}
                <div className="w-64 bg-slate-50 border-r border-slate-100 p-4 flex flex-col gap-2 shrink-0">
                    <div className="px-4 py-4 mb-2">
                        <h2 className="font-bold text-slate-800 text-xl tracking-tight">新手指南</h2>
                        <p className="text-xs text-slate-400 mt-1">从零开始，精通 AI 学习</p>
                    </div>

                    <TabButton id="start" icon={Key} label="第一步：启动 AI" />
                    <TabButton id="study" icon={BookOpen} label="怎么学 (阅读/分析)" />
                    <TabButton id="review" icon={Layers} label="怎么记 (智能复习)" />
                    <TabButton id="notes" icon={Folder} label="怎么存 (笔记管理)" />

                    <div className="mt-auto px-4 py-4">
                        <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 p-3 rounded-lg border border-emerald-100">
                            <Shield size={14} />
                            隐私承诺：所有数据均本地存储，绝不外泄。
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex justify-end p-4">
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-8 pb-8 custom-scrollbar">
                        {renderContent()}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserGuideModal;
