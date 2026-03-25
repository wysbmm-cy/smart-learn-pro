import React, { useEffect, useMemo, useRef, useState } from 'react';
import SplitPane from '../components/SplitPane';
import { useApp } from '../context/AppContext';
import {
    PenTool, Save, Sparkles, CheckCircle, AlertCircle, FileText, Trash2, X, Loader2, Layout,
    ChevronRight, BookOpen, History, ListChecks, Target, GraduationCap, Wand2, ArrowRightLeft
} from 'lucide-react';
import { saveWriting, getWritings, deleteWriting, getFlashcards, saveTranslationLog, getTranslationLogs } from '../services/db';
import { analyzeWriting, generateWritingOutline, generateTranslationChallenge, gradeTranslation } from '../services/ai';
import { writingTemplates } from '../data/writingTemplates';
import DiffViewer from '../components/DiffViewer';
import PolishChatModal from '../components/PolishChatModal';
import toast from 'react-hot-toast';

const DEFAULT_EXAM_CONTEXT = { examType: 'CET-6', targetScore: 12, genre: 'Argumentative', wordTarget: 200, prompt: '' };
const STEPS = ['prompt', 'outline', 'write', 'diagnose'];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const sentenceRanges = (text) => {
    const ranges = [];
    const regex = /[^.!?。！？\n]+[.!?。！？]?[\s]*/g;
    let m;
    while ((m = regex.exec(text)) !== null) ranges.push({ start: m.index, end: m.index + m[0].length });
    if (!ranges.length && text.length) ranges.push({ start: 0, end: text.length });
    return ranges;
};

const outlineChecks = (outline) => {
    const rows = outline?.paragraphs || [];
    return {
        thesis: Boolean((outline?.thesis || '').trim()),
        evidence: rows.some(r => (r.evidence_hint || '').trim()),
        concession: rows.some(r => r.concession === true),
        conclusion: Boolean((outline?.conclusion || '').trim())
    };
};

const parseWord = (card) => {
    const raw = (card?.front || '').split('\n')[0].trim().replace(/\/[^/]+\/$/, '').trim();
    return /^[a-zA-Z-]{4,}$/.test(raw) ? raw.toLowerCase() : null;
};

