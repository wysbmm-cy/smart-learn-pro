import { getFlashcards, getHistory, getNotes, getTranslationLogs, getWritings } from '../services/db';
import { buildTodayReviewQueue } from './reviewQueue';

const DAY_MS = 24 * 60 * 60 * 1000;

export const getLocalDateKey = (value = Date.now()) => {
    const date = new Date(value);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const toTime = (value) => {
    if (!value) return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
};

const isOnDate = (value, dateKey) => {
    const time = toTime(value);
    return Boolean(time && getLocalDateKey(time) === dateKey);
};

const wordCount = (text = '') => String(text).trim().split(/\s+/).filter(Boolean).length;

const safeText = (value, fallback = '') => String(value || fallback).trim();

const makeNode = (node) => ({
    status: 'pending',
    estimatedMinutes: 8,
    ...node
});

export const collectLearningFlowProfile = async () => {
    const todayKey = getLocalDateKey();
    const yesterdayKey = getLocalDateKey(Date.now() - DAY_MS);

    const [cards, history, writings, translations, notes] = await Promise.all([
        getFlashcards(),
        getHistory(),
        getWritings(),
        getTranslationLogs(200),
        getNotes()
    ]);

    const dueCards = buildTodayReviewQueue(cards || [], { maxCards: 12, preferUnseenToday: true });
    const newCardsYesterday = (cards || []).filter((card) =>
        isOnDate(card?.createdAt ?? card?.timestamp ?? card?.id, yesterdayKey)
    );
    const reviewedYesterday = (cards || []).filter((card) =>
        isOnDate(card?.lastReviewed ?? card?.lastReview ?? card?.fsrs_last_review, yesterdayKey)
    );
    const readingYesterday = (history || []).filter((row) =>
        isOnDate(row?.timestamp ?? row?.date ?? row?.createdAt, yesterdayKey)
    );
    const writingRecent = (writings || []).slice(0, 5);
    const writingYesterday = writingRecent.filter((row) =>
        isOnDate(row?.updatedAt ?? row?.createdAt, yesterdayKey)
    );
    const translationRecent = (translations || []).slice(0, 8);
    const translationYesterday = translationRecent.filter((row) =>
        isOnDate(row?.createdAt ?? row?.updatedAt, yesterdayKey)
    );
    const notesYesterday = (notes || []).filter((note) =>
        isOnDate(note?.updatedAt ?? note?.date ?? note?.createdAt, yesterdayKey)
    );

    return {
        todayKey,
        yesterdayKey,
        dueCards,
        newCardsYesterday,
        reviewedYesterday,
        readingYesterday,
        writingRecent,
        writingYesterday,
        translationRecent,
        translationYesterday,
        notesYesterday
    };
};

export const buildLearningFlowDraft = (profile) => {
    const nodes = [];
    const dueCount = profile.dueCards.length;

    nodes.push(makeNode({
        id: `flashcard-${profile.todayKey}`,
        type: 'flashcard',
        title: dueCount > 0 ? `先复习 ${Math.min(dueCount, 12)} 张关键闪卡` : '先做一轮轻量闪卡热身',
        description: dueCount > 0
            ? '优先处理今日到期和近期薄弱词，给后续翻译/写作热身。'
            : '今天没有明显到期卡片，可以做一轮随机复习保持手感。',
        actionLabel: '开始闪卡',
        targetView: 'flashcards',
        estimatedMinutes: dueCount > 0 ? 10 : 6,
        params: {
            flashcardStartupState: dueCount > 0
                ? { mode: 'study', folder: 'today', queueIds: profile.dueCards.map((card) => card.id) }
                : { mode: 'study', folder: 'all' }
        }
    }));

    const latestReading = profile.readingYesterday[0];
    nodes.push(makeNode({
        id: `reading-${profile.todayKey}`,
        type: 'reading',
        title: latestReading ? '回看昨日阅读题与证据句' : '完成一篇阅读理解训练',
        description: latestReading
            ? `围绕《${safeText(latestReading.title, '昨日阅读')}》复查错因和证据定位。`
            : '补一篇阅读训练，把生词和疑难句标记出来。',
        actionLabel: latestReading ? '进入历史回顾' : '开始阅读',
        targetView: 'exam',
        estimatedMinutes: 12,
        params: latestReading ? { historyId: latestReading.id } : {}
    }));

    const latestTranslation = profile.translationYesterday[0] || profile.translationRecent[0];
    nodes.push(makeNode({
        id: `translation-${profile.todayKey}`,
        type: 'translation',
        title: latestTranslation ? '针对昨日翻译弱点再练一轮' : '做一次情境翻译挑战',
        description: latestTranslation
            ? '根据近期翻译问题，先看提示再二稿评分，训练自然表达。'
            : '用全句模式完成一组翻译，建立今日输出状态。',
        actionLabel: '进入翻译',
        targetView: 'translation',
        estimatedMinutes: 12,
        params: { fromLearningFlow: true }
    }));

    const latestWriting = profile.writingYesterday[0] || profile.writingRecent[0];
    nodes.push(makeNode({
        id: `writing-${profile.todayKey}`,
        type: 'writing',
        title: latestWriting ? '改写一段最近作文' : '写一个短段落输出',
        description: latestWriting
            ? `从《${safeText(latestWriting.title, '最近作文')}》中选一段做结构和表达升级。`
            : '写 80-120 词短段落，重点练主题句和论证衔接。',
        actionLabel: '进入写作',
        targetView: 'writer',
        estimatedMinutes: 15,
        params: latestWriting ? { writingId: latestWriting.id } : {}
    }));

    const noteCount = profile.notesYesterday.length;
    nodes.push(makeNode({
        id: `note-${profile.todayKey}`,
        type: 'note',
        title: noteCount > 0 ? `复盘 ${Math.min(noteCount, 3)} 条昨日笔记` : '整理一个今日复盘笔记',
        description: noteCount > 0
            ? '把昨日深度笔记中能进入写作素材或翻译例句的内容再筛一遍。'
            : '写下今天最值得保留的 3 个词、1 个句型和 1 个问题。',
        actionLabel: '打开笔记',
        targetView: 'notes',
        estimatedMinutes: noteCount > 0 ? 8 : 6,
        params: profile.notesYesterday[0] ? { noteId: profile.notesYesterday[0].id } : {}
    }));

    const estimatedMinutes = nodes.reduce((sum, node) => sum + (node.estimatedMinutes || 0), 0);
    const reviewed = profile.reviewedYesterday.length;
    const newCards = profile.newCardsYesterday.length;

    return {
        version: 'learning-flow-v1',
        date: profile.todayKey,
        sourceDate: profile.yesterdayKey,
        title: '今日一线学习流',
        summary: `基于昨日学习记录生成：复习 ${reviewed} 张，新增 ${newCards} 张，阅读 ${profile.readingYesterday.length} 篇，翻译 ${profile.translationYesterday.length} 次，写作 ${profile.writingYesterday.length} 篇。`,
        estimatedMinutes,
        nodes,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
};

export const mergeLearningFlowInsight = (draft, insight) => {
    if (!insight) return draft;
    const nodeCopy = draft.nodes.map((node) => {
        const aiNode = Array.isArray(insight.nodes)
            ? insight.nodes.find((item) => item.id === node.id || item.type === node.type)
            : null;
        return {
            ...node,
            title: safeText(aiNode?.title, node.title),
            description: safeText(aiNode?.description, node.description)
        };
    });

    return {
        ...draft,
        title: safeText(insight.title, draft.title),
        summary: safeText(insight.summary, draft.summary),
        nodes: nodeCopy,
        updatedAt: Date.now()
    };
};

