import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Filter,
    History,
    Languages,
    Link2,
    Loader2,
    PlayCircle,
    RefreshCcw,
    RotateCcw,
    Save,
    Target,
    Wand2
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

const LS_FILTERS = 'translation_history_filters';
const LS_FEEDBACK_COLLAPSED = 'translation_feedback_collapsed';
const LS_SHORTCUTS_ENABLED = 'translation_keyboard_shortcuts_enabled';

const FILTER_DEFAULT = {
    difficulty: 'all',
    score: 'all',
    hit: 'all',
    date: 'all',
    issue: 'all'
};

const DIFFICULTIES = [
    { value: 'easy', label: '简单', desc: '1 条热身 + 1 条主任务' },
    { value: 'medium', label: '中等', desc: '2 条热身 + 1 条主任务' },
    { value: 'hard', label: '困难', desc: '2 条热身 + 1 条主任务（更高复杂度）' }
];

const STAGE = {
    setup: '设置',
    answer: '作答',
    feedback: '反馈',
    rewrite: '二次重译',
    settlement: '结算'
};

const ISSUE_TAGS = ['词义错', '语法错', '逻辑错', '漏译'];
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const todayFlashcardFolder = () => `Daily - ${new Date().toISOString().split('T')[0]}`;

const parseJSON = (value, fallback) => {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
};

const readObj = (key, defaults) => ({
    ...defaults,
    ...(parseJSON(localStorage.getItem(key), {}) || {})
});

const readBool = (key, defaults) => {
    const raw = localStorage.getItem(key);
    return raw == null ? defaults : raw === 'true';
};

const normalizeDifficulty = (value) => DIFFICULTIES.some((x) => x.value === value) ? value : 'medium';
const formatDateTime = (value) => new Date(Number(value || Date.now())).toLocaleString();

const deriveIssueTag = (issue) => {
    const text = `${String(issue?.type || '').toLowerCase()} ${String(issue?.reason || '').toLowerCase()}`;
    if (text.includes('grammar') || text.includes('tense') || text.includes('agreement') || text.includes('语法')) return '语法错';
    if (text.includes('logic') || text.includes('coherence') || text.includes('logical') || text.includes('连贯')) return '逻辑错';
    if (text.includes('omit') || text.includes('missing') || text.includes('漏') || text.includes('incomplete')) return '漏译';
    return '词义错';
};

const buildTasks = (challenge) => {
    if (!challenge) return [];
    const warmups = (challenge.warmups || []).map((item, i) => ({
        id: item.id || `warmup-${i + 1}`,
        type: item.type || 'warmup',
        chinese: String(item.chinese || ''),
        hint: String(item.hint || ''),
        scenario: String(item.scenario || ''),
        targetWords: Array.isArray(item.targetWords) ? item.targetWords : []
    }));
    const main = challenge.mainTask
        ? [{
            id: challenge.mainTask.id || 'main-task',
            type: challenge.mainTask.type || 'main',
            chinese: String(challenge.mainTask.chinese || ''),
            hint: String(challenge.mainTask.hint || ''),
            scenario: String(challenge.mainTask.scenario || ''),
            targetWords: Array.isArray(challenge.mainTask.targetWords) ? challenge.mainTask.targetWords : []
        }]
        : [];
    if (warmups.length || main.length) return [...warmups, ...main];
    return [{
        id: challenge.challengeId || 'main-task',
        type: 'main',
        chinese: String(challenge.chinese || ''),
        hint: String(challenge.hint || ''),
        scenario: String(challenge.scenario || ''),
        targetWords: Array.isArray(challenge.targetWords) ? challenge.targetWords : []
    }];
};

const normalizeGrade = (raw, requiredMinHit = 0) => {
    const score100 = clamp(Math.round(Number(raw?.score100 ?? raw?.score ?? 0) || 0), 0, 100);
    const score15 = clamp(Math.round(Number(raw?.score15 ?? Math.round((score100 / 100) * 15)) || 0), 0, 15);
    const vocab_hit = Array.isArray(raw?.vocab_hit)
        ? raw.vocab_hit
        : (Array.isArray(raw?.vocab_check) ? raw.vocab_check : []);
    const hitCount = vocab_hit.filter((x) => Boolean(x?.used) && x?.correctly !== false).length;
    return {
        score100,
        score15,
        pass: Boolean(raw?.pass),
        overall_comment: String(raw?.overall_comment || raw?.comment || ''),
        issues: Array.isArray(raw?.issues) ? raw.issues : [],
        improved_version: String(raw?.improved_version || raw?.rewritten_text || ''),
        vocab_hit,
        hitCount,
        requiredMinHit: Number(raw?.requiredMinHit || requiredMinHit || 0)
    };
};
const fallbackFromLog = (log) => ({
    challengeId: log?.challengeId || `replay-${Date.now()}`,
    difficulty: normalizeDifficulty(log?.difficulty || 'medium'),
    mode: 'mixed',
    warmups: [],
    mainTask: {
        id: 'main-task',
        type: 'main',
        chinese: String(log?.chinese || '请将这段中文翻译成自然、准确的英文，并尽量命中目标词。'),
        scenario: String(log?.scenario || 'History Replay'),
        hint: '请保持语义完整，优先译义准确，再优化表达。',
        targetWords: Array.isArray(log?.targetWords) ? log.targetWords : []
    },
    requiredMinHit: Number(log?.requiredMinHit || 0),
    targetWords: Array.isArray(log?.targetWords) ? log.targetWords : []
});

