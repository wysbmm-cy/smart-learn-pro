import React, { useState } from 'react';
import { Brain, NotebookPen, Layers, Sparkles, X, Loader, FileText } from 'lucide-react';
import { useApp } from '../context/AppContext';
import WordCard from '../components/WordCard';
import { generateDeepWordAnalysis } from '../services/ai';

const StudyView = ({ onNavigate }) => {
    const { currentArticle, analysisResult, saveToNotes, addFlashcard, settings } = useApp();

    // Deep Analysis State
    const [deepModalOpen, setDeepModalOpen] = useState(false);
    const [deepContent, setDeepContent] = useState('');
    const [isDeepAnalyzing, setIsDeepAnalyzing] = useState(false);
    const [currentDeepWord, setCurrentDeepWord] = useState(null);

    const handleSaveFlashcard = async (word) => {
        await addFlashcard({
            front: word.word,
            back: `${word.meaning}\n${word.pos || ''} ${word.phonetic || ''}`,
            tags: [word.level || 'General'],
            createdAt: Date.now()
        });
        alert(`已添加 "${word.word}" 到抽记卡!`);
    };

    const handleDeepAnalyze = async (word) => {
        setDeepModalOpen(true);
        setDeepContent('');
        setIsDeepAnalyzing(true);
        setCurrentDeepWord(word);

        // Find context sentence roughly
        const sentence = currentArticle.split(/[.!?]/).find(s => s.toLowerCase().includes(word.word.toLowerCase()));

        const result = await generateDeepWordAnalysis(word.word, sentence, settings);
        setDeepContent(result || "分析失败，请稍后重试。");
        setIsDeepAnalyzing(false);
    };

    const handleSaveDeepNote = async () => {
        if (!currentDeepWord || !deepContent) return;
        await saveToNotes({
            title: `深度词汇笔记: ${currentDeepWord.word}`,
            content: deepContent,
            folder: "Smart Analysis"
        });
        alert("已保存深度笔记！");
        setDeepModalOpen(false);
    };

    const handleSaveNote = async () => {
        if (!analysisResult) return;

        const dateStr = new Date().toLocaleDateString();
        const title = `智能分析: ${analysisResult.summary.slice(0, 15)}...`;

        // Format as Markdown
        let content = `# ${title}\n*创建于 ${dateStr}*\n\n`;
        content += `## 摘要\n${analysisResult.summary}\n\n`;

        content += `## 核心词汇\n| 单词 | 释义 | 级别 |\n| --- | --- | --- |\n`;
        analysisResult.vocabulary?.forEach(w => {
            content += `| **${w.word}** | ${w.meaning} | ${w.level || '-'} |\n`;
        });

        if (analysisResult.structures?.length) {
            content += `\n## 语法解析\n`;
            analysisResult.structures.forEach(s => {
                content += `- **${s.type}**: "${s.pattern}" - _${s.explanation}_\n`;
            });
        }

        content += `\n## 原文内容\n> ${currentArticle.replace(/\n/g, '\n> ')}`;

        await saveToNotes({ title, content, folder: "Smart Analysis" });
        alert("已保存到笔记！");
        onNavigate('notes');
    };

    if (!analysisResult) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400 gap-4">
                <Brain size={64} className="opacity-20" />
                <p>未找到分析结果。</p>
                <button
                    onClick={() => onNavigate('import')}
                    className="text-blue-600 hover:underline font-medium"
                >
                    去导入分析
                </button>
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-140px)] gap-6 animate-fade-in relative">
            {/* Modal Overlay for Deep Analysis */}
            {deepModalOpen && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-white/30">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
                            <div className="flex items-center gap-2 text-indigo-700 font-bold">
                                <Sparkles size={18} />
                                <span>深度词汇解析 (Deep Dive)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {!isDeepAnalyzing && deepContent && (
                                    <button
                                        onClick={handleSaveDeepNote}
                                        className="text-xs bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-200"
                                    >
                                        保存笔记
                                    </button>
                                )}
                                <button onClick={() => setDeepModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 p-6 overflow-y-auto bg-slate-50">
                            {isDeepAnalyzing ? (
                                <div className="flex flex-col items-center justify-center h-full text-indigo-400 gap-3">
                                    <Loader size={32} className="animate-spin" />
                                    <p className="text-sm font-medium">AI 正在为 "{currentDeepWord?.word}" 生成专家级笔记...</p>
                                    <p className="text-xs text-indigo-300">Evaluating definitions, collocations, and exam usage...</p>
                                </div>
                            ) : (
                                <div className="prose prose-indigo max-w-none text-slate-700 font-serif leading-relaxed whitespace-pre-wrap">
                                    {deepContent}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Article Column */}
            <div className="w-1/2 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                        原文内容
                    </h3>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold border border-blue-200">
                        {analysisResult.level || '智能识别'}
                    </span>
                </div>
                <div className="p-8 overflow-y-auto flex-1 text-slate-600 leading-loose text-lg font-serif whitespace-pre-wrap selection:bg-blue-100 selection:text-blue-800">
                    {currentArticle || "暂无内容。"}
                </div>
            </div>

            {/* Analysis Column */}
            <div className="w-1/2 flex flex-col gap-4 overflow-y-auto pr-2 pb-10">

                {/* Summary Card */}
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-5 rounded-2xl border border-indigo-100 shadow-sm relative group">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-indigo-800 font-bold">
                            <Brain size={20} />
                            <span>AI 智能总结</span>
                        </div>
                        <button
                            onClick={handleSaveNote}
                            className="bg-white text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100"
                        >
                            <NotebookPen size={12} />
                            保存到笔记
                        </button>
                    </div>
                    <p className="text-indigo-900/80 text-sm leading-relaxed">
                        {analysisResult.summary}
                    </p>
                </div>

                {/* Vocabulary List */}
                <div>
                    <div className="flex items-center justify-between mb-4 mt-2">
                        <h3 className="font-bold text-slate-700 text-lg">核心词汇 (Vocabulary)</h3>
                    </div>

                    {analysisResult.vocabulary?.map((word, idx) => (
                        <div key={idx} className="relative group">
                            <WordCard
                                wordData={word}
                                isFastMode={!word.mnemonic && !word.writing}
                            />
                            {/* Action Buttons */}
                            <div className="absolute top-4 right-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => handleDeepAnalyze(word)}
                                    className="p-2 bg-white/90 backdrop-blur text-indigo-600 rounded-lg shadow-sm border border-indigo-100 hover:bg-indigo-50"
                                    title="生成深度笔记"
                                >
                                    <Sparkles size={16} />
                                </button>
                                <button
                                    onClick={() => handleSaveFlashcard(word)}
                                    className="p-2 bg-white/90 backdrop-blur text-amber-500 rounded-lg shadow-sm border border-amber-100 hover:bg-amber-50"
                                    title="添加到抽记卡"
                                >
                                    <Layers size={16} />
                                </button>
                            </div>
                        </div>
                    ))}

                    {(!analysisResult.vocabulary || analysisResult.vocabulary.length === 0) && (
                        <div className="text-slate-400 text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            未提取到重点词汇。
                        </div>
                    )}
                </div>

                {/* Structures */}
                {analysisResult.structures && analysisResult.structures.length > 0 && (
                    <div>
                        <h3 className="font-bold text-slate-700 mb-3 text-lg">语法与句式解析</h3>
                        {analysisResult.structures.map((struct, idx) => (
                            <div key={idx} className="bg-white p-5 rounded-xl border-l-4 border-purple-500 shadow-sm mb-3">
                                <div className="text-xs text-purple-600 font-bold mb-1 uppercase tracking-wider">{struct.type}</div>
                                <div className="text-slate-800 font-medium mb-2 font-serif text-lg">"{struct.pattern}"</div>
                                <div className="text-sm text-slate-500">{struct.explanation}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default StudyView;
