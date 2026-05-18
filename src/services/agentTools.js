
import {
    getFlashcards,
    getHistory,
    getNotes,
    getWritings,
    getStudyLogs,
    getUserGoal,
    getRecentDrillLogs,
    getAllHighlights,
    getFolders,
    getTasks,
    getWritingMaterials,
    saveFile,
    saveFlashcard,
    saveListeningData,
    saveWritingMaterial,
    saveNote,
    saveTask,
    saveFolder,
    deleteWritingMaterial,
    deleteFlashcard,
    deleteNote,
    deleteTask
} from './db';
import { analyzePassageStructure, generateListeningQuizFromTranscript, sendChat, synthesizeSpeech } from './ai';
import { resolveTodayNotesFolderName } from '../utils/noteFolders';
import { normalizeMaterialCategory } from '../data/writingMaterials';
import {
    parseKnowledgeBlocks,
    upsertTranslationLinkedExamplesForNote,
    removeTranslationLinkedExamplesByNoteId
} from '../utils/knowledgeLinking';

const id = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const firstLine = (t) => (t || '').split('\n')[0].split('/')[0].trim();
const today = () => new Date().toISOString().split('T')[0];
const isDue = (c, now = Date.now()) => !c.nextReview || c.nextReview <= now;
const arr = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
const clean = (v) => String(v ?? '').trim();
const AGENT_FLASHCARD_BATCH_UNDO_KEY = 'agent_flashcard_last_batch_undo_v1';
const EXAM_SESSION_KEY = 'exam_adversarial_session_v2';
const EXAM_HISTORY_KEY = 'exam_adversarial_history_v1';
const byCount = (list, pick) => {
    const m = new Map();
    for (const item of list || []) {
        const k = pick(item) || 'unknown';
        m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
};

const readUndoSnapshot = () => {
    try {
        const raw = localStorage.getItem(AGENT_FLASHCARD_BATCH_UNDO_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

const writeUndoSnapshot = (payload) => {
    try {
        if (!payload) {
            localStorage.removeItem(AGENT_FLASHCARD_BATCH_UNDO_KEY);
            return;
        }
        localStorage.setItem(AGENT_FLASHCARD_BATCH_UNDO_KEY, JSON.stringify(payload));
    } catch {
        // ignore
    }
};

const readLocalJson = (key, fallback = null) => {
    try {
        if (typeof localStorage === 'undefined') return fallback;
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

const clipText = (value = '', limit = 14000) => {
    const text = String(value || '');
    const max = Math.max(1000, Math.min(30000, Number(limit) || 14000));
    return {
        text: text.slice(0, max),
        truncated: text.length > max,
        originalLength: text.length
    };
};

const sanitizeFileName = (value = 'AI Listening') =>
    clean(value || 'AI Listening').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || 'AI Listening';

const stripCodeFence = (text = '') => String(text || '')
    .trim()
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```$/i, '')
    .trim();

const estimateListeningWords = ({ durationSeconds, wordCount, level }) => {
    if (Number(wordCount) > 0) return Math.max(60, Math.min(900, Number(wordCount) || 180));
    const seconds = Math.max(30, Math.min(600, Number(durationSeconds) || 90));
    const levelText = clean(level).toLowerCase();
    const wpm = /beginner|a1|a2|初级/.test(levelText)
        ? 95
        : /advanced|c1|c2|高级|雅思|托福/.test(levelText)
            ? 140
            : 120;
    return Math.max(60, Math.min(900, Math.round((seconds / 60) * wpm)));
};

const buildFallbackListeningScript = ({ topic = '', level = 'B1-B2', style = 'short lecture', wordCount = 160 } = {}) => {
    const title = sanitizeFileName(topic || 'Everyday English Listening');
    const target = Math.max(80, Math.min(420, Number(wordCount) || 160));
    const base = [
        `Today we are going to talk about ${title}.`,
        `This listening practice is designed for ${level} learners, so the language is clear, natural, and useful.`,
        `First, think about the main idea. ${title} is not only a topic for vocabulary practice, but also a way to notice how English speakers organize information.`,
        `For example, a speaker may introduce a problem, give one or two reasons, and then finish with a practical suggestion.`,
        `As you listen, pay attention to transition words such as however, therefore, in addition, and as a result.`,
        `These words help you follow the logic of the passage.`,
        `After listening, try to summarize the topic in two sentences, then write down three useful expressions you want to remember.`,
        `This is a ${style} practice, so focus on meaning first and details second.`
    ];
    let script = base.join(' ');
    while (script.split(/\s+/).length < target) {
        script += ` Another useful exercise is to repeat one sentence aloud and replace one key word with your own idea. This helps turn passive listening into active speaking and writing practice.`;
    }
    return script.split(/\s+/).slice(0, target).join(' ');
};

const generateListeningScript = async (params = {}, settings = {}) => {
    const directText = clean(params.text || params.content || params.script);
    if (directText) {
        return {
            title: clean(params.title) || sanitizeFileName(directText.split(/\s+/).slice(0, 8).join(' ')),
            transcript: directText,
            source: 'provided_text'
        };
    }

    const topic = clean(params.topic);
    if (!topic) throw new Error('topic or text is required.');
    const level = clean(params.level) || 'B1-B2';
    const style = clean(params.style) || 'short lecture';
    const wordCount = estimateListeningWords({
        durationSeconds: params.durationSeconds,
        wordCount: params.wordCount,
        level
    });

    if (!settings?.apiKey) {
        return {
            title: clean(params.title) || sanitizeFileName(topic),
            transcript: buildFallbackListeningScript({ topic, level, style, wordCount }),
            source: 'heuristic'
        };
    }

    const prompt = `Generate an English listening script for language learners.

Return strict JSON only:
{
  "title": "short title",
  "transcript": "natural spoken English transcript"
}

Topic: ${topic}
Level: ${level}
Style: ${style}
Target word count: about ${wordCount}
Requirements:
- Use natural spoken English.
- Keep the transcript coherent and useful for listening practice.
- Avoid markdown, stage directions, SSML, or speaker labels unless the style explicitly needs a dialogue.
- If dialogue is requested, use clear short turns but still keep it easy for TTS.`;

    const result = await sendChat([
        { role: 'system', content: 'You create clean English listening scripts for learners. Return valid JSON only.' },
        { role: 'user', content: prompt }
    ], settings, true);
    const parsed = parseJsonObjectFromText(result);
    const transcript = clean(parsed?.transcript || stripCodeFence(result));
    if (!transcript) throw new Error('AI did not return a listening transcript.');
    return {
        title: clean(params.title || parsed?.title) || sanitizeFileName(topic),
        transcript,
        source: 'ai'
    };
};

const normalizeExamQuestion = (q = {}, index = 0) => ({
    id: q.id ?? index + 1,
    question: clean(q.question || q.text || q.stem),
    options: arr(q.options).map((x) => String(x || '')),
    answer: clean(q.answer),
    explanation: clean(q.explanation),
    evidence_sentence: clean(q.evidence_sentence || q.evidence)
});

const normalizeExamMatching = (matching = null) => {
    if (!matching) return null;
    return {
        paragraphs: arr(matching.paragraphs).map((p, index) => ({
            label: clean(p.label) || String.fromCharCode(65 + index),
            text: String(p.text || '')
        })),
        statements: arr(matching.statements).map((s, index) => ({
            id: s.id ?? index + 1,
            text: clean(s.text || s.question || s.statement || s.stem),
            answer: clean(s.answer),
            explanation: clean(s.explanation),
            evidence_sentence: clean(s.evidence_sentence || s.evidence)
        }))
    };
};

const normalizeCurrentExamArticle = (session = {}, maxPassageChars = 14000) => {
    const paper = session?.paper || {};
    const clipped = clipText(paper.passage || session?.setup?.passage || '', maxPassageChars);
    if (!clean(clipped.text)) return null;
    return {
        id: 'current',
        source: 'current_exam_session',
        title: clean(paper.title) || '当前阅读与考试文章',
        mode: clean(paper.mode || session?.setup?.mode) || 'reading',
        passage: clipped.text,
        passageTruncated: clipped.truncated,
        passageOriginalLength: clipped.originalLength,
        questions: arr(paper.questions).map(normalizeExamQuestion).filter((q) => q.question),
        matching: normalizeExamMatching(paper.matching),
        wordMarks: arr(session.wordMarks).map((m) => ({
            id: m.id || '',
            text: clean(m.text),
            definition: clean(m.definition),
            context: clean(m.context),
            source: clean(m.source) || 'article'
        })).filter((m) => m.text),
        sentenceMarks: arr(session.sentenceMarks).map((m) => ({
            id: m.id || '',
            text: clean(m.text),
            analysis: clean(m.analysis),
            context: clean(m.context),
            source: clean(m.source) || 'article'
        })).filter((m) => m.text),
        sentenceAnalysis: clean(session.sentenceAnalysis),
        answers: session.answers || {},
        submitted: Boolean(session.submitted),
        score: session.score || null,
        updatedAt: session.updatedAt || null
    };
};

const normalizeHistoryExamArticle = (record = {}, maxPassageChars = 14000) => {
    const snap = record?.paperSnapshot || {};
    const clipped = clipText(snap.passage || record?.setupSnapshot?.passage || record?.passagePreview || '', maxPassageChars);
    if (!clean(clipped.text)) return null;
    return {
        id: record.id || `history_${record.createdAt || Date.now()}`,
        source: 'exam_history',
        title: clean(snap.title || record.title) || '历史阅读与考试文章',
        mode: clean(record.mode || record.setupSnapshot?.mode) || 'reading',
        passage: clipped.text,
        passageTruncated: clipped.truncated,
        passageOriginalLength: clipped.originalLength,
        questions: arr(snap.questions).map(normalizeExamQuestion).filter((q) => q.question),
        matching: normalizeExamMatching(snap.matching),
        rows: arr(record.rows),
        answers: record.answersSnapshot || {},
        result: record.result || null,
        folderId: record.folderId || null,
        createdAt: record.createdAt || null
    };
};

const getReadingExamArticles = (params = {}) => {
    const source = clean(params.source || 'current_or_latest').toLowerCase();
    const limit = Math.max(1, Math.min(5, Number(params.limit) || 1));
    const maxPassageChars = Math.max(1000, Math.min(30000, Number(params.maxPassageChars) || 14000));
    const historyId = clean(params.historyId || params.id);

    if (clean(params.passage)) {
        const clipped = clipText(params.passage, maxPassageChars);
        return [{
            id: 'inline',
            source: 'inline_passage',
            title: clean(params.title) || '用户提供的阅读文章',
            mode: clean(params.mode) || 'reading',
            passage: clipped.text,
            passageTruncated: clipped.truncated,
            passageOriginalLength: clipped.originalLength,
            questions: [],
            matching: null
        }];
    }

    const articles = [];
    if (source === 'current' || source === 'current_or_latest') {
        const current = normalizeCurrentExamArticle(readLocalJson(EXAM_SESSION_KEY, {}), maxPassageChars);
        if (current) articles.push(current);
    }

    if (articles.length >= limit && !historyId) return articles.slice(0, limit);

    const history = arr(readLocalJson(EXAM_HISTORY_KEY, []));
    const historyArticles = history
        .filter((record) => !historyId || String(record.id) === historyId)
        .map((record) => normalizeHistoryExamArticle(record, maxPassageChars))
        .filter(Boolean);

    if (source === 'history' || source === 'latest_history' || historyId) {
        return historyArticles.slice(0, limit);
    }

    const seen = new Set(articles.map((item) => item.id));
    historyArticles.forEach((item) => {
        if (!seen.has(item.id)) articles.push(item);
    });
    return articles.slice(0, limit);
};

const parseJsonObjectFromText = (text = '') => {
    const raw = String(text || '').trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
    try {
        return JSON.parse(raw);
    } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try {
            return JSON.parse(match[0]);
        } catch {
            return null;
        }
    }
};

const READING_STOPWORDS = new Set([
    'about', 'above', 'after', 'again', 'against', 'almost', 'along', 'already', 'although', 'always',
    'among', 'another', 'because', 'before', 'between', 'could', 'during', 'every', 'first', 'found',
    'from', 'have', 'however', 'into', 'more', 'most', 'other', 'people', 'should', 'since', 'some',
    'such', 'their', 'there', 'these', 'those', 'through', 'under', 'until', 'using', 'where', 'which',
    'while', 'would', 'without', 'with', 'this', 'that', 'they', 'were', 'been', 'being'
]);

const getTextContext = (text = '', index = 0, length = 0, radius = 70) => {
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + length + radius);
    return text.slice(start, end).replace(/\s+/g, ' ').trim();
};

const buildHeuristicReadingLearningPoints = (article = {}, maxWords = 12, maxSentences = 6) => {
    const passage = String(article.passage || '');
    const wordMap = new Map();
    const re = /\b[A-Za-z][A-Za-z'-]{5,}\b/g;
    let match = null;
    while ((match = re.exec(passage))) {
        const word = match[0];
        const key = word.toLowerCase();
        if (READING_STOPWORDS.has(key)) continue;
        const item = wordMap.get(key) || { word, count: 0, index: match.index };
        item.count += 1;
        wordMap.set(key, item);
    }
    const vocabulary = Array.from(wordMap.values())
        .sort((a, b) => (b.count - a.count) || (b.word.length - a.word.length))
        .slice(0, maxWords)
        .map((item) => ({
            word: item.word,
            phonetic: '',
            definition: '',
            example: '',
            context: getTextContext(passage, item.index, item.word.length),
            reason: item.count > 1 ? `文中出现 ${item.count} 次，适合加入阅读词卡。` : '较长或较抽象的阅读词，适合复习。'
        }));

    const sentences = passage
        .replace(/\n+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map((x) => x.trim())
        .filter((x) => x.length > 80);
    const grammar = sentences
        .map((sentence) => {
            const lower = sentence.toLowerCase();
            const signal = ['which', 'that', 'although', 'whereas', 'while', 'because', 'despite', 'however', 'therefore']
                .filter((x) => lower.includes(x));
            return { sentence, signal, score: sentence.length + signal.length * 50 };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, maxSentences)
        .map((item) => ({
            sentence: item.sentence,
            analysis: item.signal.length
                ? `疑似包含 ${item.signal.join(', ')} 等连接/从句信号，建议拆分主干和修饰成分。`
                : '句子较长，建议拆分主干、修饰语和逻辑关系。',
            translation: '',
            pattern: item.signal.join(', ') || 'long sentence'
        }));

    const selectedSentences = grammar.slice(0, 4).map((item) => item.sentence);
    return {
        source: 'heuristic',
        vocabulary,
        grammar,
        noteOutline: [
            `# 阅读学习点：${article.title || 'Untitled'}`,
            '',
            '## 文章核心',
            '- 待结合原文和题目进一步整理主旨、论点与证据。',
            '',
            '## 生词',
            ...vocabulary.map((item) => `- ${item.word}: ${item.definition || item.reason}`),
            '',
            '## 长难句/语法',
            ...grammar.map((item) => `- ${item.sentence}\n  - ${item.analysis}`)
        ].join('\n'),
        deepNoteTargets: vocabulary.slice(0, 5).map((item) => ({
            type: 'word',
            text: item.word,
            reason: item.reason
        })),
        translationExamples: selectedSentences.map((sentence) => ({
            chinese: '',
            answer: sentence,
            hint: '先理解逻辑关系，再尝试中译英复现原句结构。'
        })),
        writingPrompts: selectedSentences.slice(0, 3).map((sentence, index) => ({
            title: `阅读句型迁移 ${index + 1}`,
            prompt: `仿照这个句子的逻辑结构写一个新句子：${sentence}`
        }))
    };
};

const normalizeReadingLearningPreview = (raw = {}, fallback = {}) => ({
    source: raw.source || 'ai',
    vocabulary: arr(raw.vocabulary).map((item) => ({
        word: clean(item.word),
        phonetic: clean(item.phonetic),
        definition: clean(item.definition || item.meaning),
        example: clean(item.example),
        context: clean(item.context),
        reason: clean(item.reason)
    })).filter((item) => item.word),
    grammar: arr(raw.grammar || raw.sentences).map((item) => ({
        sentence: clean(item.sentence || item.text),
        analysis: clean(item.analysis),
        translation: clean(item.translation),
        pattern: clean(item.pattern)
    })).filter((item) => item.sentence),
    noteOutline: clean(raw.noteOutline || raw.note || fallback.noteOutline),
    deepNoteTargets: arr(raw.deepNoteTargets).map((item) => ({
        type: clean(item.type) || 'word',
        text: clean(item.text || item.word || item.sentence),
        reason: clean(item.reason)
    })).filter((item) => item.text),
    translationExamples: arr(raw.translationExamples).map((item) => ({
        chinese: clean(item.chinese),
        answer: clean(item.answer || item.english),
        hint: clean(item.hint || item.reason)
    })).filter((item) => item.answer || item.chinese),
    writingPrompts: arr(raw.writingPrompts).map((item) => ({
        title: clean(item.title),
        prompt: clean(item.prompt || item.task),
        targetWords: arr(item.targetWords).map(clean).filter(Boolean)
    })).filter((item) => item.title || item.prompt)
});

const normalizeWordNeedles = (values = []) =>
    arr(values).map((x) => clean(x).toLowerCase()).filter(Boolean);

const clampBatchLimit = (value, fallback = 200) =>
    Math.max(1, Math.min(500, Number(value) || fallback));

const parseDateBoundary = (value, endOfDay = false) => {
    const text = clean(value);
    if (!text) return null;
    const normalized = /^\d{4}-\d{1,2}-\d{1,2}$/.test(text)
        ? text.split('-').map((part, index) => index === 0 ? part : part.padStart(2, '0')).join('-')
        : text;
    const date = new Date(endOfDay ? `${normalized}T23:59:59.999` : `${normalized}T00:00:00.000`);
    const time = date.getTime();
    return Number.isFinite(time) ? time : null;
};

const getCreatedRange = (params = {}) => {
    const createdOn = clean(params.createdOn);
    let createdAfter = parseDateBoundary(params.createdAfter, false);
    let createdBefore = parseDateBoundary(params.createdBefore, true);
    if (createdOn) {
        createdAfter = parseDateBoundary(createdOn, false);
        createdBefore = parseDateBoundary(createdOn, true);
    }
    return { createdAfter, createdBefore };
};

const hasPreciseBatchScope = (params = {}) => {
    return arr(params.ids).length > 0
        || arr(params.words).length > 0
        || !!clean(params.query)
        || !!clean(params.folderId)
        || !!clean(params.folderName)
        || !!clean(params.createdOn)
        || !!clean(params.createdAfter)
        || !!clean(params.createdBefore)
        || params.onlyDue === true
        || params.onlyMastered === true
        || params.onlyFlagged === true;
};

const pickCardsByCriteria = async (params = {}, now = Date.now()) => {
    const [cards, folders] = await Promise.all([getFlashcards(), getFolders()]);
    const allCards = arr(cards);
    const folderById = new Map(arr(folders).map((f) => [String(f.id), String(f.name || '')]));
    const folderByName = new Map(arr(folders).map((f) => [String(f.name || '').toLowerCase(), String(f.id)]));

    const ids = new Set(arr(params.ids).map((x) => clean(x)).filter(Boolean));
    const words = normalizeWordNeedles(params.words);
    const query = clean(params.query).toLowerCase();
    const folderIdInput = clean(params.folderId);
    const folderNameInput = clean(params.folderName).toLowerCase();
    const resolvedFolderId = folderIdInput || folderByName.get(folderNameInput) || '';
    const onlyDue = params.onlyDue === true;
    const onlyMastered = params.onlyMastered === true;
    const onlyFlagged = params.onlyFlagged === true;
    const limit = clampBatchLimit(params.limit, 200);
    const { createdAfter, createdBefore } = getCreatedRange(params);

    const matched = allCards.filter((c) => {
        const cardId = String(c.id || '');
        const front = String(c.front || '');
        const back = String(c.back || '');
        const word = firstLine(front).toLowerCase();
        const folderId = String(c.folderId || '');
        const folderName = String(folderById.get(folderId) || '').toLowerCase();
        const hay = `${front}\n${back}\n${arr(c.tags).join(' ')}`.toLowerCase();
        const createdAt = Number(c.createdAt || 0);

        if (ids.size > 0 && !ids.has(cardId)) return false;
        if (words.length > 0 && !words.some((w) => word === w || word.includes(w) || hay.includes(w))) return false;
        if (query && !hay.includes(query)) return false;
        if (resolvedFolderId && folderId !== resolvedFolderId) return false;
        if (!resolvedFolderId && folderNameInput && folderName !== folderNameInput) return false;
        if (createdAfter !== null && (!createdAt || createdAt < createdAfter)) return false;
        if (createdBefore !== null && (!createdAt || createdAt > createdBefore)) return false;
        if (onlyDue && !isDue(c, now)) return false;
        if (onlyMastered && !c.isMastered) return false;
        if (onlyFlagged && !c.isFlagged) return false;
        return true;
    });

    return matched.slice(0, limit);
};

const ensureFolder = async (name) => {
    if (!name) return null;
    const folders = await getFolders();
    const hit = (folders || []).find((f) => (f.name || '').toLowerCase() === name.toLowerCase());
    if (hit) return hit;
    const folder = { id: id('agent_folder'), name, createdAt: Date.now() };
    await saveFolder(folder);
    return folder;
};

const getDefaultNoteFolderName = async () => {
    const folders = await getFolders();
    return resolveTodayNotesFolderName(folders, today());
};

const inferGuidanceCategory = (text = '', section = '') => {
    const hay = `${String(text || '')}\n${String(section || '')}`.toLowerCase();
    if (/conclusion|summary|closing/.test(hay)) return 'conclusion';
    if (/transition|however|although|concession|contrast/.test(hay)) return 'transition';
    if (/thesis|opening|stance|introduction/.test(hay)) return 'thesis';
    if (/evidence|example|data|proof/.test(hay)) return 'evidence';
    if (/vocabulary|replace|lexical/.test(hay)) return 'vocabulary';
    return 'argument';
};

const buildVocabularyMaterialPayload = (params = {}, existing = null) => {
    const sourceTerm = clean(params.sourceTerm ?? params.source ?? existing?.sourceTerm);
    const targetTerm = clean(params.targetTerm ?? params.target ?? existing?.targetTerm);
    const replaceReason = clean(params.replaceReason ?? params.reason ?? existing?.replaceReason);
    const beforeExample = clean(params.beforeExample ?? existing?.beforeExample);
    const afterExample = clean(params.afterExample ?? existing?.afterExample);
    const title = clean(params.title ?? existing?.title) || (sourceTerm && targetTerm ? `${sourceTerm} -> ${targetTerm}` : clean(existing?.title));
    const content = sourceTerm && targetTerm ? `${sourceTerm} -> ${targetTerm}` : clean(params.content ?? existing?.content);
    const usage = clean(params.usage ?? existing?.usage) || replaceReason || '用于提升词汇准确度与表达层次。';
    const caution = clean(params.caution ?? existing?.caution) || '注意语境和词性，避免机械替换。';
    return {
        title,
        content,
        rewrite: clean(params.rewrite ?? existing?.rewrite) || afterExample,
        usage,
        caution,
        sourceTerm,
        targetTerm,
        replaceReason,
        beforeExample,
        afterExample,
        category: 'vocabulary',
        topic: clean(params.topic ?? existing?.topic),
        examType: clean(params.examType ?? existing?.examType),
        tags: arr(params.tags !== undefined ? params.tags : existing?.tags).map((x) => clean(x)).filter(Boolean).slice(0, 12),
        source: clean(params.sourceLabel ?? existing?.source) || 'agent'
    };
};

const clearLinkedWritingMaterialsByNoteId = async (noteId) => {
    const sourceNoteId = clean(noteId);
    if (!sourceNoteId) return 0;
    const all = arr(await getWritingMaterials());
    const linked = all.filter(
        (item) => item?.source === 'deep_note' && String(item?.sourceNoteId || '').trim() === sourceNoteId
    );
    for (const item of linked) {
        await deleteWritingMaterial(item.id);
    }
    return linked.length;
};

const resolveFlashcardFolder = async ({ folderId, folderName } = {}) => {
    const idNeedle = clean(folderId);
    const nameNeedle = clean(folderName).toLowerCase();
    const folders = arr(await getFolders());
    if (idNeedle) {
        return folders.find((f) => String(f.id) === idNeedle) || null;
    }
    if (nameNeedle) {
        return folders.find((f) => clean(f.name).toLowerCase() === nameNeedle) || null;
    }
    return null;
};

const stringifyCardContent = (card = {}) => {
    const front = String(card.front || '').trim();
    const back = String(card.back || '').trim();
    const word = firstLine(front) || '(untitled card)';
    return {
        id: String(card.id || ''),
        word,
        front,
        back,
        folderId: clean(card.folderId) || null,
        updatedAt: Number(card.updatedAt || card.createdAt || 0) || null
    };
};

const buildFlashcardsMarkdownBlock = (cards = [], folderName = '', heading = '') => {
    const title = clean(heading) || `Flashcards from ${folderName || 'Selected Folder'}`;
    const lines = [
        `## ${title}`,
        ``,
        `Total cards: ${cards.length}`,
        ``
    ];
    cards.forEach((card, idx) => {
        const normalized = stringifyCardContent(card);
        lines.push(`${idx + 1}. **${normalized.word}**`);
        lines.push(`   - Front: ${normalized.front || '(empty)'}`);
        lines.push(`   - Back: ${normalized.back || '(empty)'}`);
        lines.push('');
    });
    return lines.join('\n').trim();
};

const readNoteById = async (noteId) => {
    const allNotes = arr(await getNotes());
    return allNotes.find((n) => String(n.id) === String(noteId)) || null;
};

const verifyNoteWrite = async ({ noteId, expectedMinLength = 1 } = {}) => {
    const saved = await readNoteById(noteId);
    if (!saved) {
        return { ok: false, reason: 'Note write verification failed: note not found after save.' };
    }
    const length = String(saved.content || '').trim().length;
    if (length < Math.max(0, Number(expectedMinLength) || 0)) {
        return { ok: false, reason: `Note write verification failed: content length ${length} is below expected minimum.` };
    }
    return { ok: true, note: saved, contentLength: length };
};

const syncNoteKnowledgeToTargets = async ({
    noteRecord,
    includeWriting = true,
    includeTranslation = true,
    clearExisting = false,
    maxItems = 30,
    settings = {}
} = {}) => {
    const noteId = clean(noteRecord?.id);
    if (!noteId) return { writingSaved: 0, translationSaved: 0, parsedCount: 0, removed: 0 };

    const parsedBlocks = arr(parseKnowledgeBlocks(noteRecord?.content || '', noteId));
    const limit = Math.max(1, Math.min(200, Number(maxItems) || 30));
    let removed = 0;
    let writingSaved = 0;
    let translationSaved = 0;

    if (clearExisting) {
        if (includeWriting) {
            removed += await clearLinkedWritingMaterialsByNoteId(noteId);
        }
        if (includeTranslation) {
            removeTranslationLinkedExamplesByNoteId(noteId);
        }
    }

    if (includeWriting) {
        const guidanceBlocks = parsedBlocks.filter((item) => item.type === 'writing_guidance').slice(0, limit);
        for (let i = 0; i < guidanceBlocks.length; i += 1) {
            const block = guidanceBlocks[i];
            const safeHash = clean(block?.sourceHash);
            if (!safeHash) continue;

            const directive = clean(block?.meta?.directive).toLowerCase();
            const parsedCategory = clean(block?.meta?.category).toLowerCase();
            const category = directive === 'vocab'
                ? 'vocabulary'
                : (parsedCategory ? normalizeMaterialCategory(parsedCategory) : inferGuidanceCategory(block.text, block.section));

            await saveWritingMaterial({
                id: `deep-note-${safeHash}`,
                title: clean(block?.meta?.title) || `${clean(noteRecord?.title) || 'Deep Note'} / ${clean(block.section) || `Guidance ${i + 1}`}`,
                content: clean(block.text),
                rewrite: '',
                usage: clean(block?.meta?.usage) || `From note: ${clean(noteRecord?.title)}`,
                caution: clean(block?.meta?.caution),
                sourceTerm: clean(block?.meta?.sourceTerm),
                targetTerm: clean(block?.meta?.targetTerm),
                replaceReason: clean(block?.meta?.replaceReason),
                beforeExample: '',
                afterExample: clean(block?.meta?.afterExample),
                category,
                topic: clean(block?.meta?.topic) || clean(noteRecord?.title),
                examType: clean(settings?.writingLevel) || 'CET-6',
                tags: ['deep-note', 'linked'],
                source: 'deep_note',
                sourceNoteId: noteId,
                sourceNoteTitle: clean(noteRecord?.title),
                sourceHash: safeHash,
                sourceSection: clean(block?.section)
            });
            writingSaved += 1;
        }
    }

    if (includeTranslation) {
        const exampleBlocks = parsedBlocks.filter((item) => item.type === 'examples').slice(0, limit);
        const merged = upsertTranslationLinkedExamplesForNote({
            noteId,
            noteTitle: clean(noteRecord?.title),
            blocks: exampleBlocks
        });
        translationSaved = exampleBlocks.length;
        if (!Array.isArray(merged) && exampleBlocks.length > 0) {
            translationSaved = 0;
        }
    }

    return {
        parsedCount: parsedBlocks.length,
        writingSaved,
        translationSaved,
        removed
    };
};

const normalizeCard = (raw = {}) => {
    const word = clean(raw.word || raw.term || raw.vocab || firstLine(raw.front));
    const phonetic = clean(raw.phonetic || raw.pronunciation || raw.ipa).replace(/^\/|\/$/g, '');
    const meaning = clean(raw.chinese_meaning || raw.meaning || raw.definition || raw.cn || raw.translation || raw.back);
    const example = clean(raw.example);
    const exampleTranslation = clean(raw.example_translation || raw.exampleTranslation);
    const context = clean(raw.context);

    let front = clean(raw.front) || word;
    if (phonetic && !/\/[^/]+\//.test(front)) {
        front = [front, `/${phonetic}/`].filter(Boolean).join('\n');
    }
    if (example && !front.includes(example)) {
        front = [front, `Example: ${example}`].filter(Boolean).join('\n');
    }

    const back = clean(raw.back) || [
        meaning,
        exampleTranslation ? `例句翻译：${exampleTranslation}` : '',
        context ? `语境：${context}` : ''
    ].filter(Boolean).join('\n').trim();

    return { front, back };
};

const findCardByWord = (cards = [], word = '') => {
    const needle = clean(word).toLowerCase();
    if (!needle) return null;
    return cards.find((c) => firstLine(c.front).toLowerCase() === needle)
        || cards.find((c) => (c.front || '').toLowerCase().includes(needle))
        || null;
};

const generateDeepNoteMarkdown = async ({ word, context = '', translation = '', settings = {} }) => {
    const apiKey = clean(settings.apiKey);
    const apiBaseUrl = clean(settings.apiBaseUrl || '/api/ai');
    const modelName = clean(settings.modelName || 'kimi-k2-0905-preview');
    if (!apiKey || !apiBaseUrl) return null;

    const cleanUrl = apiBaseUrl.replace(/\/+$/, '');
    const fallbackPrompt = `
Role: Expert English Teacher.
Task: Create a "Deep Dive Vocabulary Note" for the word: "{{word}}".
Context: The word appears in this sentence: "{{context}}".

Output Format: Markdown (Strictly follow this structure):

## {{word}}
### 1. 词性与词源
*   **词性：** [e.g. Noun/Verb]
*   **词源：** [Brief etymology]

### 2. 核心释义
1.  **[Meaning 1]：** [Definition]
2.  **[Meaning 2]：** [Definition]

### 3. 常见搭配与用法
*   **[Collocation 1]**：[CN Meaning]
*   **[Collocation 2]**：[CN Meaning]
    > [Example sentence]

### 4. 同/近义词辨析
| 单词 | 侧重点 | 例句 |
| :--- | :--- | :--- |
| **{{word}}** | ... | ... |
| **[Synonym]** | ... | ... |

### 5. 例句展示
1.  [Sentence 1] ([CN Translation])
2.  [Sentence 2] ([CN Translation])

**记忆要点：** [Mnemonic or key takeaway]

### 6. 考试应用与备考策略
- **考察频率：** [High/Medium]
- **写作/翻译提分点：** [Tips]
`.trim();
    const promptTemplate = clean(settings.deepNotePrompt) || fallbackPrompt;
    const prompt = promptTemplate
        .replace(/{{word}}/g, word || 'N/A')
        .replace(/{{context}}/g, context || 'No specific context')
        .replace(/{{translation}}/g, translation || 'Not provided');

    const response = await fetch(`${cleanUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: modelName,
            messages: [
                { role: 'system', content: 'You are a strict but helpful English teacher. Return clean Markdown only.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.4
        })
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Deep note API error ${response.status}: ${text || 'unknown error'}`);
    }

    const data = await response.json();
    return clean(data?.choices?.[0]?.message?.content) || null;
};

const fn = (name, description, properties = {}, required = []) => ({
    type: 'function',
    function: { name, description, parameters: { type: 'object', properties, required } }
});

export const AGENT_TOOLS = [
    fn('get_flashcard_stats', 'Get flashcard statistics.'),
    fn('get_study_history', 'Get recent study/import history.', { limit: { type: 'number' } }),
    fn('get_notes_summary', 'Get notes summary.', { limit: { type: 'number' } }),
    fn('get_note_detail', 'Get one note detail (including full content) by id or title.', {
        id: { type: 'string' },
        title: { type: 'string' },
        query: { type: 'string' }
    }),
    fn('get_study_logs', 'Get study logs summary.', { limit: { type: 'number' } }),
    fn('get_user_goal', 'Get user goal.'),
    fn('get_drill_performance', 'Get drill performance.', { days: { type: 'number' } }),
    fn('get_current_reading_exam_article', 'Get the current or recent Reading & Exam article from the reading exam workspace, including passage, questions, marked vocabulary, marked difficult sentences, and score state.', {
        source: { type: 'string', enum: ['current_or_latest', 'current', 'latest_history', 'history'] },
        historyId: { type: 'string' },
        limit: { type: 'number' },
        maxPassageChars: { type: 'number' }
    }),
    fn('extract_reading_learning_points_preview', 'Preview learning points from a Reading & Exam article without saving: vocabulary, grammar/long sentences, passage structure, note outline, deep-note targets, translation examples, and writing prompts.', {
        source: { type: 'string', enum: ['current_or_latest', 'current', 'latest_history', 'history'] },
        historyId: { type: 'string' },
        title: { type: 'string' },
        passage: { type: 'string' },
        maxWords: { type: 'number' },
        maxSentences: { type: 'number' },
        includeStructure: { type: 'boolean' },
        maxPassageChars: { type: 'number' }
    }),
    fn('get_writing_history', 'Get writing history.', { limit: { type: 'number' } }),
    fn('list_writing_materials', 'List writing materials in the writing pack.', {
        query: { type: 'string' },
        category: { type: 'string' },
        limit: { type: 'number' }
    }),
    fn('create_writing_material', 'Create a writing material item.', {
        title: { type: 'string' },
        content: { type: 'string' },
        category: { type: 'string' },
        topic: { type: 'string' },
        examType: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        source: { type: 'string' }
    }, ['title', 'content']),
    fn('update_writing_material', 'Update writing material by id.', {
        id: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        category: { type: 'string' },
        topic: { type: 'string' },
        examType: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } }
    }, ['id']),
    fn('upsert_writing_vocabulary', 'Create or update one writing vocabulary replacement record. Use this for the writing desk vocabulary replacement table, not for inserting text into drafts.', {
        id: { type: 'string' },
        sourceTerm: { type: 'string' },
        targetTerm: { type: 'string' },
        replaceReason: { type: 'string' },
        beforeExample: { type: 'string' },
        afterExample: { type: 'string' },
        usage: { type: 'string' },
        caution: { type: 'string' },
        title: { type: 'string' },
        topic: { type: 'string' },
        examType: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } }
    }, ['sourceTerm', 'targetTerm']),
    fn('delete_writing_materials', 'Delete writing materials by ids or titles.', {
        ids: { type: 'array', items: { type: 'string' } },
        titles: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number' }
    }),
    fn('get_highlights', 'Get highlights.', { limit: { type: 'number' } }),
    fn('get_tasks', 'Get task list.', { includeCompleted: { type: 'boolean' } }),
    fn('list_flashcard_folders', 'List flashcard folders and optional card counts.', {
        includeCounts: { type: 'boolean' }
    }),
    fn('list_flashcards', 'List flashcards with folder/name/query filters and full front/back content.', {
        folderId: { type: 'string' },
        folderName: { type: 'string' },
        query: { type: 'string' },
        words: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number' }
    }),
    fn('create_flashcards', 'Create flashcards. Prefer structured items with word, phonetic, and Chinese meaning; the app will save front as word + /phonetic/ and back as Chinese meaning.', {
        cards: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    front: { type: 'string' },
                    back: { type: 'string' },
                    word: { type: 'string' },
                    phonetic: { type: 'string' },
                    chinese_meaning: { type: 'string' },
                    example: { type: 'string' },
                    example_translation: { type: 'string' },
                    context: { type: 'string' },
                    folderId: { type: 'string' },
                    folderName: { type: 'string' },
                    tags: { type: 'array', items: { type: 'string' } }
                }
            }
        }
    }, ['cards']),
    fn('update_flashcard', 'Update a flashcard by id, including front/back content edits.', {
        id: { type: 'string' },
        front: { type: 'string' },
        back: { type: 'string' },
        folderId: { type: 'string' },
        folderName: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        isMastered: { type: 'boolean' },
        isFlagged: { type: 'boolean' }
    }, ['id']),
    fn('delete_flashcards', 'Delete flashcards by explicit ids or exact words only.', {
        ids: { type: 'array', items: { type: 'string' } },
        words: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number' }
    }),
    fn('flashcard_batch_delete', 'Batch delete flashcards by explicit filters. Use createdOn/createdAfter/createdBefore for date-based deletes.', {
        ids: { type: 'array', items: { type: 'string' } },
        words: { type: 'array', items: { type: 'string' } },
        query: { type: 'string' },
        folderId: { type: 'string' },
        folderName: { type: 'string' },
        createdOn: { type: 'string' },
        createdAfter: { type: 'string' },
        createdBefore: { type: 'string' },
        onlyDue: { type: 'boolean' },
        onlyMastered: { type: 'boolean' },
        onlyFlagged: { type: 'boolean' },
        limit: { type: 'number' },
        dryRun: { type: 'boolean' }
    }),
    fn('flashcard_batch_move_folder', 'Batch move flashcards to another folder with mixed filters.', {
        ids: { type: 'array', items: { type: 'string' } },
        words: { type: 'array', items: { type: 'string' } },
        query: { type: 'string' },
        folderId: { type: 'string' },
        folderName: { type: 'string' },
        onlyDue: { type: 'boolean' },
        onlyMastered: { type: 'boolean' },
        onlyFlagged: { type: 'boolean' },
        limit: { type: 'number' },
        targetFolderId: { type: 'string' },
        targetFolderName: { type: 'string' },
        dryRun: { type: 'boolean' }
    }),
    fn('flashcard_batch_edit', 'Batch edit flashcards (tags, mastered/flagged, append/replace front/back).', {
        ids: { type: 'array', items: { type: 'string' } },
        words: { type: 'array', items: { type: 'string' } },
        query: { type: 'string' },
        folderId: { type: 'string' },
        folderName: { type: 'string' },
        onlyDue: { type: 'boolean' },
        onlyMastered: { type: 'boolean' },
        onlyFlagged: { type: 'boolean' },
        limit: { type: 'number' },
        setTags: { type: 'array', items: { type: 'string' } },
        addTags: { type: 'array', items: { type: 'string' } },
        removeTags: { type: 'array', items: { type: 'string' } },
        setMastered: { type: 'boolean' },
        setFlagged: { type: 'boolean' },
        prependFront: { type: 'string' },
        appendFront: { type: 'string' },
        prependBack: { type: 'string' },
        appendBack: { type: 'string' },
        replaceFrontFrom: { type: 'string' },
        replaceFrontTo: { type: 'string' },
        replaceBackFrom: { type: 'string' },
        replaceBackTo: { type: 'string' },
        dryRun: { type: 'boolean' }
    }),
    fn('flashcard_delete_by_rule', 'Delete flashcards by strict rules (duplicate/empty/no_front/no_back/mastered/flagged/weakness_above).', {
        rule: {
            type: 'string',
            enum: ['duplicate', 'empty', 'no_front', 'no_back', 'mastered', 'flagged', 'weakness_above']
        },
        threshold: { type: 'number' },
        limit: { type: 'number' },
        dryRun: { type: 'boolean' }
    }, ['rule']),
    fn('flashcard_undo_last_batch', 'Undo last flashcard batch operation executed by agent.'),
    fn('create_note', 'Create note.', { title: { type: 'string' }, content: { type: 'string' }, folder: { type: 'string' } }, ['title', 'content']),
    fn('update_note', 'Update note by id.', { id: { type: 'string' }, title: { type: 'string' }, content: { type: 'string' }, folder: { type: 'string' } }, ['id']),
    fn('delete_notes', 'Delete notes by ids or titles.', {
        ids: { type: 'array', items: { type: 'string' } },
        titles: { type: 'array', items: { type: 'string' } },
        limit: { type: 'number' }
    }),
    fn('create_task_item', 'Create task.', { text: { type: 'string' }, type: { type: 'string' } }, ['text']),
    fn('update_task_item', 'Update task.', { id: { type: 'string' }, text: { type: 'string' }, completed: { type: 'boolean' } }, ['id']),
    fn('delete_task_items', 'Delete tasks.', { ids: { type: 'array', items: { type: 'string' } } }, ['ids']),
    fn('create_listening_audio', 'Generate an English listening script from a topic or provided text, synthesize it with the existing TTS audio interface, save it into Listening Lab, and store the transcript.', {
        topic: { type: 'string' },
        text: { type: 'string' },
        title: { type: 'string' },
        level: { type: 'string' },
        style: { type: 'string' },
        durationSeconds: { type: 'number' },
        wordCount: { type: 'number' },
        folder: { type: 'string' },
        voice: { type: 'string' },
        generateQuiz: { type: 'boolean' },
        quizQuestionCount: { type: 'number' }
    }),
    fn('create_writing_task', 'Create in-chat writing exercise.', {
        title: { type: 'string' },
        sentences: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    chinese: { type: 'string' },
                    targetWord: { type: 'string' },
                    hint: { type: 'string' }
                },
                required: ['chinese', 'targetWord']
            }
        }
    }, ['sentences']),
    fn('create_coach_topic', 'Create coach topic and navigate.', {
        topic: { type: 'string' },
        scenario: { type: 'string' },
        systemPrompt: { type: 'string' },
        vocabulary: { type: 'array', items: { type: 'string' } }
    }, ['topic', 'systemPrompt']),
    fn('navigate_to', 'Navigate to view.', {
        view: {
            type: 'string',
            enum: ['dashboard', 'flashcards', 'writer', 'coach', 'notes', 'study', 'exam', 'plan', 'knowledge', 'import', 'review', 'listening']
        }
    }, ['view']),
    fn('create_interactive_quiz', 'Create quiz widget.', {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' } },
        correctAnswer: { type: 'string' },
        explanation: { type: 'string' }
    }, ['question', 'options', 'correctAnswer']),
    fn('review_flashcards', 'Pick cards for in-chat review.', {
        count: { type: 'number' },
        filter: { type: 'string', enum: ['due', 'weak', 'recent'] }
    }),
    fn('generate_deep_note', 'Generate a deep vocabulary note with AI and save it into Notes; can optionally bind to a flashcard.', {
        flashcardId: { type: 'string' },
        word: { type: 'string' },
        context: { type: 'string' },
        translation: { type: 'string' },
        folder: { type: 'string' },
        title: { type: 'string' }
    }),
    fn('note_create_deep_note', 'Create a deep note (word/topic), save to today folder by default, and optionally sync to writing materials/translation examples.', {
        word: { type: 'string' },
        topic: { type: 'string' },
        flashcardId: { type: 'string' },
        context: { type: 'string' },
        translation: { type: 'string' },
        folder: { type: 'string' },
        title: { type: 'string' },
        syncToWriting: { type: 'boolean' },
        syncToTranslation: { type: 'boolean' },
        clearExistingLinks: { type: 'boolean' }
    }),
    fn('note_append_today_folder', 'Append or prepend content into a note in today folder (auto-create if missing).', {
        noteId: { type: 'string' },
        title: { type: 'string' },
        heading: { type: 'string' },
        content: { type: 'string' },
        mode: { type: 'string', enum: ['append', 'prepend'] },
        syncKnowledge: { type: 'boolean' },
        syncToWriting: { type: 'boolean' },
        syncToTranslation: { type: 'boolean' }
    }, ['content']),
    fn('note_partial_sync_to_materials', 'Sync one note to writing materials and/or translation linked examples.', {
        noteId: { type: 'string' },
        title: { type: 'string' },
        toWriting: { type: 'boolean' },
        toTranslation: { type: 'boolean' },
        clearExisting: { type: 'boolean' },
        maxItems: { type: 'number' }
    }),
    fn('organize_flashcards_to_note', 'Collect flashcards from a folder and write them into one note with verification.', {
        sourceFolderId: { type: 'string' },
        sourceFolderName: { type: 'string' },
        noteId: { type: 'string' },
        noteTitle: { type: 'string' },
        noteFolder: { type: 'string' },
        mode: { type: 'string', enum: ['append', 'replace'] }
    })
];

