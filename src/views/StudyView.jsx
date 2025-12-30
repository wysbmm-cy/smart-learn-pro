import React, { useState, useEffect } from 'react';
import {
    Brain, NotebookPen, Layers, Sparkles, X, Loader, FileText,
    Target, Trophy, Calendar, ChevronRight, Activity
} from 'lucide-react';
import {
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer
} from 'recharts';
import { useApp } from '../context/AppContext';
import WordCard from '../components/WordCard';
import { generateDeepWordAnalysis, sendChatMessage, generatePlanInsight } from '../services/ai';
import { getHistory, getUserGoal, saveUserGoal, getStudyLogs } from '../services/db';
import ArticleActionMenu from '../components/ArticleActionMenu';
import TranslationBubble from '../components/TranslationBubble';

const StudyView = ({ onNavigate }) => {
    const { currentArticle, analysisResult, saveToNotes, addFlashcard, settings } = useApp();

    // Smart Coach State
    const [smartPlan, setSmartPlan] = useState(null);
    const [loadingPlan, setLoadingPlan] = useState(true);
    const [goalModalOpen, setGoalModalOpen] = useState(false);
    const [userGoal, setUserGoal] = useState({ examName: '', examDate: '', currentLevel: '' });

    // Deep Analysis State
    const [deepModalOpen, setDeepModalOpen] = useState(false);
    const [deepContent, setDeepContent] = useState('');
    const [isDeepAnalyzing, setIsDeepAnalyzing] = useState(false);
    const [currentDeepWord, setCurrentDeepWord] = useState(null);

    // Text Selection State
    const [selection, setSelection] = useState(null);
    const [translationState, setTranslationState] = useState({ status: 'idle', result: null });

    // Initial Load: Smart Coach Data
    useEffect(() => {
        const initDashboard = async () => {
            // 1. Load Goal
            try {
                const goal = await getUserGoal();
                if (goal) setUserGoal(goal);

                // 2. Load History & Logs
                const history = await getHistory();
                const logs = await getStudyLogs(); // Assumes this API exists or returns []

                // 3. Generate Insight
                // Don't regenerate every single time to save tokens? 
                // For now, let's regenerate on mount to be "fresh".
                if (settings.apiKey) {
                    const plan = await generatePlanInsight(history || [], goal, logs || [], settings);
                    setSmartPlan(plan);
                }
            } catch (e) {
                console.error("Dashboard Init Error", e);
            } finally {
                setLoadingPlan(false);
            }
        };

        if (!analysisResult) {
            initDashboard();
        }
    }, [analysisResult, settings.apiKey]); // Re-run if analysis cleared

    // Clear selection when clicking elsewhere
    useEffect(() => {
        const handleClick = () => {
            setSelection(null);
            setTranslationState({ status: 'idle', result: null });
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleSaveGoal = async () => {
        await saveUserGoal(userGoal);
        setGoalModalOpen(false);
        setLoadingPlan(true);
        // Refresh Plan
        const history = await getHistory();
        const plan = await generatePlanInsight(history || [], userGoal, [], settings);
        setSmartPlan(plan);
        setLoadingPlan(false);
    };

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
            setTranslationState({ status: 'error', result: "翻译失败: " + e.message });
        }
    };

    const handleSaveSelectionWord = async () => {
        if (!selection) return;
        await addFlashcard({
            front: selection.text,
            back: "从文章中摘录",
            tags: ["Contextual"],
            createdAt: Date.now()
        });
        alert(`Saved "${selection.text}"!`);
        setSelection(null);
    };

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
        const sentence = currentArticle?.split(/[.!?]/).find(s => s.toLowerCase().includes(word.word.toLowerCase()));
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
        let content = `# ${title}\n*创建于 ${dateStr}*\n\n## 摘要\n${analysisResult.summary}\n\n`;
        content += `## 核心词汇\n| 单词 | 释义 | 级别 |\n| --- | --- | --- |\n`;
        analysisResult.vocabulary?.forEach(w => { content += `| **${w.word}** | ${w.meaning} | ${w.level || '-'} |\n`; });
        if (analysisResult.structures?.length) {
            content += `\n## 语法解析\n`;
            analysisResult.structures.forEach(s => { content += `- **${s.type}**: "${s.pattern}" - _${s.explanation}_\n`; });
        }
        content += `\n## 原文内容\n> ${currentArticle.replace(/\n/g, '\n> ')}`;
        await saveToNotes({ title, content, folder: "Smart Analysis" });
        alert("已保存到笔记！");
        onNavigate('notes');
    };

    // --- Render Logic ---

    // 1. If Analysis Result exists, show Analysis View (Split Screen)
    if (analysisResult) {
        return (
            <div className="flex h-[calc(100vh-140px)] gap-6 animate-fade-in relative">
                {/* Deep Dive Modal */}
                {deepModalOpen && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-white/30">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 rounded-t-2xl">
                                <div className="flex items-center gap-2 text-indigo-700 font-bold">
                                    <Sparkles size={18} />
                                    <span>深度词汇解析 (Deep Dive)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {!isDeepAnalyzing && deepContent && (
                                        <button onClick={handleSaveDeepNote} className="text-xs bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-200">
                                            保存笔记
                                        </button>
                                    )}
                                    <button onClick={() => setDeepModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                                </div>
                            </div>
                            <div className="flex-1 p-6 overflow-y-auto bg-slate-50">
                                {isDeepAnalyzing ? (
                                    <div className="flex flex-col items-center justify-center h-full text-indigo-400 gap-3">
                                        <Loader size={32} className="animate-spin" />
                                        <p className="text-sm font-medium">AI 正在深度解析 "{currentDeepWord?.word}"...</p>
                                    </div>
                                ) : (
                                    <div className="prose prose-indigo max-w-none text-slate-700 font-serif leading-relaxed whitespace-pre-wrap">{deepContent}</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Left: Article */}
                <div className="w-1/2 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                            原文内容
                        </h3>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold border border-blue-200">{analysisResult.level || '智能识别'}</span>
                    </div>
                    <div className="p-8 overflow-y-auto flex-1 text-slate-600 leading-loose text-lg font-serif whitespace-pre-wrap selection:bg-blue-100 selection:text-blue-800 relative" onMouseUp={handleMouseUp}>
                        {currentArticle || "暂无内容。"}
                        {selection && translationState.status === 'idle' && (
                            <ArticleActionMenu position={{ x: selection.x, y: selection.y }} text={selection.text} onTranslate={handleTranslateSelection} onSave={handleSaveSelectionWord} onClose={() => setSelection(null)} />
                        )}
                        {selection && translationState.status !== 'idle' && (
                            <TranslationBubble key={selection.text} initialPosition={{ x: selection.x, y: selection.y }} status={translationState.status} result={translationState.result} onClose={() => { setTranslationState({ status: 'idle', result: null }); setSelection(null); }} />
                        )}
                    </div>
                </div>

                {/* Right: Smart Analysis */}
                <div className="w-1/2 flex flex-col gap-4 overflow-y-auto pr-2 pb-10">
                    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 p-5 rounded-2xl border border-indigo-100 shadow-sm relative group">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2 text-indigo-800 font-bold">
                                <Brain size={20} />
                                <span>AI 智能总结</span>
                            </div>
                            <button onClick={handleSaveNote} className="bg-white text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm border border-indigo-100 hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100">
                                <NotebookPen size={12} />
                                保存到笔记
                            </button>
                        </div>
                        <p className="text-indigo-900/80 text-sm leading-relaxed">{analysisResult.summary}</p>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-4 mt-2">
                            <h3 className="font-bold text-slate-700 text-lg">核心词汇 (Vocabulary)</h3>
                        </div>
                        {analysisResult.vocabulary?.map((word, idx) => (
                            <div key={idx} className="relative group">
                                <WordCard wordData={word} isFastMode={!word.mnemonic} />
                                <div className="absolute top-4 right-4 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleDeepAnalyze(word)} className="p-2 bg-white/90 backdrop-blur text-indigo-600 rounded-lg shadow-sm border border-indigo-100 hover:bg-indigo-50" title="生成深度笔记"><Sparkles size={16} /></button>
                                    <button onClick={() => handleSaveFlashcard(word)} className="p-2 bg-white/90 backdrop-blur text-amber-500 rounded-lg shadow-sm border border-amber-100 hover:bg-amber-50" title="添加到抽记卡"><Layers size={16} /></button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {analysisResult.structures?.length > 0 && (
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
    }

    // 2. Default: Smart Coach Dashboard
    return (
        <div className="h-[calc(100vh-140px)] animate-fade-in flex flex-col items-center p-6 overflow-y-auto">

            {/* Header / Intro */}
            <div className="w-full max-w-5xl flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
                        <Brain className="text-indigo-600" size={32} />
                        Smart Coach <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded-full">Beta 2.0</span>
                    </h1>
                    <p className="text-slate-500 mt-2">
                        {smartPlan?.schedule_status || "Your personal AI study director."}
                    </p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={() => setGoalModalOpen(true)}
                        className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 flex items-center gap-2 font-medium transition-all"
                    >
                        <Target size={18} />
                        {userGoal.examName ? `${userGoal.examName} (${userGoal.examDate})` : "Set Goal"}
                    </button>
                    <button
                        onClick={() => onNavigate('import')}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 flex items-center gap-2 font-bold transition-all transform hover:-translate-y-0.5"
                    >
                        <FileText size={18} />
                        Start New Analysis
                    </button>
                </div>
            </div>

            {loadingPlan && (
                <div className="flex-1 flex flex-col justify-center items-center text-slate-400 gap-4">
                    <Loader size={40} className="animate-spin text-indigo-500" />
                    <p>Generating your daily plan...</p>
                </div>
            )}

            {!loadingPlan && smartPlan && (
                <div className="w-full max-w-5xl grid grid-cols-3 gap-6">
                    {/* Left: Radar Chart */}
                    <div className="col-span-1 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col relative overflow-hidden">
                        <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                            <Activity size={18} className="text-emerald-500" />
                            Skill Radar
                        </h3>
                        <div className="flex-1 min-h-[250px] relative -ml-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={smartPlan.radar}>
                                    <PolarGrid stroke="#e2e8f0" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12 }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                    <Radar name="My Skills" dataKey="A" stroke="#6366f1" fill="#818cf8" fillOpacity={0.5} />
                                </RadarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="text-xs text-center text-slate-400 mt-2">
                            Based on your recent activity
                        </div>
                    </div>

                    {/* Right: Daily Insight & Quests */}
                    <div className="col-span-2 flex flex-col gap-6">

                        {/* Insight Card */}
                        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-8 opacity-10"><Sparkles size={100} /></div>
                            <h3 className="font-bold text-indigo-100 flex items-center gap-2 mb-2">
                                <Sparkles size={18} /> Daily Insight
                            </h3>
                            <p className="text-lg font-medium leading-relaxed max-w-2xl">
                                "{smartPlan.insight}"
                            </p>
                        </div>

                        {/* Quests */}
                        <div className="grid grid-cols-2 gap-4">
                            {smartPlan.daily_quests?.map((quest, idx) => (
                                <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all group cursor-pointer" onClick={() => onNavigate(quest.link || 'home')}>
                                    <div className="flex justify-between items-start mb-2">
                                        <div className={`p-2 rounded-lg ${quest.type === 'vocab' ? 'bg-amber-100 text-amber-600' :
                                                quest.type === 'reading' ? 'bg-blue-100 text-blue-600' :
                                                    'bg-purple-100 text-purple-600'
                                            }`}>
                                            {quest.type === 'vocab' ? <Layers size={20} /> :
                                                quest.type === 'reading' ? <Brain size={20} /> :
                                                    <NotebookPen size={20} />}
                                        </div>
                                        <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-full border border-slate-100">
                                            {quest.xp || 50} XP
                                        </span>
                                    </div>
                                    <h4 className="font-bold text-slate-700 mb-1 group-hover:text-indigo-600 transition-colors">{quest.title}</h4>
                                    <div className="flex items-center gap-1 text-xs text-indigo-500 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                        Start Now <ChevronRight size={12} />
                                    </div>
                                </div>
                            ))}
                            {/* Add Quest Placeholder */}
                            <div className="bg-slate-50 p-5 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-2 hover:bg-slate-100 transition-colors cursor-not-allowed">
                                <div className="p-2 bg-slate-200 rounded-full"><Trophy size={20} /></div>
                                <span className="text-sm font-medium">Coming Soon</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Goal Setting Modal */}
            {goalModalOpen && (
                <div className="absolute inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/20">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-800">Set Your Goal</h3>
                            <button onClick={() => setGoalModalOpen(false)}><X size={24} className="text-slate-400" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Target Exam / Goal</label>
                                <input
                                    type="text"
                                    value={userGoal.examName}
                                    onChange={e => setUserGoal({ ...userGoal, examName: e.target.value })}
                                    placeholder="e.g. CET-6, IELTS, TOEFL"
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Exam Date (Optional)</label>
                                <input
                                    type="date"
                                    value={userGoal.examDate}
                                    onChange={e => setUserGoal({ ...userGoal, examDate: e.target.value })}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Current Estimate Level</label>
                                <select
                                    value={userGoal.currentLevel}
                                    onChange={e => setUserGoal({ ...userGoal, currentLevel: e.target.value })}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    <option value="">Select Level</option>
                                    <option value="Beginner">Beginner (A1-A2)</option>
                                    <option value="Intermediate">Intermediate (B1-B2)</option>
                                    <option value="Advanced">Advanced (C1-C2)</option>
                                </select>
                            </div>
                            <button
                                onClick={handleSaveGoal}
                                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 mt-2"
                            >
                                Save & Generate Plan
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudyView;