const getLatestRows = (log) => Array.isArray(log?.itemResults)
    ? log.itemResults.map((x) => x?.latest).filter(Boolean)
    : [];

const getLogScore100 = (log) => {
    const direct = Number(log?.score100);
    if (Number.isFinite(direct)) return clamp(Math.round(direct), 0, 100);
    const score15 = Number(log?.score15 ?? log?.score);
    if (Number.isFinite(score15)) return clamp(Math.round((score15 / 15) * 100), 0, 100);
    const rows = getLatestRows(log);
    return rows.length
        ? clamp(Math.round(rows.reduce((sum, x) => sum + Number(x.score100 || 0), 0) / rows.length), 0, 100)
        : 0;
};

const getLogScore15 = (log) => {
    const direct = Number(log?.score15 ?? log?.score);
    if (Number.isFinite(direct)) return clamp(Math.round(direct), 0, 15);
    const rows = getLatestRows(log);
    return rows.length
        ? clamp(Math.round(rows.reduce((sum, x) => sum + Number(x.score15 || 0), 0) / rows.length), 0, 15)
        : 0;
};

const getHitStats = (log) => {
    const rows = getLatestRows(log);
    if (!rows.length) {
        const hit = Math.max(0, Number(log?.vocabHit || 0) || 0);
        const req = Math.max(0, Number(log?.requiredMinHit || 0) || 0);
        return { hit, req, rate: req > 0 ? Math.round((hit / req) * 100) : 100 };
    }
    const hit = rows.reduce((sum, x) => sum + Number(x.hitCount || 0), 0);
    const req = rows.reduce((sum, x) => sum + Number(x.requiredMinHit || 0), 0);
    return { hit, req, rate: req > 0 ? Math.round((hit / req) * 100) : 100 };
};

const getIssueStats = (log) => {
    const bucket = new Map();
    getLatestRows(log).forEach((row) => {
        (row.issues || []).forEach((issue) => {
            const tag = deriveIssueTag(issue);
            bucket.set(tag, (bucket.get(tag) || 0) + 1);
        });
    });
    return Array.from(bucket.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([tag, count]) => ({ tag, count }));
};

const getTopIssueStats = (log) => getIssueStats(log).slice(0, 3);

const getMissedWordsFromSummary = (summary) => {
    const words = [];
    (summary?.itemResults || []).forEach((entry) => {
        const latest = entry?.latest;
        (Array.isArray(latest?.vocab_hit) ? latest.vocab_hit : []).forEach((hit) => {
            const usedCorrectly = Boolean(hit?.used) && hit?.correctly !== false;
            const word = String(hit?.word || '').trim();
            if (!usedCorrectly && word) words.push(word);
        });
    });
    return Array.from(new Set(words));
};

const buildRemedialFromLog = (log) => {
    const base = log?.challengePackage || fallbackFromLog(log);
    const difficulty = normalizeDifficulty(base?.difficulty || log?.difficulty || 'medium');
    const issueTop = getTopIssueStats(log).map((x) => x.tag);
    const missedWords = getMissedWordsFromSummary({ itemResults: log?.itemResults || [] });
    const targetWords = Array.from(
        new Set([...(Array.isArray(base?.targetWords) ? base.targetWords : []), ...missedWords])
    ).slice(0, 8);
    const requiredMinHit = Math.min(targetWords.length, Math.max(1, Number(base?.requiredMinHit || 2)));
    const warmupCount = difficulty === 'easy' ? 1 : 2;

    const templates = [
        `请翻译：虽然方案看起来可行，但我们仍需核对关键细节并及时修正偏差。${missedWords.length ? `（尽量用到：${missedWords.slice(0, 2).join('、')}）` : ''}`,
        `请翻译：团队在资源受限的情况下完成了目标，这证明持续复盘和协作机制同样重要。${missedWords.length > 2 ? `（可尝试：${missedWords.slice(2, 4).join('、')}）` : ''}`
    ];

    const warmups = templates.slice(0, warmupCount).map((chinese, i) => ({
        id: `warmup-${i + 1}`,
        type: 'warmup',
        chinese,
        scenario: '错因复练',
        hint: issueTop[0] === '语法错'
            ? '重点检查时态和主谓一致。'
            : issueTop[0] === '逻辑错'
                ? '注意连接词和因果链。'
                : issueTop[0] === '漏译'
                    ? '逐句核对信息完整度。'
                    : '优先提高词义精准度。',
        targetWords: targetWords.slice(0, Math.max(2, requiredMinHit))
    }));

    return {
        challengeId: `remedial-${Date.now()}`,
        difficulty,
        mode: 'mixed',
        warmups,
        mainTask: {
            id: 'main-task',
            type: 'main',
            chinese: String(base?.mainTask?.chinese || fallbackFromLog(log).mainTask.chinese),
            hint: issueTop.length
                ? `复练重点：${issueTop.join('、')}。先保真，再提质。`
                : String(base?.mainTask?.hint || '优先语义准确，再优化表达。'),
            scenario: '错因复练',
            targetWords
        },
        requiredMinHit,
        targetWords
    };
};