export async function executeAgentTool(toolName, params = {}, options = {}) {
    const settings = options?.settings || null;
    const now = Date.now();
    switch (toolName) {
        case 'get_flashcard_stats': {
            const [cards, folders] = await Promise.all([getFlashcards(), getFolders()]);
            const folderMap = new Map((folders || []).map((f) => [f.id, f.name]));
            const t = today();
            const due = (cards || []).filter((c) => isDue(c, now));
            const reviewedToday = (cards || []).filter((c) => (c.lastReview || '').startsWith(t));
            const weakCards = [...(cards || [])]
                .sort((a, b) => (b.weaknessScore || 0) - (a.weaknessScore || 0))
                .slice(0, 10)
                .map((c) => ({ id: c.id, word: firstLine(c.front), weaknessScore: c.weaknessScore || 0, nextReview: c.nextReview || null }));
            return {
                totalCards: (cards || []).length,
                dueNow: due.length,
                reviewedToday: reviewedToday.length,
                mastered: (cards || []).filter((c) => c.isMastered).length,
                flagged: (cards || []).filter((c) => c.isFlagged).length,
                folderDistribution: byCount(cards || [], (c) => folderMap.get(c.folderId) || 'Uncategorized'),
                weakCards
            };
        }
        case 'get_study_history': {
            const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
            const list = (await getHistory()) || [];
            return { total: list.length, items: list.slice(0, limit) };
        }
        case 'get_notes_summary': {
            const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
            const notes = (await getNotes()) || [];
            return { total: notes.length, latest: notes.slice(0, limit).map((n) => ({ id: n.id, title: n.title, folder: n.folder || null, updatedAt: n.updatedAt })) };
        }
        case 'get_note_detail': {
            const notes = arr(await getNotes());
            const idNeedle = clean(params.id);
            const titleNeedle = clean(params.title).toLowerCase();
            const queryNeedle = clean(params.query).toLowerCase();
            const note = notes.find((n) => {
                if (idNeedle && String(n.id) === idNeedle) return true;
                if (titleNeedle && String(n.title || '').trim().toLowerCase() === titleNeedle) return true;
                if (queryNeedle) {
                    const hay = `${n.title || ''}\n${n.content || ''}`.toLowerCase();
                    return hay.includes(queryNeedle);
                }
                return false;
            });
            if (!note) {
                return { error: 'Note not found. Provide id, title, or query.' };
            }
            return {
                id: note.id,
                title: note.title || '',
                folder: note.folder || null,
                content: String(note.content || ''),
                updatedAt: note.updatedAt || null
            };
        }
        case 'get_study_logs': {
            const limit = Math.max(1, Math.min(200, Number(params.limit) || 50));
            const logs = (await getStudyLogs()) || [];
            return { total: logs.length, byType: byCount(logs, (l) => l.type || 'unknown'), byDate: byCount(logs, (l) => l.date || 'unknown').slice(0, 14), latest: logs.slice(-limit).reverse() };
        }
        case 'get_user_goal': {
            const goal = await getUserGoal();
            return goal || { message: 'No user goal configured yet.' };
        }
        case 'get_drill_performance': {
            const days = Math.max(1, Math.min(30, Number(params.days) || 7));
            const logs = (await getRecentDrillLogs(now - days * 24 * 60 * 60 * 1000)) || [];
            const m = new Map();
            for (const l of logs) {
                const d = l.dimension || 'unknown';
                const x = m.get(d) || { dimension: d, total: 0, correct: 0 };
                x.total += 1;
                if (l.is_correct) x.correct += 1;
                m.set(d, x);
            }
            return {
                days,
                totalAttempts: logs.length,
                dimensions: Array.from(m.values()).map((x) => ({ ...x, accuracy: x.total ? Number(((x.correct / x.total) * 100).toFixed(1)) : 0 }))
            };
        }
        case 'get_current_reading_exam_article': {
            const articles = getReadingExamArticles(params);
            if (!articles.length) {
                return {
                    error: 'No Reading & Exam article found. Open 阅读与考试 and generate/read an article first, or choose a history item.'
                };
            }
            return {
                _action: 'got_reading_exam_article',
                _navigateTo: 'exam',
                total: articles.length,
                article: articles[0],
                articles,
                message: `Loaded ${articles.length} Reading & Exam article${articles.length > 1 ? 's' : ''}.`
            };
        }
        case 'extract_reading_learning_points_preview': {
            const maxWords = Math.max(3, Math.min(20, Number(params.maxWords) || 12));
            const maxSentences = Math.max(2, Math.min(12, Number(params.maxSentences) || 6));
            const articles = getReadingExamArticles({ ...params, limit: 1 });
            const article = articles[0];
            if (!article?.passage) {
                return {
                    error: 'No Reading & Exam passage available for extraction. Provide passage, or open 阅读与考试 first.'
                };
            }

            const fallback = buildHeuristicReadingLearningPoints(article, maxWords, maxSentences);
            const warnings = [];
            let aiPreview = null;
            let structure = null;

            if (params.includeStructure !== false) {
                try {
                    structure = await analyzePassageStructure(article.passage, settings || {});
                } catch (error) {
                    warnings.push(`Structure analysis fallback used: ${error?.message || error}`);
                }
            }

            if (settings?.apiKey) {
                try {
                    const markedVocabulary = arr(article.wordMarks)
                        .map((m) => `${m.text}${m.definition ? `: ${m.definition}` : ''}`)
                        .join('\n');
                    const markedSentences = arr(article.sentenceMarks)
                        .map((m) => `${m.text}${m.analysis ? `\n${m.analysis}` : ''}`)
                        .join('\n\n');
                    const questionContext = [
                        ...arr(article.questions).slice(0, 8).map((q, index) => `Q${index + 1}: ${q.question}\nAnswer: ${q.answer}\nEvidence: ${q.evidence_sentence}`),
                        ...arr(article.matching?.statements).slice(0, 8).map((q, index) => `M${index + 1}: ${q.text}\nAnswer: ${q.answer}\nEvidence: ${q.evidence_sentence}`)
                    ].join('\n\n');

                    const prompt = `请从“阅读与考试”文章中提取学习点预览。只返回严格 JSON，不要 Markdown。

要求：
1. vocabulary 提取 ${maxWords} 个左右值得做闪卡的词，必须尽量来自原文。
2. grammar 提取 ${maxSentences} 个左右长难句/语法点，sentence 尽量使用原文原句。
3. noteOutline 生成可直接写入笔记的中文 Markdown 摘要。
4. deepNoteTargets 给出适合生成深度笔记的词或句。
5. translationExamples 选择适合中译英复现的句子，answer 可以是英文原句。
6. writingPrompts 生成基于文章表达的写作迁移练习。

JSON schema:
{
  "vocabulary": [{ "word": "", "phonetic": "", "definition": "", "example": "", "context": "", "reason": "" }],
  "grammar": [{ "sentence": "", "analysis": "", "translation": "", "pattern": "" }],
  "noteOutline": "",
  "deepNoteTargets": [{ "type": "word|sentence|grammar", "text": "", "reason": "" }],
  "translationExamples": [{ "chinese": "", "answer": "", "hint": "" }],
  "writingPrompts": [{ "title": "", "prompt": "", "targetWords": [] }]
}

文章标题：${article.title}

已标记生词：
${markedVocabulary || '(none)'}

已标记疑难句：
${markedSentences || '(none)'}

题目/证据上下文：
${questionContext || '(none)'}

文章原文：
${article.passage}`;

                    const result = await sendChat([
                        { role: 'system', content: 'You are a strict Reading & Exam learning point extractor. Return valid JSON only.' },
                        { role: 'user', content: prompt }
                    ], settings, true);
                    const parsed = parseJsonObjectFromText(result);
                    if (!parsed) throw new Error('AI returned invalid JSON');
                    aiPreview = normalizeReadingLearningPreview(parsed, fallback);
                } catch (error) {
                    warnings.push(`AI extraction failed; heuristic preview kept: ${error?.message || error}`);
                }
            } else {
                warnings.push('AI extraction skipped because API key is not configured; heuristic preview returned.');
            }

            const preview = aiPreview ? {
                source: 'ai',
                vocabulary: aiPreview.vocabulary.length ? aiPreview.vocabulary : fallback.vocabulary,
                grammar: aiPreview.grammar.length ? aiPreview.grammar : fallback.grammar,
                noteOutline: aiPreview.noteOutline || fallback.noteOutline,
                deepNoteTargets: aiPreview.deepNoteTargets.length ? aiPreview.deepNoteTargets : fallback.deepNoteTargets,
                translationExamples: aiPreview.translationExamples.length ? aiPreview.translationExamples : fallback.translationExamples,
                writingPrompts: aiPreview.writingPrompts.length ? aiPreview.writingPrompts : fallback.writingPrompts
            } : fallback;

            return {
                _action: 'reading_learning_points_preview',
                _navigateTo: 'exam',
                article: {
                    id: article.id,
                    source: article.source,
                    title: article.title,
                    mode: article.mode,
                    passageOriginalLength: article.passageOriginalLength,
                    passageTruncated: article.passageTruncated,
                    questionsCount: arr(article.questions).length,
                    matchingCount: arr(article.matching?.statements).length,
                    wordMarksCount: arr(article.wordMarks).length,
                    sentenceMarksCount: arr(article.sentenceMarks).length
                },
                structure,
                preview,
                warnings,
                message: `Preview ready: ${preview.vocabulary.length} vocabulary items, ${preview.grammar.length} grammar items, ${preview.translationExamples.length} translation examples.`
            };
        }
        case 'get_writing_history': {
            const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
            const list = (await getWritings()) || [];
            return { total: list.length, latest: list.slice(0, limit).map((w) => ({ id: w.id, title: w.title, updatedAt: w.updatedAt })) };
        }
        case 'list_writing_materials': {
            const limit = Math.max(1, Math.min(200, Number(params.limit) || 50));
            const query = clean(params.query).toLowerCase();
            const category = clean(params.category).toLowerCase();
            const list = (await getWritingMaterials()) || [];
            const filtered = list.filter((m) => {
                if (category && String(m.category || '').toLowerCase() !== category) return false;
                if (!query) return true;
                const hay = `${m.title || ''}\n${m.content || ''}\n${m.topic || ''}\n${(m.tags || []).join(' ')}`.toLowerCase();
                return hay.includes(query);
            });
            return {
                total: filtered.length,
                items: filtered.slice(0, limit).map((m) => ({
                    id: m.id,
                    title: m.title,
                    category: m.category || 'argument',
                    topic: m.topic || '',
                    examType: m.examType || '',
                    tags: m.tags || [],
                    updatedAt: m.updatedAt
                }))
            };
        }
        case 'create_writing_material': {
            const title = clean(params.title);
            const content = clean(params.content);
            if (!title || !content) return { error: 'title and content are required.' };
            const material = await saveWritingMaterial({
                id: id('agent_material'),
                title,
                content,
                category: normalizeMaterialCategory(params.category),
                topic: clean(params.topic),
                examType: clean(params.examType),
                tags: arr(params.tags).map((x) => clean(x)).filter(Boolean).slice(0, 12),
                source: clean(params.source) || 'agent'
            });
            return {
                _action: 'created_writing_material',
                _navigateTo: 'writer',
                _navigateToParams: { openMaterials: true, materialId: material.id },
                id: material.id,
                message: `Created writing material: ${material.title}`
            };
        }
        case 'update_writing_material': {
            const materialId = clean(params.id);
            if (!materialId) return { error: 'Missing material id.' };
            const all = (await getWritingMaterials()) || [];
            const material = all.find((m) => m.id === materialId);
            if (!material) return { error: `Writing material not found: ${materialId}` };
            const updated = await saveWritingMaterial({
                ...material,
                ...(params.title !== undefined ? { title: clean(params.title) } : {}),
                ...(params.content !== undefined ? { content: String(params.content) } : {}),
                ...(params.category !== undefined ? { category: normalizeMaterialCategory(params.category) } : {}),
                ...(params.topic !== undefined ? { topic: clean(params.topic) } : {}),
                ...(params.examType !== undefined ? { examType: clean(params.examType) } : {}),
                ...(params.tags !== undefined ? { tags: arr(params.tags).map((x) => clean(x)).filter(Boolean).slice(0, 12) } : {})
            });
            return {
                _action: 'updated_writing_material',
                _navigateTo: 'writer',
                _navigateToParams: { openMaterials: true, materialId: updated.id },
                id: updated.id,
                message: `Updated writing material: ${updated.title}`
            };
        }
        case 'upsert_writing_vocabulary': {
            const sourceTerm = clean(params.sourceTerm ?? params.source);
            const targetTerm = clean(params.targetTerm ?? params.target);
            if (!sourceTerm || !targetTerm) return { error: 'sourceTerm and targetTerm are required.' };
            const all = arr(await getWritingMaterials());
            const materialId = clean(params.id);
            const existing = materialId
                ? all.find((m) => String(m.id) === materialId)
                : all.find((m) => (
                    normalizeMaterialCategory(m.category) === 'vocabulary'
                    && clean(m.sourceTerm).toLowerCase() === sourceTerm.toLowerCase()
                ));
            if (materialId && !existing) return { error: `Vocabulary material not found: ${materialId}` };
            const payload = buildVocabularyMaterialPayload(params, existing);
            if (!payload.replaceReason) {
                return { error: 'replaceReason is required so the vocabulary table has useful detail.' };
            }
            const saved = await saveWritingMaterial({
                ...(existing || {}),
                ...payload,
                id: existing?.id || id('agent_vocab')
            });
            return {
                _action: existing ? 'updated_writing_vocabulary' : 'created_writing_vocabulary',
                _navigateTo: 'writer',
                _navigateToParams: { openMaterials: true, materialCategory: 'vocabulary', materialId: saved.id },
                id: saved.id,
                sourceTerm: saved.sourceTerm,
                targetTerm: saved.targetTerm,
                message: `${existing ? 'Updated' : 'Created'} vocabulary replacement: ${saved.sourceTerm} -> ${saved.targetTerm}`
            };
        }
        case 'delete_writing_materials': {
            const ids = arr(params.ids).map((x) => clean(x)).filter(Boolean);
            const titles = arr(params.titles).map((x) => clean(x).toLowerCase()).filter(Boolean);
            const limit = Math.max(1, Math.min(200, Number(params.limit) || 20));
            let targetIds = [...ids];
            if (!targetIds.length && titles.length) {
                const matched = ((await getWritingMaterials()) || []).filter((m) => {
                    const title = String(m.title || '').toLowerCase();
                    return titles.some((t) => title === t || title.includes(t));
                });
                targetIds = matched.slice(0, limit).map((m) => m.id);
            }
            if (!targetIds.length) return { error: 'Provide ids or titles for deleting writing materials.' };
            for (const x of targetIds) await deleteWritingMaterial(x);
            return {
                _action: 'deleted_writing_materials',
                _navigateTo: 'writer',
                _navigateToParams: { openMaterials: true },
                deleted: targetIds.length,
                ids: targetIds,
                message: `Deleted ${targetIds.length} writing materials.`
            };
        }
        case 'get_highlights': {
            const limit = Math.max(1, Math.min(200, Number(params.limit) || 30));
            const list = (await getAllHighlights()) || [];
            return { total: list.length, latest: list.slice(0, limit) };
        }
        case 'get_tasks': {
            const includeCompleted = params.includeCompleted !== false;
            const tasks = ((await getTasks()) || []).filter((t) => includeCompleted || !t.completed);
            return { total: tasks.length, pending: tasks.filter((t) => !t.completed).length, completed: tasks.filter((t) => t.completed).length, items: tasks.slice(0, 100) };
        }
        case 'list_flashcard_folders': {
            const includeCounts = params.includeCounts !== false;
            const [folders, cards] = await Promise.all([getFolders(), getFlashcards()]);
            const cardRows = arr(cards);
            const folderRows = arr(folders);
            const counts = new Map();
            if (includeCounts) {
                for (const card of cardRows) {
                    const key = clean(card.folderId) || '__uncategorized__';
                    counts.set(key, (counts.get(key) || 0) + 1);
                }
            }
            const items = folderRows.map((folder) => ({
                id: String(folder.id),
                name: clean(folder.name),
                count: includeCounts ? (counts.get(String(folder.id)) || 0) : undefined
            }));
            if (includeCounts && (counts.get('__uncategorized__') || 0) > 0) {
                items.push({
                    id: '',
                    name: 'Uncategorized',
                    count: counts.get('__uncategorized__') || 0
                });
            }
            return { total: items.length, items };
        }
        case 'list_flashcards': {
            const limit = Math.max(1, Math.min(500, Number(params.limit) || 100));
            const folder = await resolveFlashcardFolder({
                folderId: params.folderId,
                folderName: params.folderName
            });
            const words = normalizeWordNeedles(params.words);
            const queryNeedle = clean(params.query).toLowerCase();
            const cards = arr(await getFlashcards());
            const filtered = cards.filter((card) => {
                const normalized = stringifyCardContent(card);
                if (folder && clean(normalized.folderId) !== clean(folder.id)) return false;
                const hay = `${normalized.word}\n${normalized.front}\n${normalized.back}`.toLowerCase();
                if (words.length > 0 && !words.some((w) => hay.includes(w))) return false;
                if (queryNeedle && !hay.includes(queryNeedle)) return false;
                return true;
            });
            const rows = filtered
                .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
                .slice(0, limit)
                .map(stringifyCardContent);
            return {
                totalMatched: filtered.length,
                returned: rows.length,
                folder: folder ? { id: String(folder.id), name: clean(folder.name) } : null,
                items: rows
            };
        }
        case 'organize_flashcards_to_note': {
            const sourceFolder = await resolveFlashcardFolder({
                folderId: params.sourceFolderId,
                folderName: params.sourceFolderName
            });
            if (!sourceFolder) {
                return { error: 'Source folder not found. Provide sourceFolderId or sourceFolderName.' };
            }

            const allCards = arr(await getFlashcards());
            const sourceCards = allCards
                .filter((c) => clean(c.folderId) === clean(sourceFolder.id))
                .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));

            if (!sourceCards.length) {
                return { error: `No flashcards found in folder "${clean(sourceFolder.name)}".` };
            }

            const noteBlock = buildFlashcardsMarkdownBlock(
                sourceCards,
                clean(sourceFolder.name),
                clean(params.heading) || `${clean(sourceFolder.name)} Flashcards`
            );

            const mode = clean(params.mode).toLowerCase() === 'replace' ? 'replace' : 'append';
            const noteIdNeedle = clean(params.noteId);
            const noteTitleNeedle = clean(params.noteTitle).toLowerCase();
            const allNotes = arr(await getNotes());

            let targetNote = noteIdNeedle
                ? allNotes.find((n) => String(n.id) === noteIdNeedle) || null
                : null;
            if (!targetNote && noteTitleNeedle) {
                targetNote = allNotes.find((n) => clean(n.title).toLowerCase() === noteTitleNeedle) || null;
            }

            const noteFolder = clean(params.noteFolder)
                || clean(targetNote?.folder)
                || await getDefaultNoteFolderName();
            await ensureFolder(noteFolder);

            const nextTitle = clean(params.noteTitle)
                || clean(targetNote?.title)
                || `${clean(sourceFolder.name)} Learning Review`;
            const previous = String(targetNote?.content || '').trim();
            const nextContent = mode === 'replace' || !previous
                ? noteBlock
                : `${previous}\n\n---\n\n${noteBlock}`;

            const nextNote = {
                ...(targetNote || {
                    id: id('agent_note_pack'),
                    date: new Date().toISOString()
                }),
                title: nextTitle,
                folder: noteFolder,
                content: nextContent,
                updatedAt: Date.now()
            };

            await saveNote(nextNote);
            const verified = await verifyNoteWrite({
                noteId: nextNote.id,
                expectedMinLength: Math.max(1, String(nextContent).trim().length)
            });
            if (!verified.ok) return { error: verified.reason };

            return {
                _action: 'organized_flashcards_to_note',
                _navigateTo: 'notes',
                _navigateToParams: { id: nextNote.id },
                noteId: nextNote.id,
                noteTitle: nextNote.title,
                noteFolder: nextNote.folder,
                sourceFolder: {
                    id: String(sourceFolder.id),
                    name: clean(sourceFolder.name)
                },
                cardsCount: sourceCards.length,
                sampleWords: sourceCards.slice(0, 12).map((c) => firstLine(c.front)),
                contentLength: verified.contentLength,
                mode,
                message: `Organized ${sourceCards.length} flashcards from "${clean(sourceFolder.name)}" into note "${nextNote.title}".`
            };
        }
        case 'create_flashcards': {
            const cards = arr(params.cards);
            if (!cards.length) return { error: 'cards is required and must be a non-empty array.' };
            const ids = [];
            for (const raw of cards) {
                const folder = raw.folderName ? await ensureFolder(raw.folderName) : null;
                const body = normalizeCard(raw);
                if (!body.front || !body.back) continue;
                const card = {
                    id: id('agent_card'),
                    front: body.front,
                    back: body.back,
                    folderId: raw.folderId || folder?.id || null,
                    tags: arr(raw.tags),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    reviews: 0,
                    interval: 0,
                    easeFactor: 2.5,
                    weaknessScore: 0
                };
                await saveFlashcard(card);
                ids.push(card.id);
            }
            return { _action: 'created_flashcards', _navigateTo: 'flashcards', count: ids.length, ids, message: `Created ${ids.length} flashcards.` };
        }
        case 'update_flashcard': {
            const { id: cardId } = params;
            if (!cardId) return { error: 'Missing flashcard id.' };
            const card = ((await getFlashcards()) || []).find((c) => c.id === cardId);
            if (!card) return { error: `Flashcard not found: ${cardId}` };
            let folderId = params.folderId;
            if (!folderId && params.folderName) {
                const folder = await ensureFolder(params.folderName);
                folderId = folder?.id || null;
            }
            const updated = {
                ...card,
                ...(params.front !== undefined ? { front: params.front } : {}),
                ...(params.back !== undefined ? { back: params.back } : {}),
                ...(folderId !== undefined ? { folderId } : {}),
                ...(params.tags !== undefined ? { tags: arr(params.tags) } : {}),
                ...(params.isMastered !== undefined ? { isMastered: !!params.isMastered } : {}),
                ...(params.isFlagged !== undefined ? { isFlagged: !!params.isFlagged } : {}),
                updatedAt: Date.now()
            };
            await saveFlashcard(updated);
            return { _action: 'updated_flashcard', _navigateTo: 'flashcards', id: cardId, message: `Updated flashcard: ${firstLine(updated.front) || cardId}` };
        }
        case 'delete_flashcards': {
            const ids = arr(params.ids);
            const words = arr(params.words).map((w) => String(w).trim().toLowerCase()).filter(Boolean);
            const limit = Math.max(1, Math.min(200, Number(params.limit) || 20));
            let targetIds = [...ids];
            let matchedCards = [];
            if (!targetIds.length && words.length) {
                const matched = ((await getFlashcards()) || []).filter((c) => {
                    const w = firstLine(c.front).toLowerCase();
                    return words.some((x) => w === x);
                });
                matchedCards = matched.slice(0, limit);
                targetIds = matchedCards.map((c) => c.id);
            }
            if (!targetIds.length) return { error: 'Provide ids or words for deleting flashcards.' };
            if (!matchedCards.length) {
                const cards = arr(await getFlashcards());
                const targetSet = new Set(targetIds.map(String));
                matchedCards = cards.filter((c) => targetSet.has(String(c.id)));
            }
            writeUndoSnapshot({
                op: 'delete_flashcards',
                createdAt: Date.now(),
                cards: matchedCards
            });
            for (const x of targetIds) await deleteFlashcard(x);
            return {
                _action: 'deleted_flashcards',
                _navigateTo: 'flashcards',
                deleted: targetIds.length,
                ids: targetIds,
                words: matchedCards.map((c) => firstLine(c.front)).slice(0, 20),
                canUndo: true,
                scope: ids.length ? 'explicit ids' : 'exact words',
                message: `Deleted ${targetIds.length} flashcards. Undo is available.`
            };
        }
        case 'flashcard_batch_delete': {
            const dryRun = params.dryRun === true;
            if (!hasPreciseBatchScope(params)) {
                return {
                    error: 'Batch delete refused: provide a clear scope such as ids, exact words, folder, query, createdOn, createdAfter/createdBefore, due/mastered/flagged.'
                };
            }
            const matched = await pickCardsByCriteria(params, now);
            if (!matched.length) return { error: 'No flashcards matched the batch delete filters.' };

            const snapshot = {
                op: 'batch_delete',
                createdAt: Date.now(),
                cards: matched
            };

            if (dryRun) {
                return {
                    _action: 'flashcard_batch_delete_preview',
                    _navigateTo: 'flashcards',
                    count: matched.length,
                    ids: matched.map((c) => c.id),
                    words: matched.map((c) => firstLine(c.front)).slice(0, 20),
                    scope: {
                        folderId: clean(params.folderId) || null,
                        folderName: clean(params.folderName) || null,
                        createdOn: clean(params.createdOn) || null,
                        createdAfter: clean(params.createdAfter) || null,
                        createdBefore: clean(params.createdBefore) || null,
                        query: clean(params.query) || null
                    },
                    canUndo: false,
                    message: `Preview: ${matched.length} flashcards would be deleted.`
                };
            }

            for (const c of matched) await deleteFlashcard(c.id);
            writeUndoSnapshot(snapshot);
            return {
                _action: 'flashcard_batch_delete',
                _navigateTo: 'flashcards',
                deleted: matched.length,
                ids: matched.map((c) => c.id),
                words: matched.map((c) => firstLine(c.front)).slice(0, 20),
                canUndo: true,
                scope: {
                    folderId: clean(params.folderId) || null,
                    folderName: clean(params.folderName) || null,
                    createdOn: clean(params.createdOn) || null,
                    createdAfter: clean(params.createdAfter) || null,
                    createdBefore: clean(params.createdBefore) || null,
                    query: clean(params.query) || null
                },
                message: `Deleted ${matched.length} flashcards in batch. You can undo this operation.`
            };
        }
        case 'flashcard_batch_move_folder': {
            const dryRun = params.dryRun === true;
            const targetFolderIdInput = clean(params.targetFolderId);
            const targetFolderNameInput = clean(params.targetFolderName);
            if (!targetFolderIdInput && !targetFolderNameInput) {
                return { error: 'targetFolderId or targetFolderName is required.' };
            }

            const matched = await pickCardsByCriteria(params, now);
            if (!matched.length) return { error: 'No flashcards matched the batch move filters.' };

            let targetFolderId = targetFolderIdInput;
            let targetFolderName = targetFolderNameInput;
            if (!targetFolderId) {
                const folder = await ensureFolder(targetFolderNameInput);
                targetFolderId = folder?.id || null;
                targetFolderName = folder?.name || targetFolderNameInput;
            } else if (!targetFolderName) {
                const folders = await getFolders();
                const found = arr(folders).find((f) => String(f.id) === String(targetFolderId));
                targetFolderName = found?.name || '';
            }

            const before = matched.map((c) => ({ ...c }));
            const updated = matched.map((c) => ({
                ...c,
                folderId: targetFolderId,
                updatedAt: Date.now()
            }));

            if (dryRun) {
                return {
                    _action: 'flashcard_batch_move_preview',
                    _navigateTo: 'flashcards',
                    count: updated.length,
                    targetFolderId,
                    targetFolderName,
                    message: `Preview: ${updated.length} flashcards would be moved to ${targetFolderName || targetFolderId}.`
                };
            }

            for (const c of updated) await saveFlashcard(c);
            writeUndoSnapshot({
                op: 'batch_move_folder',
                createdAt: Date.now(),
                cards: before
            });
            return {
                _action: 'flashcard_batch_move_folder',
                _navigateTo: 'flashcards',
                moved: updated.length,
                targetFolderId,
                targetFolderName,
                message: `Moved ${updated.length} flashcards to ${targetFolderName || targetFolderId}.`
            };
        }
        case 'flashcard_batch_edit': {
            const dryRun = params.dryRun === true;
            const matched = await pickCardsByCriteria(params, now);
            if (!matched.length) return { error: 'No flashcards matched the batch edit filters.' };

            const setTags = params.setTags !== undefined ? arr(params.setTags).map(clean).filter(Boolean) : null;
            const addTags = arr(params.addTags).map(clean).filter(Boolean);
            const removeTags = new Set(arr(params.removeTags).map((x) => clean(x).toLowerCase()).filter(Boolean));

            const replaceFrontFrom = clean(params.replaceFrontFrom);
            const replaceFrontTo = String(params.replaceFrontTo ?? '');
            const replaceBackFrom = clean(params.replaceBackFrom);
            const replaceBackTo = String(params.replaceBackTo ?? '');

            const before = matched.map((c) => ({ ...c }));
            const updated = matched.map((card) => {
                let front = String(card.front || '');
                let back = String(card.back || '');
                if (clean(params.prependFront)) front = `${String(params.prependFront)}${front}`;
                if (clean(params.appendFront)) front = `${front}${String(params.appendFront)}`;
                if (clean(params.prependBack)) back = `${String(params.prependBack)}${back}`;
                if (clean(params.appendBack)) back = `${back}${String(params.appendBack)}`;

                if (replaceFrontFrom) front = front.split(replaceFrontFrom).join(replaceFrontTo);
                if (replaceBackFrom) back = back.split(replaceBackFrom).join(replaceBackTo);

                let nextTags = setTags ? [...setTags] : arr(card.tags);
                if (addTags.length) {
                    const s = new Set(nextTags.map((x) => String(x)));
                    addTags.forEach((x) => s.add(x));
                    nextTags = Array.from(s);
                }
                if (removeTags.size > 0) {
                    nextTags = nextTags.filter((x) => !removeTags.has(String(x).toLowerCase()));
                }

                const next = {
                    ...card,
                    front,
                    back,
                    tags: nextTags,
                    updatedAt: Date.now()
                };
                if (params.setMastered !== undefined) next.isMastered = !!params.setMastered;
                if (params.setFlagged !== undefined) next.isFlagged = !!params.setFlagged;
                return next;
            });

            if (dryRun) {
                return {
                    _action: 'flashcard_batch_edit_preview',
                    _navigateTo: 'flashcards',
                    count: updated.length,
                    sample: updated.slice(0, 3).map((c) => ({ id: c.id, word: firstLine(c.front), tags: c.tags || [] })),
                    message: `Preview: ${updated.length} flashcards would be edited.`
                };
            }

            for (const c of updated) await saveFlashcard(c);
            writeUndoSnapshot({
                op: 'batch_edit',
                createdAt: Date.now(),
                cards: before
            });
            return {
                _action: 'flashcard_batch_edit',
                _navigateTo: 'flashcards',
                edited: updated.length,
                message: `Edited ${updated.length} flashcards in batch.`
            };
        }
        case 'flashcard_delete_by_rule': {
            const dryRun = params.dryRun === true;
            const rule = clean(params.rule).toLowerCase();
            const limit = clampBatchLimit(params.limit, 200);
            const allCards = arr(await getFlashcards());
            let matched = [];

            if (rule === 'duplicate') {
                const groups = new Map();
                for (const card of allCards) {
                    const key = firstLine(card.front).toLowerCase();
                    if (!key) continue;
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(card);
                }
                for (const group of groups.values()) {
                    if (group.length <= 1) continue;
                    const sorted = [...group].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
                    matched.push(...sorted.slice(1));
                }
            } else if (rule === 'empty') {
                matched = allCards.filter((c) => !clean(c.front) || !clean(c.back));
            } else if (rule === 'no_front') {
                matched = allCards.filter((c) => !clean(c.front));
            } else if (rule === 'no_back') {
                matched = allCards.filter((c) => !clean(c.back));
            } else if (rule === 'mastered') {
                matched = allCards.filter((c) => !!c.isMastered);
            } else if (rule === 'flagged') {
                matched = allCards.filter((c) => !!c.isFlagged);
            } else if (rule === 'weakness_above') {
                const threshold = Number(params.threshold);
                const floor = Number.isFinite(threshold) ? threshold : 80;
                matched = allCards.filter((c) => Number(c.weaknessScore || 0) >= floor);
            } else {
                return { error: `Unsupported rule: ${rule}` };
            }

            matched = matched.slice(0, limit);
            if (!matched.length) return { error: `No flashcards matched rule: ${rule}` };

            if (dryRun) {
                return {
                    _action: 'flashcard_delete_by_rule_preview',
                    _navigateTo: 'flashcards',
                    rule,
                    count: matched.length,
                    words: matched.map((c) => firstLine(c.front)).slice(0, 20),
                    message: `Preview: ${matched.length} flashcards would be deleted by rule ${rule}.`
                };
            }

            for (const c of matched) await deleteFlashcard(c.id);
            writeUndoSnapshot({
                op: 'delete_by_rule',
                rule,
                createdAt: Date.now(),
                cards: matched
            });
            return {
                _action: 'flashcard_delete_by_rule',
                _navigateTo: 'flashcards',
                rule,
                deleted: matched.length,
                message: `Deleted ${matched.length} flashcards by rule ${rule}.`
            };
        }
        case 'flashcard_undo_last_batch': {
            const snapshot = readUndoSnapshot();
            if (!snapshot?.cards || !Array.isArray(snapshot.cards) || snapshot.cards.length === 0) {
                return { error: 'No undo snapshot available for flashcard batch operations.' };
            }
            for (const card of snapshot.cards) {
                await saveFlashcard(card);
            }
            const restored = snapshot.cards.length;
            writeUndoSnapshot(null);
            return {
                _action: 'flashcard_undo_last_batch',
                _navigateTo: 'flashcards',
                restored,
                op: snapshot.op || 'unknown',
                message: `Undo completed. Restored ${restored} flashcards from last batch operation.`
            };
        }
        case 'create_note': {
            const { title, content } = params;
            if (!title || !content) return { error: 'title and content are required.' };
            const folderName = clean(params.folder) || await getDefaultNoteFolderName();
            await ensureFolder(folderName);
            const note = {
                id: id('agent_note'),
                title: String(title).trim(),
                content: String(content),
                folder: folderName,
                date: new Date().toISOString(),
                updatedAt: Date.now()
            };
            await saveNote(note);
            const verified = await verifyNoteWrite({ noteId: note.id, expectedMinLength: 1 });
            if (!verified.ok) return { error: verified.reason };
            return {
                _action: 'created_note',
                _navigateTo: 'notes',
                _navigateToParams: { id: note.id },
                id: note.id,
                contentLength: verified.contentLength,
                message: `Created note: ${note.title}`
            };
        }
        case 'update_note': {
            const { id: noteId } = params;
            if (!noteId) return { error: 'Missing note id.' };
            const note = ((await getNotes()) || []).find((n) => n.id === noteId);
            if (!note) return { error: `Note not found: ${noteId}` };
            const nextFolder = params.folder !== undefined ? String(params.folder) : note.folder;
            if (nextFolder) await ensureFolder(nextFolder);
            const updated = {
                ...note,
                ...(params.title !== undefined ? { title: String(params.title) } : {}),
                ...(params.content !== undefined ? { content: String(params.content) } : {}),
                ...(params.folder !== undefined ? { folder: nextFolder } : {}),
                updatedAt: Date.now()
            };
            await saveNote(updated);
            const expectedMinLength = params.content !== undefined ? Math.max(1, String(params.content || '').trim().length) : 1;
            const verified = await verifyNoteWrite({ noteId, expectedMinLength });
            if (!verified.ok) return { error: verified.reason };
            return {
                _action: 'updated_note',
                _navigateTo: 'notes',
                _navigateToParams: { id: noteId },
                id: noteId,
                contentLength: verified.contentLength,
                message: `Updated note: ${updated.title || noteId}`
            };
        }
        case 'delete_notes': {
            const ids = arr(params.ids);
            const titles = arr(params.titles).map((t) => String(t).trim().toLowerCase()).filter(Boolean);
            const limit = Math.max(1, Math.min(200, Number(params.limit) || 20));
            let targetIds = [...ids];
            if (!targetIds.length && titles.length) {
                const matched = ((await getNotes()) || []).filter((n) => {
                    const t = (n.title || '').toLowerCase();
                    return titles.some((x) => t === x || t.includes(x));
                });
                targetIds = matched.slice(0, limit).map((n) => n.id);
            }
            if (!targetIds.length) return { error: 'Provide ids or titles for deleting notes.' };
            for (const x of targetIds) await deleteNote(x);
            return { _action: 'deleted_notes', _navigateTo: 'notes', deleted: targetIds.length, ids: targetIds, message: `Deleted ${targetIds.length} notes.` };
        }
        case 'create_task_item': {
            const { text, type = 'study' } = params;
            if (!text || !String(text).trim()) return { error: 'Task text is required.' };
            const task = { id: id('agent_task'), text: String(text).trim(), type, completed: false, createdAt: Date.now() };
            await saveTask(task);
            return { _action: 'created_task', _navigateTo: 'plan', id: task.id, message: `Created task: ${task.text}` };
        }
        case 'update_task_item': {
            const { id: taskId, text, completed } = params;
            if (!taskId) return { error: 'Missing task id.' };
            const task = ((await getTasks()) || []).find((t) => t.id === taskId);
            if (!task) return { error: `Task not found: ${taskId}` };
            const updated = {
                ...task,
                ...(text !== undefined ? { text: String(text) } : {}),
                ...(completed !== undefined ? { completed: !!completed } : {}),
                updatedAt: Date.now()
            };
            await saveTask(updated);
            return { _action: 'updated_task', _navigateTo: 'plan', id: taskId, message: `Updated task: ${updated.text || taskId}` };
        }
        case 'delete_task_items': {
            const ids = arr(params.ids);
            if (!ids.length) return { error: 'Provide task ids to delete.' };
            for (const x of ids) await deleteTask(x);
            return { _action: 'deleted_tasks', _navigateTo: 'plan', deleted: ids.length, ids, message: `Deleted ${ids.length} tasks.` };
        }
        case 'create_listening_audio': {
            const generated = await generateListeningScript(params, settings || {});
            const transcript = clean(generated.transcript);
            if (!transcript) return { error: 'No listening transcript was generated.' };
            if (transcript.length > 4000) {
                return { error: 'Listening transcript is too long for TTS. Keep it under 4000 characters.' };
            }

            const ttsSettings = params.voice
                ? { ...(settings || {}), ttsVoice: clean(params.voice) }
                : (settings || {});
            const audioBlob = await synthesizeSpeech(transcript, ttsSettings);
            const safeTitle = sanitizeFileName(params.title || generated.title || params.topic || 'AI Listening');
            const ext = audioBlob.type?.includes('wav') ? 'wav' : 'mp3';
            const fileId = id('agent_listening_audio');
            const folder = clean(params.folder) || 'AI生成';
            const fileRecord = {
                id: fileId,
                name: `[AI听力] ${safeTitle}.${ext}`,
                type: audioBlob.type || 'audio/mpeg',
                blob: audioBlob,
                timestamp: Date.now(),
                listeningFolder: folder,
                source: 'agent',
                generatedBy: 'create_listening_audio',
                topic: clean(params.topic),
                level: clean(params.level) || null,
                style: clean(params.style) || null
            };
            await saveFile(fileRecord);

            let quizData = null;
            if (params.generateQuiz === true) {
                try {
                    const count = Math.max(3, Math.min(10, Number(params.quizQuestionCount) || 6));
                    quizData = await generateListeningQuizFromTranscript(transcript, settings || {}, count);
                } catch (error) {
                    quizData = {
                        error: `Quiz generation failed: ${error?.message || error}`
                    };
                }
            }

            await saveListeningData({
                fileId,
                transcript,
                quizData,
                source: 'agent',
                topic: clean(params.topic),
                title: safeTitle
            });

            return {
                _action: 'created_listening_audio',
                _navigateTo: 'listening',
                id: fileId,
                fileId,
                name: fileRecord.name,
                folder,
                type: fileRecord.type,
                transcript,
                transcriptLength: transcript.length,
                transcriptWordCount: transcript.split(/\s+/).filter(Boolean).length,
                scriptSource: generated.source,
                quizGenerated: Boolean(quizData && !quizData.error),
                quizError: quizData?.error || null,
                message: `Created listening audio: ${fileRecord.name}`
            };
        }
        case 'create_writing_task': {
            const title = params.title || 'Sentence Writing Practice';
            const sentences = arr(params.sentences)
                .map((s) => ({ chinese: String(s.chinese || '').trim(), targetWord: String(s.targetWord || '').trim(), hint: String(s.hint || '').trim() }))
                .filter((s) => s.chinese && s.targetWord)
                .slice(0, 6);
            if (!sentences.length) return { error: 'Provide at least one valid sentence item.' };
            return { _action: 'chat_writing', title, sentences, message: `Writing practice is ready (${sentences.length} items).` };
        }
        case 'create_coach_topic': {
            const { topic, scenario, systemPrompt } = params;
            const vocabulary = arr(params.vocabulary);
            if (!topic || !systemPrompt) return { error: 'topic and systemPrompt are required.' };
            localStorage.setItem('agent_coach_topic', JSON.stringify({ topic, scenario: scenario || '', systemPrompt, vocabulary, createdAt: Date.now(), source: 'AI Agent' }));
            return { _action: 'created_coach_topic', _navigateTo: 'coach', topic, scenario, vocabulary, message: `Prepared coach topic: ${topic}` };
        }
        case 'navigate_to': {
            if (!params.view) return { error: 'Missing target view.' };
            return { _action: 'navigate', _navigateTo: params.view, message: `Navigate to ${params.view}` };
        }
        case 'create_interactive_quiz': {
            const { question, options, correctAnswer, explanation = '' } = params;
            const cleanOptions = arr(options).map((o) => String(o));
            if (!question || cleanOptions.length < 2 || !correctAnswer) {
                return { error: 'question, options (>=2) and correctAnswer are required.' };
            }
            if (!cleanOptions.includes(correctAnswer)) cleanOptions.push(String(correctAnswer));
            return {
                _action: 'chat_quiz',
                question: String(question),
                options: cleanOptions.slice(0, 6),
                correctAnswer: String(correctAnswer),
                explanation: String(explanation || 'No explanation provided.'),
                message: 'Quiz is ready.'
            };
        }
        case 'review_flashcards': {
            const count = Math.max(1, Math.min(10, Number(params.count) || 5));
            const filter = ['due', 'weak', 'recent'].includes(params.filter) ? params.filter : 'due';
            const cards = (await getFlashcards()) || [];
            if (!cards.length) return { _action: 'no_cards', message: 'No flashcards found.' };

            let selected = [];
            if (filter === 'weak') {
                selected = [...cards].sort((a, b) => (b.weaknessScore || 0) - (a.weaknessScore || 0));
            } else if (filter === 'recent') {
                selected = [...cards].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            } else {
                const due = cards.filter((c) => isDue(c, now));
                if (due.length >= count) {
                    selected = due.sort((a, b) => (b.weaknessScore || 0) - (a.weaknessScore || 0));
                } else {
                    const dueIds = new Set(due.map((c) => c.id));
                    const extras = cards.filter((c) => !dueIds.has(c.id)).sort((a, b) => (b.weaknessScore || 0) - (a.weaknessScore || 0));
                    selected = [...due, ...extras];
                }
            }

            return {
                _action: 'chat_flashcard_review',
                cards: selected.slice(0, count).map((c) => ({ id: c.id, front: c.front, back: c.back, word: firstLine(c.front) })),
                message: `Prepared ${Math.min(selected.length, count)} cards for quick review.`
            };
        }
        case 'generate_deep_note': {
            if (!settings?.apiKey) {
                return { error: 'Missing API key in settings. Please configure API key first.' };
            }

            const cards = (await getFlashcards()) || [];
            let targetCard = null;
            if (params.flashcardId) {
                targetCard = cards.find((c) => c.id === params.flashcardId) || null;
                if (!targetCard) return { error: `Flashcard not found: ${params.flashcardId}` };
            } else if (params.word) {
                targetCard = findCardByWord(cards, params.word);
            }

            const word = clean(params.word) || firstLine(targetCard?.front);
            if (!word) {
                return { error: 'Provide flashcardId or word to generate deep note.' };
            }

            const context = clean(params.context) || clean(targetCard?.context);
            const translation = clean(params.translation) || clean(targetCard?.back);
            const markdown = await generateDeepNoteMarkdown({ word, context, translation, settings });
            if (!markdown) {
                return { error: `Failed to generate deep note for "${word}".` };
            }

            let flashcardId = null;
            if (targetCard) {
                const updated = { ...targetCard, notes: markdown, updatedAt: Date.now() };
                await saveFlashcard(updated);
                flashcardId = targetCard.id;
            }

            const folder = clean(params.folder) || await getDefaultNoteFolderName();
            await ensureFolder(folder);

            const note = {
                id: targetCard ? `dn_${targetCard.id}` : id('agent_deep_note'),
                title: clean(params.title) || `深度笔记 - ${word}`,
                content: markdown,
                folder,
                date: new Date().toISOString(),
                updatedAt: Date.now()
            };
            await saveNote(note);

            return {
                _action: 'generated_deep_note',
                _navigateTo: 'notes',
                _navigateToParams: { id: note.id },
                noteId: note.id,
                flashcardId,
                word,
                message: `Generated deep note for ${word}.`
            };
        }
        case 'note_create_deep_note': {
            const deepNoteParams = {
                ...params,
                word: clean(params.word) || clean(params.topic),
                folder: clean(params.folder) || await getDefaultNoteFolderName()
            };
            if (!deepNoteParams.word && !deepNoteParams.flashcardId) {
                return { error: 'Provide word/topic or flashcardId to create deep note.' };
            }

            const generated = await executeAgentTool('generate_deep_note', deepNoteParams, options);
            if (generated?.error) return generated;

            const includeWriting = params.syncToWriting !== false;
            const includeTranslation = params.syncToTranslation !== false;
            if (includeWriting || includeTranslation) {
                const note = arr(await getNotes()).find((n) => String(n.id) === String(generated.noteId));
                if (note) {
                    const synced = await syncNoteKnowledgeToTargets({
                        noteRecord: note,
                        includeWriting,
                        includeTranslation,
                        clearExisting: params.clearExistingLinks === true,
                        maxItems: 30,
                        settings
                    });
                    return {
                        ...generated,
                        _action: 'note_create_deep_note',
                        synced,
                        message: `${generated.message} Synced ${synced.writingSaved} materials and ${synced.translationSaved} translation examples.`
                    };
                }
            }
            return {
                ...generated,
                _action: 'note_create_deep_note'
            };
        }
        case 'note_append_today_folder': {
            const content = String(params.content || '').trim();
            if (!content) return { error: 'content is required.' };

            const mode = clean(params.mode).toLowerCase() === 'prepend' ? 'prepend' : 'append';
            const todayFolder = await getDefaultNoteFolderName();
            await ensureFolder(todayFolder);

            const allNotes = arr(await getNotes());
            let targetNote = null;
            const noteId = clean(params.noteId);
            if (noteId) {
                targetNote = allNotes.find((n) => String(n.id) === noteId) || null;
            }
            if (!targetNote) {
                const title = clean(params.title) || `Today Notes ${today()}`;
                targetNote = allNotes.find(
                    (n) => clean(n.title).toLowerCase() === title.toLowerCase() && clean(n.folder).toLowerCase() === clean(todayFolder).toLowerCase()
                ) || null;
                if (!targetNote) {
                    targetNote = {
                        id: id('agent_note_today'),
                        title,
                        content: '',
                        folder: todayFolder,
                        date: new Date().toISOString(),
                        updatedAt: Date.now()
                    };
                }
            }

            const heading = clean(params.heading);
            const block = heading ? `\n\n### ${heading}\n${content}\n` : `\n\n${content}\n`;
            const current = String(targetNote.content || '').trim();
            const nextContent = mode === 'prepend'
                ? `${content}\n\n${current}`.trim()
                : `${current}${block}`.trim();

            const updated = {
                ...targetNote,
                folder: todayFolder,
                content: nextContent,
                updatedAt: Date.now()
            };
            await saveNote(updated);

            const syncKnowledge = params.syncKnowledge === true;
            let synced = null;
            if (syncKnowledge) {
                synced = await syncNoteKnowledgeToTargets({
                    noteRecord: updated,
                    includeWriting: params.syncToWriting !== false,
                    includeTranslation: params.syncToTranslation !== false,
                    clearExisting: false,
                    maxItems: 30,
                    settings
                });
            }

            return {
                _action: 'note_append_today_folder',
                _navigateTo: 'notes',
                _navigateToParams: { id: updated.id },
                noteId: updated.id,
                folder: todayFolder,
                mode,
                synced,
                message: `Updated note "${updated.title}" in today folder.`
            };
        }
        case 'note_partial_sync_to_materials': {
            const includeWriting = params.toWriting !== false;
            const includeTranslation = params.toTranslation !== false;
            if (!includeWriting && !includeTranslation) {
                return { error: 'Enable at least one target: toWriting or toTranslation.' };
            }

            const allNotes = arr(await getNotes());
            const noteId = clean(params.noteId);
            const titleNeedle = clean(params.title).toLowerCase();
            const note = noteId
                ? allNotes.find((n) => String(n.id) === noteId)
                : allNotes.find((n) => clean(n.title).toLowerCase() === titleNeedle || clean(n.title).toLowerCase().includes(titleNeedle));

            if (!note) {
                return { error: 'Note not found. Provide a valid noteId or title.' };
            }

            const synced = await syncNoteKnowledgeToTargets({
                noteRecord: note,
                includeWriting,
                includeTranslation,
                clearExisting: params.clearExisting === true,
                maxItems: Number(params.maxItems) || 30,
                settings
            });

            return {
                _action: 'note_partial_sync_to_materials',
                _navigateTo: includeWriting ? 'writer' : 'translation',
                noteId: note.id,
                noteTitle: note.title,
                ...synced,
                message: `Synced note "${note.title}": ${synced.writingSaved} materials, ${synced.translationSaved} translation examples.`
            };
        }
        default:
            return { error: `Unknown tool: ${toolName}` };
    }
}

