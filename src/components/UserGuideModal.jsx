import React from 'react';
import { X, BookOpen, Brain, Zap, Layers, Folder, Shield } from 'lucide-react';

const UserGuideModal = ({ onClose }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-slate-900/30 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col border border-slate-200 overflow-hidden">

                {/* Header */}
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 backdrop-blur">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                            <BookOpen size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">SmartLearn Pro 使用手册</h2>
                            <p className="text-xs text-slate-500">v1.2.0 • 用户指南 & 功能详解</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-10 text-slate-600 custom-scrollbar">

                    {/* Section 1: AI Engine */}
                    <section>
                        <h3 className="flex items-center gap-2 text-indigo-700 font-bold text-lg mb-4">
                            <Brain size={20} /> AI 核心引擎 (AI Engine)
                        </h3>
                        <div className="bg-indigo-50/50 p-5 rounded-xl border border-indigo-100 space-y-4">
                            <div>
                                <h4 className="font-bold text-slate-800 text-sm mb-1">🚀 极速聚合分析 (Turbo Analysis)</h4>
                                <p className="text-sm leading-relaxed">
                                    我们优化了算法，采用 <strong>All-in-One 打包请求</strong>。现在，AI 会在一次交互中同时完成“摘要总结”、“核心词提取”和“语法分析”。速度提升 300%，且大幅降低 API 报错率。
                                </p>
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800 text-sm mb-1 flex items-center gap-2">
                                    <span className="text-amber-500">✨</span> 深度解析模式 (Deep Dive)
                                </h4>
                                <p className="text-sm leading-relaxed">
                                    在阅读界面，点击任意单词右上角的 <strong>Sparkles 图标</strong>，即可唤醒专家模式。AI 将生成包含词源、地道搭配、考试策略的<strong>Markdown 深度笔记</strong>。
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Section 2: Flashcards */}
                    <section>
                        <h3 className="flex items-center gap-2 text-amber-600 font-bold text-lg mb-4">
                            <Layers size={20} /> 智能记忆卡片 (Smart Flashcards)
                        </h3>
                        <div className="space-y-3 text-sm leading-relaxed">
                            <p>
                                我们的复习系统基于<strong>艾宾浩斯遗忘曲线 (SRS)</strong>。系统会根据您对单词的熟悉程度（Remembered/Forgot）自动计算下一次复习时间。
                            </p>
                            <ul className="list-disc pl-5 space-y-1 marker:text-amber-400">
                                <li><strong>新词</strong>：间隔 1 天复习。</li>
                                <li><strong>记得</strong>：间隔呈指数增长 (1 → 3 → 7 → ...)。</li>
                                <li><strong>忘记</strong>：重置进度，立即重新学习。</li>
                            </ul>
                        </div>
                    </section>

                    {/* Section 3: Knowledge Management */}
                    <section>
                        <h3 className="flex items-center gap-2 text-violet-600 font-bold text-lg mb-4">
                            <Folder size={20} /> 知识管理 (Notes)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                <h4 className="font-bold text-slate-800 mb-2">📂 文件夹系统</h4>
                                <p className="text-xs text-slate-500">
                                    全新的侧边栏支持文件夹归档。您可以创建自定义文件夹，将笔记分门别类。
                                </p>
                            </div>
                            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                                <h4 className="font-bold text-slate-800 mb-2">🤖 智能归档</h4>
                                <p className="text-xs text-slate-500">
                                    从 AI 分析界面保存的笔记（包括深度解析），会自动存入 <strong>"Smart Analysis"</strong> 文件夹，保持收件箱整洁。
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* Section 4: Privacy */}
                    <section>
                        <h3 className="flex items-center gap-2 text-emerald-600 font-bold text-lg mb-4">
                            <Shield size={20} /> 隐私与数据
                        </h3>
                        <p className="text-sm text-slate-500 bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <strong>100% 本地优先。</strong> 您的 API Key、学习记录、笔记和词库均存储在浏览器本地数据库 (IndexedDB) 中。除了发送给 AI 进行分析的内容外，没有任何数据会被上传到云端服务器。
                        </p>
                    </section>

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 text-center">
                    <button
                        onClick={onClose}
                        className="bg-slate-800 text-white px-8 py-2.5 rounded-full text-sm font-bold hover:bg-slate-700 transition-all shadow-lg hover:shadow-xl"
                    >
                        开始学习
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UserGuideModal;