const parseTargetWordsInput = (raw) => {
    return Array.from(
        new Set(
            String(raw || '')
                .split(/[\n,，;；]+/g)
                .map((x) => x.trim())
                .filter(Boolean)
        )
    ).slice(0, 12);
};

const buildCustomChallenge = ({ source, hint, difficulty, targetWords }) => {
    const normalizedDifficulty = normalizeDifficulty(difficulty);
    const warmupCount = normalizedDifficulty === 'easy' ? 1 : 2;
    const minHitBase = normalizedDifficulty === 'easy' ? 1 : normalizedDifficulty === 'hard' ? 3 : 2;
    const requiredMinHit = targetWords.length ? Math.min(targetWords.length, minHitBase) : 0;

    const warmupPool = [
        '请翻译：在时间紧张的情况下，我们先保证核心目标，再逐步优化细节。',
        '请翻译：如果方案效果不理想，我们需要及时复盘并调整执行路径。'
    ];

    const warmups = warmupPool.slice(0, warmupCount).map((chinese, idx) => ({
        id: `warmup-${idx + 1}`,
        type: 'warmup',
        chinese,
        hint: '先保证语义准确，再优化表达自然度。',
        scenario: '自定义导入',
        targetWords: targetWords.slice(0, Math.max(2, requiredMinHit))
    }));

    return {
        challengeId: `custom-${Date.now()}`,
        difficulty: normalizedDifficulty,
        mode: 'mixed',
        warmups,
        mainTask: {
            id: 'main-task',
            type: 'main',
            chinese: String(source || '').trim(),
            hint: String(hint || '').trim() || '请保持信息完整，优先准确，再追求地道表达。',
            scenario: '自定义导入',
            targetWords
        },
        requiredMinHit,
        targetWords
    };
};

