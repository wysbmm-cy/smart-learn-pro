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
import { generateTranslationChallenge, gradeTranslation, checkTranslationComponents } from '../services/ai';
import { getTodayNotesFolderName } from '../utils/noteFolders';
import { readTranslationLinkedExamples, normalizeKnowledgeLinkingSettings } from '../utils/knowledgeLinking';

const LS_FILTERS = 'translation_history_filters';
const LS_FEEDBACK_COLLAPSED = 'translation_feedback_collapsed';
const LS_SHORTCUTS_ENABLED = 'translation_keyboard_shortcuts_enabled';
const LS_EXAMPLES_PANEL_COLLAPSED = 'translation_examples_panel_collapsed';
const LS_EXAMPLES_AUTO_PICK = 'translation_examples_auto_pick';
const LS_EXAMPLES_PER_TASK_COUNT = 'translation_examples_per_task_count';

const DEFAULT_EXAMPLES_PER_TASK = 3;
const GENERATION_EXAMPLE_CAP = 6;
const MIN_TOKEN_LEN = 2;
const ENGLISH_STOPWORDS = new Set([
    'the', 'and', 'for', 'are', 'with', 'that', 'this', 'from', 'into', 'your', 'have', 'will', 'been',
    'were', 'was', 'their', 'they', 'them', 'then', 'than', 'about', 'because', 'while', 'when', 'where',
    'which', 'what', 'who', 'whom', 'whose', 'how', 'why', 'can', 'could', 'should', 'would', 'might',
    'there', 'here', 'also', 'just', 'very', 'more', 'most', 'such', 'much', 'many', 'some', 'any', 'our',
    'you', 'we', 'i', 'he', 'she', 'it', 'is', 'am', 'be', 'to', 'of', 'in', 'on', 'at', 'by', 'as', 'or',
    'if', 'an', 'a'
]);

const SCENARIO_KEYWORD_MAP = {
    email: ['email', 'mail', 'subject', 'dear', 'regards', 'schedule', 'meeting', 'follow-up', '回复', '邮件'],
    dialogue: ['dialogue', 'conversation', 'talk', 'chat', 'speak', 'say', 'reply', 'ask', '对话', '交流'],
    classroom: ['classroom', 'teacher', 'student', 'course', 'lecture', 'assignment', 'class', '课堂', '教学'],
    workplace: ['workplace', 'team', 'project', 'deadline', 'manager', 'client', 'report', '职场', '协作'],
    travel: ['travel', 'trip', 'airport', 'hotel', 'ticket', 'boarding', 'tour', '旅行', '出行'],
    social: ['social', 'media', 'post', 'comment', 'share', 'feed', 'platform', '社交', '媒体']
};

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

const SCENARIO_OPTIONS = [
    { value: 'email', label: '邮件沟通' },
    { value: 'dialogue', label: '日常对话' },
    { value: 'classroom', label: '课堂讨论' },
    { value: 'workplace', label: '职场协作' },
    { value: 'travel', label: '旅行沟通' },
    { value: 'social', label: '社交媒体' }
];

const STAGE = {
    setup: '设置',
    answer: '作答',
    feedback: '反馈',
    rewrite: '二次重译',
    settlement: '结算'
};

const ISSUE_TAGS = ['词义错', '语法错', '逻辑错', '漏译'];
const WEAKNESS_KEYS = ['logic_omission', 'target_usage', 'naturalness', 'literal_translation', 'grammar_collocation'];
const WEAKNESS_LABEL = {
    logic_omission: '逻辑关系漏译',
    target_usage: '目标词会认不会用',
    naturalness: '表达不自然',
    literal_translation: '直译倾向',
    grammar_collocation: '冠词/搭配问题'
};
const SELF_CHECK_LIST = [
    { key: 'complete', label: '信息是否完整（人物/动作/结果）' },
    { key: 'logic', label: '逻辑关系是否清晰（因果/转折/递进）' },
    { key: 'register', label: '语气是否符合场景（正式/中性/口语）' }
];
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
    , scaffold: item.scaffold || null
    }));
    const main = challenge.mainTask
        ? [{
            id: challenge.mainTask.id || 'main-task',
            type: challenge.mainTask.type || 'main',
            chinese: String(challenge.mainTask.chinese || ''),
            hint: String(challenge.mainTask.hint || ''),
            scenario: String(challenge.mainTask.scenario || ''),
            targetWords: Array.isArray(challenge.mainTask.targetWords) ? challenge.mainTask.targetWords : []
        , scaffold: challenge.mainTask.scaffold || null
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
        acceptance: raw?.acceptance !== false,
        action_plan: Array.isArray(raw?.action_plan) ? raw.action_plan : [],
        subscores: raw?.subscores || {},
        vocab_hit,
        hitCount,
        requiredMinHit: Number(raw?.requiredMinHit || requiredMinHit || 0)
    };
};

const parseIssueWeakness = (issue) => {
    const text = `${String(issue?.type || '').toLowerCase()} ${String(issue?.reason || '').toLowerCase()}`;
    const bucket = [];
    if (/logic|coherence|连接|逻辑|漏译|omit|missing/.test(text)) bucket.push('logic_omission');
    if (/target|vocab|word|词汇|词义/.test(text)) bucket.push('target_usage');
    if (/natural|fluency|地道|自然|表达/.test(text)) bucket.push('naturalness');
    if (/literal|直译/.test(text)) bucket.push('literal_translation');
    if (/grammar|article|collocation|搭配|语法|冠词/.test(text)) bucket.push('grammar_collocation');
    return bucket.length ? bucket : ['target_usage'];
};

