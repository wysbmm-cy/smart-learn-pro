import React, { useState } from 'react';
import { X, BookOpen, Brain, Zap, Layers, Folder, Shield, Key, FileText, Sparkles, GraduationCap, Video, PenTool } from 'lucide-react';

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
                                    <li>点击左侧菜单底部的 <strong>设置与接口 (Settings)</strong>。</li>
                                    <li>找到 <strong>API Key</strong> 输入框。</li>
                                    <li>如果您没有 Key，我们也提供了获取方式（推荐使用 SiliconFlow 等国内可直连服务，便宜且稳定）。</li>
                                    <li>粘贴 Key，点击保存。看到 "已验证" 绿灯亮起，您的 AI 导师就上班了！</li>
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
            case 'video':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="bg-pink-50 p-6 rounded-2xl border border-pink-100 mb-6">
                            <h3 className="text-lg font-bold text-pink-900 mb-2 flex items-center gap-2">
                                <Video size={20} />
                                视频学习 (Bilibili + AI)
                            </h3>
                            <p className="text-pink-800/80 text-sm leading-relaxed">
                                不需要下载视频。只需粘贴 B 站视频链接，AI 就能陪您一起看。
                            </p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm text-sm text-slate-600 leading-7">
                            <ul className="list-disc pl-5 space-y-2 marker:text-pink-400">
                                <li><strong>双屏模式:</strong> 左边看视频，右边记笔记。</li>
                                <li><strong>AI 听力:</strong> 点击右侧的麦克风图标 🎙️，AI 会通过系统音频“听”视频内容，并实时转录成文字。</li>
                                <li><strong>一键分析:</strong> 听到不懂的段落？点击分析，AI 帮您解释难句和生词。</li>
                            </ul>
                        </div>
                    </div>
                );
            case 'writer':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100 mb-6">
                            <h3 className="text-lg font-bold text-emerald-900 mb-2 flex items-center gap-2">
                                <PenTool size={20} />
                                AI 写作工作台 2.0
                            </h3>
                            <p className="text-emerald-800/80 text-sm leading-relaxed">
                                全新升级！打造您的专属写作教练。
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                <div className="font-bold text-slate-700 mb-2">✨ 核心功能</div>
                                <ul className="text-xs text-slate-500 space-y-2 list-disc pl-4">
                                    <li><strong>写作模板 (Templates)</strong>: 内置雅思、托福、商务邮件等专业模板，快速搭建文章结构。</li>
                                    <li><strong>专注模式 (Focus Mode)</strong>: 点击工具栏 "全屏" 图标，进入沉浸式写作环境，告别干扰。</li>
                                    <li><strong>作品集 (Portfolio)</strong>: 自动保存写作历史与多维评分，见证每一次进步。</li>
                                </ul>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                <div className="font-bold text-slate-700 mb-2">🤖 AI 深度润色</div>
                                <ul className="text-xs text-slate-500 space-y-2 list-disc pl-4">
                                    <li><strong>多维评分</strong>: 基于 CEFR 标准进行 0-15 分打分。</li>
                                    <li><strong>词汇热力图 (Heatmap)</strong>: <Layers size={10} className="inline" /> 分析完成后，点击报告顶部的 "词汇热力"，AI 会自动高亮文中的高级词汇 (C1/C2 紫色)，助您掌握词汇运用。</li>
                                    <li><strong>对比视图 (Diff View)</strong>: <GitCompare size={10} className="inline" /> 点击 "对比模式"，直观展示 "修改前/修改后" 的差异。</li>
                                </ul>
                            </div>
                        </div>
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
                                别再死记硬背了。我们内置了<strong>间隔重复算法 (Spaced Repetition)</strong>，它会计算您大脑的遗忘规律。
                            </p>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 border border-slate-100 rounded-xl bg-green-50/50">
                                    <h5 className="font-bold text-green-700 mb-2">✅ 我记得</h5>
                                    <p className="text-xs text-slate-600">
                                        如果您选了这个，系统会判断您掌握了，下次复习间隔会变长 (比如 3天后 到 7天后)。
                                    </p>
                                </div>
                                <div className="p-4 border border-slate-100 rounded-xl bg-red-50/50">
                                    <h5 className="font-bold text-red-700 mb-2">❌ 我忘了</h5>
                                    <p className="text-xs text-slate-600">
                                        没关系！系统会标记这个词为“困难”，并会在明天立即提醒您复习，直到您记牢为止。
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <h5 className="font-bold text-slate-700 mb-2 text-sm">🗂️ 文件夹管理 (新功能)</h5>
                                <p className="text-xs text-slate-500">
                                    现在您可以创建自定义文件夹 (如 "六级高频", "每日阅读") 来分类管理您的卡片。在导入单词或阅读时，也可以直接选择存入指定文件夹。
                                </p>
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
                        <p className="text-xs text-slate-400 mt-1">SmartLearn Pro v1.0</p>
                    </div>

                    <TabButton id="start" icon={Key} label="第一步：启动 AI" />
                    <TabButton id="study" icon={BookOpen} label="阅读与分析" />
                    <TabButton id="video" icon={Video} label="视频学习 (New)" />
                    <TabButton id="writer" icon={PenTool} label="AI 写作 (New)" />
                    <TabButton id="review" icon={Layers} label="智能背词" />

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
