import React, { useState, useEffect, useRef } from 'react';
import SplitPane from '../components/SplitPane';
import { useApp } from '../context/AppContext';
import { PenTool, Save, RotateCcw, Sparkles, CheckCircle, AlertCircle, FileText, Eraser, Trash2, X, Loader2, Layout, Maximize2, Minimize2, ArrowRightLeft, ChevronLeft, ChevronRight, Wand2, Layers, BarChart3, History, BookOpen, Bookmark } from 'lucide-react';
import { saveWriting, getWritings, deleteWriting, saveNote, getFolders, saveHighlight } from '../services/db';
import { analyzeWriting, generateTranslationChallenge, gradeTranslation } from '../services/ai';
import { writingTemplates } from '../data/writingTemplates';
import DiffViewer from '../components/DiffViewer';
import PolishChatModal from '../components/PolishChatModal';
import toast from 'react-hot-toast';

const WriterView = () => {
    const { settings, toggleChat, setCurrentArticle } = useApp();
    const [content, setContent] = useState(() => localStorage.getItem('draft_writer_content') || '');
    const [title, setTitle] = useState(() => localStorage.getItem('draft_writer_title') || '');
    const [writings, setWritings] = useState([]);
    const [currentId, setCurrentId] = useState(null);
    const [isSaving, setIsSaving] = useState(false);

    // AI Analysis State
    const [analysis, setAnalysis] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // V2.0 New States
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [viewMode, setViewMode] = useState('report');
    const [analysisMode, setAnalysisMode] = useState('polish'); // 'grammar', 'polish', 'academic'

    // Mobile Tab State
    const [mobileTab, setMobileTab] = useState('editor'); // 'tools', 'editor', 'analysis'

    // Translation Challenge State
    const [isTranslationMode, setIsTranslationMode] = useState(false);
    const [challengeData, setChallengeData] = useState(null); // { chinese: "...", targetWords: [...] }

    // Sentence Polish State
    const [selection, setSelection] = useState(null);
    const [showPolishModal, setShowPolishModal] = useState(false);
    const textareaRef = useRef(null);

    // Persist draft
    useEffect(() => {
        localStorage.setItem('draft_writer_content', content);
    }, [content]);

    useEffect(() => {
        localStorage.setItem('draft_writer_title', title);
    }, [title]);

    // Stats
    const wordCount = content.trim().split(/\s+/).filter(w => w.length > 0).length;

    useEffect(() => {
        loadWritings();
    }, []);

    const loadWritings = async () => {
        const list = await getWritings();
        setWritings(list);
    };

    const handleSave = async () => {
        if (!content.trim()) return;
        setIsSaving(true);
        const id = currentId || crypto.randomUUID();

        // Prepare writing object with metadata if analysis exists
        const writing = {
            id,
            title: title || content.slice(0, 30) + '...',
            content,
            updatedAt: Date.now(),
            // Save last analysis result stats if available (lightweight)
            lastScore: analysis?.score,
            lastLevel: analysis?.level,
            // Full Analysis Data (Persisted)
            analysisResult: analysis
        };

        await saveWriting(writing);
        setCurrentId(id);
        if (!title) setTitle(writing.title);
        await loadWritings();
        setTimeout(() => setIsSaving(false), 800);
        toast.success('草稿保存成功！');
    };

    const handleNew = () => {
        setShowTemplateModal(true);
    };

    const handleSelectTemplate = (template) => {
        setContent(template ? template.content : '');
        setTitle(template ? `${template.name} - ${new Date().toLocaleDateString()}` : '');
        setCurrentId(null);
        setAnalysis(null);
        setShowTemplateModal(false);
        if (template) setMobileTab('editor');
        toast.success(template ? `已应用模板: ${template.name}` : '已创建空白草稿');
    };

    const handleLoad = (w) => {
        setContent(w.content);
        setTitle(w.title);
        setCurrentId(w.id);
        setAnalysis(w.analysisResult || null); // Restore analysis if exists
        setMobileTab('editor'); // Switch to editor on load
        if (isFocusMode) setIsFocusMode(false);
    };

    const handleDelete = async (e, id) => {
        e.stopPropagation();
        if (window.confirm("确定删除此草稿？")) {
            await deleteWriting(id);
            if (currentId === id) {
                setContent('');
                setTitle('');
                setCurrentId(null);
            }
            loadWritings();
            toast.success('草稿已删除。');
        }
    };

    const handleSelectionChange = (e) => {
        const start = e.target.selectionStart;
        const end = e.target.selectionEnd;
        if (start !== end) {
            const text = content.substring(start, end);
            if (text.trim().length > 0) {
                setSelection({ text, start, end });
            } else {
                setSelection(null);
            }
        } else {
            setSelection(null);
        }
    };

    const openPolishModal = () => {
        if (selection) {
            setShowPolishModal(true);
        }
    };

    const handleSaveNote = async () => {
        if (!analysis?.knowledge_summary) return;
        const note = {
            id: crypto.randomUUID(),
            title: `写作笔记: ${title || '无标题'} - ${new Date().toLocaleDateString()}`,
            content: analysis.knowledge_summary,
            updatedAt: Date.now()
        };
        await saveNote(note);
        toast.success("已保存到学习笔记！");
    };

    const handleStartChallenge = async () => {
        try {
            toast.loading("Generating Challenge...", { id: 'gen_trans' });
            // Fetch vocab from DB
            const folders = await getFolders();
            const allVocab = folders.flatMap(f => f.flashcards || []);

            const challenge = await generateTranslationChallenge(allVocab, settings);
            setChallengeData(challenge);
            setContent(''); // Clear editor for the user
            setTitle("Translation Practice - " + new Date().toLocaleDateString());
            setAnalysis(null);
            setIsTranslationMode(true);
            setMobileTab('editor');
            toast.success("Ready! Translate the Chinese sentence.", { id: 'gen_trans' });
        } catch (e) {
            toast.error("Failed to generate: " + e.message, { id: 'gen_trans' });
        }
    };

    const handleAnalyze = async () => {
        if (!content.trim()) {
            toast.error("请先写点什么吧！");
            return;
        }
        setIsAnalyzing(true);
        setAnalysis(null);

        try {
            if (isTranslationMode && challengeData) {
                const result = await gradeTranslation(challengeData, content, settings);
                const normalized = {
                    score: Math.round(result.score / 100 * 15),
                    level: result.score > 85 ? "Excellent" : result.score > 70 ? "Good" : "Fair",
                    comment: result.comment,
                    corrected_text: result.improved_version,
                    issues: (result.issues || []).length > 0 ? result.issues : (result.vocab_check || []).map(v => ({
                        type: "Vocabulary",
                        severity: v.correctly ? "improvement" : "critical",
                        original: v.word, // Fallback, might not match content
                        fixed: v.used ? "Used ✅" : "Missed ❌",
                        reason: v.correctly ? "Great usage!" : "Incorrect usage or form."
                    })),
                    improvement_tips: ["Check the improved version for better flow."],
                    knowledge_summary: `## Translation Review\n\n**Original:** ${challengeData.chinese}\n\n**Your Translation:** ${content}\n\n**Better Version:** ${result.improved_version}\n\n**Vocab Usage:**\n${(result.vocab_check || []).map(v => `* ${v.word}: ${v.used ? (v.correctly ? '✅' : '⚠️') : '❌'}`).join('\n')}`
                };
                setAnalysis(normalized);
                toast.success("Translation Graded!");
                setMobileTab('analysis'); // Auto switch to analysis

            } else {
                const result = await analyzeWriting(content, settings, analysisMode);
                setAnalysis(result);
                toast.success("AI 润色分析完成！");
                setMobileTab('analysis'); // Auto switch to analysis
            }
        } catch (e) {
            console.error(e);
            toast.error("分析失败: " + e.message);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleApplyFix = (issue) => {
        if (issue.applied) return;
        const idx = content.indexOf(issue.original);
        if (idx === -1) {
            toast.error("未找到原文，可能已被修改。");
            return;
        }
        const before = content.substring(0, idx);
        const after = content.substring(idx + issue.original.length);
        const newContent = before + issue.fixed + after;
        setContent(newContent);
        const newIssues = analysis.issues.map(i =>
            i === issue ? { ...i, applied: true } : i
        );
        setAnalysis({ ...analysis, issues: newIssues });
        toast.success("修改已应用");
    };

    // Helper: Score Badge Color
    const getScoreColor = (score) => {
        if (!score) return 'bg-slate-500';
        if (score >= 13) return 'bg-emerald-500 shadow-emerald-500/50';
        if (score >= 10) return 'bg-indigo-500 shadow-indigo-500/50';
        if (score >= 7) return 'bg-amber-500 shadow-amber-500/50';
        return 'bg-red-500 shadow-red-500/50';
    };

    // Helper Component: SmartReview (Graded Annotations)
    const SmartReview = () => {
        if (!content) return null;

        const mask = new Array(content.length).fill(null);

        (analysis.issues || []).forEach(issue => {
            if (!issue.original || issue.original.length < 2) return;

            let pos = content.indexOf(issue.original);
            // Highlight all occurrences to be safe, or just first? 
            // Ideally we need specific index from AI, but we don't have it.
            // We'll highlight all non-overlapping occurrences.
            while (pos !== -1) {
                // Check overlap
                let isFree = true;
                for (let k = pos; k < pos + issue.original.length; k++) {
                    if (mask[k]) isFree = false;
                }

                if (isFree) {
                    for (let k = pos; k < pos + issue.original.length; k++) {
                        mask[k] = issue;
                    }
                }
                pos = content.indexOf(issue.original, pos + 1);
            }
        });

        let output = [];
        let i = 0;
        while (i < content.length) {
            if (!mask[i]) {
                output.push(<span key={i}>{content[i]}</span>);
                i++;
            } else {
                const issue = mask[i];
                const start = i;
                while (i < content.length && mask[i] === issue) {
                    i++;
                }
                const textSegment = content.substring(start, i);

                let colorClass = "bg-amber-500/10 text-amber-200 decoration-amber-500/30"; // Default: Block style (Improvement)
                let badgeColor = "text-amber-400";

                const s = (issue.severity || '').toLowerCase();
                if (s.includes('critical')) {
                    // Critical: Red Wavy Underline (No background) to mimic error
                    colorClass = "underline decoration-wavy decoration-red-500 decoration-2 text-red-200 decoration-offset-4";
                    badgeColor = "text-red-400";
                }
                else if (s.includes('style')) {
                    // Style: Purple Block
                    colorClass = "bg-purple-500/20 text-purple-200 border-b-2 border-purple-500/30 px-1 rounded mx-0.5";
                    badgeColor = "text-purple-400";
                } else {
                    // Improvement: Amber Block
                    colorClass = "bg-amber-500/10 text-amber-200 border-b-2 border-amber-500/30 px-1 rounded mx-0.5";
                }

                output.push(
                    <span
                        key={start}
                        className={`cursor-pointer relative group transition-all ${colorClass}`}
                    >
                        {textSegment}
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 p-0 bg-slate-900 shadow-2xl rounded-xl border border-white/20 opacity-0 group-hover:opacity-100 transition-opacity z-50 overflow-hidden">
                            {/* Tooltip Header */}
                            <div className="flex justify-between items-center p-3 bg-slate-950/50 border-b border-white/10">
                                <div className="flex items-center gap-2">
                                    <span className={`font-bold text-xs uppercase tracking-wider ${badgeColor}`}>{issue.type}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 bg-white/10 rounded text-slate-400 font-mono">{issue.severity}</span>
                                </div>
                            </div>

                            {/* Tooltip Content */}
                            <div className="p-4 space-y-3">
                                <div className="text-sm text-slate-300 leading-relaxed font-sans">{issue.reason}</div>

                                {/* Fix Preview */}
                                <div className="flex items-center gap-2 text-sm bg-black/20 p-2 rounded-lg border border-white/5 font-mono">
                                    <span className="text-red-400/70 line-through decoration-red-500/30 selection:bg-red-900/30">{issue.original}</span>
                                    <ChevronRight size={12} className="text-slate-500" />
                                    <span className="text-emerald-400 font-bold selection:bg-emerald-900/30">{issue.fixed}</span>
                                </div>

                                {/* Apply Button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleApplyFix(issue);
                                    }}
                                    className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-emerald-900/20 active:scale-95"
                                >
                                    <CheckCircle size={14} />
                                    Click to Apply Fix
                                </button>
                            </div>
                        </span>
                    </span>
                );
            }
        }

        return (
            <div className="bg-slate-800/50 rounded-xl p-6 border border-white/10 font-serif text-lg leading-loose text-slate-300 whitespace-pre-wrap">
                {output}
            </div>
        );
    };

    // Helper Component: HeatmapView
    const HeatmapView = () => {
        if (!analysis?.vocabulary_analysis) return <div className="text-slate-500">无法生成词汇热力图 (数据缺失)</div>;
        const vocabMap = new Map();
        analysis.vocabulary_analysis.forEach(item => {
            vocabMap.set(item.word.toLowerCase(), item);
        });
        const tokens = content.split(/(\b[a-zA-Z-]+\b)/g);
        return (
            <div className="bg-slate-800/50 rounded-xl p-6 border border-white/10 font-serif text-lg leading-loose text-slate-300">
                <div className="flex gap-4 mb-4 text-xs font-bold uppercase tracking-wider pb-4 border-b border-white/5">
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500"></span> C1/C2 (Adv)</div>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> B2 (Upper)</div>
                    <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500"></span> Basic</div>
                </div>
                {tokens.map((token, i) => {
                    const info = vocabMap.get(token.toLowerCase());
                    let className = "";
                    let tooltip = "";
                    if (info) {
                        const lvl = info.level?.toUpperCase();
                        if (lvl?.includes('C1') || lvl?.includes('C2')) className = "text-purple-300 bg-purple-500/20 box-decoration-clone px-1 rounded mx-0.5 border-b-2 border-purple-500/50";
                        else if (lvl?.includes('B2')) className = "text-indigo-300 bg-indigo-500/20 px-1 rounded mx-0.5 border-b-2 border-indigo-500/50";
                        if (className) tooltip = `${token}: ${info.level} ${info.suggestion ? `(Try: ${info.suggestion})` : ''}`;
                    }
                    return (
                        <span key={i} className={`transition-all hover:opacity-100 ${className ? 'relative group cursor-help' : ''}`} title={tooltip}>
                            {token}
                        </span>
                    );
                })}
            </div>
        );
    };

    // Helper Component: SidebarContent
    const SidebarContent = (
        <div className="h-full flex flex-col p-4 text-slate-200 bg-slate-900/40">
            <div className="mb-6">
                <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
                    <PenTool className="text-emerald-500" />
                    写作工作台
                </h2>
                <p className="text-xs text-slate-400">Writer Coach V2.0</p>
            </div>

            <button
                onClick={handleNew}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-sm font-bold mb-4 flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
            >
                <FileText size={16} /> 新建 / 模板
            </button>

            {/* Translation Mode Toggle */}
            <button
                onClick={handleStartChallenge}
                className={`w-full py-2 rounded-lg text-sm font-bold mb-4 flex items-center justify-center gap-2 shadow-lg transition-all ${isTranslationMode
                    ? 'bg-amber-600 text-white shadow-amber-900/20'
                    : 'bg-slate-800 text-slate-400 hover:text-amber-400 hover:bg-slate-700'
                    }`}
            >
                <BookOpen size={16} /> {isTranslationMode ? '退出翻译挑战' : '每日翻译挑战'}
            </button>

            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                <h3 className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                    <History size={12} /> 我的作品集 ({writings.length})
                </h3>
                {writings.length === 0 && (
                    <div className="text-center py-10 text-slate-500 text-xs">
                        暂无草稿，<br />开启你的创作之旅。
                    </div>
                )}
                {writings.map(w => (
                    <div
                        key={w.id}
                        onClick={() => handleLoad(w)}
                        className={`p-3 rounded-lg border cursor-pointer group transition-all text-left relative ${currentId === w.id
                            ? 'bg-emerald-900/20 border-emerald-500/50 text-emerald-100'
                            : 'bg-slate-800/30 border-white/5 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                    >
                        <div className="flex justify-between items-start mb-1">
                            <p className="text-sm font-medium line-clamp-1 pr-6">{w.title || '无标题'}</p>
                            <button
                                onClick={(e) => handleDelete(e, w.id)}
                                className="opacity-0 group-hover:opacity-100 hover:text-red-400 absolute top-2 right-2 transition-opacity p-1 bg-slate-900/50 rounded"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                        <div className="flex justify-between items-center text-[10px] opacity-70">
                            <span>{new Date(w.updatedAt || Date.now()).toLocaleDateString()}</span>
                            {w.lastScore && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold text-white flex items-center gap-1 ${getScoreColor(w.lastScore)}`}>
                                    <BarChart3 size={8} /> {w.lastScore}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    // Helper Component: EditorPanel
    const EditorPanel = (
        <div className="flex flex-col h-full w-full">
            {/* Editor Toolbar */}
            <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-white/5 shrink-0 bg-slate-900/50">
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="无标题草稿..."
                    className="bg-transparent text-lg md:text-xl font-bold text-white placeholder-slate-600 focus:outline-none w-full mr-4"
                />
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 mr-2 whitespace-nowrap hidden md:inline">
                        {wordCount} 词
                    </span>

                    <button
                        onClick={() => setIsFocusMode(true)}
                        className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors hidden md:block"
                        title="专注模式 (Zen Mode)"
                    >
                        <Maximize2 size={20} />
                    </button>

                    <button
                        onClick={handleSave}
                        className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                        title="保存草稿 (Ctrl+S)"
                    >
                        {isSaving ? <CheckCircle size={20} className="text-emerald-500" /> : <Save size={20} />}
                    </button>

                    {/* Desktop Toolbar Extras */}
                    <div className="hidden md:flex items-center">
                        <div className="w-px h-6 bg-white/10 mx-1"></div>
                        {selection && (
                            <button
                                onClick={openPolishModal}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold bg-purple-600 text-white shadow-lg shadow-purple-500/20 animate-in zoom-in duration-200 mr-2"
                            >
                                <Sparkles size={16} /> 单句精修
                            </button>
                        )}
                        <div className="flex items-center bg-slate-800 rounded-lg p-1 mr-2 border border-slate-700">
                            {[
                                { id: 'grammar', label: '语法' },
                                { id: 'polish', label: '润色' },
                                { id: 'academic', label: '学术' }
                            ].map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => setAnalysisMode(m.id)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${analysisMode === m.id ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                >
                                    {m.label}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={handleAnalyze}
                            disabled={isAnalyzing}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold shadow-lg transition-all whitespace-nowrap
                                ${isAnalyzing
                                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'}`}
                        >
                            {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            {isAnalyzing ? '正在分析...' : 'AI 分析'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Actions Bar (Below Toolbar) */}
            <div className="md:hidden px-4 py-2 bg-slate-900/30 border-b border-white/5 flex gap-2 overflow-x-auto scrollbar-hide">
                {selection && (
                    <button onClick={openPolishModal} className="px-3 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-lg flex items-center gap-1 shrink-0">
                        <Sparkles size={12} /> 精修选中
                    </button>
                )}
                <select
                    value={analysisMode}
                    onChange={(e) => setAnalysisMode(e.target.value)}
                    className="bg-slate-800 text-xs text-white px-2 py-1.5 rounded-lg border border-slate-700 outline-none"
                >
                    <option value="grammar">语法修正</option>
                    <option value="polish">润色优化</option>
                    <option value="academic">学术改写</option>
                </select>
                <button
                    onClick={() => {
                        handleAnalyze();
                    }}
                    disabled={isAnalyzing}
                    className="flex-1 bg-indigo-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center justify-center gap-1"
                >
                    {isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                    开始分析
                </button>
            </div>

            {/* Editor Textarea Container */}
            <div className="flex-1 overflow-y-auto relative bg-slate-950/30">
                {/* Challenge Card */}
                {isTranslationMode && challengeData && (
                    <div className="mx-4 mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2 opacity-20"><BookOpen size={64} className="text-amber-500" /></div>
                        <div className="relative z-10">
                            <h3 className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">Translation Challenge</h3>
                            <p className="text-xl font-serif text-amber-100 mb-3 leading-relaxed tracking-wide">
                                {challengeData.chinese}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {challengeData.targetWords.map((w, i) => (
                                    <span key={i} className="px-2 py-1 bg-black/30 rounded text-amber-200 text-xs font-mono border border-amber-500/20">{w}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onSelect={handleSelectionChange}
                    placeholder="在此开始写作..."
                    className="w-full h-full min-h-[500px] p-6 md:p-8 bg-transparent text-base md:text-lg leading-loose text-slate-300 focus:text-slate-100 focus:outline-none resize-none font-serif placeholder:text-slate-700"
                    spellCheck="false"
                />
            </div>
        </div>
    );

    // Helper Component: AnalysisPanel
    const AnalysisPanel = analysis && (
        <div className="h-full bg-slate-900/40 backdrop-blur-xl overflow-y-auto custom-scrollbar border-l border-white/5">
            <div className="p-4 md:p-6 space-y-6">
                <div className="flex justify-between items-start sticky top-0 bg-slate-900/95 backdrop-blur z-30 pb-4 border-b border-white/5 -mt-4 md:-mt-6 pt-4 md:pt-6 -mx-4 md:-mx-6 px-4 md:px-6 shadow-sm">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <CheckCircle className="text-emerald-400" />
                            分析报告
                        </h3>
                        {/* View Toggles */}
                        <div className="flex gap-2 mt-2 overflow-x-auto scrollbar-hide py-1">
                            {[
                                { id: 'report', label: '总览', icon: null },
                                { id: 'heatmap', label: '热力', icon: Layers },
                                { id: 'diff', label: '批注', icon: PenTool },
                                { id: 'note', label: '笔记', icon: BookOpen },
                            ].map(v => (
                                <button
                                    key={v.id}
                                    onClick={() => setViewMode(v.id)}
                                    className={`text-[10px] px-2 py-1 rounded-md font-bold transition-all whitespace-nowrap flex items-center gap-1 ${viewMode === v.id ? 'bg-white/20 text-white' : 'text-slate-500 hover:bg-white/5'}`}
                                >
                                    {v.icon && <v.icon size={10} />} {v.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={async () => {
                                await saveHighlight({
                                    type: 'writing',
                                    sourceId: currentId || 'draft',
                                    content: `写作分析: ${analysis.score}/15 - ${analysis.level}`,
                                    context: analysis.comment || title,
                                    date: new Date().toISOString().split('T')[0]
                                });
                                toast.success('已标记！');
                            }}
                            className="p-2 hover:bg-amber-500/20 rounded-lg text-amber-400 hover:text-amber-300 transition-colors"
                        >
                            <Bookmark size={16} />
                        </button>
                        <button
                            onClick={() => {
                                setAnalysis(null);
                                if (mobileTab === 'analysis') setMobileTab('editor');
                            }}
                            className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-xs font-bold"
                        >
                            <X size={16} /> <span className="hidden md:inline">关闭</span>
                        </button>
                    </div>
                </div>

                {viewMode === 'report' && (
                    <>
                        <div className="bg-slate-800/50 rounded-2xl p-6 border border-white/5 relative overflow-hidden group hover:border-white/10 transition-colors">
                            <div className="flex justify-between items-center relative z-10">
                                <div>
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">预计分数</div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-6xl font-black text-white tracking-tighter">{analysis.score}</span>
                                        <span className="text-2xl text-slate-500 font-light">/ 15</span>
                                    </div>
                                    <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold text-white mt-3 shadow-lg ${getScoreColor(analysis.score)}`}>
                                        {analysis.level}
                                    </div>
                                </div>
                                <div className="text-right pl-4 flex-1">
                                    <div className="text-slate-300 text-sm italic leading-relaxed">"{analysis.comment}"</div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <AlertCircle size={14} />
                                关键问题 ({analysis.issues.length})
                            </h4>
                            {analysis.issues.length === 0 ? (
                                <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-300 text-sm text-center font-bold">
                                    🎉 太棒了！未发现主要问题。
                                </div>
                            ) : (
                                analysis.issues.map((issue, idx) => {
                                    let borderColor = 'border-white/5';
                                    let badgeColor = 'bg-slate-500/20 text-slate-300';
                                    let severityIcon = null;

                                    const s = (issue.severity || 'improvement').toLowerCase();
                                    if (s.includes('critical')) {
                                        borderColor = 'border-red-500/30 bg-red-900/10';
                                        badgeColor = 'bg-red-500/20 text-red-300 border-red-500/30';
                                        severityIcon = <AlertCircle size={12} className="text-red-400" />;
                                    } else if (s.includes('style')) {
                                        borderColor = 'border-purple-500/30 bg-purple-900/10';
                                        badgeColor = 'bg-purple-500/20 text-purple-300 border-purple-500/30';
                                        severityIcon = <Sparkles size={12} className="text-purple-400" />;
                                    } else {
                                        borderColor = 'border-amber-500/30 bg-amber-900/10';
                                        badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
                                        severityIcon = <ArrowRightLeft size={12} className="text-amber-400" />;
                                    }

                                    return (
                                        <div key={idx} className={`rounded-xl p-4 border transition-all ${borderColor} ${issue.applied ? 'opacity-50 grayscale' : 'hover:bg-slate-800/80'}`}>
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex flex-wrap gap-2 items-center">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border flex items-center gap-1 ${badgeColor}`}>
                                                        {severityIcon} {issue.type}
                                                    </span>
                                                </div>
                                                {!issue.applied && (
                                                    <button
                                                        onClick={() => handleApplyFix(issue)}
                                                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-1"
                                                    >
                                                        <CheckCircle size={12} /> 应用
                                                    </button>
                                                )}
                                                {issue.applied && <span className="text-xs text-emerald-500 font-bold flex items-center gap-1"><CheckCircle size={12} /> 已应用</span>}
                                            </div>
                                            <div className="flex items-center gap-2 mb-2 font-mono text-sm">
                                                <span className="text-red-300/80 line-through decoration-red-500/50 bg-red-900/20 px-1 rounded">{issue.original}</span>
                                                <ArrowRightLeft size={12} className="text-slate-500" />
                                                <span className="text-emerald-300 font-bold bg-emerald-900/20 px-1 rounded">{issue.fixed}</span>
                                            </div>
                                            <p className="text-sm text-slate-400">{issue.reason}</p>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {analysis.improvement_tips && (
                            <div className="bg-indigo-900/10 rounded-2xl p-6 border border-indigo-500/10">
                                <h4 className="text-sm font-bold text-indigo-300 uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <Sparkles size={14} /> 提升建议
                                </h4>
                                <ul className="space-y-2">
                                    {analysis.improvement_tips.map((tip, idx) => (
                                        <li key={idx} className="text-sm text-indigo-200/80 flex gap-3 text-left">
                                            <span className="text-indigo-500 font-bold">•</span> {tip}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}

                {viewMode === 'heatmap' && (
                    <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                        <HeatmapView />
                    </div>
                )}

                {viewMode === 'diff' && (
                    <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                        <div className="bg-slate-800/50 rounded-xl p-4 border border-white/10">
                            <div className="mb-4 flex items-center gap-4 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-white/5 pb-2">
                                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span> 关键错误</div>
                                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500"></span> 风格优化</div>
                                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500"></span> 改进建议</div>
                            </div>
                            <SmartReview />
                            <div className="mt-4 pt-4 border-t border-white/5 text-center text-xs text-slate-500">
                                Tip: 悬停在下划线处查看 AI 批注详情
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === 'note' && (
                    <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                        <div className="bg-amber-50/5 rounded-xl p-6 border border-amber-200/20">
                            <div className="flex justify-between items-center mb-4 border-b border-amber-200/10 pb-2">
                                <h4 className="text-amber-200 font-bold flex items-center gap-2">
                                    <BookOpen size={16} /> 知识点总结
                                </h4>
                                <button
                                    onClick={handleSaveNote}
                                    className="text-[10px] bg-amber-500 hover:bg-amber-400 text-slate-900 px-3 py-1 rounded-full font-bold flex items-center gap-1 transition-colors"
                                >
                                    <Save size={10} /> 保存到笔记
                                </button>
                            </div>
                            {analysis.knowledge_summary ? (
                                <div className="prose prose-invert prose-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                                    {analysis.knowledge_summary}
                                </div>
                            ) : (
                                <div className="text-center py-10 text-slate-500">
                                    本次分析未生成知识点总结。主要针对长文章或全面润色模式。
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    // Template Modal
    const TemplatePicker = () => (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm bg-black/60 animate-in fade-in duration-200">
            <div className="bg-slate-900 rounded-2xl shadow-2xl border border-white/10 w-full max-w-3xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-slate-950/50">
                    <h3 className="font-bold text-white text-lg flex items-center gap-2">
                        <Layout className="text-emerald-500" /> 选择写作模板
                    </h3>
                    <button onClick={() => setShowTemplateModal(false)} className="text-slate-400 hover:text-white"><X /></button>
                </div>
                <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Blank Option */}
                    <button
                        onClick={() => handleSelectTemplate(null)}
                        className="p-4 rounded-xl border border-dashed border-slate-700 hover:border-emerald-500 hover:bg-slate-800 transition-all text-left group"
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-slate-800 rounded-lg group-hover:bg-emerald-500/20 text-slate-400 group-hover:text-emerald-500 transition-colors">
                                <FileText size={20} />
                            </div>
                            <span className="font-bold text-slate-200">空白文档</span>
                        </div>
                        <div className="text-xs text-slate-500">从零开始，自由创作。</div>
                    </button>

                    {writingTemplates.map(tmpl => (
                        <button
                            key={tmpl.id}
                            onClick={() => handleSelectTemplate(tmpl)}
                            className="p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-slate-800 hover:border-emerald-500/50 transition-all text-left relative group overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 bg-white/10 px-2 py-1 text-[10px] rounded-bl-lg text-slate-400 font-bold uppercase">
                                {tmpl.category}
                            </div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-slate-800 rounded-lg group-hover:bg-emerald-500/20 text-slate-400 group-hover:text-emerald-500 transition-colors">
                                    <Wand2 size={20} />
                                </div>
                                <span className="font-bold text-slate-200">{tmpl.name}</span>
                            </div>
                            <div className="text-xs text-slate-500 leading-relaxed">{tmpl.description}</div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div className={`w-full h-full overflow-hidden transition-all duration-300 relative ${isFocusMode ? 'fixed inset-0 z-50 bg-slate-950' : 'rounded-3xl border border-white/5 shadow-2xl bg-slate-900/20 backdrop-blur-sm'}`}>

            {showTemplateModal && <TemplatePicker />}
            {showPolishModal && selection && (
                <PolishChatModal
                    selectedText={selection.text}
                    onClose={() => setShowPolishModal(false)}
                />
            )}

            {/* If Focus Mode, we don't show split pane sidebar, just the editor */}
            {isFocusMode ? (
                <div className="w-full h-full max-w-4xl mx-auto flex flex-col bg-slate-950 relative animate-in fade-in duration-500">
                    {/* Focus Toolbar */}
                    <div className="absolute top-4 right-8 z-10 flex gap-4 opacity-30 hover:opacity-100 transition-opacity">
                        <div className="text-sm text-slate-500 font-mono self-center">{wordCount} words</div>
                        <button onClick={() => setIsFocusMode(false)} className="p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white">
                            <Minimize2 size={20} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-8 py-20">
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Untitled"
                            className="bg-transparent text-4xl font-black text-slate-800 mb-8 placeholder-slate-800 focus:outline-none w-full text-center"
                        />
                        <textarea
                            ref={textareaRef}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            onSelect={handleSelectionChange}
                            placeholder="Just write..."
                            className="w-full h-full min-h-[80vh] bg-transparent text-xl leading-relaxed text-slate-400 focus:text-slate-200 focus:outline-none resize-none font-serif text-center md:px-20 placeholder:text-slate-800"
                            spellCheck="false"
                            autoFocus
                        />
                    </div>
                    <div className="absolute bottom-4 left-0 right-0 text-center text-slate-800 text-xs pointer-events-none">
                        Focus Mode • Zen Writing
                    </div>
                </div>
            ) : (
                <>
                    {/* Desktop Layout (SplitPane) */}
                    <div className="hidden md:block h-full">
                        <SplitPane
                            initialLeftWidth={280}
                            minLeftWidth={250}
                            maxLeftWidth={400}
                            left={SidebarContent}
                            right={
                                <div className="flex h-full bg-slate-950/30 relative overflow-hidden">
                                    <div className={`flex flex-col h-full transition-all duration-300 ${analysis ? 'w-1/2 border-r border-white/5' : 'w-full'}`}>
                                        {EditorPanel}
                                    </div>
                                    {analysis && (
                                        <div className="flex-1 h-full overflow-hidden relative">
                                            {AnalysisPanel}
                                        </div>
                                    )}
                                </div>
                            }
                        />
                    </div>

                    {/* Mobile Layout (Tabs) */}
                    <div className="md:hidden h-full flex flex-col">
                        <div className="flex items-center justify-between p-2 px-4 bg-slate-900 border-b border-white/5 shrink-0">
                            <div className="font-bold text-slate-200 text-sm">写作助手</div>
                            <div className="flex bg-slate-800 rounded-lg p-1">
                                <button onClick={() => setMobileTab('tools')} className={`px-3 py-1 text-xs rounded-md transition-all ${mobileTab === 'tools' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>工具</button>
                                <button onClick={() => setMobileTab('editor')} className={`px-3 py-1 text-xs rounded-md transition-all ${mobileTab === 'editor' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>编辑</button>
                                {analysis && <button onClick={() => setMobileTab('analysis')} className={`px-3 py-1 text-xs rounded-md transition-all ${mobileTab === 'analysis' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>报告</button>}
                            </div>
                        </div>

                        <div className="flex-1 overflow-hidden relative bg-slate-900/20">
                            {mobileTab === 'tools' && SidebarContent}
                            {mobileTab === 'editor' && EditorPanel}
                            {mobileTab === 'analysis' && (AnalysisPanel || <div className="p-10 text-center text-slate-500 text-sm">暂无分析结果</div>)}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default WriterView;
