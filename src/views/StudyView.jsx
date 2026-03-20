import React, { useState, useEffect } from 'react';
import { Brain, NotebookPen, Layers, Sparkles, X, Loader, FileText, Bookmark } from 'lucide-react';
import { useApp } from '../context/AppContext';
import WordCard from '../components/WordCard';
import { generateDeepWordAnalysis, sendChatMessage, generateQuickDefinition, analyzeText, generateReadingComprehensionQuiz } from '../services/ai';
import { getFolders, saveFolder, saveHighlight } from '../services/db';
import ArticleActionMenu from '../components/ArticleActionMenu';
import TranslationBubble from '../components/TranslationBubble';

const StudyView = ({ onNavigate }) => {
    const {
        currentArticle,
        analysisResult,
        setAnalysisResult,
        saveToNotes,
        saveToHistory,
        addFlashcard,
        settings
    } = useApp();

    const [deepContent, setDeepContent] = useState('');
    const [isDeepAnalyzing, setIsDeepAnalyzing] = useState(false);
    const [currentDeepWord, setCurrentDeepWord] = useState(null);
    const [mobileTab, setMobileTab] = useState('article');

    const [selection, setSelection] = useState(null);
    const [translationState, setTranslationState] = useState({ status: 'idle', result: null });

    const [isManualAnalyzing, setIsManualAnalyzing] = useState(false);
    const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
    const [readingQuiz, setReadingQuiz] = useState(null);
    const [quizAnswers, setQuizAnswers] = useState({});
    const [quizSubmitted, setQuizSubmitted] = useState(false);

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
        if (!text) return;

        const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
        if (selection?.text !== text) {
            setTranslationState({ status: 'idle', result: null });
        }
        setSelection({ text, x: rect.left + (rect.width / 2), y: rect.top });
    };

    const handleTranslateSelection = async () => {
        if (!selection) return;
        setTranslationState({ status: 'loading', result: null });
        try {
            const result = await sendChatMessage([
                { role: 'user', content: `Translate this to Chinese (Direct translation only, concise): "${selection.text}"` }
            ], settings);
            setTranslationState({ status: 'success', result });
        } catch (e) {
            setTranslationState({ status: 'success', result: `翻译失败: ${e.message}` });
        }
    };

    const resolveContextFolder = async (namePrefix = 'Context') => {
        const dateStr = new Date().toISOString().split('T')[0];
        const folderName = `${namePrefix} - ${dateStr}`;
        let folderId;
        const allFolders = await getFolders();
        const existing = allFolders.find(f => f.name === folderName);
        if (existing) {
            folderId = existing.id;
        } else {
            folderId = crypto.randomUUID();
            await saveFolder({ id: folderId, name: folderName, type: 'user' });
        }
        return { folderId, folderName };
    };

    const handleSaveSelectionWord = async () => {
        if (!selection) return;
        const text = selection.text;

        setTranslationState({ status: 'loading', result: null });
        const definition = await generateQuickDefinition(text, currentArticle?.substring(0, 200) || '', settings);
        setTranslationState({ status: 'idle', result: null });

        try {
            const { folderId, folderName } = await resolveContextFolder('Context');
            await addFlashcard({
                front: text,
                back: definition || '从文章中摘录',
                folderId,
                tags: ['Contextual'],
                createdAt: Date.now()
            });
            alert(`已将 "${text}" 保存到文件夹 "${folderName}"！`);
            setSelection(null);
        } catch (e) {
            alert(`保存失败: ${e.message}`);
        }
    };

    const handleSaveFlashcard = async (word) => {
        try {
            const { folderId, folderName } = await resolveContextFolder('Context');
            await addFlashcard({
                front: word.word,
                back: `${word.meaning}\n${word.pos || ''} ${word.phonetic || ''}`,
                folderId,
                tags: [word.level || 'General'],
                createdAt: Date.now()
            });
            alert(`已将 "${word.word}" 保存到文件夹 "${folderName}"！`);
        } catch (e) {
            alert(`保存失败: ${e.message}`);
        }
    };

    const handleBatchSaveFlashcards = async () => {
        if (!analysisResult?.vocabulary?.length) return;

        try {
            const { folderId, folderName } = await resolveContextFolder('Context');
            const total = analysisResult.vocabulary.length;
            let count = 0;

            for (const word of analysisResult.vocabulary) {
                await addFlashcard({
                    front: word.word,
                    back: `${word.meaning}\n${word.pos || ''} ${word.phonetic || ''}`,
                    folderId,
                    tags: [word.level || 'General', 'Batch Import'],
                    createdAt: Date.now()
                });
                count += 1;
            }

            alert(`成功批量添加 ${count}/${total} 个单词到文件夹 "${folderName}"`);
        } catch (e) {
            alert(`批量添加失败: ${e.message}`);
        }
    };

    const handleDeepAnalyze = async (word) => {
        setDeepContent('');
        setIsDeepAnalyzing(true);
        setCurrentDeepWord(word);

        const sentence = currentArticle
            ? currentArticle.split(/[.!?]/).find(s => s.toLowerCase().includes(word.word.toLowerCase()))
            : '';

        const result = await generateDeepWordAnalysis(word.word, sentence || '', settings);
        setDeepContent(result || '分析失败，请稍后重试。');
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

    const handleManualAnalyze = async () => {
        if (!currentArticle || !currentArticle.trim()) {
            alert('请先导入文章内容');
            return;
        }
        if (!settings.apiKey) {
            alert('请先配置 API Key');
            return;
        }

        setIsManualAnalyzing(true);
        try {
            const result = await analyzeText(currentArticle, settings);
            setAnalysisResult(result);
            await saveToHistory(currentArticle, result);
            alert('分析完成');
        } catch (e) {
            alert(`分析失败: ${e.message}`);
        } finally {
            setIsManualAnalyzing(false);
        }
    };

    const handleGenerateReadingQuiz = async () => {
        if (!currentArticle || !currentArticle.trim()) {
            alert('请先导入文章内容');
            return;
        }
        if (!settings.apiKey) {
            alert('请先配置 API Key');
            return;
        }

        setIsGeneratingQuiz(true);
        setReadingQuiz(null);
        setQuizAnswers({});
        setQuizSubmitted(false);

        try {
            const quiz = await generateReadingComprehensionQuiz(currentArticle, settings, 5);
            setReadingQuiz(quiz);
        } catch (e) {
            alert(`出题失败: ${e.message}`);
        } finally {
            setIsGeneratingQuiz(false);
        }
    };

    const handleSelectQuizOption = (qid, optionLetter) => {
        if (quizSubmitted) return;
        setQuizAnswers(prev => ({ ...prev, [qid]: optionLetter }));
    };

    const handleSaveNote = async () => {
        if (!analysisResult) return;

        const dateStr = new Date().toLocaleDateString();
        const title = `智能分析: ${analysisResult.summary.slice(0, 15)}...`;

        let content = `# ${title}\n*创建于 ${dateStr}*\n\n`;
        content += `## 核心总结\n${analysisResult.summary}\n\n`;
        content += `## 核心词汇\n| 单词 | 释义 | 级别 |\n| --- | --- | --- |\n`;
        analysisResult.vocabulary?.forEach(w => {
            content += `| **${w.word}** | ${w.meaning} | ${w.level || '-'} |\n`;
        });

        if (analysisResult.structures?.length) {
            content += '\n## 语法解析\n';
            analysisResult.structures.forEach(s => {
                content += `- **${s.type}**: "${s.pattern}" - _${s.explanation}_\n`;
            });
        }

        content += `\n## 原文内容\n> ${currentArticle ? currentArticle.replace(/\n/g, '\n> ') : ''}`;
        await saveToNotes({ title, content, folder: 'Smart Analysis' });
        alert('已保存到笔记！');
        onNavigate('notes');
    };

    const quizScore = readingQuiz?.questions?.length
        ? readingQuiz.questions.reduce((sum, q) => sum + (quizAnswers[q.id] === q.answer ? 1 : 0), 0)
        : 0;

    const answeredCount = readingQuiz?.questions?.length
        ? readingQuiz.questions.filter(q => !!quizAnswers[q.id]).length
        : 0;

    const progressPercent = readingQuiz?.questions?.length
        ? Math.round((answeredCount / readingQuiz.questions.length) * 100)
        : 0;

    const ReadingQuizPanel = () => (
        <div className="bg-gradient-to-br from-phy-glass to-phy-bg/60 rounded-2xl border border-phy-border p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                        <FileText size={16} />
                    </div>
                    <div>
                        <h3 className="font-bold text-phy-text">阅读理解练习</h3>
                        <p className="text-xs text-phy-muted">手动触发，不会在导入时自动分析。</p>
                    </div>
                </div>
                <button
                    onClick={handleGenerateReadingQuiz}
                    disabled={isGeneratingQuiz}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-60"
                >
                    {isGeneratingQuiz ? '生成中...' : '生成题目'}
                </button>
            </div>

            {!readingQuiz && (
                <div className="rounded-xl border border-dashed border-phy-border px-4 py-6 text-center text-sm text-phy-muted">
                    导入文章后点击「生成题目」开始练习。
                </div>
            )}

            {readingQuiz?.questions?.length > 0 && (
                <div className="space-y-4">
                    <div className="bg-phy-bg/60 rounded-xl border border-phy-border p-3">
                        <div className="flex items-center justify-between text-xs font-bold mb-2">
                            <span className="text-phy-muted">进度</span>
                            <span className="text-phy-text">{answeredCount}/{readingQuiz.questions.length}</span>
                        </div>
                        <div className="h-2 rounded-full bg-phy-glass overflow-hidden">
                            <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
                        </div>
                    </div>

                    {readingQuiz.questions.map((q, idx) => (
                        <div key={q.id || idx} className="p-3 bg-phy-bg rounded-xl border border-phy-border">
                            <div className="text-xs px-2 py-0.5 rounded-full bg-phy-glass text-phy-muted border border-phy-border inline-block mb-2">
                                Q{idx + 1}
                            </div>

                            <div className="text-sm font-bold text-phy-text mb-2 leading-relaxed">{q.question}</div>

                            <div className="grid grid-cols-1 gap-2">
                                {(q.options || []).map((opt, optIdx) => {
                                    const letter = String.fromCharCode(65 + optIdx);
                                    const selected = quizAnswers[q.id] === letter;
                                    const isCorrect = quizSubmitted && q.answer === letter;
                                    const isWrongSelected = quizSubmitted && selected && q.answer !== letter;

                                    return (
                                        <button
                                            key={`${q.id}_${letter}`}
                                            onClick={() => handleSelectQuizOption(q.id, letter)}
                                            className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                                                isCorrect
                                                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                                    : isWrongSelected
                                                        ? 'border-rose-500 bg-rose-50 text-rose-700'
                                                        : selected
                                                            ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                                                            : 'border-phy-border hover:bg-phy-glassHover text-phy-text'
                                            }`}
                                        >
                                            {opt}
                                        </button>
                                    );
                                })}
                            </div>

                            {quizSubmitted && (
                                <div className="mt-2 rounded-lg bg-phy-glass p-2 text-xs text-phy-muted">
                                    正确答案: <span className="font-bold text-emerald-600">{q.answer}</span>
                                    {q.explanation ? ` · ${q.explanation}` : ''}
                                </div>
                            )}
                        </div>
                    ))}

                    <div className="flex flex-wrap gap-2 items-center justify-between">
                        <div className="flex flex-wrap gap-2 items-center">
                            {!quizSubmitted ? (
                                <button
                                    onClick={() => setQuizSubmitted(true)}
                                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500"
                                >
                                    提交
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        setQuizSubmitted(false);
                                        setQuizAnswers({});
                                    }}
                                    className="px-4 py-2 rounded-lg bg-phy-glass text-phy-text text-sm font-bold hover:bg-phy-glassHover"
                                >
                                    重做
                                </button>
                            )}
                            <button
                                onClick={handleGenerateReadingQuiz}
                                disabled={isGeneratingQuiz}
                                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 disabled:opacity-60"
                            >
                                重新生成
                            </button>
                        </div>

                        {quizSubmitted && (
                            <div className="text-sm font-bold text-phy-text">
                                分数: {quizScore}/{readingQuiz.questions.length}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );

    const ArticleColumn = (
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
                    {analysisResult?.level || '待分析'}
                </span>
            </div>
            <div
                className="p-5 md:p-8 overflow-y-auto flex-1 text-phy-muted leading-loose text-base md:text-lg font-serif whitespace-pre-wrap selection:bg-blue-100 selection:text-blue-800 relative"
                onMouseUp={handleMouseUp}
                onTouchEnd={handleMouseUp}
            >
                {currentArticle || '暂无内容。'}

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
                        onClose={() => {
                            setTranslationState({ status: 'idle', result: null });
                            setSelection(null);
                        }}
                    />
                )}
            </div>
        </div>
    );

    if (!analysisResult) {
        if (!currentArticle) {
            return (
                <div className="flex flex-col items-center justify-center h-[60vh] text-phy-muted gap-4">
                    <Brain size={64} className="opacity-20" />
                    <p>未找到导入内容。</p>
                    <button onClick={() => onNavigate('import')} className="text-blue-600 hover:underline font-medium">
                        去导入文章
                    </button>
                </div>
            );
        }

        return (
            <div className="animate-fade-in relative">
                <div className="sticky top-0 z-20 bg-phy-bg/80 backdrop-blur-md pt-2 pb-3 -mx-4 px-4 md:hidden mb-2">
                    <div className="flex mobile-tabs">
                        <button className={`mobile-tab-btn ${mobileTab === 'article' ? 'active' : ''}`} onClick={() => setMobileTab('article')}>
                            原文内容
                        </button>
                        <button className={`mobile-tab-btn ${mobileTab === 'analysis' ? 'active' : ''}`} onClick={() => setMobileTab('analysis')}>
                            学习工具
                        </button>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 md:gap-6 md:h-[calc(100vh-140px)]">
                    {ArticleColumn}

                    <div className={`md:w-1/2 flex flex-col gap-4 overflow-y-auto pb-6 ${mobileTab === 'analysis' ? 'flex' : 'hidden'} md:flex`}>
                        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-5 rounded-2xl border border-indigo-100 shadow-sm">
                            <div className="flex items-center gap-2 text-indigo-800 font-bold mb-2">
                                <Brain size={18} />
                                文章已导入，等待手动操作
                            </div>
                            <p className="text-sm text-indigo-900/80 mb-4">
                                按你的要求，导入后默认不自动分析。你可以手动触发 AI 分析，或直接生成阅读理解题。
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <button onClick={handleManualAnalyze} disabled={isManualAnalyzing} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 disabled:opacity-60">
                                    {isManualAnalyzing ? '分析中...' : '手动开始 AI 分析'}
                                </button>
                                <button onClick={handleGenerateReadingQuiz} disabled={isGeneratingQuiz} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-500 disabled:opacity-60">
                                    {isGeneratingQuiz ? '出题中...' : '手动生成阅读理解'}
                                </button>
                            </div>
                        </div>

                        <ReadingQuizPanel />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in relative">
            <div className="sticky top-0 z-20 bg-phy-bg/80 backdrop-blur-md pt-2 pb-3 -mx-4 px-4 md:hidden mb-2">
                <div className="flex mobile-tabs">
                    <button className={`mobile-tab-btn ${mobileTab === 'article' ? 'active' : ''}`} onClick={() => setMobileTab('article')}>
                        原文内容
                    </button>
                    <button className={`mobile-tab-btn ${mobileTab === 'analysis' ? 'active' : ''}`} onClick={() => setMobileTab('analysis')}>
                        AI 分析
                    </button>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 md:gap-6 md:h-[calc(100vh-140px)]">
                {ArticleColumn}

                <div className={`md:w-1/2 flex flex-col gap-4 overflow-y-auto pb-6 ${mobileTab === 'analysis' ? 'flex' : 'hidden'} md:flex`}>
                    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-5 rounded-2xl border border-indigo-100 shadow-sm relative group">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 text-indigo-800 font-bold">
                                <Brain size={20} />
                                <span>AI 智能总结</span>
                            </div>
                            <div className="flex gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={async () => {
                                        await saveHighlight({
                                            type: 'article',
                                            sourceId: 'current_analysis',
                                            content: analysisResult.summary,
                                            context: `文章级别: ${analysisResult.level || '未知'}`,
                                            date: new Date().toISOString().split('T')[0]
                                        });
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
                                    <NotebookPen size={12} /> 保存笔记
                                </button>
                            </div>
                        </div>
                        <p className="text-indigo-900/80 text-sm leading-relaxed">{analysisResult.summary}</p>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold text-phy-text text-base md:text-lg">核心词汇</h3>
                            <button
                                onClick={handleBatchSaveFlashcards}
                                className="text-xs bg-amber-500/10 text-amber-600 border border-amber-500/20 px-3 py-1.5 rounded-lg font-bold hover:bg-amber-500 hover:text-white transition-all flex items-center gap-1 shadow-sm"
                            >
                                <Layers size={14} /> 批量加入闪卡
                            </button>
                        </div>

                        {analysisResult.vocabulary?.map((word, idx) => (
                            <div key={idx} className="relative group mb-4 transition-all duration-300">
                                <div className={currentDeepWord?.word === word.word ? 'ring-2 ring-indigo-500 rounded-2xl' : ''}>
                                    <WordCard
                                        wordData={word}
                                        isFastMode={!word.mnemonic && !word.writing}
                                        actions={
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (currentDeepWord?.word === word.word) {
                                                            setCurrentDeepWord(null);
                                                        } else {
                                                            handleDeepAnalyze(word);
                                                        }
                                                    }}
                                                    className={`p-2 backdrop-blur rounded-lg shadow-sm border transition-colors ${
                                                        currentDeepWord?.word === word.word
                                                            ? 'bg-indigo-100 text-indigo-700 border-indigo-200'
                                                            : 'bg-white/90 text-indigo-600 border-indigo-100 hover:bg-indigo-50'
                                                    }`}
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
                                        }
                                    />
                                </div>

                                {currentDeepWord?.word === word.word && (
                                    <div className="mt-2 ml-2 mr-1 bg-phy-glass rounded-xl border-l-[3px] border-indigo-500 shadow-md overflow-hidden">
                                        <div className="bg-indigo-50/50 px-4 py-2 border-b border-indigo-100 flex justify-between items-center text-xs">
                                            <span className="font-bold text-indigo-700 flex items-center gap-1"><Sparkles size={12} /> 深度分析</span>
                                            {!isDeepAnalyzing && deepContent && (
                                                <button onClick={handleSaveDeepNote} className="hover:bg-indigo-100 px-2 py-1 rounded text-indigo-600 font-bold">保存笔记</button>
                                            )}
                                        </div>
                                        <div className="p-4 md:p-5">
                                            {isDeepAnalyzing ? (
                                                <div className="flex flex-col items-center justify-center py-8 text-indigo-400 gap-3">
                                                    <Loader size={24} className="animate-spin" />
                                                    <p className="text-sm font-medium">正在深度分析 {word.word} ...</p>
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

                    {analysisResult.structures?.length > 0 && (
                        <div>
                            <h3 className="font-bold text-phy-text mb-3 text-base md:text-lg">语法与句式解析</h3>
                            {analysisResult.structures.map((struct, idx) => (
                                <div key={idx} className="bg-phy-glass p-4 md:p-5 rounded-xl border-l-4 border-purple-500 shadow-sm mb-3">
                                    <div className="text-xs text-purple-600 font-bold mb-1 uppercase tracking-wider">{struct.type}</div>
                                    <div className="text-phy-text font-bold mb-2 font-serif text-base md:text-lg">{struct.pattern}</div>
                                    <div className="text-sm text-phy-muted">{struct.explanation}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    <ReadingQuizPanel />
                </div>
            </div>
        </div>
    );
};

export default StudyView;
