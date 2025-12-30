import React, { useState, useEffect, useRef } from 'react';
import SplitPane from '../components/SplitPane';
import { useApp } from '../context/AppContext';
import { PenTool, Save, RotateCcw, Sparkles, CheckCircle, AlertCircle, FileText, Eraser, Trash2, X, Loader2, Layout, Maximize2, Minimize2, GitCompare, ChevronLeft, ChevronRight, Wand2, Layers, BarChart3, History, BookOpen } from 'lucide-react';
import { saveWriting, getWritings, deleteWriting, saveNote } from '../services/db';
import { analyzeWriting } from '../services/ai';
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
    const [viewMode, setViewMode] = useState('report'); // 'report' | 'diff' | 'heatmap' | 'note'

    // Sentence Polish State
    const [selection, setSelection] = useState(null); // { text: string }
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
            lastLevel: analysis?.level
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
        toast.success(template ? `已应用模板: ${template.name}` : '已创建空白草稿');
    };

    const handleLoad = (w) => {
        setContent(w.content);
        setTitle(w.title);
        setCurrentId(w.id);
        setAnalysis(null); // Load fresh, analysis is transient for now unless we persist full json
        if (w.lastScore) {
            // Optional: could show a "Past Score: X" badge somewhere
        }
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

    const handleAnalyze = async () => {
        if (!content.trim()) {
            toast.error("请先写点什么吧！");
            return;
        }
        setIsAnalyzing(true);
        setAnalysis(null); // Reset previous analysis
        try {
            const result = await analyzeWriting(content, settings);
            setAnalysis(result);
            toast.success("AI 润色分析完成！");

            // Auto-save the score to the draft if it exists
            if (currentId) {
                // Updating local state handles the UI, next save writes to DB. 
                // Or we could auto-save here too. Let's just prompt user or rely on manual/auto save later.
                // For V2.0 simplicity, let's trigger a save after analysis if we have an ID
                // But handleSave relies on state 'content' which is synced.
            }
        } catch (e) {
            console.error(e);
            toast.error("分析失败: " + e.message);
        } finally {
            setIsAnalyzing(false);
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

    // Score Badge Color Helper
    const getScoreColor = (score) => {
        if (!score) return 'bg-slate-500';
        if (score >= 13) return 'bg-emerald-500 shadow-emerald-500/50'; // Excellent
        if (score >= 10) return 'bg-indigo-500 shadow-indigo-500/50';       // Good
        if (score >= 7) return 'bg-amber-500 shadow-amber-500/50';      // Fair
        return 'bg-red-500 shadow-red-500/50';                         // Poor
    };

    const HeatmapView = () => {
        if (!analysis?.vocabulary_analysis) return <div className="text-slate-500">无法生成词汇热力图 (数据缺失)</div>;

        // Map words to levels for O(1) lookup
        const vocabMap = new Map();
        analysis.vocabulary_analysis.forEach(item => {
            vocabMap.set(item.word.toLowerCase(), item);
        });

        // Split by words but keep delimiters to reconstruct text
        // Simple regex split for English
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
                <SplitPane
                    initialLeftWidth={280}
                    minLeftWidth={250}
                    maxLeftWidth={400}
                    left={SidebarContent}
                    right={
                        <div className="flex h-full bg-slate-950/30 relative overflow-hidden">
                            {/* Main Editor Area */}
                            <div className={`flex flex-col h-full transition-all duration-300 ${analysis ? 'hidden md:flex md:w-1/2 border-r border-white/5' : 'w-full'}`}>
                                {/* Editor Toolbar */}
                                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0 bg-slate-900/50">
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="无标题草稿..."
                                        className="bg-transparent text-xl font-bold text-white placeholder-slate-600 focus:outline-none w-full mr-4"
                                    />
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-slate-500 mr-2 whitespace-nowrap hidden md:inline">
                                            {wordCount} 词
                                        </span>

                                        <button
                                            onClick={() => setIsFocusMode(true)}
                                            className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
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

                                        <div className="w-px h-6 bg-white/10 mx-1"></div>

                                        {selection && (
                                            <button
                                                onClick={openPolishModal}
                                                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold bg-purple-600 text-white shadow-lg shadow-purple-500/20 animate-in zoom-in duration-200 mr-2"
                                            >
                                                <Sparkles size={16} /> 单句精修
                                            </button>
                                        )}

                                        <button
                                            onClick={handleAnalyze}
                                            disabled={isAnalyzing}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold shadow-lg transition-all whitespace-nowrap
                                            ${isAnalyzing
                                                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20'}`}
                                        >
                                            {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                            {isAnalyzing ? '正在分析...' : 'AI 润色'}
                                        </button>
                                    </div>
                                </div>

                                <textarea
                                    ref={textareaRef}
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    onSelect={handleSelectionChange}
                                    placeholder="在此开始写作..."
                                    className="flex-1 w-full bg-transparent p-8 text-lg leading-relaxed text-slate-200 focus:outline-none resize-none custom-scrollbar font-sans"
                                    spellCheck="false"
                                />
                            </div>

                            {/* Analysis Result Panel */}
                            {analysis && (
                                <div className="flex-1 h-full bg-slate-900/40 backdrop-blur-xl overflow-y-auto custom-scrollbar animate-in slide-in-from-right duration-300 absolute md:static inset-0 z-20 md:z-0 w-full md:w-auto border-l border-white/5">
                                    <div className="p-6 space-y-6">
                                        <div className="flex justify-between items-start sticky top-0 bg-slate-900/95 backdrop-blur z-30 pb-4 border-b border-white/5 -mt-6 pt-6 -mx-6 px-6 shadow-sm">
                                            <div>
                                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                                    <CheckCircle className="text-emerald-400" />
                                                    分析报告
                                                </h3>
                                                {/* View Toggles */}
                                                <div className="flex gap-2 mt-2">
                                                    <button
                                                        onClick={() => setViewMode('report')}
                                                        className={`text-[10px] px-2 py-1 rounded-md font-bold transition-all ${viewMode === 'report' ? 'bg-white/20 text-white' : 'text-slate-500 hover:bg-white/5'}`}
                                                    >
                                                        总览
                                                    </button>
                                                    <button
                                                        onClick={() => setViewMode('heatmap')}
                                                        className={`text-[10px] px-2 py-1 rounded-md font-bold transition-all flex items-center gap-1 ${viewMode === 'heatmap' ? 'bg-white/20 text-white' : 'text-slate-500 hover:bg-white/5'}`}
                                                    >
                                                        <Layers size={10} /> 词汇热力
                                                    </button>
                                                    <button
                                                        onClick={() => setViewMode('diff')}
                                                        className={`text-[10px] px-2 py-1 rounded-md font-bold transition-all flex items-center gap-1 ${viewMode === 'diff' ? 'bg-white/20 text-white' : 'text-slate-500 hover:bg-white/5'}`}
                                                    >
                                                        <GitCompare size={10} /> 对比模式
                                                    </button>
                                                    <button
                                                        onClick={() => setViewMode('note')}
                                                        className={`text-[10px] px-2 py-1 rounded-md font-bold transition-all flex items-center gap-1 ${viewMode === 'note' ? 'bg-white/20 text-white' : 'text-slate-500 hover:bg-white/5'}`}
                                                    >
                                                        <BookOpen size={10} /> 学习笔记
                                                    </button>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setAnalysis(null)}
                                                className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-xs font-bold"
                                            >
                                                <X size={16} /> 关闭
                                            </button>
                                        </div>

                                        {viewMode === 'report' && (
                                            <>
                                                {/* Score Card */}
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

                                                {/* Issues List */}
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
                                                        analysis.issues.map((issue, idx) => (
                                                            <div key={idx} className="bg-slate-800/30 rounded-xl p-4 border border-white/5 hover:bg-slate-800/50 transition-colors">
                                                                <div className="flex flex-wrap gap-2 items-center mb-2">
                                                                    <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-bold uppercase border border-indigo-500/30">
                                                                        {issue.type}
                                                                    </span>
                                                                    <span className="text-xs text-red-300 font-mono bg-red-500/10 px-1 rounded line-through decoration-red-500/50">
                                                                        {issue.original}
                                                                    </span>
                                                                    <span className="text-slate-500">→</span>
                                                                    <span className="text-xs text-emerald-300 font-mono bg-emerald-500/10 px-1 rounded font-bold">
                                                                        {issue.fixed}
                                                                    </span>
                                                                </div>
                                                                <p className="text-sm text-slate-400">{issue.reason}</p>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>

                                                {/* Improvement Tips */}
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
                                                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500/50"></span> Original (Del)</div>
                                                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500/50"></span> Improved (Ins)</div>
                                                    </div>
                                                    {analysis.corrected_text ? (
                                                        <DiffViewer oldText={content} newText={analysis.corrected_text} />
                                                    ) : (
                                                        <div className="text-center py-10 text-slate-500">
                                                            无对应范文，无法进行全文比对。
                                                        </div>
                                                    )}
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
                            )}
                        </div>
                    }
                />
            )}
        </div>
    );
};

export default WriterView;
