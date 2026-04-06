import React, { useEffect, useMemo, useState } from 'react';
import {
    Languages, Wand2, Loader2, RotateCcw, CheckCircle2, AlertCircle, BookOpen, History,
    RefreshCcw, Link2, Save, PlayCircle, Target
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/AppContext';
import {
    getFlashcards,
    getFolders,
    getTranslationLogs,
    saveFlashcard,
    saveFolder,
    saveTranslationLog
} from '../services/db';
import { generateTranslationChallenge, gradeTranslation } from '../services/ai';
import { getTodayNotesFolderName } from '../utils/noteFolders';

const DIFFICULTY_OPTIONS = [
    { value: 'easy', label: '简单', desc: '1 条热身 + 1 条主任务' },
    { value: 'medium', label: '中等', desc: '2 条热身 + 1 条主任务' },
    { value: 'hard', label: '困难', desc: '2 条热身 + 1 条主任务（更复杂）' }
];

const STAGE_LABELS = {
    setup: '设置',
    answer: '作答',
    feedback: '反馈',
    rewrite: '二次重译',
    settlement: '结算'
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const getTodayFlashcardFolderName = () => `Daily - ${new Date().toISOString().split('T')[0]}`;

const buildChallengeTasks = (challenge) => {
    if (!challenge) return [];
    const warmups = (challenge.warmups || []).map((item, idx) => ({
        id: item.id || `warmup-${idx + 1}`,
        type: item.type || 'warmup',
        chinese: String(item.chinese || ''),
        hint: String(item.hint || ''),
        scenario: String(item.scenario || ''),
        targetWords: Array.isArray(item.targetWords) ? item.targetWords : []
    }));
    const mainTask = challenge.mainTask ? [{
        id: challenge.mainTask.id || 'main-task',
        type: challenge.mainTask.type || 'main',
        chinese: String(challenge.mainTask.chinese || ''),
        hint: String(challenge.mainTask.hint || ''),
        scenario: String(challenge.mainTask.scenario || ''),
        targetWords: Array.isArray(challenge.mainTask.targetWords) ? challenge.mainTask.targetWords : []
    }] : [];
    if (warmups.length || mainTask.length) return [...warmups, ...mainTask];
    return [{
        id: challenge.challengeId || 'main-task',
        type: 'main',
        chinese: String(challenge.chinese || ''),
        hint: String(challenge.hint || ''),
        scenario: String(challenge.scenario || ''),
        targetWords: Array.isArray(challenge.targetWords) ? challenge.targetWords : []
    }];
};

const normalizeGrading = (raw, requiredMinHit = 0) => {
    const score100 = clamp(Math.round(Number(raw?.score100 ?? raw?.score ?? 0) || 0), 0, 100);
    const score15 = clamp(
        Math.round(Number(raw?.score15 ?? raw?.score_total ?? Math.round((score100 / 100) * 15)) || 0),
        0,
        15
    );
    const vocabHitRows = Array.isArray(raw?.vocab_hit)
        ? raw.vocab_hit
        : (Array.isArray(raw?.vocab_check) ? raw.vocab_check : []);
    const hitCount = vocabHitRows.filter((x) => Boolean(x?.used) && (x?.correctly !== false)).length;
    return {
        score100,
        score15,
        score_total: score15,
        score: score15,
        pass: Boolean(raw?.pass),
        level: raw?.level || (score15 >= 13 ? 'excellent' : score15 >= 10 ? 'good' : score15 >= 7 ? 'fair' : 'needs_work'),
        overall_comment: String(raw?.overall_comment || raw?.comment || ''),
        issues: Array.isArray(raw?.issues) ? raw.issues : [],
        improved_version: String(raw?.improved_version || raw?.rewritten_text || ''),
        vocab_hit: vocabHitRows,
        hitCount,
        requiredMinHit: Number(raw?.requiredMinHit || requiredMinHit || 0)
    };
};

const fallbackChallengeFromLog = (log) => {
    const difficulty = String(log?.difficulty || 'medium');
    const chinese = String(log?.chinese || '请将这段中文翻译成自然、准确的英文，并尽量命中目标词。');
    const targetWords = Array.isArray(log?.targetWords) ? log.targetWords : [];
    return {
        challengeId: log?.challengeId || `replay-${Date.now()}`,
        difficulty,
        mode: 'mixed',
        warmups: [],
        mainTask: {
            id: 'main-task',
            type: 'main',
            chinese,
            scenario: String(log?.scenario || 'History Replay'),
            hint: '请保持信息完整，优先语义准确，再优化表达。',
            targetWords
        },
        requiredMinHit: Number(log?.requiredMinHit || 0),
        targetWords
    };
};

const TranslationChallengeView = () => {
    const { settings, saveToNotes } = useApp();
    const [difficulty, setDifficulty] = useState('medium');
    const [challengeData, setChallengeData] = useState(null);
    const [stage, setStage] = useState('setup');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [results, setResults] = useState({});
    const [summary, setSummary] = useState(null);
    const [historyLogs, setHistoryLogs] = useState([]);
    const [linkOptions, setLinkOptions] = useState({ flashcards: false, notes: false });
    const [logSaved, setLogSaved] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isScoring, setIsScoring] = useState(false);
    const [isSavingLinks, setIsSavingLinks] = useState(false);

    const tasks = useMemo(() => buildChallengeTasks(challengeData), [challengeData]);
    const currentTask = tasks[currentIndex] || null;
    const currentTaskResultRows = currentTask ? (results[currentTask.id] || []) : [];
    const latestCurrentTaskResult = currentTaskResultRows.length ? currentTaskResultRows[currentTaskResultRows.length - 1] : null;
    const currentAnswer = currentTask ? (answers[currentTask.id] || '') : '';

    const refreshHistory = async () => {
        const rows = await getTranslationLogs(30);
        setHistoryLogs(rows || []);
    };

    useEffect(() => {
        refreshHistory().catch(() => { });
    }, []);

    const resetRuntime = () => {
        setStage('setup');
        setCurrentIndex(0);
        setAnswers({});
        setResults({});
        setSummary(null);
        setLinkOptions({ flashcards: false, notes: false });
        setLogSaved(false);
    };

    const startChallenge = async (preset = null) => {
        setIsGenerating(true);
        try {
            const cards = await getFlashcards();
            const generated = preset || await generateTranslationChallenge(cards, settings, {
                difficulty,
                mode: 'mixed'
            });
            setChallengeData(generated);
            setDifficulty(String(generated?.difficulty || difficulty));
            setCurrentIndex(0);
            setAnswers({});
            setResults({});
            setSummary(null);
            setLinkOptions({ flashcards: false, notes: false });
            setLogSaved(false);
            setStage('answer');
            toast.success('翻译挑战已开始');
        } catch (e) {
            toast.error(`生成失败：${e?.message || '未知错误'}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const buildSummary = () => {
        const itemResults = tasks.map((task) => {
            const rows = results?.[task.id] || [];
            return {
                task,
                attempts: rows,
                latest: rows.length ? rows[rows.length - 1] : null
            };
        });
        const latestRows = itemResults.map((x) => x.latest).filter(Boolean);
        const score100 = latestRows.length
            ? Math.round(latestRows.reduce((sum, x) => sum + Number(x.score100 || 0), 0) / latestRows.length)
            : 0;
        const score15 = latestRows.length
            ? Math.round(latestRows.reduce((sum, x) => sum + Number(x.score15 || 0), 0) / latestRows.length)
            : 0;
        const totalVocabHit = latestRows.reduce((sum, x) => sum + Number(x.hitCount || 0), 0);
        const attempts = itemResults.reduce((sum, x) => sum + Number(x.attempts?.length || 0), 0);
        return {
            challengeId: challengeData?.challengeId || `challenge-${Date.now()}`,
            difficulty: challengeData?.difficulty || difficulty,
            mode: challengeData?.mode || 'mixed',
            requiredMinHit: Number(challengeData?.requiredMinHit || 0),
            totalTasks: tasks.length,
            completedTasks: latestRows.length,
            score100,
            score15,
            vocabHit: totalVocabHit,
            attempts,
            targetWords: challengeData?.targetWords || [],
            scenario: challengeData?.mainTask?.scenario || '',
            itemResults
        };
    };

    const handleSubmitScore = async () => {
        if (!currentTask) return;
        const userText = String(currentAnswer || '').trim();
        if (!userText) {
            toast.error('请先输入译文');
            return;
        }
        setIsScoring(true);
        try {
            const graded = await gradeTranslation(currentTask, userText, settings, {
                requiredMinHit: Number(challengeData?.requiredMinHit || 0),
                difficulty: challengeData?.difficulty || difficulty,
                mode: 'mixed'
            });
            const normalized = normalizeGrading(graded, challengeData?.requiredMinHit);
            setResults((prev) => {
                const rows = prev?.[currentTask.id] || [];
                const record = {
                    ...normalized,
                    attempt: rows.length + 1,
                    taskId: currentTask.id,
                    taskType: currentTask.type,
                    chinese: currentTask.chinese,
                    userTranslation: userText,
                    targetWords: currentTask.targetWords || [],
                    scenario: currentTask.scenario || '',
                    createdAt: Date.now()
                };
                return { ...prev, [currentTask.id]: [...rows, record] };
            });
            setStage('feedback');
            setLogSaved(false);
            toast.success(normalized.pass ? '本题通过，可进入下一题' : '已生成反馈，可继续重译提分');
        } catch (e) {
            toast.error(`评分失败：${e?.message || '未知错误'}`);
        } finally {
            setIsScoring(false);
        }
    };

    const toNextTask = () => {
        if (currentIndex + 1 >= tasks.length) {
            const nextSummary = buildSummary();
            setSummary(nextSummary);
            setStage('settlement');
            return;
        }
        setCurrentIndex((idx) => idx + 1);
        setStage('answer');
    };

    const saveSessionLog = async () => {
        const finalSummary = summary || buildSummary();
        if (!finalSummary || logSaved) return;
        await saveTranslationLog({
            challengeId: finalSummary.challengeId,
            difficulty: finalSummary.difficulty,
            mode: finalSummary.mode,
            attempts: finalSummary.attempts,
            score100: finalSummary.score100,
            score15: finalSummary.score15,
            score: finalSummary.score15,
            vocabHit: finalSummary.vocabHit,
            requiredMinHit: finalSummary.requiredMinHit,
            itemResults: finalSummary.itemResults,
            targetWords: finalSummary.targetWords,
            scenario: finalSummary.scenario,
            challengePackage: challengeData,
            createdAt: Date.now()
        });
        setSummary(finalSummary);
        setLogSaved(true);
        await refreshHistory();
        toast.success('挑战记录已保存');
    };

    const ensureTodayFlashcardFolderId = async () => {
        const folderName = getTodayFlashcardFolderName();
        const folders = await getFolders();
        const existing = (folders || []).find((x) => String(x?.name || '').trim().toLowerCase() === folderName.toLowerCase());
        if (existing) return existing.id;
        const id = crypto.randomUUID();
        await saveFolder({ id, name: folderName, type: 'user', createdAt: Date.now() });
        return id;
    };

    const collectMissedWords = (baseSummary) => {
        const words = [];
        (baseSummary?.itemResults || []).forEach((row) => {
            const latest = row?.latest;
            if (!latest) return;
            const hits = Array.isArray(latest.vocab_hit) ? latest.vocab_hit : [];
            hits.forEach((x) => {
                const usedCorrectly = Boolean(x?.used) && (x?.correctly !== false);
                const word = String(x?.word || '').trim();
                if (!usedCorrectly && word) words.push(word);
            });
        });
        return Array.from(new Set(words));
    };

    const applyLinks = async () => {
        const baseSummary = summary || buildSummary();
        if (!baseSummary) return;
        setIsSavingLinks(true);
        try {
            let addedFlashcards = 0;
            let addedNotes = 0;

            if (linkOptions.flashcards) {
                const missedWords = collectMissedWords(baseSummary);
                if (missedWords.length) {
                    const folderId = await ensureTodayFlashcardFolderId();
                    const cards = await getFlashcards();
                    const exists = new Set(
                        (cards || []).map((c) => `${String(c.front || '').trim().toLowerCase()}|||${String(c.folderId || '')}`)
                    );
                    for (const word of missedWords) {
                        const front = String(word).trim();
                        const key = `${front.toLowerCase()}|||${folderId}`;
                        if (!front || exists.has(key)) continue;
                        await saveFlashcard({
                            id: crypto.randomUUID(),
                            front,
                            back: `翻译挑战错词复习（${new Date().toLocaleDateString()}）`,
                            folderId,
                            tags: ['translation', 'mistake'],
                            createdAt: Date.now(),
                            nextReview: Date.now(),
                            interval: 1,
                            repetitions: 0
                        });
                        exists.add(key);
                        addedFlashcards += 1;
                    }
                }
            }

            if (linkOptions.notes) {
                const lines = [];
                (baseSummary.itemResults || []).forEach((entry, index) => {
                    const latest = entry.latest;
                    if (!latest) return;
                    lines.push(`## 题目 ${index + 1}（${entry.task?.type === 'warmup' ? '热身' : '主任务'}）`);
                    lines.push(`原文：${entry.task?.chinese || ''}`);
                    lines.push(`得分：${latest.score100}/100 · ${latest.score15}/15`);
                    (latest.issues || []).slice(0, 5).forEach((issue) => {
                        const tag = String(issue?.severity || issue?.type || 'issue');
                        const reason = String(issue?.reason || issue?.description || '待改进');
                        lines.push(`- [${tag}] ${reason}`);
                    });
                    if (latest.improved_version) {
                        lines.push('改写建议：');
                        lines.push(latest.improved_version);
                    }
                    lines.push('');
                });
                await saveToNotes({
                    title: `翻译挑战复盘 ${new Date().toLocaleDateString()}`,
                    content: lines.join('\n').trim() || '本次翻译挑战暂无可记录的反馈。',
                    folder: getTodayNotesFolderName()
                });
                addedNotes += 1;
            }

            setSummary((prev) => prev ? {
                ...prev,
                selectedLinks: { ...linkOptions },
                linkedResult: { addedFlashcards, addedNotes, at: Date.now() }
            } : prev);
            toast.success(`联动完成：闪卡 +${addedFlashcards}，笔记 +${addedNotes}`);
        } catch (e) {
            toast.error(`联动失败：${e?.message || '未知错误'}`);
        } finally {
            setIsSavingLinks(false);
        }
    };

    const replayLog = async (log) => {
        const pack = log?.challengePackage || fallbackChallengeFromLog(log);
        setDifficulty(String(pack?.difficulty || log?.difficulty || 'medium'));
        await startChallenge(pack);
    };

    return (
        <div className="h-full min-h-0 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-4">
            <div className="glass-panel rounded-2xl border border-phy-border p-4 md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-xs uppercase tracking-wider text-phy-muted">Translation Training</div>
                        <h2 className="text-xl font-black text-phy-text flex items-center gap-2 mt-1">
                            <Languages size={20} className="text-indigo-300" />
                            翻译挑战
                        </h2>
                        <p className="text-sm text-phy-muted mt-1">独立训练：设置 &rarr; 作答 &rarr; 反馈 &rarr; 二次重译 &rarr; 结算</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={difficulty}
                            onChange={(e) => setDifficulty(e.target.value)}
                            className="px-3 py-2 rounded-xl bg-phy-bg border border-phy-border text-sm text-phy-text"
                        >
                            {DIFFICULTY_OPTIONS.map((x) => (
                                <option key={x.value} value={x.value}>{x.label} · {x.desc}</option>
                            ))}
                        </select>
                        <button
                            onClick={() => startChallenge()}
                            disabled={isGenerating}
                            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60"
                        >
                            {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
                            开始挑战
                        </button>
                        {challengeData ? (
                            <button
                                onClick={resetRuntime}
                                className="px-3 py-2 rounded-xl border border-phy-border bg-phy-glass text-phy-text text-sm font-bold inline-flex items-center gap-2"
                            >
                                <RotateCcw size={14} />
                                退出本次
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
                <div className="space-y-4">
                    {challengeData && currentTask ? (
                        <div className="glass-panel rounded-2xl border border-phy-border p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-sm font-bold text-phy-text">
                                    第 {currentIndex + 1}/{tasks.length} 题 · {currentTask.type === 'warmup' ? '热身题' : '主任务'}
                                </div>
                                <div className="text-xs text-phy-muted">阶段：{STAGE_LABELS[stage] || stage}</div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {tasks.map((task, idx) => (
                                    <button
                                        key={task.id}
                                        onClick={() => {
                                            setCurrentIndex(idx);
                                            setStage('answer');
                                        }}
                                        className={`px-2 py-1 rounded-lg border text-xs ${idx === currentIndex
                                            ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-100'
                                            : 'bg-phy-glass border-phy-border text-phy-muted'
                                            }`}
                                    >
                                        {task.type === 'warmup' ? `热身 ${idx + 1}` : '主任务'}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-4 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3">
                                <div className="text-xs text-amber-200/80">原文（中文）</div>
                                <div className="mt-2 text-sm text-amber-100 whitespace-pre-wrap leading-relaxed">{currentTask.chinese}</div>
                                {currentTask.hint ? (
                                    <div className="mt-2 text-xs text-amber-200/80">提示：{currentTask.hint}</div>
                                ) : null}
                                <div className="mt-2 text-xs text-amber-100/80">
                                    目标词：{(currentTask.targetWords || challengeData.targetWords || []).join(' / ') || '无'} · 最少命中 {Number(challengeData.requiredMinHit || 0)}
                                </div>
                            </div>

                            <div className="mt-4">
                                <label className="text-xs text-phy-muted">你的英文翻译</label>
                                <textarea
                                    value={currentAnswer}
                                    onChange={(e) => setAnswers((prev) => ({ ...prev, [currentTask.id]: e.target.value }))}
                                    rows={8}
                                    placeholder="在这里输入你的译文..."
                                    className="mt-2 w-full rounded-xl border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text resize-y min-h-[180px]"
                                />
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                    onClick={handleSubmitScore}
                                    disabled={isScoring}
                                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60"
                                >
                                    {isScoring ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                    {isScoring ? '评分中...' : '提交评分'}
                                </button>
                                {latestCurrentTaskResult ? (
                                    <span className="text-xs text-phy-muted">
                                        最近得分：{latestCurrentTaskResult.score100}/100 · {latestCurrentTaskResult.score15}/15 · 尝试 {latestCurrentTaskResult.attempt}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <div className="glass-panel rounded-2xl border border-phy-border p-6 text-center text-phy-muted">
                            选择难度后点击「开始挑战」，生成今日混合翻译任务包。
                        </div>
                    )}

                    {(stage === 'feedback' || stage === 'rewrite') && latestCurrentTaskResult ? (
                        <div className="glass-panel rounded-2xl border border-phy-border p-4">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-phy-glass border border-phy-border">
                                    <CheckCircle2 size={12} className="text-emerald-300" /> {latestCurrentTaskResult.score100}/100
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-phy-glass border border-phy-border">
                                    <CheckCircle2 size={12} className="text-indigo-300" /> {latestCurrentTaskResult.score15}/15
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-phy-glass border border-phy-border">
                                    <Target size={12} className="text-amber-300" /> 命中 {latestCurrentTaskResult.hitCount}/{latestCurrentTaskResult.requiredMinHit || 0}
                                </span>
                            </div>
                            {latestCurrentTaskResult.overall_comment ? (
                                <p className="mt-3 text-sm text-phy-text whitespace-pre-wrap">{latestCurrentTaskResult.overall_comment}</p>
                            ) : null}
                            {Array.isArray(latestCurrentTaskResult.issues) && latestCurrentTaskResult.issues.length ? (
                                <div className="mt-3 space-y-2">
                                    {latestCurrentTaskResult.issues.slice(0, 8).map((issue, idx) => (
                                        <div key={`${idx}-${issue?.type || 'issue'}`} className="rounded-lg border border-rose-400/20 bg-rose-500/5 p-2">
                                            <div className="text-xs text-rose-200 flex items-center gap-1"><AlertCircle size={12} /> {issue?.severity || issue?.type || 'issue'}</div>
                                            <div className="text-sm text-phy-text/90 mt-1">{issue?.reason || issue?.description || '待改进'}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                            {latestCurrentTaskResult.improved_version ? (
                                <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3">
                                    <div className="text-xs text-emerald-200">改写参考</div>
                                    <div className="text-sm text-emerald-100 mt-1 whitespace-pre-wrap">{latestCurrentTaskResult.improved_version}</div>
                                </div>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    onClick={() => setStage('rewrite')}
                                    className="px-3 py-1.5 rounded-lg border border-phy-border bg-phy-glass text-phy-text text-xs font-bold inline-flex items-center gap-1"
                                >
                                    <RefreshCcw size={12} /> 再译一版
                                </button>
                                <button
                                    onClick={toNextTask}
                                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold"
                                >
                                    {currentIndex + 1 < tasks.length ? '下一题' : '进入结算'}
                                </button>
                            </div>
                        </div>
                    ) : null}

                    {(stage === 'settlement' && (summary || tasks.length)) ? (
                        <div className="glass-panel rounded-2xl border border-phy-border p-4">
                            <h3 className="text-base font-black text-phy-text">挑战结算</h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                                <div className="rounded-xl border border-phy-border bg-phy-glass p-3"><div className="text-[11px] text-phy-muted">总分(100)</div><div className="font-black text-phy-text">{(summary || buildSummary()).score100}</div></div>
                                <div className="rounded-xl border border-phy-border bg-phy-glass p-3"><div className="text-[11px] text-phy-muted">总分(15)</div><div className="font-black text-emerald-300">{(summary || buildSummary()).score15}</div></div>
                                <div className="rounded-xl border border-phy-border bg-phy-glass p-3"><div className="text-[11px] text-phy-muted">目标词命中</div><div className="font-black text-amber-200">{(summary || buildSummary()).vocabHit}</div></div>
                                <div className="rounded-xl border border-phy-border bg-phy-glass p-3"><div className="text-[11px] text-phy-muted">尝试次数</div><div className="font-black text-indigo-200">{(summary || buildSummary()).attempts}</div></div>
                            </div>
                            <div className="mt-4 rounded-xl border border-phy-border bg-phy-glass p-3 space-y-2">
                                <label className="flex items-center gap-2 text-sm text-phy-text">
                                    <input type="checkbox" checked={Boolean(linkOptions.flashcards)} onChange={(e) => setLinkOptions((prev) => ({ ...prev, flashcards: e.target.checked }))} />
                                    未命中目标词 &rarr; 加入今日闪卡文件夹（去重）
                                </label>
                                <label className="flex items-center gap-2 text-sm text-phy-text">
                                    <input type="checkbox" checked={Boolean(linkOptions.notes)} onChange={(e) => setLinkOptions((prev) => ({ ...prev, notes: e.target.checked }))} />
                                    疑难句与错因 &rarr; 存入今日笔记
                                </label>
                                <div className="flex flex-wrap gap-2 pt-1">
                                    <button onClick={applyLinks} disabled={isSavingLinks} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-60">
                                        {isSavingLinks ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />} 执行联动
                                    </button>
                                    <button onClick={saveSessionLog} disabled={logSaved} className="px-3 py-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/10 text-indigo-200 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-60">
                                        <Save size={12} /> {logSaved ? '记录已保存' : '保存结算记录'}
                                    </button>
                                    <button onClick={() => startChallenge(challengeData)} className="px-3 py-1.5 rounded-lg border border-phy-border bg-phy-glass text-phy-text text-xs font-bold">同题再练</button>
                                    <button onClick={resetRuntime} className="px-3 py-1.5 rounded-lg border border-rose-400/30 bg-rose-500/10 text-rose-200 text-xs font-bold">结束挑战</button>
                                </div>
                                {summary?.linkedResult ? (
                                    <div className="text-xs text-phy-muted">
                                        上次联动：闪卡 +{summary.linkedResult.addedFlashcards || 0}，笔记 +{summary.linkedResult.addedNotes || 0}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                </div>

                <aside className="space-y-4">
                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                        <h3 className="text-sm font-black text-phy-text flex items-center gap-2">
                            <History size={14} />
                            历史回顾 ({historyLogs.length})
                        </h3>
                        <div className="mt-3 space-y-2 max-h-[58vh] overflow-y-auto custom-scrollbar pr-1">
                            {historyLogs.length ? historyLogs.map((log) => (
                                <div key={log.id || `${log.challengeId}-${log.createdAt}`} className="rounded-xl border border-phy-border bg-phy-glass p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="text-xs text-phy-muted">{new Date(log.createdAt || Date.now()).toLocaleDateString()}</div>
                                        <div className="text-xs font-bold text-emerald-300">{Number(log.score15 ?? log.score ?? 0)} / 15</div>
                                    </div>
                                    <div className="text-xs text-phy-muted mt-1">
                                        {String(log.difficulty || 'medium')} · 命中 {Number(log.vocabHit || 0)}/{Number(log.requiredMinHit || 0)} · 尝试 {Number(log.attempts || 1)}
                                    </div>
                                    <button onClick={() => replayLog(log)} className="mt-2 w-full px-2 py-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/10 text-indigo-200 text-xs font-bold inline-flex items-center justify-center gap-1">
                                        <RotateCcw size={12} /> 用同题再练
                                    </button>
                                </div>
                            )) : (
                                <div className="text-xs text-phy-muted rounded-lg border border-phy-border bg-phy-glass p-3">
                                    暂无历史记录
                                </div>
                            )}
                        </div>
                    </div>

                    {challengeData ? (
                        <div className="glass-panel rounded-2xl border border-phy-border p-4">
                            <h3 className="text-sm font-black text-phy-text flex items-center gap-2">
                                <BookOpen size={14} />
                                本次任务配置
                            </h3>
                            <div className="mt-2 text-xs text-phy-muted space-y-1">
                                <div>难度：{challengeData.difficulty || difficulty}</div>
                                <div>模式：{challengeData.mode || 'mixed'}</div>
                                <div>任务数：{tasks.length}</div>
                                <div>最低目标词命中：{Number(challengeData.requiredMinHit || 0)}</div>
                                <div>场景：{challengeData.mainTask?.scenario || 'General'}</div>
                            </div>
                        </div>
                    ) : null}
                </aside>
            </div>
        </div>
    );
};

export default TranslationChallengeView;