const summarizeWeakness = (logs = []) => {
    const now = Date.now();
    const recent7d = now - 7 * 24 * 60 * 60 * 1000;
    const latest3Ids = new Set(
        [...logs]
            .sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0))
            .slice(0, 3)
            .map((x) => String(x?.id || x?.challengeId || x?.createdAt))
    );
    const scoreMap = new Map(WEAKNESS_KEYS.map((key) => [key, 0]));

    logs.forEach((log) => {
        const id = String(log?.id || log?.challengeId || log?.createdAt);
        const ts = Number(log?.createdAt || 0);
        const weight = (ts >= recent7d ? 1 : 0) + (latest3Ids.has(id) ? 1.5 : 0.6);
        const rows = getLatestRows(log);

        rows.forEach((row) => {
            (row?.issues || []).forEach((issue) => {
                parseIssueWeakness(issue).forEach((key) => scoreMap.set(key, (scoreMap.get(key) || 0) + weight));
            });
            const hit = Number(row?.hitCount || 0);
            const req = Number(row?.requiredMinHit || 0);
            if (req > 0 && hit < req) {
                scoreMap.set('target_usage', (scoreMap.get('target_usage') || 0) + weight * 1.2);
            }
            const ss = row?.subscores || {};
            if (Number(ss?.naturalness || 0) < 70) {
                scoreMap.set('naturalness', (scoreMap.get('naturalness') || 0) + weight * 0.8);
            }
            if (Number(ss?.grammar || 0) < 70) {
                scoreMap.set('grammar_collocation', (scoreMap.get('grammar_collocation') || 0) + weight * 0.8);
            }
        });
    });

    return Array.from(scoreMap.entries())
        .map(([key, score]) => ({ key, label: WEAKNESS_LABEL[key], score: Number(score.toFixed(2)) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
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

const tokenizeText = (text) => {
    const raw = String(text || '').toLowerCase();
    const englishTokens = raw.match(/[a-z]{2,}/g) || [];
    const chineseTokens = raw.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    return [...englishTokens, ...chineseTokens]
        .map((x) => x.trim())
        .filter((x) => x.length >= MIN_TOKEN_LEN && !ENGLISH_STOPWORDS.has(x));
};

const getScenarioKeywords = (taskScenario = '', scenarioLock = '') => {
    const scenarioText = String(taskScenario || '').toLowerCase();
    const keyByLock = String(scenarioLock || '').toLowerCase();
    if (keyByLock && SCENARIO_KEYWORD_MAP[keyByLock]) {
        return SCENARIO_KEYWORD_MAP[keyByLock];
    }
    const found = Object.entries(SCENARIO_KEYWORD_MAP).find(([key]) => scenarioText.includes(key));
    return found ? found[1] : [];
};

const scoreExampleForTask = (task, example, scenarioLock = '') => {
    const taskTokens = tokenizeText(`${task?.chinese || ''} ${task?.hint || ''} ${(task?.targetWords || []).join(' ')}`);
    const exampleTokens = tokenizeText(example?.text || '');
    const taskSet = new Set(taskTokens);
    const overlap = exampleTokens.reduce((count, token) => count + (taskSet.has(token) ? 1 : 0), 0);

    const scenarioKeywords = getScenarioKeywords(task?.scenario, scenarioLock);
    const exampleText = String(example?.text || '').toLowerCase();
    const scenarioBonus = scenarioKeywords.some((kw) => exampleText.includes(String(kw).toLowerCase())) ? 2 : 0;
    const recencyBonus = Number(example?.updatedAt || 0) > 0 ? Math.min(1, (Date.now() - Number(example.updatedAt)) < 7 * 24 * 3600 * 1000 ? 1 : 0.4) : 0;

    return overlap * 3 + scenarioBonus + recencyBonus;
};

const uniqueByHash = (items = []) => {
    const map = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
        const key = String(item?.sourceHash || item?.text || '').trim();
        if (!key || map.has(key)) return;
        map.set(key, item);
    });
    return Array.from(map.values());
};

const pickByCursor = (ranked = [], cursor = 0, count = DEFAULT_EXAMPLES_PER_TASK) => {
    const list = uniqueByHash(ranked);
    if (!list.length) return [];
    if (list.length <= count) return list;

    const normalizedCursor = Math.max(0, Number(cursor || 0));
    const start = (normalizedCursor * count) % list.length;
    const result = [];
    for (let i = 0; i < list.length && result.length < count; i += 1) {
        const item = list[(start + i) % list.length];
        if (!result.some((x) => x.sourceHash === item.sourceHash)) {
            result.push(item);
        }
    }
    return result;
};

const buildTaskExampleMaps = (tasks = [], pool = [], count = DEFAULT_EXAMPLES_PER_TASK, scenarioLock = '') => {
    const rankedMap = {};
    const selectedMap = {};
    const cursorMap = {};
    let previousHashes = new Set();
    const safePool = uniqueByHash(pool);

    (Array.isArray(tasks) ? tasks : []).forEach((task) => {
        const ranked = safePool
            .map((example) => ({ ...example, __score: scoreExampleForTask(task, example, scenarioLock) }))
            .sort((a, b) => {
                if (b.__score !== a.__score) return b.__score - a.__score;
                return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
            });
        const rankedClean = ranked.map(({ __score, ...rest }) => rest);
        rankedMap[task.id] = rankedClean;
        cursorMap[task.id] = 0;

        const preferred = rankedClean.filter((x) => !previousHashes.has(x.sourceHash));
        const selected = (preferred.length >= count ? preferred : rankedClean).slice(0, count);
        selectedMap[task.id] = selected;
        previousHashes = new Set(selected.map((x) => x.sourceHash));
    });

    return { rankedMap, selectedMap, cursorMap };
};

const pickGenerationExamples = (pool = [], scenarioLock = '', cap = GENERATION_EXAMPLE_CAP) => {
    const safePool = uniqueByHash(pool);
    const scenarioKeywords = getScenarioKeywords(scenarioLock, scenarioLock);
    const ranked = safePool
        .map((item) => {
            const text = String(item?.text || '').toLowerCase();
            const scenarioBonus = scenarioKeywords.some((kw) => text.includes(String(kw).toLowerCase())) ? 2 : 0;
            const tokenCount = tokenizeText(item?.text || '').length;
            const recencyBonus = Number(item?.updatedAt || 0) > 0 ? (Date.now() - Number(item.updatedAt) < 7 * 24 * 3600 * 1000 ? 1 : 0.3) : 0;
            return { item, score: scenarioBonus + Math.min(2, tokenCount / 8) + recencyBonus };
        })
        .sort((a, b) => b.score - a.score || Number(b.item?.updatedAt || 0) - Number(a.item?.updatedAt || 0))
        .slice(0, Math.max(1, cap));
    return ranked.map((x) => String(x.item?.text || '').trim()).filter(Boolean);
};

const buildExampleHitSummary = (examples = [], answerText = '') => {
    const answerTokens = new Set(tokenizeText(answerText));
    return (Array.isArray(examples) ? examples : []).map((example) => {
        const candidateTokens = tokenizeText(example?.text || '').filter((x) => x.length >= 4).slice(0, 12);
        const matched = candidateTokens.filter((token) => answerTokens.has(token));
        const hit = matched.length >= 2 || (candidateTokens.length > 0 && matched.length / candidateTokens.length >= 0.35);
        return {
            ...example,
            hit,
            matched: matched.slice(0, 4)
        };
    });
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
    const linkingConfig = normalizeKnowledgeLinkingSettings(settings?.knowledgeLinking);

    const [difficulty, setDifficulty] = useState('medium');
    const [scenarioMode, setScenarioMode] = useState('auto');
    const [scenarioLock, setScenarioLock] = useState('workplace');
    const [challenge, setChallenge] = useState(null);
    const [stage, setStage] = useState('setup');
    const [index, setIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [results, setResults] = useState({});
    const [draftOneSnapshots, setDraftOneSnapshots] = useState({});
    const [hintLayers, setHintLayers] = useState({});
    const [selfChecks, setSelfChecks] = useState({});
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
    const [useLinkedExamples, setUseLinkedExamples] = useState(
        Boolean(linkingConfig.enabled && linkingConfig.rules.examplesToTranslation)
    );
    const [examplesPanelCollapsed, setExamplesPanelCollapsed] = useState(() => readBool(LS_EXAMPLES_PANEL_COLLAPSED, true));
    const [exampleAutoPick] = useState(() => readBool(LS_EXAMPLES_AUTO_PICK, true));
    const [examplesPerTask] = useState(() => {
        const raw = Number(localStorage.getItem(LS_EXAMPLES_PER_TASK_COUNT) || DEFAULT_EXAMPLES_PER_TASK);
        return clamp(Number.isFinite(raw) ? raw : DEFAULT_EXAMPLES_PER_TASK, 1, 5);
    });
    const [selectedExamplesByTaskId, setSelectedExamplesByTaskId] = useState({});
    const [rankedExamplesByTaskId, setRankedExamplesByTaskId] = useState({});
    const [examplePickCursorByTaskId, setExamplePickCursorByTaskId] = useState({});

    // Scaffolded Translation States
    const [practiceMode, setPracticeMode] = useState('full'); // 'full' | 'scaffolded'
    const [subStage, setSubStage] = useState('phrases'); // 'phrases' | 'cloze' | 'full'
    const [scaffoldAnswers, setScaffoldAnswers] = useState({});
    const [scaffoldFeedback, setScaffoldFeedback] = useState({});
    const [checkingSubStep, setCheckingSubStep] = useState(false);

    const tasks = useMemo(() => buildTasks(challenge), [challenge]);
    const currentTask = tasks[index] || null;
    const currentRows = currentTask ? (results[currentTask.id] || []) : [];
    const latest = currentRows.length ? currentRows[currentRows.length - 1] : null;
    const currentAnswer = currentTask ? (answers[currentTask.id] || '') : '';
    const currentDraftOne = currentTask ? (draftOneSnapshots[currentTask.id] || null) : null;
    const currentHintLayer = currentTask ? Number(hintLayers[currentTask.id] || 0) : 0;
    const currentSelfCheck = currentTask ? (selfChecks[currentTask.id] || {}) : {};
    const allSelfChecksDone = SELF_CHECK_LIST.every((item) => Boolean(currentSelfCheck[item.key]));
    const activeTargetWords = useMemo(
        () => (currentTask?.targetWords || challenge?.targetWords || []).filter(Boolean),
        [currentTask, challenge]
    );
    const [linkedExamplesCache, setLinkedExamplesCache] = useState(() => readTranslationLinkedExamples());
    const linkedExamples = useMemo(
        () => (linkedExamplesCache || []).map((x) => x.text).filter(Boolean),
        [linkedExamplesCache]
    );
    const linkedExampleCount = linkedExamples.length;
    const currentTaskExamples = useMemo(
        () => currentTask ? (selectedExamplesByTaskId[currentTask.id] || []) : [],
        [currentTask, selectedExamplesByTaskId]
    );
    const currentTaskRankedExamples = useMemo(
        () => currentTask ? (rankedExamplesByTaskId[currentTask.id] || []) : [],
        [currentTask, rankedExamplesByTaskId]
    );
    const currentExampleHitSummary = useMemo(
        () => buildExampleHitSummary(currentTaskExamples, latest?.userTranslation || ''),
        [currentTaskExamples, latest?.userTranslation]
    );
    const effectiveHintTiers = useMemo(() => {
        const fallbackL1 = [String(currentTask?.hint || '').trim() || '先确认语义是否完整。'];
        const tiers = challenge?.hintTiers || {};
        return {
            l1: Array.isArray(tiers?.l1) && tiers.l1.length ? tiers.l1 : fallbackL1,
            l2: Array.isArray(tiers?.l2) && tiers.l2.length ? tiers.l2 : ['检查逻辑连接词、时态和主谓一致。'],
            l3: Array.isArray(tiers?.l3) && tiers.l3.length ? tiers.l3 : ['对照场景语气，做一次压缩与润色。']
        };
    }, [challenge, currentTask]);

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

    useEffect(() => {
        localStorage.setItem(LS_EXAMPLES_PANEL_COLLAPSED, String(examplesPanelCollapsed));
    }, [examplesPanelCollapsed]);

    useEffect(() => {
        localStorage.setItem(LS_EXAMPLES_AUTO_PICK, String(exampleAutoPick));
        localStorage.setItem(LS_EXAMPLES_PER_TASK_COUNT, String(examplesPerTask));
    }, [exampleAutoPick, examplesPerTask]);

    useEffect(() => {
        setUseLinkedExamples(Boolean(linkingConfig.enabled && linkingConfig.rules.examplesToTranslation));
    }, [linkingConfig.enabled, linkingConfig.rules.examplesToTranslation]);

    useEffect(() => {
        const reload = () => setLinkedExamplesCache(readTranslationLinkedExamples());
        reload();
        window.addEventListener('focus', reload);
        return () => window.removeEventListener('focus', reload);
    }, []);

    useEffect(() => {
        if (!challenge || !tasks.length || !useLinkedExamples || !exampleAutoPick || !linkedExamplesCache.length) {
            setSelectedExamplesByTaskId({});
            setRankedExamplesByTaskId({});
            setExamplePickCursorByTaskId({});
            return;
        }
        const { rankedMap, selectedMap, cursorMap } = buildTaskExampleMaps(tasks, linkedExamplesCache, examplesPerTask, scenarioLock);
        setRankedExamplesByTaskId(rankedMap);
        setSelectedExamplesByTaskId(selectedMap);
        setExamplePickCursorByTaskId(cursorMap);
    }, [challenge, tasks, useLinkedExamples, exampleAutoPick, linkedExamplesCache, examplesPerTask, scenarioLock]);

    const issueTagPool = useMemo(() => {
        const map = new Map();
        logs.forEach((log) => {
            getIssueStats(log).forEach((x) => map.set(x.tag, (map.get(x.tag) || 0) + x.count));
        });
        return Array.from(map.keys());
    }, [logs]);
    const weaknessTrend = useMemo(() => summarizeWeakness(logs), [logs]);

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
            scenarioProfile: challenge?.scenarioProfile || null,
            issueBuckets: getIssueStats({ itemResults }),
            rounds: itemResults.map((x) => ({
                taskId: x.task?.id,
                round1: draftOneSnapshots?.[x.task?.id] || null,
                round2: x.latest || null
            })),
            weaknessSnapshot: summarizeWeakness([{
                id: `current-${Date.now()}`,
                createdAt: Date.now(),
                itemResults
            }]).slice(0, 5),
            itemResults
        };
    };

    const resetRuntime = () => {
        setStage('setup');
        setIndex(0);
        setAnswers({});
        setResults({});
        setDraftOneSnapshots({});
        setHintLayers({});
        setSelfChecks({});
        setSummary(null);
        setLinks({ flashcards: false, notes: false });
        setLogSaved(false);
        setSelectedExamplesByTaskId({});
        setRankedExamplesByTaskId({});
        setExamplePickCursorByTaskId({});
    };

    const startChallenge = async (preset = null, runtimeOptions = {}) => {
        setLoadingGen(true);
        try {
            const linkedPool = useLinkedExamples ? readTranslationLinkedExamples() : [];
            const latestLinkedExamples = useLinkedExamples
                ? (
                    exampleAutoPick
                        ? pickGenerationExamples(
                            linkedPool,
                            scenarioMode === 'lock' ? scenarioLock : '',
                            GENERATION_EXAMPLE_CAP
                        )
                        : linkedPool.map((x) => x.text).filter(Boolean)
                )
                : [];
            if (useLinkedExamples) {
                setLinkedExamplesCache(linkedPool);
            }
            const allCards = await getFlashcards();
            
            // Prioritize unfamiliar words (last two categories: Critical & Weak)
            const getScore = (c) => {
                try { return getEffectiveWeaknessScore(c); } catch(e) { return 0; }
            };

            const p1 = allCards.filter(c => getScore(c) >= 10); // 需强化 & 较弱
            const p2 = allCards.filter(c => getScore(c) >= 5 && getScore(c) < 10); // 一般
            const others = allCards.filter(c => getScore(c) < 5);

            // Create a pool of up to 40 cards, prioritizing p1 then p2
            const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
            let pool = [];
            
            if (p1.length >= 20) {
                pool = shuffle(p1).slice(0, 40);
            } else if (p1.length + p2.length >= 10) {
                pool = [...p1, ...shuffle(p2)].slice(0, 40);
            } else {
                pool = [...p1, ...p2, ...shuffle(others)].slice(0, 40);
            }

            // Fallback to allCards if pool is empty for some reason
            const finalVocab = pool.length > 0 ? pool : allCards;

            const generated = preset || await generateTranslationChallenge(finalVocab, settings, {
                difficulty,
                mode: 'mixed',
                scenarioMode,
                scenarioLock,
                weaknessFocus: Array.isArray(runtimeOptions?.weaknessFocus) ? runtimeOptions.weaknessFocus : [],
                linkedExamples: latestLinkedExamples
            });
            setChallenge(generated);
            setDifficulty(normalizeDifficulty(generated?.difficulty || difficulty));
            setIndex(0);
            setAnswers({});
            setResults({});
            setDraftOneSnapshots({});
            setHintLayers({});
            setSelfChecks({});
            setSubStage('phrases');
            setScaffoldAnswers({});
            setScaffoldFeedback({});
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
            const isFirstRound = stage === 'answer';
            const raw = await gradeTranslation(currentTask, text, settings, {
                requiredMinHit: Number(challenge?.requiredMinHit || 0),
                difficulty: challenge?.difficulty || difficulty,
                mode: 'mixed',
                round: isFirstRound ? 'draft1' : 'draft2'
            });
            const graded = normalizeGrade(raw, challenge?.requiredMinHit);
            if (isFirstRound) {
                setDraftOneSnapshots((prev) => ({
                    ...prev,
                    [currentTask.id]: {
                        ...graded,
                        userTranslation: text,
                        createdAt: Date.now()
                    }
                }));
                setHintLayers((prev) => ({ ...prev, [currentTask.id]: Math.max(1, Number(prev?.[currentTask.id] || 0)) }));
                setStage('rewrite');
                setLogSaved(false);
                toast.success('初稿已记录，请查看分层提示后完成二稿');
                return;
            }

            const draftOne = draftOneSnapshots?.[currentTask.id] || null;
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
                            draft1: draftOne,
                            revisionGain100: graded.score100 - Number(draftOne?.score100 || 0),
                            revisionGain15: graded.score15 - Number(draftOne?.score15 || 0),
                            createdAt: Date.now()
                        }
                    ]
                };
            });
            setStage('feedback');
            setLogSaved(false);
            toast.success(graded.pass ? '二稿通过，可进入下一题' : '已生成反馈，可继续优化');
        } catch (e) {
            toast.error(`评分失败：${e?.message || '未知错误'}`);
        } finally {
            setLoadingScore(false);
        }
    };

    
    const checkSubStep = async (type, originalText, inputKey) => {
        const input = String(scaffoldAnswers[inputKey] || '').trim();
        if (!input) {
            toast.error('请输入内容');
            return;
        }
        setCheckingSubStep(true);
        try {
            const result = await checkTranslationComponents(type, {
                chinese: currentTask.chinese,
                originalText: originalText
            }, input, settings);
            
            setScaffoldFeedback(prev => ({
                ...prev,
                [inputKey]: result
            }));
            
            if (result.isCorrect) {
                toast.success(result.feedback || '回答正确！');
            } else {
                toast.error(result.feedback || '再想想看？');
            }
        } catch (e) {
            toast.error(`检查失败：${e?.message || '未知错误'}`);
        } finally {
            setCheckingSubStep(false);
        }
    };

    const handleNextSubStage = () => {
        if (subStage === 'phrases') setSubStage('cloze');
        else if (subStage === 'cloze') {
            // Pre-fill the final answer area if it's empty
            if (!currentAnswer) {
                // Try to use the cloze correctly filled version or just let the user type
                // For now, just advance
            }
            setSubStage('full');
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
        setSubStage('phrases');
        setScaffoldAnswers({});
        setScaffoldFeedback({});
    };

    const unlockHintTier = (tier = 1) => {
        if (!currentTask) return;
        setHintLayers((prev) => ({
            ...prev,
            [currentTask.id]: Math.max(Number(prev?.[currentTask.id] || 0), tier)
        }));
    };

    const toggleSelfCheck = (key) => {
        if (!currentTask) return;
        setSelfChecks((prev) => ({
            ...prev,
            [currentTask.id]: {
                ...(prev?.[currentTask.id] || {}),
                [key]: !prev?.[currentTask.id]?.[key]
            }
        }));
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
            rounds: s.rounds,
            weaknessSnapshot: s.weaknessSnapshot,
            issueBuckets: s.issueBuckets,
            scenarioProfile: s.scenarioProfile,
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

    const generateTargetedChallenge = async () => {
        const currentSummary = summary || (stage === 'settlement' ? buildSummary() : null);
        const focusBase = currentSummary
            ? summarizeWeakness([...logs, { id: `current-${Date.now()}`, createdAt: Date.now(), itemResults: currentSummary.itemResults }])
            : weaknessTrend;
        const focusTags = focusBase.slice(0, 3).map((item) => item.key);
        await startChallenge(null, { weaknessFocus: focusTags });
        if (focusTags.length) {
            toast.success(`已生成针对练：${focusTags.map((x) => WEAKNESS_LABEL[x]).filter(Boolean).join('、')}`);
        } else {
            toast.success('已生成通用针对练');
        }
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

    const rotateCurrentTaskExamples = (goToRewrite = false) => {
        if (!currentTask) return;
        const ranked = currentTaskRankedExamples;
        const current = currentTaskExamples;
        if (!ranked.length || ranked.length <= current.length) {
            toast('当前题目没有更多可切换的例句');
            return;
        }

        const currentCursor = Number(examplePickCursorByTaskId[currentTask.id] || 0);
        const nextCursor = currentCursor + 1;
        const nextPick = pickByCursor(ranked, nextCursor, examplesPerTask);

        const unchanged = nextPick.length === current.length
            && nextPick.every((item, idx) => item?.sourceHash === current[idx]?.sourceHash);
        if (unchanged) {
            toast('例句组合已切换到末尾');
            return;
        }

        setExamplePickCursorByTaskId((prev) => ({ ...prev, [currentTask.id]: nextCursor }));
        setSelectedExamplesByTaskId((prev) => ({ ...prev, [currentTask.id]: nextPick }));
        if (goToRewrite) {
            setStage('rewrite');
        }
        toast.success(goToRewrite ? '已换一组例句，进入再译' : '已换一组例句');
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
    const settlementData = summary || buildSummary();
    const avgRevisionGain100 = Math.round(
        ((settlementData.rounds || []).reduce(
            (sum, x) => sum + (Number(x?.round2?.score100 || 0) - Number(x?.round1?.score100 || 0)),
            0
        )) / Math.max(1, (settlementData.rounds || []).length)
    );

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
                            <p className="text-sm text-phy-muted mt-1">教练化两轮：初稿 → 分层提示 → 二稿评分（全端一致）。</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="px-3 py-2 rounded-xl bg-phy-bg border border-phy-border text-sm text-phy-text">
                                {DIFFICULTIES.map((x) => (
                                    <option key={x.value} value={x.value}>{x.label} · {x.desc}</option>
                                ))}
                            </select>
                            <select value={scenarioMode} onChange={(e) => setScenarioMode(e.target.value)} className="px-3 py-2 rounded-xl bg-phy-bg border border-phy-border text-sm text-phy-text">
                                <option value="auto">场景：自动轮换</option>
                                <option value="lock">场景：手动锁定</option>
                            </select>
                            {scenarioMode === 'lock' ? (
                                <select value={scenarioLock} onChange={(e) => setScenarioLock(e.target.value)} className="px-3 py-2 rounded-xl bg-phy-bg border border-phy-border text-sm text-phy-text">
                                    {SCENARIO_OPTIONS.map((x) => (
                                        <option key={x.value} value={x.value}>{x.label}</option>
                                    ))}
                                </select>
                            ) : null}
                            <div className="flex rounded-xl bg-phy-glass border border-phy-border p-0.5">
                                <button onClick={() => setPracticeMode('full')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${practiceMode === 'full' ? 'bg-indigo-600 text-white shadow-lg' : 'text-phy-muted hover:text-phy-text'}`}>全句模式</button>
                                <button onClick={() => setPracticeMode('scaffolded')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${practiceMode === 'scaffolded' ? 'bg-indigo-600 text-white shadow-lg' : 'text-phy-muted hover:text-phy-text'}`}>阶梯模式</button>
                            </div>
                            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-phy-border bg-phy-glass text-xs text-phy-text">
                                <input
                                    type="checkbox"
                                    className="accent-indigo-500"
                                    checked={useLinkedExamples}
                                    onChange={(e) => setUseLinkedExamples(e.target.checked)}
                                />
                                <span>纳入深度笔记例句</span>
                                <span className="text-phy-muted">({linkedExampleCount})</span>
                            </label>
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
                    {challenge?.progression ? (
                        <div className="mt-3 rounded-xl border border-indigo-400/25 bg-indigo-500/10 p-3">
                            <div className="text-xs font-semibold text-indigo-100">任务线递进说明</div>
                            <div className="mt-1 text-xs text-indigo-100/90">热身目标：{challenge.progression.warmupGoal}</div>
                            <div className="mt-1 text-xs text-indigo-100/90">衔接动作：{challenge.progression.bridge}</div>
                            <div className="mt-1 text-xs text-indigo-100/90">主任务目标：{challenge.progression.mainGoal}</div>
                        </div>
                    ) : null}
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
                                        {challenge?.scenarioProfile?.label ? (
                                            <span className="text-xs text-indigo-200 border border-indigo-400/30 bg-indigo-500/10 rounded-md px-2 py-1">
                                                场景：{challenge.scenarioProfile.label}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="space-y-4 md:min-h-0 md:overflow-y-auto custom-scrollbar md:pr-1">
                                    <div className="glass-panel rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4">
                                        <div className="text-xs text-amber-200/80">题干（中文）</div>
                                        <div className="mt-2 text-sm text-amber-100 whitespace-pre-wrap leading-relaxed">{currentTask.chinese}</div>
                                        {currentTask.hint ? <div className="mt-2 text-xs text-amber-200/80">提示：{currentTask.hint}</div> : null}
                                        <div className="mt-2 text-xs text-amber-100/80">目标词：{activeTargetWords.join(' / ') || '无'}</div>
                                        {useLinkedExamples ? (
                                            <div className="mt-3 rounded-lg border border-indigo-300/25 bg-indigo-500/10 p-2.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setExamplesPanelCollapsed((v) => !v)}
                                                    className="w-full inline-flex items-center justify-between gap-2 text-left"
                                                >
                                                    <span className="text-xs font-semibold text-indigo-100">
                                                        本题已纳入深度笔记例句（{currentTaskExamples.length}）
                                                    </span>
                                                    <span className="inline-flex items-center gap-1 text-[11px] text-indigo-200/90">
                                                        {examplesPanelCollapsed ? '展开' : '收起'}
                                                        {examplesPanelCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                                                    </span>
                                                </button>

                                                {!examplesPanelCollapsed ? (
                                                    <div className="mt-2 space-y-2">
                                                        {currentTaskExamples.length ? (
                                                            currentTaskExamples.map((item, idx) => (
                                                                <div key={item.sourceHash || `${item.sourceNoteId}-${idx}`} className="rounded-md border border-indigo-300/20 bg-black/10 px-2.5 py-2">
                                                                    <div className="text-xs text-indigo-100 whitespace-pre-wrap break-words leading-relaxed">{idx + 1}. {item.text}</div>
                                                                    <div className="mt-1 text-[11px] text-indigo-200/75">
                                                                        来源：{item.sourceNoteTitle || '深度笔记'}{item.sourceSection ? ` · ${item.sourceSection}` : ''}
                                                                    </div>
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="text-xs text-indigo-200/85">
                                                                当前没有可纳入的深度笔记例句。请先在深度笔记中写“例句/Examples”块并保存。
                                                            </div>
                                                        )}
                                                        {currentTaskRankedExamples.length > currentTaskExamples.length ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => rotateCurrentTaskExamples(false)}
                                                                className="px-2.5 py-1.5 rounded-md border border-indigo-300/30 bg-indigo-500/20 text-indigo-100 text-[11px] font-bold"
                                                            >
                                                                换一组例句
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>

                                    
                                    <div className="glass-panel rounded-2xl border border-phy-border p-4">
                                        {practiceMode === 'scaffolded' && subStage !== 'full' ? (
                                            <div className="space-y-6">
                                                {/* Sub-stage tabs */}
                                                <div className="flex items-center gap-2 border-b border-phy-border pb-3">
                                                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${subStage === 'phrases' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30' : 'bg-phy-glass text-phy-muted border border-phy-border'}`}>1. 核心短语</div>
                                                    <div className={`w-4 h-px bg-phy-border`} />
                                                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${subStage === 'cloze' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30' : 'bg-phy-glass text-phy-muted border border-phy-border'}`}>2. 完形填空</div>
                                                    <div className={`w-4 h-px bg-phy-border`} />
                                                    <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${subStage === 'full' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30' : 'bg-phy-glass text-phy-muted border border-phy-border'}`}>3. 全句翻译</div>
                                                </div>

                                                {subStage === 'phrases' && (
                                                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
                                                        {(currentTask.scaffold?.phrases || []).map((p, i) => (
                                                            <div key={i} className="space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <label className="text-xs text-phy-muted">短语 {i + 1}：{p.cn}</label>
                                                                    {scaffoldFeedback[`p${i}`] && (
                                                                        <span className={`text-[10px] font-bold ${scaffoldFeedback[`p${i}`].isCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                            {scaffoldFeedback[`p${i}`].isCorrect ? '√ 正确' : '× 建议参考'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <input 
                                                                        type="text"
                                                                        value={scaffoldAnswers[`p${i}`] || ''}
                                                                        onChange={(e) => setScaffoldAnswers(prev => ({...prev, [`p${i}`]: e.target.value}))}
                                                                        className="flex-1 rounded-lg border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text"
                                                                        placeholder="输入对应英文短语..."
                                                                    />
                                                                    <button 
                                                                        onClick={() => checkSubStep('phrases', p.en, `p${i}`)}
                                                                        disabled={checkingSubStep}
                                                                        className="px-3 py-2 rounded-lg bg-phy-glass border border-phy-border text-phy-text text-xs hover:bg-phy-bg transition-colors"
                                                                    >
                                                                        {checkingSubStep ? <Loader2 size={12} className="animate-spin" /> : '核对'}
                                                                    </button>
                                                                </div>
                                                                {scaffoldFeedback[`p${i}`] && !scaffoldFeedback[`p${i}`].isCorrect && (
                                                                    <div className="text-[11px] text-amber-200 bg-amber-500/10 p-2 rounded-lg border border-amber-400/20">
                                                                        建议：{scaffoldFeedback[`p${i}`].suggestion}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                        <button 
                                                            onClick={handleNextSubStage}
                                                            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-500/20 transition-all"
                                                        >
                                                            下一步：进入完形填空
                                                        </button>
                                                    </div>
                                                )}

                                                {subStage === 'cloze' && (
                                                    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2">
                                                        <div className="space-y-3">
                                                            <div className="text-xs text-phy-muted">补充完整句子：</div>
                                                            <div className="p-4 rounded-xl border border-phy-border bg-phy-glass text-sm text-phy-text leading-relaxed">
                                                                {currentTask.scaffold?.cloze || 'AI未能生成填空模板，请直接进行全句翻译。'}
                                                            </div>
                                                            <div className="flex flex-col gap-2">
                                                                <textarea 
                                                                    value={scaffoldAnswers['cloze'] || ''}
                                                                    onChange={(e) => setScaffoldAnswers(prev => ({...prev, 'cloze': e.target.value}))}
                                                                    className="w-full rounded-xl border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text min-h-[100px]"
                                                                    placeholder="在此填补空缺部分或完整复写句子..."
                                                                />
                                                                <button 
                                                                    onClick={() => checkSubStep('cloze', currentTask.scaffold?.cloze, 'cloze')}
                                                                    disabled={checkingSubStep}
                                                                    className="w-full py-2 rounded-lg bg-phy-glass border border-phy-border text-phy-text text-xs hover:bg-phy-bg transition-colors inline-flex items-center justify-center gap-2"
                                                                >
                                                                    {checkingSubStep ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                                                    {checkingSubStep ? 'AI 检查中...' : '提交这一步'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {scaffoldFeedback['cloze'] && (
                                                            <div className={`p-3 rounded-xl border ${scaffoldFeedback['cloze'].isCorrect ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-amber-400/30 bg-amber-500/10'}`}>
                                                                <div className={`text-xs font-bold ${scaffoldFeedback['cloze'].isCorrect ? 'text-emerald-300' : 'text-amber-200'}`}>反馈：</div>
                                                                <p className="text-sm mt-1 text-phy-text">{scaffoldFeedback['cloze'].feedback}</p>
                                                                {!scaffoldFeedback['cloze'].isCorrect && (
                                                                    <p className="text-[11px] mt-2 text-phy-muted border-t border-phy-border pt-2 italic">参考：{scaffoldFeedback['cloze'].suggestion}</p>
                                                                )}
                                                            </div>
                                                        )}
                                                        <button 
                                                            onClick={() => setSubStage('full')}
                                                            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-500/20"
                                                        >
                                                            下一步：通关全句翻译
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center justify-between gap-2">
                                                    <label className="text-xs text-phy-muted">{stage === 'rewrite' ? '二稿译文（基于提示修订）' : '初稿译文'}</label>
                                                    <span className="text-xs text-phy-muted">Ctrl/Cmd + Enter 提交</span>
                                                </div>
                                                {currentDraftOne ? (
                                                    <div className="mt-2 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                                                        初稿基线：{currentDraftOne.score100}/100 · {currentDraftOne.score15}/15
                                                    </div>
                                                ) : null}
                                                {stage === 'rewrite' ? (
                                                    <div className="mt-2 rounded-lg border border-indigo-400/25 bg-indigo-500/10 p-3 space-y-3">
                                                        <div className="text-xs font-semibold text-indigo-100">自检清单（建议先完成）</div>
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                                            {SELF_CHECK_LIST.map((item) => (
                                                                <label key={item.key} className="inline-flex items-center gap-2 text-xs text-indigo-100/90">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={Boolean(currentSelfCheck[item.key])}
                                                                        onChange={() => toggleSelfCheck(item.key)}
                                                                    />
                                                                    {item.label}
                                                                </label>
                                                            ))}
                                                        </div>
                                                        <div className="rounded-lg border border-indigo-300/20 bg-phy-bg/40 p-2">
                                                            <div className="text-xs text-indigo-100 mb-2">分层提示（L1 → L2 → L3）</div>
                                                            <div className="flex flex-wrap gap-2">
                                                                <button onClick={() => unlockHintTier(1)} className="px-2 py-1 rounded-md text-xs border border-indigo-300/30 bg-indigo-500/20 text-indigo-100">L1</button>
                                                                <button onClick={() => unlockHintTier(2)} className="px-2 py-1 rounded-md text-xs border border-indigo-300/30 bg-indigo-500/20 text-indigo-100">L2</button>
                                                                <button onClick={() => unlockHintTier(3)} className="px-2 py-1 rounded-md text-xs border border-indigo-300/30 bg-indigo-500/20 text-indigo-100">L3</button>
                                                            </div>
                                                            <div className="mt-2 space-y-1 text-xs text-indigo-100/90">
                                                                {currentHintLayer >= 1 ? effectiveHintTiers.l1.map((line, idx) => <div key={`l1-${idx}`}>L1 · {line}</div>) : null}
                                                                {currentHintLayer >= 2 ? effectiveHintTiers.l2.map((line, idx) => <div key={`l2-${idx}`}>L2 · {line}</div>) : null}
                                                                {currentHintLayer >= 3 ? effectiveHintTiers.l3.map((line, idx) => <div key={`l3-${idx}`}>L3 · {line}</div>) : null}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : null}
                                                <textarea
                                                    value={currentAnswer}
                                                    onChange={(e) => setAnswers((prev) => ({ ...prev, [currentTask.id]: e.target.value }))}
                                                    rows={9}
                                                    placeholder="在这里输入你的译文..."
                                                    className="mt-2 w-full rounded-xl border border-phy-border bg-phy-bg px-3 py-2 text-sm text-phy-text resize-y min-h-[220px]"
                                                />
                                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                                    <button onClick={submitScore} disabled={loadingScore || (stage === 'rewrite' && !allSelfChecksDone)} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60">
                                                        {loadingScore ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                                                        {loadingScore ? '处理中...' : stage === 'rewrite' ? '提交二稿并评分' : '提交初稿'}
                                                    </button>
                                                    {latest ? <span className="text-xs text-phy-muted">最近得分：{latest.score100}/100 · {latest.score15}/15 · 尝试 {latest.attempt}</span> : null}
                                                    {stage === 'rewrite' && !allSelfChecksDone ? <span className="text-xs text-amber-200">请先完成自检清单再提交二稿</span> : null}
                                                    {practiceMode === 'scaffolded' && (
                                                        <button onClick={() => setSubStage('phrases')} className="ml-auto text-[10px] text-phy-muted hover:text-indigo-300 underline underline-offset-2">返回阶梯练习</button>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>


                                    {stage === 'feedback' && latest ? (
                                        <div className="glass-panel rounded-2xl border border-phy-border p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border bg-phy-glass border-phy-border"><CheckCircle2 size={12} className="text-emerald-300" />{latest.score100}/100</span>
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border ${scoreBadgeClass}`}><CheckCircle2 size={12} />{latest.score15}/15</span>
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-amber-400/30 bg-amber-500/10 text-amber-200"><Target size={12} />命中 {latest.hitCount}/{latest.requiredMinHit || 0}</span>
                                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-indigo-400/30 bg-indigo-500/10 text-indigo-100">修订增益 {latest.revisionGain100 >= 0 ? '+' : ''}{latest.revisionGain100 || 0} /100 · {latest.revisionGain15 >= 0 ? '+' : ''}{latest.revisionGain15 || 0} /15</span>
                                                </div>
                                                <button onClick={() => setFeedbackCollapsed((v) => !v)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-phy-border bg-phy-glass text-xs text-phy-text">
                                                    {feedbackCollapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                                                    {feedbackCollapsed ? '展开反馈明细' : '收起反馈明细'}
                                                </button>
                                            </div>

                                            {latest.overall_comment ? <p className="mt-3 text-sm text-phy-text whitespace-pre-wrap">{latest.overall_comment}</p> : null}

                                            <div className="mt-3 rounded-lg border border-cyan-400/25 bg-cyan-500/10 p-3">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="text-xs font-semibold text-cyan-100">本题引用例句命中情况</div>
                                                    {currentTaskRankedExamples.length > currentTaskExamples.length ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => rotateCurrentTaskExamples(true)}
                                                            className="px-2.5 py-1 rounded-md border border-cyan-300/30 bg-cyan-500/15 text-cyan-100 text-[11px] font-bold"
                                                        >
                                                            换一组例句并再译
                                                        </button>
                                                    ) : null}
                                                </div>
                                                {currentExampleHitSummary.length ? (
                                                    <div className="mt-2 space-y-2">
                                                        {currentExampleHitSummary.map((item, idx) => (
                                                            <div key={item.sourceHash || `${item.sourceNoteId}-${idx}`} className="rounded-md border border-cyan-300/20 bg-black/10 px-2.5 py-2">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="text-xs text-cyan-100 whitespace-pre-wrap break-words">{idx + 1}. {item.text}</div>
                                                                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${item.hit ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200' : 'border-rose-400/30 bg-rose-500/15 text-rose-200'}`}>
                                                                        {item.hit ? '命中' : '未命中'}
                                                                    </span>
                                                                </div>
                                                                <div className="mt-1 text-[11px] text-cyan-200/75">
                                                                    来源：{item.sourceNoteTitle || '深度笔记'}{item.sourceSection ? ` · ${item.sourceSection}` : ''}
                                                                </div>
                                                                {!item.hit && item.matched?.length ? (
                                                                    <div className="mt-1 text-[11px] text-cyan-200/80">
                                                                        部分重合：{item.matched.join(' / ')}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="mt-2 text-xs text-cyan-100/85">本题未纳入深度笔记例句。</div>
                                                )}
                                            </div>

                                            {!feedbackCollapsed ? (
                                                <div className="mt-3 space-y-3">
                                                    {(latest.issues || []).length ? (latest.issues || []).slice(0, 8).map((issue, i) => (
                                                        <div key={`${i}-${issue?.type || 'issue'}`} className="rounded-lg border border-rose-400/20 bg-rose-500/5 p-2">
                                                            <div className="text-xs text-rose-200 flex items-center gap-1"><AlertCircle size={12} />{deriveIssueTag(issue)} · {issue?.severity || issue?.type || 'issue'}</div>
                                                            <div className="text-sm text-phy-text/90 mt-1">{issue?.reason || issue?.description || '待改进'}</div>
                                                        </div>
                                                    )) : <div className="text-xs text-phy-muted">未检测到明显问题，建议再译一版冲高分。</div>}
                                                    {(latest.action_plan || []).length ? (
                                                        <div className="rounded-lg border border-indigo-400/20 bg-indigo-500/5 p-3">
                                                            <div className="text-xs text-indigo-200">下一步动作</div>
                                                            <ul className="mt-1 space-y-1 text-sm text-indigo-100">
                                                                {latest.action_plan.slice(0, 4).map((line, idx) => (
                                                                    <li key={`plan-${idx}`}>• {line}</li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    ) : null}

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
                                                <div className="rounded-xl border border-phy-border bg-phy-glass p-3"><div className="text-[11px] text-phy-muted">总分 (100)</div><div className="font-black text-phy-text">{settlementData.score100}</div></div>
                                                <div className="rounded-xl border border-phy-border bg-phy-glass p-3"><div className="text-[11px] text-phy-muted">总分 (15)</div><div className="font-black text-emerald-300">{settlementData.score15}</div></div>
                                                <div className="rounded-xl border border-phy-border bg-phy-glass p-3"><div className="text-[11px] text-phy-muted">目标词命中</div><div className="font-black text-amber-200">{settlementData.vocabHit}</div></div>
                                                <div className="rounded-xl border border-phy-border bg-phy-glass p-3"><div className="text-[11px] text-phy-muted">尝试次数</div><div className="font-black text-indigo-200">{settlementData.attempts}</div></div>
                                                <div className="rounded-xl border border-phy-border bg-phy-glass p-3"><div className="text-[11px] text-phy-muted">修订增益 (100)</div><div className="font-black text-cyan-200">{avgRevisionGain100}</div></div>
                                            </div>
                                            <div className="mt-3 rounded-xl border border-phy-border bg-phy-glass p-3">
                                                <div className="text-xs text-phy-muted">弱点画像（近7天 + 最近3次加权）</div>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {settlementData.weaknessSnapshot?.length
                                                        ? settlementData.weaknessSnapshot.slice(0, 5).map((item) => (
                                                            <span key={item.key} className="px-2 py-1 rounded-md text-xs border border-indigo-400/30 bg-indigo-500/10 text-indigo-100">
                                                                {item.label}
                                                            </span>
                                                        ))
                                                        : <span className="text-xs text-phy-muted">暂无足够历史，下一次结算后将生成画像。</span>}
                                                </div>
                                            </div>

                                            <div className="mt-4 rounded-xl border border-phy-border bg-phy-glass p-3 space-y-2">
                                                <label className="flex items-center gap-2 text-sm text-phy-text"><input type="checkbox" checked={Boolean(links.flashcards)} onChange={(e) => setLinks((prev) => ({ ...prev, flashcards: e.target.checked }))} />未命中目标词 → 加入今日闪卡文件夹（去重）</label>
                                                <label className="flex items-center gap-2 text-sm text-phy-text"><input type="checkbox" checked={Boolean(links.notes)} onChange={(e) => setLinks((prev) => ({ ...prev, notes: e.target.checked }))} />疑难句与错因总结 → 存入今日笔记</label>
                                                <div className="flex flex-wrap gap-2 pt-1">
                                                    <button onClick={applyLinks} disabled={loadingLink} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-60">{loadingLink ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}执行联动</button>
                                                    <button onClick={saveLog} disabled={logSaved} className="px-3 py-1.5 rounded-lg border border-indigo-400/30 bg-indigo-500/10 text-indigo-200 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-60"><Save size={12} />{logSaved ? '记录已保存' : '保存结算记录'}</button>
                                                    <button onClick={() => startChallenge(challenge)} className="px-3 py-1.5 rounded-lg border border-phy-border bg-phy-glass text-phy-text text-xs font-bold">同题再练</button>
                                                    <button onClick={generateTargetedChallenge} className="px-3 py-1.5 rounded-lg border border-amber-400/30 bg-amber-500/10 text-amber-100 text-xs font-bold">下一套针对练</button>
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

                        <div className="mt-3 rounded-xl border border-phy-border bg-phy-glass p-3">
                            <div className="text-xs font-semibold text-phy-text">弱点趋势（近7天 + 最近3次）</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {weaknessTrend.length ? weaknessTrend.slice(0, 4).map((item) => (
                                    <span key={item.key} className="px-2 py-1 rounded-md text-[11px] border border-amber-400/30 bg-amber-500/10 text-amber-100">
                                        {item.label}
                                    </span>
                                )) : <span className="text-xs text-phy-muted">暂无趋势数据</span>}
                            </div>
                        </div>

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