const TranslationChallengeView = () => {
    const { settings, saveToNotes } = useApp();

    const [difficulty, setDifficulty] = useState('medium');
    const [challenge, setChallenge] = useState(null);
    const [stage, setStage] = useState('setup');
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [results, setResults] = useState({});
    const [summary, setSummary] = useState(null);
    const [logs, setLogs] = useState([]);
    const [links, setLinks] = useState({ flashcards: false, notes: false });
    const [logSaved, setLogSaved] = useState(false);
    const [loadingGen, setLoadingGen] = useState(false);
    const [loadingScore, setLoadingScore] = useState(false);
    const [loadingLink, setLoadingLink] = useState(false);
    const [filters, setFilters] = useState(() => readObj(LS_FILTERS, FILTER_DEFAULT));
    const [feedbackCollapsed, setFeedbackCollapsed] = useState(() => readBool(LS_FEEDBACK_COLLAPSED, true));
    const [shortcutsEnabled, setShortcutsEnabled] = useState(() => readBool(LS_SHORTCUTS_ENABLED, true));
    const [showFilters, setShowFilters] = useState(false);
    const [expandedLogId, setExpandedLogId] = useState(null);
    const [customSourceText, setCustomSourceText] = useState('');
    const [customHintText, setCustomHintText] = useState('');
    const [customTargetWordsText, setCustomTargetWordsText] = useState('');

    const tasks = useMemo(() => buildTasks(challenge), [challenge]);
    const currentTask = tasks[index] || null;
    const currentRows = currentTask ? (results[currentTask.id] || []) : [];
    const latest = currentRows.length ? currentRows[currentRows.length - 1] : null;
    const currentAnswer = currentTask ? (answers[currentTask.id] || '') : '';
    const activeTargetWords = useMemo(
        () => (currentTask?.targetWords || challenge?.targetWords || []).filter(Boolean),
        [currentTask, challenge]
    );
    const refreshLogs = async () => {
        const data = await getTranslationLogs(120);
        setLogs(data || []);
    };

    useEffect(() => {
        refreshLogs().catch(() => { });
    }, []);

    useEffect(() => {
        localStorage.setItem(LS_FILTERS, JSON.stringify(filters));
    }, [filters]);

    useEffect(() => {
        localStorage.setItem(LS_FEEDBACK_COLLAPSED, String(feedbackCollapsed));
    }, [feedbackCollapsed]);

    useEffect(() => {
        localStorage.setItem(LS_SHORTCUTS_ENABLED, String(shortcutsEnabled));
    }, [shortcutsEnabled]);

    const issueTagPool = useMemo(() => {
        const map = new Map();
        logs.forEach((log) => {
            getIssueStats(log).forEach((x) => map.set(x.tag, (map.get(x.tag) || 0) + x.count));
        });
        return Array.from(map.keys());
    }, [logs]);

    const filteredLogs = useMemo(() => {
        const now = Date.now();
        const dateMin = filters.date === 'today'
            ? (() => {
                const d = new Date();
                d.setHours(0, 0, 0, 0);
                return d.getTime();
            })()
            : filters.date === '7d'
                ? now - 7 * 24 * 60 * 60 * 1000
                : filters.date === '30d'
                    ? now - 30 * 24 * 60 * 60 * 1000
                    : null;

        return logs.filter((log) => {
            const d = normalizeDifficulty(log?.difficulty || 'medium');
            const s100 = getLogScore100(log);
            const hit = getHitStats(log).rate;
            const ts = Number(log?.createdAt || 0) || 0;
            const tags = getIssueStats(log).map((x) => x.tag);

            if (filters.difficulty !== 'all' && d !== filters.difficulty) return false;
            if (filters.score !== 'all') {
                if (filters.score === '90+' && s100 < 90) return false;
                if (filters.score === '80-89' && (s100 < 80 || s100 > 89)) return false;
                if (filters.score === '70-79' && (s100 < 70 || s100 > 79)) return false;
                if (filters.score === '<70' && s100 >= 70) return false;
            }
            if (filters.hit !== 'all') {
                if (filters.hit === '100' && hit < 100) return false;
                if (filters.hit === '70+' && hit < 70) return false;
                if (filters.hit === '<70' && hit >= 70) return false;
            }
            if (dateMin != null && ts < dateMin) return false;
            if (filters.issue !== 'all' && !tags.includes(filters.issue)) return false;
            return true;
        });
    }, [logs, filters]);

    const buildSummary = () => {
        const itemResults = tasks.map((task) => {
            const attempts = results?.[task.id] || [];
            return {
                task,
                attempts,
                latest: attempts.length ? attempts[attempts.length - 1] : null
            };
        });
        const latestRows = itemResults.map((x) => x.latest).filter(Boolean);

        return {
            challengeId: challenge?.challengeId || `challenge-${Date.now()}`,
            difficulty: challenge?.difficulty || difficulty,
            mode: challenge?.mode || 'mixed',
            requiredMinHit: Number(challenge?.requiredMinHit || 0),
            totalTasks: tasks.length,
            completedTasks: latestRows.length,
            score100: latestRows.length
                ? Math.round(latestRows.reduce((sum, x) => sum + Number(x.score100 || 0), 0) / latestRows.length)
                : 0,
            score15: latestRows.length
                ? Math.round(latestRows.reduce((sum, x) => sum + Number(x.score15 || 0), 0) / latestRows.length)
                : 0,
            vocabHit: latestRows.reduce((sum, x) => sum + Number(x.hitCount || 0), 0),
            attempts: itemResults.reduce((sum, x) => sum + Number(x.attempts?.length || 0), 0),
            targetWords: challenge?.targetWords || [],
            scenario: challenge?.mainTask?.scenario || '',
            itemResults
        };
    };

    const resetRuntime = () => {
        setStage('setup');
        setIndex(0);
        setAnswers({});
        setResults({});
        setSummary(null);
        setLinks({ flashcards: false, notes: false });
        setLogSaved(false);
    };

    const startChallenge = async (preset = null) => {
        setLoadingGen(true);
        try {
            const cards = await getFlashcards();
            const generated = preset || await generateTranslationChallenge(cards, settings, {
                difficulty,
                mode: 'mixed'
            });
            setChallenge(generated);
            setDifficulty(normalizeDifficulty(generated?.difficulty || difficulty));
            setIndex(0);
            setAnswers({});
            setResults({});
            setSummary(null);
            setLinks({ flashcards: false, notes: false });
            setLogSaved(false);
            setStage('answer');
            toast.success('翻译挑战已开始');
        } catch (e) {
            toast.error(`生成失败：${e?.message || '未知错误'}`);
        } finally {
            setLoadingGen(false);
        }
    };

    const submitScore = async () => {
        if (!currentTask) return;
        const text = String(currentAnswer || '').trim();
        if (!text) {
            toast.error('请先输入译文');
            return;
        }
        setLoadingScore(true);
        try {
            const raw = await gradeTranslation(currentTask, text, settings, {
                requiredMinHit: Number(challenge?.requiredMinHit || 0),
                difficulty: challenge?.difficulty || difficulty,
                mode: 'mixed'
            });
            const graded = normalizeGrade(raw, challenge?.requiredMinHit);
            setResults((prev) => {
                const rows = prev?.[currentTask.id] || [];
                return {
                    ...prev,
                    [currentTask.id]: [
                        ...rows,
                        {
                            ...graded,
                            attempt: rows.length + 1,
                            taskId: currentTask.id,
                            taskType: currentTask.type,
                            chinese: currentTask.chinese,
                            userTranslation: text,
                            targetWords: currentTask.targetWords || [],
                            scenario: currentTask.scenario || '',
                            createdAt: Date.now()
                        }
                    ]
                };
            });
            setStage('feedback');
            setLogSaved(false);
            toast.success(graded.pass ? '本题通过，可进入下一题' : '已生成反馈，可继续重译提分');
        } catch (e) {
            toast.error(`评分失败：${e?.message || '未知错误'}`);
        } finally {
            setLoadingScore(false);
        }
    };

    const nextTask = () => {
        if (index + 1 >= tasks.length) {
            const nextSummary = buildSummary();
            setSummary(nextSummary);
            setStage('settlement');
            return;
        }
        setIndex((x) => x + 1);
        setStage('answer');
    };

    const saveLog = async () => {
        const s = summary || buildSummary();
        if (!s || logSaved) return;
        await saveTranslationLog({
            challengeId: s.challengeId,
            difficulty: s.difficulty,
            mode: s.mode,
            attempts: s.attempts,
            score100: s.score100,
            score15: s.score15,
            score: s.score15,
            vocabHit: s.vocabHit,
            requiredMinHit: s.requiredMinHit,
            itemResults: s.itemResults,
            targetWords: s.targetWords,
            scenario: s.scenario,
            challengePackage: challenge,
            createdAt: Date.now()
        });
        setSummary(s);
        setLogSaved(true);
        await refreshLogs();
        toast.success('挑战记录已保存');
    };
    const ensureTodayFolderId = async () => {
        const name = todayFlashcardFolder();
        const folders = await getFolders();
        const existing = (folders || []).find(
            (x) => String(x?.name || '').trim().toLowerCase() === name.toLowerCase()
        );
        if (existing) return existing.id;
        const id = crypto.randomUUID();
        await saveFolder({ id, name, type: 'user', createdAt: Date.now() });
        return id;
    };

    const applyLinks = async () => {
        const s = summary || buildSummary();
        if (!s) return;
        setLoadingLink(true);
        try {
            let addedFlashcards = 0;
            let addedNotes = 0;

            if (links.flashcards) {
                const missedWords = getMissedWordsFromSummary(s);
                if (missedWords.length) {
                    const folderId = await ensureTodayFolderId();
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

            if (links.notes) {
                const lines = [];
                (s.itemResults || []).forEach((entry, i) => {
                    const latestRow = entry.latest;
                    if (!latestRow) return;
                    lines.push(`## 题目 ${i + 1}（${entry.task?.type === 'warmup' ? '热身' : '主任务'}）`);
                    lines.push(`原文：${entry.task?.chinese || ''}`);
                    lines.push(`得分：${latestRow.score100}/100 · ${latestRow.score15}/15`);
                    (latestRow.issues || []).slice(0, 5).forEach((issue) => {
                        lines.push(`- [${deriveIssueTag(issue)}] ${String(issue?.reason || issue?.description || '待改进')}`);
                    });
                    if (latestRow.improved_version) {
                        lines.push('改写建议：');
                        lines.push(latestRow.improved_version);
                    }
                    lines.push('');
                });

                await saveToNotes({
                    title: `翻译挑战复盘 ${new Date().toLocaleDateString()}`,
                    content: lines.join('\n').trim() || '本次翻译挑战暂无可记录反馈。',
                    folder: getTodayNotesFolderName()
                });
                addedNotes += 1;
            }

            setSummary((prev) => prev ? {
                ...prev,
                selectedLinks: { ...links },
                linkedResult: { addedFlashcards, addedNotes, at: Date.now() }
            } : prev);

            toast.success(`联动完成：闪卡 +${addedFlashcards}，笔记 +${addedNotes}`);
        } catch (e) {
            toast.error(`联动失败：${e?.message || '未知错误'}`);
        } finally {
            setLoadingLink(false);
        }
    };

    const replay = async (log) => {
        const pack = log?.challengePackage || fallbackFromLog(log);
        setDifficulty(normalizeDifficulty(pack?.difficulty || log?.difficulty || 'medium'));
        await startChallenge(pack);
    };

    const generateRemedial = async (log) => {
        await startChallenge(buildRemedialFromLog(log));
        toast.success('已生成错因复练集');
    };

    const startCustomChallenge = async () => {
        const source = String(customSourceText || '').trim();
        if (source.length < 6) {
            toast.error('请先输入要练习的中文原文');
            return;
        }
        const targetWords = parseTargetWordsInput(customTargetWordsText);
        const pack = buildCustomChallenge({
            source,
            hint: customHintText,
            difficulty,
            targetWords
        });
        await startChallenge(pack);
    };

    useEffect(() => {
        const onKeyDown = (e) => {
            if (!shortcutsEnabled || e.isComposing) return;
            if (e.altKey && (e.key === 'h' || e.key === 'H')) {
                e.preventDefault();
                setShowFilters((v) => !v);
                return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                if (stage === 'answer' || stage === 'rewrite') {
                    e.preventDefault();
                    submitScore().catch(() => { });
                }
                return;
            }
            if (e.altKey && e.key === 'ArrowRight') {
                if (stage === 'feedback' && latest) {
                    e.preventDefault();
                    nextTask();
                }
                return;
            }
            if (e.altKey && (e.key === 'r' || e.key === 'R')) {
                if (stage === 'feedback' && latest) {
                    e.preventDefault();
                    setStage('rewrite');
                }
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [shortcutsEnabled, stage, latest, currentTask, currentAnswer]);

    const scoreBadgeClass = latest?.score15 >= 12
        ? 'text-emerald-200 border-emerald-400/30 bg-emerald-500/10'
        : latest?.score15 >= 9
            ? 'text-amber-200 border-amber-400/30 bg-amber-500/10'
            : 'text-rose-200 border-rose-400/30 bg-rose-500/10';

    return (
        <div className="h-full min-h-0 overflow-y-auto md:overflow-hidden p-3 md:p-6">
            <div className="min-h-full md:h-full md:min-h-0 md:grid md:grid-rows-[auto_minmax(0,1fr)] flex flex-col gap-4 pb-20 md:pb-0">
                <section className="glass-panel rounded-2xl border border-phy-border p-4 md:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="text-xs uppercase tracking-wider text-phy-muted">Translation Challenge</div>
                            <h2 className="text-xl font-black text-phy-text flex items-center gap-2 mt-1">
                                <Languages size={20} className="text-indigo-300" />翻译挑战
                            </h2>
                            <p className="text-sm text-phy-muted mt-1">桌面效率版：历史快回放 + 快捷键 + 折叠反馈。</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="px-3 py-2 rounded-xl bg-phy-bg border border-phy-border text-sm text-phy-text">
                                {DIFFICULTIES.map((x) => (
                                    <option key={x.value} value={x.value}>{x.label} · {x.desc}</option>
                                ))}
                            </select>
                            <button onClick={() => startChallenge()} disabled={loadingGen} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60">
                                {loadingGen ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}开始挑战
                            </button>
                            {challenge ? (
                                <button onClick={resetRuntime} className="px-3 py-2 rounded-xl border border-phy-border bg-phy-glass text-phy-text text-sm font-bold inline-flex items-center gap-2">
                                    <RotateCcw size={14} />退出本次
                                </button>
                            ) : null}
                            <button onClick={() => setShortcutsEnabled((v) => !v)} className={`px-3 py-2 rounded-xl border text-xs font-bold ${shortcutsEnabled ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200' : 'border-phy-border bg-phy-glass text-phy-muted'}`}>
                                快捷键 {shortcutsEnabled ? '开' : '关'}
                            </button>
                        </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-phy-border bg-phy-glass p-3">
                        <div className="text-xs font-semibold text-phy-text mb-2">自定义原文导入（直接开练）</div>
                        <textarea
                            value={customSourceText}
                            onChange={(e) => setCustomSourceText(e.target.value)}
                            rows={3}
                            placeholder="粘贴你要练习的中文原文..."
                            className="w-full rounded-lg border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text resize-y"
                        />
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
                            <input
                                value={customTargetWordsText}
                                onChange={(e) => setCustomTargetWordsText(e.target.value)}
                                placeholder="目标词（可选，逗号分隔）"
                                className="rounded-lg border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text"
                            />
                            <input
                                value={customHintText}
                                onChange={(e) => setCustomHintText(e.target.value)}
                                placeholder="提示（可选）"
                                className="rounded-lg border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text"
                            />
                            <button
                                onClick={() => startCustomChallenge()}
                                disabled={loadingGen}
                                className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-60"
                            >
                                用自定义原文开练
                            </button>
                        </div>
                    </div>
                </section>

                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2.2fr)_minmax(360px,1fr)] gap-4 md:min-h-0">
                    <section className="flex flex-col gap-4 md:min-h-0">
                        {challenge && currentTask ? (
                            <>
                                <div className="sticky top-0 z-20 glass-panel rounded-2xl border border-phy-border p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="text-sm font-bold text-phy-text">第 {index + 1}/{tasks.length} 题 · {currentTask.type === 'warmup' ? '热身题' : '主任务'}</div>
                                        <div className="text-xs text-phy-muted">阶段：{STAGE[stage] || stage}</div>
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        {tasks.map((task, i) => (
                                            <button key={task.id} onClick={() => { setIndex(i); setStage('answer'); }} className={`px-2 py-1 rounded-lg border text-xs ${i === index ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-100' : 'bg-phy-glass border-phy-border text-phy-muted'}`}>
                                                {task.type === 'warmup' ? `热身 ${i + 1}` : '主任务'}
                                            </button>
                                        ))}
                                        <span className="ml-auto text-xs text-amber-200/90 inline-flex items-center gap-1">
                                            <Target size={12} />目标词命中要求：至少 {Number(challenge.requiredMinHit || 0)}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-4 md:min-h-0 md:overflow-y-auto custom-scrollbar md:pr-1">
                                    <div className="glass-panel rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4">
                                        <div className="text-xs text-amber-200/80">题干（中文）</div>
                                        <div className="mt-2 text-sm text-amber-100 whitespace-pre-wrap leading-relaxed">{currentTask.chinese}</div>
                                        {currentTask.hint ? <div className="mt-2 text-xs text-amber-200/80">提示：{currentTask.hint}</div> : null}
                                        <div className="mt-2 text-xs text-amber-100/80">目标词：{activeTargetWords.join(' / ') || '无'}</div>
                                    </div>

                                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                                        <div className="flex items-center justify-between gap-2">
                                            <label className="text-xs text-phy-muted">你的英文翻译</label>
                                            <span className="text-xs text-phy-muted">Ctrl/Cmd + Enter 提交</span>
                                        </div>
                                        <textarea
                                            value={currentAnswer}
                                            onChange={(e) => setAnswers((prev) => ({ ...prev, [currentTask.id]: e.target.value }))}
                                            rows={9}
                                            placeholder="在这里输入你的译文..."
                                            className="mt-2 w-full rounded-xl border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text resize-y min-h-[220px]"
                                        />
                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                            <button onClick={submitScore} disabled={loadingScore} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60">
                                                {loadingScore ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                                {loadingScore ? '评分中...' : '提交评分'}
                                            </button>
                                            {latest ? <span className="text-xs text-phy-muted">最近得分：{latest.score100}/100 · {latest.score15}/15 · 尝试 {latest.attempt}</span> : null}
                                        </div>
                                    </div>

                                    {(stage === 'feedback' || stage === 'rewrite') && latest ? (
                                        <div className="glass-panel rounded-2xl border border-phy-border p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border bg-phy-glass border-phy-border"><CheckCircle2 size={12} className="text-emerald-300" />{latest.score100}/100</span>
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border ${scoreBadgeClass}`}><CheckCircle2 size={12} />{latest.score15}/15</span>
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-amber-400/30 bg-amber-500/10 text-amber-200"><Target size={12} />命中 {latest.hitCount}/{latest.requiredMinHit || 0}</span>
                                                </div>
                                                <button onClick={() => setFeedbackCollapsed((v) => !v)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-phy-border bg-phy-glass text-xs text-phy-text">
                                                    {feedbackCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                                                    {feedbackCollapsed ? '展开反馈明细' : '收起反馈明细'}
                                                </button>
                                            </div>

                                            {latest.overall_comment ? <p className="mt-3 text-sm text-phy-text whitespace-pre-wrap">{latest.overall_comment}</p> : null}

                                            {!feedbackCollapsed ? (
                                                <div className="mt-3 space-y-3">
                                                    {(latest.issues || []).length ? (latest.issues || []).slice(0, 8).map((issue, i) => (
                                                        <div key={`${i}-${issue?.type || 'issue'}`} className="rounded-lg border border-rose-400/20 bg-rose-500/5 p-2">
                                                            <div className="text-xs text-rose-200 flex items-center gap-1"><AlertCircle size={12} />{deriveIssueTag(issue)} · {issue?.severity || issue?.type || 'issue'}</div>
                                                            <div className="text-sm text-phy-text/90 mt-1">{issue?.reason || issue?.description || '待改进'}</div>
                                                        </div>
                                                    )) : <div className="text-xs text-phy-muted">未检测到明显问题，建议再译一版冲高分。</div>}

                                                    {latest.improved_version ? (
                                                        <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3">
                                                            <div className="text-xs text-emerald-200">改写参考</div>
                                                            <div className="text-sm text-emerald-100 mt-1 whitespace-pre-wrap">{latest.improved_version}</div>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ) : null}

                                            <div className="mt-4 pt-3 border-t border-phy-border flex flex-wrap items-center gap-2">
                                                <button onClick={() => setStage('rewrite')} className="px-3 py-1.5 rounded-lg border border-phy-border bg-phy-glass text-phy-text text-xs font-bold inline-flex items-center gap-1"><RefreshCcw size={12} />再译一版 (Alt+R)</button>
                                                <button onClick={nextTask} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold">{index + 1 < tasks.length ? '下一题 (Alt+→)' : '进入结算 (Alt+→)'}</button>
                                            </div>
                                        </div>
                                    ) : null}

                                    {stage === 'settlement' && (summary || tasks.length) ? (
                                        <div className="glass-panel rounded-2xl border border-phy-border p-4">
                                            <h3 className="text-base font-black text-phy-text">挑战结算</h3>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                                                <div className="rounded-xl border border-phy-border bg-phy-glass p-3"><div className="text-[11px] text-phy-muted">总分 (100)</div><div className="font-black text-phy-text">{(summary || buildSummary()).score100}</div></div>
                                                <div className="rounded-xl border border-phy-border bg-phy-glass p-3"><div className="text-[11px] text-phy-muted">总分 (15)</div><div className="font-black text-emerald-300">{(summary || buildSummary()).score15}</div></div>
                                                <div className="rounded-xl border border-phy-border bg-phy-glass p-3"><div className="text-[11px] text-phy-muted">目标词命中</div><div className="font-black text-amber-200">{(summary || buildSummary()).vocabHit}</div></div>
                                                <div className="rounded-xl border border-phy-border bg-phy-glass p-3"><div className="text-[11px] text-phy-muted">尝试次数</div><div className="font-black text-indigo-200">{(summary || buildSummary()).attempts}</div></div>
                                            </div>

                                            <div className="mt-4 rounded-xl border border-phy-border bg-phy-glass p-3 space-y-2">
                                                <label className="flex items-center gap-2 text-sm text-phy-text"><input type="checkbox" checked={Boolean(links.flashcards)} onChange={(e) => setLinks((prev) => ({ ...prev, flashcards: e.target.checked }))} />未命中目标词 → 加入今日闪卡文件夹（去重）</label>
                                                <label className="flex items-center gap-2 text-sm text-phy-text"><input type="checkbox" checked={Boolean(links.notes)} onChange={(e) => setLinks((prev) => ({ ...prev, notes: e.target.checked }))} />疑难句与错因总结 → 存入今日笔记</label>
                                                <div className="flex flex-wrap gap-2 pt-1">
                                                    <button onClick={applyLinks} disabled={loadingLink} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-60">{loadingLink ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}执行联动</button>
                                                    <button onClick={saveLog} disabled={logSaved} className="px-3 py-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/10 text-indigo-200 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-60"><Save size={12} />{logSaved ? '记录已保存' : '保存结算记录'}</button>
                                                    <button onClick={() => startChallenge(challenge)} className="px-3 py-1.5 rounded-lg border border-phy-border bg-phy-glass text-phy-text text-xs font-bold">同题再练</button>
                                                    <button onClick={resetRuntime} className="px-3 py-1.5 rounded-lg border border-rose-400/30 bg-rose-500/10 text-rose-200 text-xs font-bold">结束挑战</button>
                                                </div>
                                                {summary?.linkedResult ? <div className="text-xs text-phy-muted">上次联动：闪卡 +{summary.linkedResult.addedFlashcards || 0}，笔记 +{summary.linkedResult.addedNotes || 0}</div> : null}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            </>
                        ) : (
                            <div className="glass-panel rounded-2xl border border-phy-border p-8 text-center text-phy-muted">选择难度后点击“开始挑战”，生成今日混合翻译任务包。</div>
                        )}
                    </section>

                    <aside className="glass-panel rounded-2xl border border-phy-border p-4 flex flex-col max-h-[42vh] md:max-h-none md:min-h-0">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-sm font-black text-phy-text flex items-center gap-2"><History size={14} />历史快回放 ({filteredLogs.length}/{logs.length})</h3>
                            <button onClick={() => setShowFilters((v) => !v)} className="px-2 py-1 rounded-lg border border-phy-border bg-phy-glass text-xs text-phy-text inline-flex items-center gap-1" title="Alt + H"><Filter size={12} />筛选</button>
                        </div>

                        {showFilters ? (
                            <div className="mt-3 rounded-xl border border-phy-border bg-phy-glass p-3 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <select value={filters.difficulty} onChange={(e) => setFilters((prev) => ({ ...prev, difficulty: e.target.value }))} className="px-2 py-1.5 rounded-lg bg-phy-bg border border-phy-border text-xs text-phy-text"><option value="all">难度：全部</option><option value="easy">难度：简单</option><option value="medium">难度：中等</option><option value="hard">难度：困难</option></select>
                                    <select value={filters.score} onChange={(e) => setFilters((prev) => ({ ...prev, score: e.target.value }))} className="px-2 py-1.5 rounded-lg bg-phy-bg border border-phy-border text-xs text-phy-text"><option value="all">得分：全部</option><option value="90+">得分：90+</option><option value="80-89">得分：80-89</option><option value="70-79">得分：70-79</option><option value="<70">得分：&lt;70</option></select>
                                    <select value={filters.hit} onChange={(e) => setFilters((prev) => ({ ...prev, hit: e.target.value }))} className="px-2 py-1.5 rounded-lg bg-phy-bg border border-phy-border text-xs text-phy-text"><option value="all">命中率：全部</option><option value="100">命中率：100%</option><option value="70+">命中率：≥70%</option><option value="<70">命中率：&lt;70%</option></select>
                                    <select value={filters.date} onChange={(e) => setFilters((prev) => ({ ...prev, date: e.target.value }))} className="px-2 py-1.5 rounded-lg bg-phy-bg border border-phy-border text-xs text-phy-text"><option value="all">日期：全部</option><option value="today">日期：今天</option><option value="7d">日期：近7天</option><option value="30d">日期：近30天</option></select>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    <button onClick={() => setFilters((prev) => ({ ...prev, issue: 'all' }))} className={`px-2 py-1 rounded-md text-[11px] border ${filters.issue === 'all' ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-100' : 'bg-phy-bg border-phy-border text-phy-muted'}`}>错因：全部</button>
                                    {Array.from(new Set([...ISSUE_TAGS, ...issueTagPool])).map((tag) => (
                                        <button key={tag} onClick={() => setFilters((prev) => ({ ...prev, issue: tag }))} className={`px-2 py-1 rounded-md text-[11px] border ${filters.issue === tag ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-100' : 'bg-phy-bg border-phy-border text-phy-muted'}`}>{tag}</button>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        <div className="mt-3 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-2">
                            {filteredLogs.length ? filteredLogs.map((log) => {
                                const id = log.id || `${log.challengeId}-${log.createdAt}`;
                                const score100 = getLogScore100(log);
                                const score15 = getLogScore15(log);
                                const hit = getHitStats(log);
                                const top3 = getTopIssueStats(log);
                                const expanded = expandedLogId === id;
                                return (
                                    <article key={id} className="rounded-xl border border-phy-border bg-phy-glass p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="text-xs text-phy-muted">{formatDateTime(log.createdAt)}</div>
                                            <div className="text-xs font-bold text-emerald-300">{score15} / 15</div>
                                        </div>
                                        <div className="mt-1 text-xs text-phy-muted">{normalizeDifficulty(log.difficulty)} · {score100}/100 · 命中率 {hit.rate}%</div>
                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            <button onClick={() => replay(log)} className="px-2 py-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/10 text-indigo-200 text-xs font-bold inline-flex items-center justify-center gap-1"><RotateCcw size={12} />同题再练</button>
                                            <button onClick={() => generateRemedial(log)} className="px-2 py-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 text-emerald-200 text-xs font-bold inline-flex items-center justify-center gap-1"><RefreshCcw size={12} />生成复练集</button>
                                        </div>
                                        <button onClick={() => setExpandedLogId((prev) => (prev === id ? null : id))} className="mt-2 w-full px-2 py-1.5 rounded-lg border border-phy-border bg-phy-bg text-phy-text text-xs inline-flex items-center justify-center gap-1">{expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}{expanded ? '收起详情' : '展开详情'}</button>
                                        {expanded ? (
                                            <div className="mt-2 rounded-lg border border-phy-border bg-phy-bg p-2 space-y-1.5 text-xs text-phy-text">
                                                <div>双分：{score100}/100 · {score15}/15</div>
                                                <div>命中词：{hit.hit}/{Math.max(hit.req, 0)}</div>
                                                <div>主要错因 Top3：{top3.length ? top3.map((x) => `${x.tag}(${x.count})`).join('、') : '本次无明显错因'}</div>
                                            </div>
                                        ) : null}
                                    </article>
                                );
                            }) : (
                                <div className="text-xs text-phy-muted rounded-lg border border-phy-border bg-phy-glass p-3">当前筛选下暂无历史记录</div>
                            )}
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default TranslationChallengeView;
