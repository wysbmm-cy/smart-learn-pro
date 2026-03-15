import React, { useState, useEffect } from 'react';
import { Brain, NotebookPen, Layers, Sparkles, X, Loader, FileText, Bookmark } from 'lucide-react';
import { useApp } from '../context/AppContext';
import WordCard from '../components/WordCard';
import { generateDeepWordAnalysis, sendChatMessage, generateQuickDefinition } from '../services/ai';
import { getFolders, saveFolder, saveHighlight } from '../services/db';
import ArticleActionMenu from '../components/ArticleActionMenu';
import TranslationBubble from '../components/TranslationBubble';

const StudyView = ({ onNavigate }) => {
    const { currentArticle, analysisResult, saveToNotes, addFlashcard, settings } = useApp();

    const [deepContent, setDeepContent] = useState('');
    const [isDeepAnalyzing, setIsDeepAnalyzing] = useState(false);
    const [currentDeepWord, setCurrentDeepWord] = useState(null);
    const [mobileTab, setMobileTab] = useState('article'); // 'article' | 'analysis'

    const [selection, setSelection] = useState(null);
    const [translationState, setTranslationState] = useState({ status: 'idle', result: null });

    useEffect(() => {
        const handleClick = () => {
            setSelection(null);
            setTranslationState({ status: 'idle', result: null });
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleMouseUp = (e) => {
        e.stopPropagation();
        const text = window.getSelection().toString().trim();
        if (text && text.length > 0) {
            const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
            if (selection?.text !== text) {
                setTranslationState({ status: 'idle', result: null });
            }
            setSelection({ text, x: rect.left + (rect.width / 2), y: rect.top });
        }
    };

    const handleTranslateSelection = async () => {
        if (!selection) return;
        setTranslationState({ status: 'loading', result: null });
        try {
            const result = await sendChatMessage([
                { role: "user", content: `Translate this to Chinese (Direct translation only, concise): "${selection.text}"` }
            ], settings);
            setTranslationState({ status: 'success', result });
        } catch (e) {
            setTranslationState({ status: 'success', result: "翻译失败: " + e.message });
        }
    };

    const handleSaveSelectionWord = async () => {
        if (!selection) return;
        const text = selection.text;
        setTranslationState({ status: 'loading', result: null });
        const definition = await generateQuickDefinition(text, currentArticle.substring(0, 200), settings);
        setTranslationState({ status: 'idle', result: null });

        const dateStr = new Date().toISOString().split('T')[0];
        const folderName = `Context - ${dateStr}`;
        let folderId;
        try {
            const allFolders = await getFolders();
            const existing = allFolders.find(f => f.name === folderName);
            if (existing) { folderId = existing.id; }
            else { folderId = crypto.randomUUID(); await saveFolder({ id: folderId, name: folderName, type: 'user' }); }
        } catch (e) { console.error("Folder error", e); }

        await addFlashcard({ front: text, back: definition || "从文章中摘录", folderId, tags: ["Contextual"], createdAt: Date.now() });
        alert(`Saved "${text}" to folder "${folderName}"!`);
        setSelection(null);
    };

    const handleSaveFlashcard = async (word) => {
        const dateStr = new Date().toISOString().split('T')[0];
        const folderName = `Context - ${dateStr}`;
        let folderId;
        try {
            const allFolders = await getFolders();
            const existing = allFolders.find(f => f.name === folderName);
            if (existing) { folderId = existing.id; }
            else { folderId = crypto.randomUUID(); await saveFolder({ id: folderId, name: folderName, type: 'user' }); }
        } catch (e) { console.error("Folder error", e); }

        await addFlashcard({ front: word.word, back: `${word.meaning}\n${word.pos || ''} ${word.phonetic || ''}`, folderId, tags: [word.level || 'General'], createdAt: Date.now() });
        alert(`Saved "${word.word}" to folder "${folderName}"!`);
    };

    const handleDeepAnalyze = async (word) => {
        setDeepContent('');
        setIsDeepAnalyzing(true);
        setCurrentDeepWord(word);
        const sentence = currentArticle ? currentArticle.split(/[.!?]/).find(s => s.toLowerCase().includes(word.word.toLowerCase())) : '';
        const result = await generateDeepWordAnalysis(word.word, sentence, settings);
        setDeepContent(result || "分析失败，请稍后重试。");
        setIsDeepAnalyzing(false);
    };

    const handleSaveDeepNote = async () => {
        if (!currentDeepWord || !deepContent) return;
        const dateStr = new Date().toISOString().split('T')[0];
        const folderName = `Deep Notes - ${dateStr}`;
        await saveToNotes({ title: `Deep Analysis: ${currentDeepWord.word}`, content: deepContent, folder: folderName });
        alert(`Saved to Note Folder: ${folderName}`);
        setCurrentDeepWord(null);
    };

    const handleSaveNote = async () => {
        if (!analysisResult) return;
        const dateStr = new Date().toLocaleDateString();
        const title = `智能分析: ${analysisResult.summary.slice(0, 15)}...`;
        let content = `# ${title}\n*创建于 ${dateStr}*\n\n`;
        content += `## 摘要\n${analysisResult.summary}\n\n`;
        content += `## 核心词汇\n| 单词 | 释义 | 级别 |\n| --- | --- | --- |\n`;
        analysisResult.vocabulary?.forEach(w => { content += `| **${w.word}** | ${w.meaning} | ${w.level || '-'} |\n`; });
        if (analysisResult.structures?.length) {
            content += `\n## 语法解析\n`;
            analysisResult.structures.forEach(s => { content += `- **${s.type}**: "${s.pattern}" - _${s.explanation}_\n`; });
        }
        content += `\n## 原文内容\n> ${currentArticle ? currentArticle.replace(/\n/g, '\n> ') : ''}`;
        await saveToNotes({ title, content, folder: "Smart Analysis" });
        alert("已保存到笔记！");
        onNavigate('notes');
    };

    if (!analysisResult) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-phy-muted gap-4">
                <Brain size={64} className="opacity-20" />
                <p>未找到分析结果。</p>
                <button onClick={() => onNavigate('import')} className="text-blue-600 hover:underline font-medium">
                    去导入分析
                </button>
            </div>
        );
    }

    return (
        <div className="animate-fade-in relative">
            {/* ── Mobile Segmented Control ── */}
            <div className="flex md:hidden mb-3 mobile-tabs">
                <button
                    className={`mobile-tab-btn ${mobileTab === 'article' ? 'active' : ''}`}
                    onClick={() => setMobileTab('article')}
                >
                    📄 原文内容
                </button>
                <button
                    className={`mobile-tab-btn ${mobileTab === 'analysis' ? 'active' : ''}`}
                    onClick={() => setMobileTab('analysis')}
                >
                    🔬 AI 分析
                </button>
            </div>

            {/* ── Main Layout ── */}
            <div className="flex flex-col md:flex-row gap-4 md:gap-6 md:h-[calc(100vh-140px)]">

                {/* Article Column */}
                <div
                    className={`md:w-1/2 bg-phy-glass rounded-2xl shadow-sm border border-phy-border flex flex-col overflow-hidden ${mobileTab === 'article' ? 'flex' : 'hidden'} md:flex`}
                    style={{ minHeight: '60vh' }}
                >
                    <div className="p-4 border-b border-phy-border bg-phy-bg flex justify-between items-center">
                        <h3 className="font-bold text-phy-text flex items-center gap-2">
                            <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                            原文内容
                        </h3>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold border border-blue-200">
                            {analysisResult.level || '智能识别'}
                        </span>
                    </div>
                    <div
                        className="p-5 md:p-8 overflow-y-auto flex-1 text-phy-muted leading-loose text-base md:text-lg font-serif whitespace-pre-wrap selection:bg-blue-100 selection:text-blue-800 relative"
                        onMouseUp={handleMouseUp}
                        onTouchEnd={handleMouseUp}
                    >
                        {currentArticle || "暂无内容。"}

                        {selection && translationState.status === 'idle' && (
                            <ArticleActionMenu
                                position={{ x: selection.x, y: selection.y }}
                                text={selection.text}
                                onTranslate={handleTranslateSelection}
                                onSave={handleSaveSelectionWord}
                                onClose={() => setSelection(null)}
                            />
                        )}
                        {selection && translationState.status !== 'idle' && (
                            <TranslationBubble
                                key={selection.text}
                                initialPosition={{ x: selection.x, y: selection.y }}
                                status={translationState.status}
                                result={translationState.result}
                                onClose={() => { setTranslationState({ status: 'idle', result: null }); setSelection(null); }}
                            />
                        )}
                    </div>
                </div>

                {/* Analysis Column */}
                <div className={`md:w-1/2 flex flex-col gap-4 overflow-y-auto pb-6 ${mobileTab === 'analysis' ? 'flex' : 'hidden'} md:flex`}>

                    {/* Summary Card */}
                    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-5 rounded-2xl border border-indigo-100 shadow-sm relative group">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 text-indigo-800 font-bold">
                                <Brain size={20} />
                                <span>AI 智能总结</span>
                            </div>
                            <div className="flex gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={async () => {
                                        await saveHighlight({ type: 'article', sourceId: 'current_analysis', content: analysisResult.summary, context: `文章级别: ${analysisResult.level || '未知'}`, date: new Date().toISOString().split('T')[0] });
                                        alert('已标记到每日总结！');
                                    }}
                                    className="bg-phy-glass text-amber-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-amber-100 hover:bg-amber-500 hover:text-white transition-all flex items-center gap-1"
                                >
                                    <Bookmark size={12} /> 标记
                                </button>
                                <button
                                    onClick={handleSaveNote}
                                    className="bg-phy-glass text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-1"
                                >
                                    <NotebookPen size={12} /> 保存
                                </button>
                            </div>
                        </div>
                        <p className="text-indigo-900/80 text-sm leading-relaxed">{analysisResult.summary}</p>
                    </div>

                    {/* Vocabulary */}
                    <div>
                        <h3 className="font-bold text-phy-text text-base md:text-lg mb-3">核心词汇 (Vocabulary)</h3>
                        {analysisResult.vocabulary?.map((word, idx) => (
                            <div key={idx} className="relative group mb-4 transition-all duration-300">
                                <div className={currentDeepWord?.word === word.word ? 'ring-2 ring-indigo-500 rounded-2xl' : ''}>
                                    <WordCard wordData={word} isFastMode={!word.mnemonic && !word.writing} />
                                </div>
                                {/* Action buttons always visible on mobile */}
                                <div className="absolute top-4 right-4 z-10 flex gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (currentDeepWord?.word === word.word) { setCurrentDeepWord(null); }
                                            else { handleDeepAnalyze(word); }
                                        }}
                                        className={`p-2 backdrop-blur rounded-lg shadow-sm border transition-colors ${currentDeepWord?.word === word.word ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-white/90 text-indigo-600 border-indigo-100 hover:bg-indigo-50'}`}
                                    >
                                        {currentDeepWord?.word === word.word ? <X size={16} /> : <Sparkles size={16} />}
                                    </button>
                                    <button
                                        onClick={() => handleSaveFlashcard(word)}
                                        className="p-2 bg-white/90 backdrop-blur text-amber-500 rounded-lg shadow-sm border border-amber-100 hover:bg-amber-50"
                                    >
                                        <Layers size={16} />
                                    </button>
                                </div>
                                {currentDeepWord?.word === word.word && (
                                    <div className="mt-2 ml-2 mr-1 bg-phy-glass rounded-xl border-l-[3px] border-indigo-500 shadow-md overflow-hidden">
                                        <div className="bg-indigo-50/50 px-4 py-2 border-b border-indigo-100 flex justify-between items-center text-xs">
                                            <span className="font-bold text-indigo-700 flex items-center gap-1"><Sparkles size={12} /> 深度解析</span>
                                            {!isDeepAnalyzing && deepContent && (
                                                <button onClick={handleSaveDeepNote} className="hover:bg-indigo-100 px-2 py-1 rounded text-indigo-600 font-bold">保存笔记</button>
                                            )}
                                        </div>
                                        <div className="p-4 md:p-5">
                                            {isDeepAnalyzing ? (
                                                <div className="flex flex-col items-center justify-center py-8 text-indigo-400 gap-3">
                                                    <Loader size={24} className="animate-spin" />
                                                    <p className="text-sm font-medium">正在深度分析 "{word.word}"...</p>
                                                </div>
                                            ) : (
                                                <div className="prose prose-sm prose-indigo max-w-none text-phy-text font-serif leading-relaxed whitespace-pre-wrap">{deepContent}</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                        {(!analysisResult.vocabulary || analysisResult.vocabulary.length === 0) && (
                            <div className="text-phy-muted text-center py-8 bg-phy-bg rounded-xl border border-dashed border-phy-border">未提取到重点词汇。</div>
                        )}
                    </div>

                    {/* Structures */}
                    {analysisResult.structures?.length > 0 && (
                        <div>
                            <h3 className="font-bold text-phy-text mb-3 text-base md:text-lg">语法与句式解析</h3>
                            {analysisResult.structures.map((struct, idx) => (
                                <div key={idx} className="bg-phy-glass p-4 md:p-5 rounded-xl border-l-4 border-purple-500 shadow-sm mb-3">
                                    <div className="text-xs text-purple-600 font-bold mb-1 uppercase tracking-wider">{struct.type}</div>
                                    <div className="text-phy-text font-bold mb-2 font-serif text-base md:text-lg">"{struct.pattern}"</div>
                                    <div className="text-sm text-phy-muted">{struct.explanation}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StudyView;