const WriterView = ({ params }) => {
    const { settings } = useApp();
    const [content, setContent] = useState(() => localStorage.getItem('draft_writer_content') || '');
    const [title, setTitle] = useState(() => localStorage.getItem('draft_writer_title') || '');
    const [examContext, setExamContext] = useState(() => {
        try {
            const raw = localStorage.getItem('draft_writer_exam_context');
            return raw ? { ...DEFAULT_EXAM_CONTEXT, ...JSON.parse(raw) } : DEFAULT_EXAM_CONTEXT;
        } catch { return DEFAULT_EXAM_CONTEXT; }
    });
    const [workflowStep, setWorkflowStep] = useState('prompt');
    const [outline, setOutline] = useState(null);
    const [analysis, setAnalysis] = useState(null);
    const [analysisMode, setAnalysisMode] = useState('polish');
    const [writings, setWritings] = useState([]);
    const [currentId, setCurrentId] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
    const [showTemplateModal, setShowTemplateModal] = useState(false);
    const [mobileTab, setMobileTab] = useState('editor');
    const [selection, setSelection] = useState(null);
    const [showPolishModal, setShowPolishModal] = useState(false);
    const [actionChecks, setActionChecks] = useState({});
    const [isTranslationMode, setIsTranslationMode] = useState(false);
    const [challengeData, setChallengeData] = useState(null);
    const [translationStats, setTranslationStats] = useState({ logs: [], avgScore: 0 });
    const [cards, setCards] = useState([]);

    const analyzeAbort = useRef(null);
    const outlineAbort = useRef(null);
    const analyzeReq = useRef(0);
    const lastAnalyzeAt = useRef(0);

    const wordCount = useMemo(() => content.trim().split(/\s+/).filter(Boolean).length, [content]);
    const checks = useMemo(() => outlineChecks(outline), [outline]);
    const checkScore = useMemo(() => Math.round((Object.values(checks).filter(Boolean).length / 4) * 100), [checks]);

    const injectSuggestions = useMemo(() => {
        if (!analysis) return [];
        if (Array.isArray(analysis.vocabulary_injection) && analysis.vocabulary_injection.length) return analysis.vocabulary_injection.slice(0, 6);
        const used = new Set((content.toLowerCase().match(/[a-zA-Z-]+/g) || []).map(x => x.toLowerCase()));
        const pool = [];
        for (const c of cards) {
            const w = parseWord(c);
            if (!w || used.has(w)) continue;
            pool.push(w);
            if (pool.length >= 6) break;
        }
        return pool.map((word) => ({ word, why: '来自你的词库，可提升表达层次', where: '可放在论点句或例证句' }));
    }, [analysis, cards, content]);

    useEffect(() => { localStorage.setItem('draft_writer_content', content); }, [content]);
    useEffect(() => { localStorage.setItem('draft_writer_title', title); }, [title]);
    useEffect(() => { localStorage.setItem('draft_writer_exam_context', JSON.stringify(examContext)); }, [examContext]);

    useEffect(() => {
        (async () => {
            setWritings(await getWritings());
            setCards(await getFlashcards());
            const logs = await getTranslationLogs(10);
            const avg = logs.length ? Math.round(logs.reduce((s, x) => s + (x.score || 0), 0) / logs.length) : 0;
            setTranslationStats({ logs, avgScore: avg });
        })();
    }, []);

    useEffect(() => {
        if (!params?.id) return;
        const item = writings.find(w => w.id === params.id);
        if (!item) return;
        loadDraft(item);
    }, [params, writings]);

    const refreshWritings = async () => setWritings(await getWritings());
    const loadDraft = (w) => {
        setCurrentId(w.id);
        setTitle(w.title || '');
        setContent(w.content || '');
        setExamContext({ ...DEFAULT_EXAM_CONTEXT, ...(w.examContext || {}) });
        setOutline(w.outline || null);
        setAnalysis(w.analysisResult || null);
        setWorkflowStep(w.analysisResult ? 'diagnose' : (w.workflowStep || (w.outline ? 'write' : 'prompt')));
        setMobileTab(w.analysisResult ? 'analysis' : 'editor');
        setActionChecks({});
    };

    const saveDraft = async () => {
        if (!content.trim() && !examContext.prompt.trim()) return toast.error('请先写一点内容');
        setIsSaving(true);
        const id = currentId || crypto.randomUUID();
        const item = {
            id,
            title: title || examContext.prompt || content.slice(0, 30) || '未命名写作',
            content,
            examContext,
            workflowStep,
            outline,
            analysisResult: analysis,
            lastScore: analysis?.score_total || analysis?.score || null,
            lastLevel: analysis?.level || null,
            updatedAt: Date.now()
        };
        await saveWriting(item);
        setCurrentId(id);
        if (!title) setTitle(item.title);
        await refreshWritings();
        setIsSaving(false);
        toast.success('已保存');
    };

    const deleteDraft = async (e, id) => {
        e.stopPropagation();
        if (!window.confirm('确定删除这篇写作吗？')) return;
        await deleteWriting(id);
        if (id === currentId) {
            setCurrentId(null); setTitle(''); setContent(''); setOutline(null); setAnalysis(null); setWorkflowStep('prompt');
        }
        await refreshWritings();
    };

    const generateOutline = async () => {
        if (!examContext.prompt.trim()) return toast.error('请先输入题目');
        if (outlineAbort.current) outlineAbort.current.abort();
        const controller = new AbortController();
        outlineAbort.current = controller;
        setIsGeneratingOutline(true);
        try {
            const res = await generateWritingOutline(examContext, settings, { signal: controller.signal });
            setOutline(res);
            setWorkflowStep('outline');
            toast.success('提纲已生成');
        } catch (e) {
            if (e?.name !== 'AbortError') toast.error(`提纲生成失败: ${e.message}`);
        } finally {
            setIsGeneratingOutline(false);
            if (outlineAbort.current === controller) outlineAbort.current = null;
        }
    };

    const normalizeTranslation = (raw) => {
        const score = clamp(Math.round((raw.score || 0) / 100 * 15), 0, 15);
        return {
            score_total: score,
            score,
            level: score >= 13 ? 'Excellent' : score >= 10 ? 'Good' : score >= 7 ? 'Fair' : 'Poor',
            rubric_scores: { task_response: Math.round(score / 3), coherence: Math.round(score / 3), lexical_resource: Math.round(score / 3), grammar_range_accuracy: Math.round(score / 3) },
            overall_comment: raw.comment || '',
            rewritten_text: raw.improved_version || '',
            paragraph_feedback: [{ paragraph_index: 0, issue: raw.comment || '', suggestion: '按改写版本优化表达', rewritten_paragraph: raw.improved_version || '' }],
            issues: Array.isArray(raw.issues) ? raw.issues.map(x => ({ ...x, sentence_index: Number(x.sentence_index || 0) || 0 })) : [],
            improvement_plan: [
                { id: 1, title: '信息完整', action: '核对原句信息点是否全部覆盖' },
                { id: 2, title: '搭配准确', action: '替换中式直译搭配' },
                { id: 3, title: '句法自然', action: '优化从句和连接词' }
            ],
            vocabulary_injection: []
        };
    };

    const runAnalyze = async () => {
        const now = Date.now();
        if (now - lastAnalyzeAt.current < 450) return;
        lastAnalyzeAt.current = now;
        if (!content.trim()) return toast.error('请先写作');

        if (analyzeAbort.current) analyzeAbort.current.abort();
        const controller = new AbortController();
        analyzeAbort.current = controller;
        const req = ++analyzeReq.current;
        setIsAnalyzing(true);
        try {
            const result = isTranslationMode && challengeData
                ? normalizeTranslation(await gradeTranslation(challengeData, content, settings))
                : await analyzeWriting(content, settings, analysisMode, { signal: controller.signal, examContext, outline });
            if (req !== analyzeReq.current) return;
            setAnalysis(result);
            setWorkflowStep('diagnose');
            setMobileTab('analysis');
            setActionChecks({});
            if (isTranslationMode && challengeData) {
                await saveTranslationLog({ score: result.score_total, chinese: challengeData.chinese, userTranslation: content, targetWords: challengeData.targetWords, scenario: challengeData.scenario, errorTypes: [] });
            }
            toast.success('诊断完成');
        } catch (e) {
            if (e?.name === 'AbortError') return;
            toast.error((e.message || '').includes('429') ? '触发限流，请稍后重试' : `诊断失败: ${e.message}`);
        } finally {
            if (req === analyzeReq.current) setIsAnalyzing(false);
        }
    };

    const applyFix = (issue) => {
        if (!issue?.fixed) return;
        const ranges = sentenceRanges(content);
        const idx = clamp(Number(issue.sentence_index || 0), 0, Math.max(0, ranges.length - 1));
        const r = ranges[idx];
        if (!r) return;
        const sentence = content.slice(r.start, r.end);
        let next = content;
        if (issue.original && sentence.includes(issue.original)) {
            next = content.slice(0, r.start) + sentence.replace(issue.original, issue.fixed) + content.slice(r.end);
        } else if (issue.original && content.includes(issue.original)) {
            next = content.replace(issue.original, issue.fixed);
        } else {
            next = content.slice(0, r.start) + issue.fixed + content.slice(r.end);
        }
        setContent(next);
        setAnalysis(prev => prev ? ({ ...prev, issues: (prev.issues || []).map(i => i === issue ? { ...i, applied: true } : i) }) : prev);
    };

    const startTranslation = async () => {
        try {
            toast.loading('生成翻译挑战中...', { id: 'writer_trans' });
            const challenge = await generateTranslationChallenge(cards, settings);
            setChallengeData(challenge); setIsTranslationMode(true);
            setTitle(`翻译训练 - ${new Date().toLocaleDateString()}`); setContent('');
            setAnalysis(null); setWorkflowStep('write'); setMobileTab('editor');
            toast.success('翻译挑战已准备好', { id: 'writer_trans' });
        } catch (e) {
            toast.error(`生成失败: ${e.message}`, { id: 'writer_trans' });
        }
    };
    const Sidebar = (
        <div className="h-full flex flex-col p-4 bg-slate-900/40 text-phy-text">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-1"><PenTool className="text-emerald-400" /> AI 写作台</h2>
            <p className="text-xs text-phy-muted mb-4">提纲驱动 + 分层诊断</p>
            <button onClick={() => setShowTemplateModal(true)} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl text-sm font-bold mb-2 flex items-center justify-center gap-2"><FileText size={16} /> 新建 / 模板</button>
            <button onClick={isTranslationMode ? () => setIsTranslationMode(false) : startTranslation} className={`w-full py-2 rounded-xl text-sm font-bold mb-4 flex items-center justify-center gap-2 ${isTranslationMode ? 'bg-amber-600 text-white' : 'bg-phy-glass text-phy-muted hover:text-amber-400'}`}><BookOpen size={16} /> {isTranslationMode ? '退出翻译模式' : '每日翻译挑战'}</button>
            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                <h3 className="text-xs font-bold text-phy-muted uppercase tracking-wider mb-2 flex items-center gap-2"><History size={12} /> 我的写作 ({writings.length})</h3>
                {writings.map(w => (
                    <div key={w.id} onClick={() => loadDraft(w)} className={`p-3 rounded-xl border cursor-pointer group relative ${currentId === w.id ? 'bg-emerald-900/20 border-emerald-500/40 text-emerald-100' : 'bg-slate-800/30 border-phy-border text-phy-muted hover:text-phy-text'}`}>
                        <div className="text-sm font-medium line-clamp-1 pr-6">{w.title || '未命名'}</div>
                        <div className="text-[10px] opacity-70 mt-1">{new Date(w.updatedAt || Date.now()).toLocaleDateString()}</div>
                        <button onClick={(e) => deleteDraft(e, w.id)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-500/10 text-phy-muted hover:text-red-400"><Trash2 size={12} /></button>
                    </div>
                ))}
            </div>
        </div>
    );

    const StepNav = (
        <div className="px-4 md:px-6 py-3 border-b border-phy-border bg-slate-900/60 flex items-center gap-2 overflow-x-auto scrollbar-hide">
            {STEPS.map((step, i) => (
                <React.Fragment key={step}>
                    <button onClick={() => { if (step === 'outline' && !outline) return; if (step === 'diagnose' && !analysis) return; setWorkflowStep(step); }} className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold ${workflowStep === step ? 'bg-indigo-600 text-white' : 'bg-phy-glass text-phy-muted hover:text-phy-text'}`}>{step === 'prompt' ? '审题' : step === 'outline' ? '提纲' : step === 'write' ? '写作' : '诊断'}</button>
                    {i < STEPS.length - 1 ? <ChevronRight size={14} className="text-phy-muted shrink-0" /> : null}
                </React.Fragment>
            ))}
        </div>
    );

    const PromptPane = (
        <div className="p-4 md:p-6 space-y-4">
            <div className="glass-panel rounded-2xl border border-phy-border p-5">
                <h3 className="font-bold text-phy-text text-base flex items-center gap-2 mb-4"><GraduationCap size={16} className="text-indigo-400" /> 审题与目标设置</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <select value={examContext.examType} onChange={(e) => setExamContext(p => ({ ...p, examType: e.target.value }))} className="bg-phy-bg border border-phy-border rounded-lg px-3 py-2 text-sm text-phy-text">{['CET-4', 'CET-6', 'IELTS', 'TOEFL'].map(x => <option key={x} value={x}>{x}</option>)}</select>
                    <select value={examContext.genre} onChange={(e) => setExamContext(p => ({ ...p, genre: e.target.value }))} className="bg-phy-bg border border-phy-border rounded-lg px-3 py-2 text-sm text-phy-text">{['Argumentative', 'Expository', 'Narrative', 'Email'].map(x => <option key={x} value={x}>{x}</option>)}</select>
                    <input type="number" min="1" max="15" value={examContext.targetScore} onChange={(e) => setExamContext(p => ({ ...p, targetScore: clamp(Number(e.target.value) || 12, 1, 15) }))} className="bg-phy-bg border border-phy-border rounded-lg px-3 py-2 text-sm text-phy-text" />
                    <input type="number" min="80" max="1200" value={examContext.wordTarget} onChange={(e) => setExamContext(p => ({ ...p, wordTarget: clamp(Number(e.target.value) || 200, 80, 1200) }))} className="bg-phy-bg border border-phy-border rounded-lg px-3 py-2 text-sm text-phy-text" />
                </div>
                <textarea value={examContext.prompt} onChange={(e) => setExamContext(p => ({ ...p, prompt: e.target.value }))} rows={5} placeholder="输入题目或任务说明" className="w-full mt-4 bg-phy-bg border border-phy-border rounded-xl px-4 py-3 text-sm text-phy-text resize-none" />
                <div className="mt-4 flex gap-2">
                    <button onClick={generateOutline} disabled={isGeneratingOutline} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold flex items-center gap-2">{isGeneratingOutline ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} 生成提纲</button>
                    <button onClick={() => setWorkflowStep('write')} className="px-4 py-2 rounded-lg bg-phy-glass border border-phy-border text-phy-text text-sm font-bold">直接写作</button>
                </div>
            </div>
        </div>
    );

    const OutlinePane = (
        <div className="p-4 md:p-6 space-y-4">
            {!outline ? <div className="glass-panel rounded-2xl border border-phy-border p-5 text-sm text-phy-muted">暂无提纲，请先生成。</div> : (
                <>
                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                        <div className="flex justify-between items-center"><div className="text-sm font-bold text-phy-text">提纲质量仪表</div><div className="text-lg font-black text-phy-text">{checkScore}%</div></div>
                        <div className="mt-2 h-2 rounded-full bg-phy-glass overflow-hidden"><div className="h-full bg-indigo-500" style={{ width: `${checkScore}%` }} /></div>
                        <div className="mt-2 text-xs text-phy-muted">论点:{checks.thesis ? '✓' : '✗'} 论据:{checks.evidence ? '✓' : '✗'} 让步:{checks.concession ? '✓' : '✗'} 结论:{checks.conclusion ? '✓' : '✗'}</div>
                    </div>
                    <div className="glass-panel rounded-2xl border border-phy-border p-4 text-sm text-phy-text"><div className="font-semibold mb-1">核心立场</div>{outline.thesis || '（空）'}</div>
                    {(outline.paragraphs || []).map((p, i) => (
                        <div key={i} className="glass-panel rounded-xl border border-phy-border p-3">
                            <div className="text-xs text-phy-muted mb-1">P{i + 1} · {p.purpose || 'Purpose'}</div>
                            <div className="text-sm font-semibold text-phy-text">{p.topic_sentence}</div>
                            <div className="text-xs text-phy-muted mt-1">{p.evidence_hint}</div>
                        </div>
                    ))}
                    <div className="flex gap-2">
                        <button onClick={generateOutline} className="px-4 py-2 rounded-lg bg-phy-glass border border-phy-border text-phy-text text-sm font-bold">重生成提纲</button>
                        <button onClick={() => { if (!content.trim()) setContent((outline.paragraphs || []).map((p, i) => `Paragraph ${i + 1}: ${p.topic_sentence || ''}`).join('\n\n')); setWorkflowStep('write'); }} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold">进入写作</button>
                    </div>
                </>
            )}
        </div>
    );
    const WritePane = (
        <div className="flex flex-col h-full">
            <div className="px-4 md:px-6 py-3 border-b border-phy-border bg-slate-900/50 flex items-center gap-2">
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="输入标题..." className="bg-transparent text-base md:text-lg font-bold text-phy-text placeholder:text-phy-muted outline-none w-full" />
                <div className="text-xs text-phy-muted shrink-0">{wordCount} 词</div>
                <button onClick={saveDraft} className="p-2 rounded-lg text-phy-muted hover:text-emerald-400">{isSaving ? <CheckCircle size={18} className="text-emerald-500" /> : <Save size={18} />}</button>
            </div>
            <div className="px-4 md:px-6 py-2 border-b border-phy-border bg-slate-900/30 flex flex-wrap items-center gap-2">
                <select value={analysisMode} onChange={(e) => setAnalysisMode(e.target.value)} className="bg-phy-glass border border-phy-border text-xs rounded-lg px-2 py-1.5 text-phy-text">{['grammar', 'polish', 'academic'].map(x => <option key={x} value={x}>{x}</option>)}</select>
                {selection ? <button onClick={() => setShowPolishModal(true)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-600 text-white flex items-center gap-1.5"><Sparkles size={12} /> 单句精修</button> : null}
                <button onClick={runAnalyze} disabled={isAnalyzing} className="ml-auto px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-60">{isAnalyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} {isAnalyzing ? '诊断中...' : '开始诊断'}</button>
            </div>
            {isTranslationMode && challengeData ? <div className="mx-4 md:mx-6 mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-100">{challengeData.chinese}</div> : null}
            <textarea value={content} onChange={(e) => setContent(e.target.value)} onSelect={(e) => { const s = e.target.selectionStart; const t = e.target.selectionEnd; const text = content.substring(s, t).trim(); setSelection(s !== t && text.length >= 2 ? { text, start: s, end: t } : null); }} placeholder="在此开始写作..." className="w-full flex-1 min-h-[420px] p-4 md:p-6 bg-transparent text-base leading-loose text-phy-text outline-none resize-none font-serif placeholder:text-phy-muted" spellCheck="false" />
        </div>
    );

    const DiagnosePane = (
        <div className="h-full overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4 bg-slate-900/30">
            {!analysis ? <div className="glass-panel rounded-2xl border border-phy-border p-6 text-sm text-phy-muted text-center">暂无诊断结果，请先完成诊断。</div> : (
                <>
                    <div className="glass-panel rounded-2xl border border-phy-border p-5"><div className="text-xs text-phy-muted uppercase mb-1">总评分</div><div className="text-4xl font-black text-phy-text">{analysis.score_total || analysis.score}<span className="text-lg text-phy-muted"> / 15</span></div><div className="text-sm text-phy-text mt-2">“{analysis.overall_comment || analysis.comment || '暂无总评'}”</div></div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="glass-panel rounded-xl border border-phy-border p-3"><div className="text-[11px] text-phy-muted">Task</div><div className="font-bold text-phy-text">{analysis.rubric_scores?.task_response ?? 0}</div></div>
                        <div className="glass-panel rounded-xl border border-phy-border p-3"><div className="text-[11px] text-phy-muted">Coherence</div><div className="font-bold text-phy-text">{analysis.rubric_scores?.coherence ?? 0}</div></div>
                        <div className="glass-panel rounded-xl border border-phy-border p-3"><div className="text-[11px] text-phy-muted">Lexical</div><div className="font-bold text-phy-text">{analysis.rubric_scores?.lexical_resource ?? 0}</div></div>
                        <div className="glass-panel rounded-xl border border-phy-border p-3"><div className="text-[11px] text-phy-muted">Grammar</div><div className="font-bold text-phy-text">{analysis.rubric_scores?.grammar_range_accuracy ?? 0}</div></div>
                    </div>
                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                        <h4 className="font-bold text-phy-text text-sm mb-2">冲分建议清单</h4>
                        {(analysis.improvement_plan || []).slice(0, 5).map((item) => (
                            <label key={item.id} className="flex items-start gap-2 rounded-lg border border-phy-border p-2 bg-phy-glass mb-2">
                                <input type="checkbox" checked={Boolean(actionChecks[item.id])} onChange={() => setActionChecks(prev => ({ ...prev, [item.id]: !prev[item.id] }))} className="mt-0.5" />
                                <div className="text-sm text-phy-text">{item.title}: <span className="text-phy-muted">{item.action}</span></div>
                                <button onClick={(e) => { e.preventDefault(); setContent(prev => `${prev.trim()}\n\n${item.action}`); setWorkflowStep('write'); setMobileTab('editor'); }} className="ml-auto px-2 py-1 text-[11px] rounded-md border border-indigo-500/30 text-indigo-300">插入</button>
                            </label>
                        ))}
                    </div>
                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                        <h4 className="font-bold text-phy-text text-sm mb-2">句级问题 ({(analysis.issues || []).length})</h4>
                        {(analysis.issues || []).map((issue, idx) => (
                            <div key={idx} className={`rounded-lg border p-3 mb-2 ${issue.applied ? 'opacity-60 border-emerald-500/30 bg-emerald-500/5' : 'border-phy-border bg-phy-glass'}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="text-xs text-phy-muted">{issue.type} · sentence #{issue.sentence_index}</div>
                                    {!issue.applied ? <button onClick={() => applyFix(issue)} className="px-2 py-1 text-[11px] rounded-md bg-emerald-600 hover:bg-emerald-500 text-white">应用修正</button> : <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1"><CheckCircle size={12} />已应用</span>}
                                </div>
                                <div className="mt-1 text-sm text-phy-text"><span className="line-through text-rose-300/80">{issue.original}</span><ArrowRightLeft size={12} className="inline mx-1 text-phy-muted" /><span className="text-emerald-300 font-semibold">{issue.fixed}</span></div>
                                <div className="mt-1 text-xs text-phy-muted">{issue.reason}</div>
                            </div>
                        ))}
                    </div>
                    <div className="glass-panel rounded-2xl border border-phy-border p-4"><h4 className="font-bold text-phy-text text-sm mb-2">改写对照</h4><DiffViewer oldText={content} newText={analysis.rewritten_text || analysis.corrected_text || ''} /></div>
                    <div className="glass-panel rounded-2xl border border-phy-border p-4"><h4 className="font-bold text-phy-text text-sm mb-2">词汇注入建议</h4><div className="grid grid-cols-1 md:grid-cols-2 gap-2">{injectSuggestions.map((item, idx) => <div key={idx} className="rounded-lg border border-phy-border bg-phy-glass p-3"><div className="text-sm font-bold text-phy-text">{item.word}</div><div className="text-xs text-phy-muted mt-1">{item.why}</div><div className="text-xs text-indigo-300 mt-1">{item.where}</div></div>)}</div></div>
                </>
            )}
        </div>
    );

    const Main = (
        <div className="h-full flex flex-col bg-transparent">
            {StepNav}
            <div className="flex-1 overflow-hidden">
                {workflowStep === 'prompt' ? PromptPane : workflowStep === 'outline' ? OutlinePane : workflowStep === 'write' ? WritePane : DiagnosePane}
            </div>
        </div>
    );

    const TemplatePicker = (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm bg-black/60">
            <div className="bg-phy-glassHeavy rounded-2xl shadow-2xl border border-phy-borderHover w-full max-w-3xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-phy-borderHover flex justify-between items-center bg-slate-950/50">
                    <h3 className="font-bold text-white text-lg flex items-center gap-2"><Layout className="text-emerald-500" /> 选择写作模板</h3>
                    <button onClick={() => setShowTemplateModal(false)} className="text-phy-muted hover:text-white"><X /></button>
                </div>
                <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button onClick={() => { setShowTemplateModal(false); setContent(''); setTitle(''); setWorkflowStep('write'); }} className="p-4 rounded-xl border border-dashed border-phy-border hover:border-emerald-500 text-left"><div className="font-bold text-phy-text">空白文档</div><div className="text-xs text-phy-muted mt-1">从零开始，自由创作。</div></button>
                    {writingTemplates.map(t => (
                        <button key={t.id} onClick={() => { setShowTemplateModal(false); setContent(t.content); setTitle(`${t.name} - ${new Date().toLocaleDateString()}`); setWorkflowStep('write'); }} className="p-4 rounded-xl border border-phy-border bg-phy-glass hover:bg-phy-glassHover text-left">
                            <div className="font-bold text-phy-text">{t.name}</div><div className="text-xs text-phy-muted mt-1">{t.description}</div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div className="w-full h-full overflow-hidden rounded-3xl border border-phy-border shadow-2xl bg-slate-900/20 backdrop-blur-sm">
            {showTemplateModal ? TemplatePicker : null}
            {showPolishModal && selection ? <PolishChatModal selectedText={selection.text} onClose={() => setShowPolishModal(false)} /> : null}
            <div className="hidden md:block h-full"><SplitPane initialLeftWidth={300} minLeftWidth={250} maxLeftWidth={420} left={Sidebar} right={Main} /></div>
            <div className="md:hidden h-full flex flex-col">
                <div className="flex items-center justify-between p-2 px-4 bg-phy-glassHeavy border-b border-phy-border shrink-0">
                    <div className="font-bold text-phy-text text-sm">写作助手</div>
                    <div className="flex bg-phy-glass rounded-lg p-1">
                        <button onClick={() => setMobileTab('tools')} className={`px-3 py-1 text-xs rounded-md ${mobileTab === 'tools' ? 'bg-indigo-600 text-white' : 'text-phy-muted'}`}>工具</button>
                        <button onClick={() => setMobileTab('editor')} className={`px-3 py-1 text-xs rounded-md ${mobileTab === 'editor' ? 'bg-indigo-600 text-white' : 'text-phy-muted'}`}>编辑</button>
                        <button onClick={() => setMobileTab('analysis')} className={`px-3 py-1 text-xs rounded-md ${mobileTab === 'analysis' ? 'bg-indigo-600 text-white' : 'text-phy-muted'}`}>诊断</button>
                    </div>
                </div>
                <div className="flex-1 overflow-hidden">{mobileTab === 'tools' ? Sidebar : mobileTab === 'editor' ? Main : DiagnosePane}</div>
            </div>
        </div>
    );
};

export default WriterView;