export const AGENT_SYSTEM_PROMPT = `
You are VerbaPath Agent for the 语脉 VerbaPath learning platform.

Your role:
- Use tools to read the user's learning data.
- When asked, execute concrete actions (create/update/delete flashcards, notes, tasks, deep notes, writing materials).
- Keep actions explicit and safe.

Execution policy:
- If a user asks to do something in-app, call the matching tool.
- Before write operations, prefer read/list tools first to confirm target ids or names.
- For deletion, prefer precise ids and keep scope limited when matching by names/words.
- For writing desk vocabulary replacement records, use upsert_writing_vocabulary. Include sourceTerm, targetTerm, replaceReason, and useful before/after examples or usage/caution when possible.
- For batch flashcard deletes, prefer dryRun=true first, then execute after user confirmation intent is clear.
- If the user says "today/yesterday/this date", pass createdOn or createdAfter/createdBefore. Never infer delete targets from totalMatched alone.
- If a delete result has canUndo=true, tell the user it can be restored with flashcard_undo_last_batch.
  - For flashcard creation/import, pass word + phonetic + chinese_meaning whenever possible. Do not leave the back empty.
  - For deep note requests, prefer generate_deep_note and save results into Notes. It must follow the user's deepNotePrompt from Settings.
- For note linking requests, use note_partial_sync_to_materials or note_create_deep_note with sync options.
- For note editing, first read existing content with get_note_detail, then update with update_note or note_append_today_folder.
- Never claim write success until tool result confirms verification fields (for notes: noteId/contentLength).
- If user asks to sync selected note knowledge into writing/translation, include @material / @translation_example / @vocab_replace style directives in note content, then call note_partial_sync_to_materials.
- For coaching/writing/quiz tasks, produce practical, user-level content.

Response style:
- Be concise and actionable.
- After tool calls, summarize what changed and what to do next.
`.trim();
